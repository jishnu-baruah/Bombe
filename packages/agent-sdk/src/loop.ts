/**
 * loop.ts — ReAct loop with hard rules. (PRD §6.3, T-213)
 *
 * Core design contract:
 *   - Model proposes {thought, action: toolCall | finalize}.
 *   - SDK executes tools, feeds observations back, repeats until finalize or maxSteps.
 *   - Hard rules are enforced REGARDLESS of model output; they are the product's safety claims.
 *
 * Hard rules (PRD §6.3 + §13):
 *   1. Tier 3 → ABSTAIN(TIER3_OVERRIDE)  — any non-ABSTAIN model decision is overridden.
 *   2. confidenceBps < threshold → ABSTAIN(BELOW_THRESHOLD)
 *   3. Stale single source + conservative → ABSTAIN(STALE_SINGLE_SOURCE)
 *   4. Step budget exhausted → ABSTAIN(STEP_BUDGET)
 *   5. Cost cap exceeded → ABSTAIN(COST_CAPPED)
 *   6. Unrecoverable tool failure → ABSTAIN(TOOL_FAILURE)
 *
 * Determinism: all timestamps come from deps.clock (never Date.now / Math.random).
 * Two identical runs with the same scripted model + same seeded clock produce
 * byte-identical traces and identical hashCanonical(trace) values.
 */

import { type Claim, tierOf } from "@bombe/shared";
import { z } from "zod";
import type { CostBreaker } from "./cost-breaker.js";
import type { ModelRouter } from "./model-router.js";
import type { ModelSwitchRecord } from "./model-router.js";
import type { AbstainReason } from "./reasons.js";
import { allowedTools, isToolAllowed, refusalObservation } from "./router.js";
import type { ToolName } from "./router.js";
import type { ClockSeam, ModelSeam } from "./seams/types.js";
import { runToolWithRecovery } from "./tool-recovery.js";
import { getTool } from "./tools/index.js";
import type { ToolDeps, ToolResult } from "./tools/types.js";
import type { HistorySource } from "./tools/types.js";

// ---------------------------------------------------------------------------
// Temperament — per-agent tuning knobs (PRD §6.4)
// ---------------------------------------------------------------------------

/**
 * Temperament — the set of hard-rule parameters that define an agent's personality.
 *
 * thresholdBps      — minimum confidence required for VALID/REJECTED (else BELOW_THRESHOLD).
 * maxSteps          — maximum ReAct steps before STEP_BUDGET abstain.
 * requiresTwoSources — if true, a VALID/REJECTED finalize needs ≥2 distinct sources in
 *                      the step observations; otherwise ABSTAIN(STALE_SINGLE_SOURCE).
 *                      (Used by Reflector: conservative, §6.4.)
 * abstainOnStale    — if true AND any step observation has stale+low-confidence AND
 *                      there is only a single source → ABSTAIN(STALE_SINGLE_SOURCE).
 */
export interface Temperament {
  thresholdBps: number;
  maxSteps: number;
  requiresTwoSources: boolean;
  abstainOnStale: boolean;
}

// ---------------------------------------------------------------------------
// LoopDeps — all external dependencies injected into the loop
// ---------------------------------------------------------------------------

/**
 * LoopDeps — injected dependencies for the ReAct loop.
 *
 * model        — the ModelSeam (may be a plain seam or a ModelRouter).
 * clock        — deterministic timestamp source.
 * costBreaker  — tracks cumulative cost and reports isCapped().
 * history      — HistorySource seam for cross_check_history tool.
 * toolDeps     — ToolDeps injected into every tool run.
 * onErrorRow   — optional callback for structured error rows emitted by tool failures.
 */
export interface LoopDeps {
  model: ModelSeam;
  clock: ClockSeam;
  costBreaker: CostBreaker;
  history: HistorySource;
  toolDeps: ToolDeps;
  onErrorRow?: ((row: unknown) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Trace types (PRD §6.3 — EXACT shapes)
// ---------------------------------------------------------------------------

/**
 * ModelSwitchedRecord — the exact shape embedded in a step when a ModelRouter
 * failover occurs. Mirrors ModelSwitchRecord but is independently typed for
 * the trace schema.
 */
const ModelSwitchedSchema = z.object({
  modelSwitched: z.literal(true),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
});

/** A single step in the ReAct trace. */
const TraceStepSchema = z.object({
  step: z.number().int().nonnegative(),
  thought: z.string(),
  action: z.unknown(),
  observation: z.unknown(),
  ts: z.number(),
  modelSwitched: ModelSwitchedSchema.optional(),
});

/** The final decision block in a trace. */
const TraceFinalSchema = z.object({
  decision: z.enum(["VALID", "REJECTED", "ABSTAIN"]),
  confidenceBps: z.number(),
  rationaleSummary: z.string(),
  reasons: z.array(z.string()),
});

/**
 * TraceSchema — the full v1.0 trace shape. (PRD §6.3)
 *
 * traceVersion "1.0" is a literal — any shape change requires a version bump.
 */
export const TraceSchema = z.object({
  traceVersion: z.literal("1.0"),
  agentId: z.string(),
  claimId: z.string(),
  docVersion: z.string().optional(),
  steps: z.array(TraceStepSchema),
  final: TraceFinalSchema,
});

export type Trace = z.infer<typeof TraceSchema>;

// ---------------------------------------------------------------------------
// Model proposal schemas (zod-validated on every model response)
// ---------------------------------------------------------------------------

/** A tool-call action: the model wants to invoke a named tool with some input. */
const ToolCallActionSchema = z.object({
  tool: z.string(),
  input: z.unknown(),
});

/** A finalize action: the model proposes a terminal decision. */
const FinalizeActionSchema = z.object({
  finalize: z.object({
    decision: z.enum(["VALID", "REJECTED", "ABSTAIN"]),
    confidenceBps: z.number(),
    rationaleSummary: z.string(),
  }),
});

/** Discriminated union of the two action types. */
const ActionSchema = z.union([ToolCallActionSchema, FinalizeActionSchema]);

/** Full step proposal from the model. */
const StepProposalSchema = z.object({
  thought: z.string(),
  action: ActionSchema,
});

export type Action = z.infer<typeof ActionSchema>;
export type StepProposal = z.infer<typeof StepProposalSchema>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Attempt to parse a StepProposal from raw model text. Returns null on failure. */
function parseProposal(text: string): StepProposal | null {
  // Try direct JSON parse first.
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Not valid JSON — try to extract JSON from the text (model may wrap in prose).
    const match = /\{[\s\S]*\}/.exec(text);
    if (match === null) return null;
    try {
      raw = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  const result = StepProposalSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data;
}

/**
 * Observation shape for a parse failure — fed back to the model so it can retry.
 * This is intentionally NOT an ABSTAIN path; the model gets one chance to fix its JSON.
 * Re-injects tool specs so the model can correct wrong input fields.
 */
function invalidResponseObservation(text: string, claimType: Claim["claimType"]): unknown {
  return {
    error: "invalid_response",
    message:
      "Your response could not be parsed as a valid StepProposal. " +
      "Respond with ONLY one JSON object, no prose or markdown. " +
      'Schema: {"thought": "...", "action": {"tool": "...", "input": {...}} | {"finalize": {"decision": "VALID"|"REJECTED"|"ABSTAIN", "confidenceBps": <0-10000>, "rationaleSummary": "..."}}}',
    received: text.slice(0, 200),
    toolSpecs: buildToolSpecs(claimType),
  };
}

/**
 * Observation shape for a tool failure — re-injects tool specs so the model can correct
 * wrong input schemas on its next attempt.
 */
function toolFailureObservation(toolName: string, claimType: Claim["claimType"]): unknown {
  return {
    error: "tool_failure",
    message: `Tool "${toolName}" failed. Check the input schema below and retry with correct field names and types. Respond with ONLY one JSON object, no prose or markdown.`,
    toolSpecs: buildToolSpecs(claimType),
  };
}

/**
 * Detect whether a ToolResult is stale.
 * Stale = confidence ≤ 2000 bps (LOW confidence) AND value.stale === true.
 * This mirrors the stale policy in tools/feeds.ts (CONFIDENCE_LOW = 2000).
 */
function isStaleResult(result: ToolResult): boolean {
  if (result.confidence > 2000) return false;
  if (
    result.value !== null &&
    typeof result.value === "object" &&
    "stale" in (result.value as object) &&
    (result.value as Record<string, unknown>).stale === true
  ) {
    return true;
  }
  return false;
}

/**
 * Extract the model's switch records for THIS call from a ModelRouter.
 * Reads the switches array slice from the count before the call to the count after.
 * Returns undefined if the seam is not a ModelRouter.
 */
function extractNewSwitches(
  seam: ModelSeam,
  switchesBefore: number,
): ModelSwitchRecord | undefined {
  // Check if the seam is a ModelRouter by duck-typing (avoids circular import issues).
  if (
    seam !== null &&
    typeof seam === "object" &&
    "switches" in seam &&
    Array.isArray((seam as { switches: unknown }).switches)
  ) {
    const switches = (seam as { switches: ModelSwitchRecord[] }).switches;
    const newSwitches = switches.slice(switchesBefore);
    if (newSwitches.length > 0) {
      // Return the last switch (most recent failover for this step).
      return newSwitches[newSwitches.length - 1];
    }
  }
  return undefined;
}

/** Count current switches length from a ModelRouter seam, or 0 if not a router. */
function getSwitchCount(seam: ModelSeam): number {
  if (
    seam !== null &&
    typeof seam === "object" &&
    "switches" in seam &&
    Array.isArray((seam as { switches: unknown }).switches)
  ) {
    return (seam as { switches: ModelSwitchRecord[] }).switches.length;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// runLoop — the ReAct loop entry point
// ---------------------------------------------------------------------------

/**
 * runLoop — execute one ReAct loop for a single claim with a given temperament.
 *
 * Produces a Trace (PRD §6.3). Hard rules are enforced regardless of model output.
 *
 * @param args.agentId     — identifier for the agent running this loop.
 * @param args.claim       — the claim to attest on.
 * @param args.temperament — per-agent tuning knobs (threshold, maxSteps, staleness policy).
 * @param args.deps        — injected external dependencies.
 *
 * @returns Trace — the complete v1.0 trace; always resolves (never throws).
 */
export async function runLoop(args: {
  agentId: string;
  claim: Claim;
  temperament: Temperament;
  deps: LoopDeps;
}): Promise<Trace> {
  const { agentId, claim, temperament, deps } = args;
  const { model, clock, costBreaker, toolDeps, onErrorRow } = deps;

  const steps: Trace["steps"] = [];

  // ---- Hard rule 1: Tier 3 → immediate ABSTAIN(TIER3_OVERRIDE) ----
  // This fires before any model call. FAIR_VALUE has no tools, so there is
  // nothing the model could meaningfully do.
  if (tierOf(claim.claimType) === 3) {
    return buildTrace({
      agentId,
      claim,
      steps,
      decision: "ABSTAIN",
      confidenceBps: 0,
      rationaleSummary: "Tier-3 claim (FAIR_VALUE). Attestation is forbidden by protocol.",
      reasons: ["TIER3_OVERRIDE"],
    });
  }

  // Build the initial messages (system + user prompt with the claim).
  const systemPrompt = buildSystemPrompt(agentId, claim, temperament);
  const userPrompt = buildUserPrompt(claim);

  // Conversation history: we grow this with each step's thought+action and observation.
  const conversationHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // Track tool result observations for stale-source detection.
  // distinctSources: set of source identifiers seen across all tool results.
  const distinctSources = new Set<string>();
  // anyStaleResult: whether any stale result was seen in this run.
  let anyStaleResult = false;
  // toolFailureRetries: how many times we have already fed a tool failure back to
  // the model. We allow exactly ONE corrective retry (real models frequently send
  // a bad tool input first — e.g. a non-existent oracle period — then fix it once
  // the schema is re-injected). A SECOND failure → hard ABSTAIN(TOOL_FAILURE).
  let toolFailureRetries = 0;
  const MAX_TOOL_FAILURE_RETRIES = 1;

  // ---- Main ReAct loop ----
  for (let stepNum = 0; stepNum < temperament.maxSteps; stepNum++) {
    // Record switch count before model call to detect new switches.
    const switchesBefore = getSwitchCount(model);

    // Call the model.
    let resp: Awaited<ReturnType<ModelSeam["complete"]>>;
    try {
      resp = await model.complete({
        model: agentId,
        messages: conversationHistory,
        maxTokens: 1024,
      });
    } catch (err) {
      // Model threw an unrecoverable error — treat as TOOL_FAILURE equivalent.
      // This is a degenerate case (ModelRouter should absorb transients).
      onErrorRow?.({
        scope: "model",
        error: err instanceof Error ? err.message : String(err),
        step: stepNum,
      });
      return buildTrace({
        agentId,
        claim,
        steps,
        decision: "ABSTAIN",
        confidenceBps: 0,
        rationaleSummary: "Model call failed unrecoverably.",
        reasons: ["TOOL_FAILURE"],
      });
    }

    // ---- Hard rule 5: COST_CAPPED ----
    costBreaker.addResponse(resp);
    if (costBreaker.isCapped()) {
      return buildTrace({
        agentId,
        claim,
        steps,
        decision: "ABSTAIN",
        confidenceBps: 0,
        rationaleSummary: `Cost cap exceeded (spent ~$${costBreaker.spentUsd.toFixed(4)}).`,
        reasons: ["COST_CAPPED"],
      });
    }

    // Detect if ModelRouter switched during this step.
    const modelSwitched = extractNewSwitches(model, switchesBefore);

    // Parse the model's proposal.
    const proposal = parseProposal(resp.text);
    const ts = clock.now();

    if (proposal === null) {
      // Invalid response — feed structured error back to the model (with tool specs re-injected).
      const obs = invalidResponseObservation(resp.text, claim.claimType);
      steps.push({
        step: stepNum,
        thought: "",
        action: { error: "unparseable_response" },
        observation: obs,
        ts,
        ...(modelSwitched !== undefined ? { modelSwitched } : {}),
      });
      conversationHistory.push({
        role: "assistant",
        content: resp.text,
      });
      conversationHistory.push({
        role: "user",
        content: JSON.stringify(obs),
      });
      // Continue loop — give the model another chance.
      continue;
    }

    // ---- Handle finalize action ----
    if ("finalize" in proposal.action) {
      const { decision, confidenceBps, rationaleSummary } = proposal.action.finalize;

      // Record the finalize step.
      steps.push({
        step: stepNum,
        thought: proposal.thought,
        action: proposal.action,
        observation: { finalized: true },
        ts,
        ...(modelSwitched !== undefined ? { modelSwitched } : {}),
      });

      // ---- Hard rule 1 (double-check): Tier 3 override ----
      // Already handled above for tier=3 claims, but guard against claimType
      // inconsistency just in case.
      if (tierOf(claim.claimType) === 3 && decision !== "ABSTAIN") {
        return buildTrace({
          agentId,
          claim,
          steps,
          decision: "ABSTAIN",
          confidenceBps: 0,
          rationaleSummary: `TIER3_OVERRIDE(was=${decision}). Attestation is forbidden for Tier-3 claims.`,
          reasons: [`TIER3_OVERRIDE(was=${decision})`],
        });
      }

      // Only apply BELOW_THRESHOLD and STALE_SINGLE_SOURCE to VALID/REJECTED
      // (these checks are inapplicable to a model-proposed ABSTAIN).
      if (decision !== "ABSTAIN") {
        // ---- Hard rule 2: BELOW_THRESHOLD ----
        if (confidenceBps < temperament.thresholdBps) {
          return buildTrace({
            agentId,
            claim,
            steps,
            decision: "ABSTAIN",
            confidenceBps,
            rationaleSummary: `Confidence ${confidenceBps.toString()} bps is below threshold ${temperament.thresholdBps.toString()} bps.`,
            reasons: ["BELOW_THRESHOLD"],
          });
        }

        // ---- Hard rule 3: STALE_SINGLE_SOURCE ----
        // Fire when:
        //   - temperament.abstainOnStale is true, AND
        //   - at least one stale observation was seen, AND
        //   - the number of distinct supporting sources is < 2
        //     (either temperament.requiresTwoSources is true, or there genuinely
        //     was only 1 source and it was stale).
        if (temperament.abstainOnStale && anyStaleResult) {
          const sourceCount = distinctSources.size;
          if (sourceCount < 2) {
            return buildTrace({
              agentId,
              claim,
              steps,
              decision: "ABSTAIN",
              confidenceBps,
              rationaleSummary: `Stale single source detected (${sourceCount.toString()} source(s)); conservative temperament requires ≥2 independent sources.`,
              reasons: ["STALE_SINGLE_SOURCE"],
            });
          }
        }
      }

      // All hard rules passed — accept the model's finalize.
      return buildTrace({
        agentId,
        claim,
        steps,
        decision,
        confidenceBps,
        rationaleSummary,
        reasons: decision === "ABSTAIN" ? ["MODEL_ABSTAIN"] : [],
      });
    }

    // ---- Handle tool-call action ----
    const toolAction = proposal.action as z.infer<typeof ToolCallActionSchema>;
    const requestedTool = toolAction.tool;

    // Check tool authorization.
    if (!isToolAllowed(claim.claimType, requestedTool as ToolName)) {
      const refusal = refusalObservation(claim.claimType, requestedTool);
      steps.push({
        step: stepNum,
        thought: proposal.thought,
        action: proposal.action,
        observation: refusal,
        ts,
        ...(modelSwitched !== undefined ? { modelSwitched } : {}),
      });
      conversationHistory.push({
        role: "assistant",
        content: resp.text,
      });
      conversationHistory.push({
        role: "user",
        content: JSON.stringify(refusal),
      });
      // Do NOT execute the tool — feed refusal back so model can revise.
      continue;
    }

    // Execute the tool via the recovery wrapper.
    const toolName = requestedTool as ToolName;
    const tool = getTool(toolName);

    const toolResult = await runToolWithRecovery(
      toolName,
      () => tool.run(toolAction.input, toolDeps),
      {
        onErrorRow: onErrorRow as
          | ((row: import("./tool-recovery.js").ToolErrorRow) => void)
          | undefined,
      },
    );

    // ---- Hard rule 6: TOOL_FAILURE ----
    // On the FIRST tool failure, re-inject the tool schemas as an observation and
    // give the model one corrective turn (bad inputs — e.g. a non-existent oracle
    // period — are usually fixable once the schema is shown). On a SECOND failure
    // the hard rule fires: ABSTAIN(TOOL_FAILURE).
    if (!toolResult.ok) {
      const toolFailObs = toolFailureObservation(toolName, claim.claimType);
      steps.push({
        step: stepNum,
        thought: proposal.thought,
        action: proposal.action,
        observation: toolFailObs,
        ts,
        ...(modelSwitched !== undefined ? { modelSwitched } : {}),
      });

      if (toolFailureRetries < MAX_TOOL_FAILURE_RETRIES) {
        toolFailureRetries++;
        conversationHistory.push({ role: "assistant", content: resp.text });
        conversationHistory.push({ role: "user", content: JSON.stringify(toolFailObs) });
        // Give the model one chance to correct the tool input.
        continue;
      }

      return buildTrace({
        agentId,
        claim,
        steps,
        decision: "ABSTAIN",
        confidenceBps: 0,
        rationaleSummary: `Tool "${toolName}" failed unrecoverably.`,
        reasons: ["TOOL_FAILURE"],
      });
    }

    const toolValue = toolResult.value;

    // Accumulate source and stale-detection data.
    distinctSources.add(toolValue.source);
    if (isStaleResult(toolValue)) {
      anyStaleResult = true;
    }

    const observation: unknown = toolValue;

    steps.push({
      step: stepNum,
      thought: proposal.thought,
      action: proposal.action,
      observation,
      ts,
      ...(modelSwitched !== undefined ? { modelSwitched } : {}),
    });

    conversationHistory.push({
      role: "assistant",
      content: resp.text,
    });
    conversationHistory.push({
      role: "user",
      content: JSON.stringify(observation),
    });
  }

  // ---- Hard rule 4: STEP_BUDGET exhausted ----
  return buildTrace({
    agentId,
    claim,
    steps,
    decision: "ABSTAIN",
    confidenceBps: 0,
    rationaleSummary: `Step budget of ${temperament.maxSteps.toString()} exhausted without a finalize.`,
    reasons: ["STEP_BUDGET"],
  });
}

// ---------------------------------------------------------------------------
// Internal builders
// ---------------------------------------------------------------------------

function buildTrace(opts: {
  agentId: string;
  claim: Claim;
  steps: Trace["steps"];
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  confidenceBps: number;
  rationaleSummary: string;
  reasons: AbstainReason[] | string[];
}): Trace {
  return {
    traceVersion: "1.0",
    agentId: opts.agentId,
    claimId: opts.claim.id,
    steps: opts.steps,
    final: {
      decision: opts.decision,
      confidenceBps: opts.confidenceBps,
      rationaleSummary: opts.rationaleSummary,
      reasons: opts.reasons,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool input-schema catalogue (derived from zod schemas in tools/*.ts)
// ---------------------------------------------------------------------------

/**
 * TOOL_INPUT_SPECS — exact input JSON schemas for every SDK tool.
 * Derived directly from the zod input schemas in tools/*.ts.
 * Used in the system prompt so real LLMs know EXACTLY what fields to pass.
 */
const TOOL_INPUT_SPECS: Record<
  ToolName,
  { description: string; inputSchema: Record<string, unknown>; example: Record<string, unknown> }
> = {
  fetch_chainlink_price: {
    description: "Reads a generic oracle snapshot by (asset, period).",
    inputSchema: {
      type: "object",
      required: ["asset", "period"],
      properties: {
        asset: { type: "string", minLength: 1 },
        period: { type: "string", minLength: 1 },
      },
    },
    example: { asset: "mETH", period: "30d-fresh" },
  },
  fetch_meth_yield: {
    description: "Reads the mETH yield oracle snapshot. Returns { yieldBps, stale, ... }.",
    inputSchema: {
      type: "object",
      properties: { period: { type: "string", minLength: 1, default: "30d-fresh" } },
    },
    example: { period: "30d-fresh" },
  },
  fetch_usdy_yield: {
    description: "Reads the USDY yield oracle snapshot. Returns { yieldBps, stale, ... }.",
    inputSchema: {
      type: "object",
      properties: { period: { type: "string", minLength: 1, default: "30d" } },
    },
    example: { period: "30d" },
  },
  query_chain_state: {
    description:
      "Queries mock chain state via DSL. op='balanceOf' needs {account, token}; op='eventOccurred' needs {claimRef}.",
    inputSchema: {
      oneOf: [
        {
          type: "object",
          required: ["op", "account", "token"],
          properties: {
            op: { const: "balanceOf" },
            account: { type: "string", minLength: 1 },
            token: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          required: ["op", "claimRef"],
          properties: {
            op: { const: "eventOccurred" },
            claimRef: { type: "string", minLength: 1 },
          },
        },
      ],
    },
    example: { op: "eventOccurred", claimRef: "DIST-2026-05" },
  },
  compute_expected: {
    description:
      "Pure ±2 bps tolerance check. Returns { observedBps, expectedBps, deltaBps, withinTolerance }.",
    inputSchema: {
      type: "object",
      required: ["observedBps", "expectedBps"],
      properties: { observedBps: { type: "number" }, expectedBps: { type: "number" } },
    },
    example: { observedBps: 34, expectedBps: 34 },
  },
  read_document: {
    description:
      "Reads a document fixture (servicer report or bank statement). Returns { docRef, docType, docVersion, fields }.",
    inputSchema: {
      type: "object",
      required: ["docRef"],
      properties: {
        docRef: { type: "string", minLength: 1 },
        version: { type: "string", minLength: 1, default: "v1" },
      },
    },
    example: { docRef: "pc-pool-1-servicer", version: "v1" },
  },
  cross_check_history: {
    description:
      "Queries prior attestation history for a claim. Returns { claimRef, priorAttestations }.",
    inputSchema: {
      type: "object",
      required: ["claimRef"],
      properties: { claimRef: { type: "string", minLength: 1 } },
    },
    example: { claimRef: "A" },
  },
};

/**
 * buildToolSpecs — returns a JSON-serialisable array of tool specs for the allowed
 * tools of a given claim type. Embedded in the system prompt so real LLMs know the
 * exact input field names and types to use.
 */
function buildToolSpecs(claimType: Claim["claimType"]): Array<{
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  example: Record<string, unknown>;
}> {
  const allowed = allowedTools(claimType);
  return allowed.map((name) => ({
    name,
    ...TOOL_INPUT_SPECS[name],
  }));
}

// ---------------------------------------------------------------------------
// Few-shot worked examples (one per tier)
// ---------------------------------------------------------------------------

/**
 * TIER1_FEW_SHOT — one correct Tier-1 (YIELD_BPS) exchange showing the exact
 * tool-call input schema, then a correct finalize.
 */
const TIER1_FEW_SHOT = `
EXAMPLE (Tier 1 — YIELD_BPS, claim A: mETH 30d yield ≥ 30 bps):
  Step 1 — model outputs:
  {"thought":"I need the mETH 30d yield from the oracle.","action":{"tool":"fetch_meth_yield","input":{"period":"30d-fresh"}}}
  Step 1 — observation (tool result):
  {"value":{"asset":"mETH","period":"30d-fresh","yieldBps":34,"stale":false},"source":"chainlink-meth","fetchedAt":1000000,"confidence":9500}
  Step 2 — model outputs:
  {"thought":"Yield is 34 bps. Checking within tolerance of 34 bps expected.","action":{"tool":"compute_expected","input":{"observedBps":34,"expectedBps":34}}}
  Step 2 — observation:
  {"value":{"observedBps":34,"expectedBps":34,"deltaBps":0,"withinTolerance":true},"source":"compute","fetchedAt":1000010,"confidence":9500}
  Step 3 — model outputs:
  {"thought":"withinTolerance is true and confidence is high. Finalising VALID.","action":{"finalize":{"decision":"VALID","confidenceBps":9500,"rationaleSummary":"mETH yield 34 bps is within ±2 bps of expected 34 bps."}}}
END EXAMPLE
`.trim();

/**
 * TIER2_FEW_SHOT — one correct Tier-2 (CASHFLOW_MATCH) exchange.
 */
const TIER2_FEW_SHOT = `
EXAMPLE (Tier 2 — CASHFLOW_MATCH, claim C: servicer report vs bank statement):
  Step 1 — model outputs:
  {"thought":"Read the servicer report first.","action":{"tool":"read_document","input":{"docRef":"pc-pool-1-servicer","version":"v1"}}}
  Step 1 — observation:
  {"value":{"docRef":"pc-pool-1-servicer","docType":"servicer-report","docVersion":"v1","fields":{"cashflowTotal":50000}},"source":"fixture:v1/pc-pool-1-servicer","fetchedAt":1000000,"confidence":9500}
  Step 2 — model outputs:
  {"thought":"Now read the bank statement.","action":{"tool":"read_document","input":{"docRef":"pc-pool-1-statement","version":"v1"}}}
  Step 2 — observation:
  {"value":{"docRef":"pc-pool-1-statement","docType":"bank-statement","docVersion":"v1","fields":{"lineItemsTotal":45000}},"source":"fixture:v1/pc-pool-1-statement","fetchedAt":1000010,"confidence":9500}
  Step 3 — model outputs:
  {"thought":"50000 vs 45000 — delta is 5000, not within tolerance. REJECTED.","action":{"finalize":{"decision":"REJECTED","confidenceBps":9500,"rationaleSummary":"Servicer cashflow 50000 does not match bank lineItems 45000 (delta 5000)."}}}
END EXAMPLE
`.trim();

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(agentId: string, claim: Claim, temperament: Temperament): string {
  const tier = tierOf(claim.claimType);
  const allowed = allowedTools(claim.claimType);
  const toolList = allowed.length > 0 ? allowed.join(", ") : "(none — Tier 3 claim)";
  const toolSpecs = buildToolSpecs(claim.claimType);

  // Pick the relevant few-shot example based on tier.
  let fewShot: string;
  if (tier === 1) {
    fewShot = TIER1_FEW_SHOT;
  } else if (tier === 2) {
    fewShot = TIER2_FEW_SHOT;
  } else {
    fewShot = "";
  }

  const lines: string[] = [
    `You are agent "${agentId}", an autonomous attestor for real-world-asset claims.`,
    `Claim type: ${claim.claimType} (Tier ${tier.toString()}).`,
    `Available tools: [${toolList}].`,
    `Confidence threshold: ${temperament.thresholdBps.toString()} bps (0–10000 scale).`,
    `Max steps: ${temperament.maxSteps.toString()}.`,
    "",
    "CRITICAL: Respond with ONLY one JSON object per turn — no prose, no markdown, no explanation outside the JSON. Non-JSON text wastes a step and will be rejected.",
    "",
    "Mandatory JSON schema every turn:",
    '  Tool call:  {"thought": "<reasoning>", "action": {"tool": "<tool_name>", "input": <input_object>}}',
    '  Finalize:   {"thought": "<reasoning>", "action": {"finalize": {"decision": "VALID"|"REJECTED"|"ABSTAIN", "confidenceBps": <integer 0-10000>, "rationaleSummary": "<one sentence>"}}}',
    "",
    "TOOL INPUT SCHEMAS (use EXACTLY these field names — wrong fields cause TOOL_FAILURE → ABSTAIN):",
    JSON.stringify(toolSpecs, null, 2),
  ];

  if (fewShot) {
    lines.push("");
    lines.push(fewShot);
  }

  return lines.join("\n");
}

function buildUserPrompt(claim: Claim): string {
  const tier = tierOf(claim.claimType);
  let guidance: string;
  if (tier === 1) {
    guidance =
      "GUIDANCE (Tier 1): Use the numeric oracle tools (fetch_meth_yield, fetch_usdy_yield, " +
      "fetch_chainlink_price, query_chain_state) to retrieve the observed value, then call " +
      "compute_expected with {observedBps, expectedBps} to check the ±2 bps tolerance. " +
      "Finalize based on withinTolerance.";
  } else if (tier === 2) {
    guidance =
      "GUIDANCE (Tier 2): Call read_document first (with {docRef, version}) to read each " +
      "relevant document, then use compute_expected to compare numeric fields. " +
      "Finalize REJECTED if the delta exceeds tolerance, VALID if within tolerance.";
  } else {
    guidance =
      "GUIDANCE (Tier 3): This is a FAIR_VALUE (Tier 3) claim. No tools are available. " +
      "You MUST immediately finalize with ABSTAIN — do not attempt any tool calls.";
  }
  return `Claim to attest: ${JSON.stringify(claim)}\n\n${guidance}`;
}
