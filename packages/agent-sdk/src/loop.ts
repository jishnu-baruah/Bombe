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
 */
function invalidResponseObservation(text: string): unknown {
  return {
    error: "invalid_response",
    message:
      "Your response could not be parsed as a valid StepProposal. " +
      'Respond with JSON: {"thought": "...", "action": {"tool": "...", "input": {...}} | {"finalize": {"decision": "VALID"|"REJECTED"|"ABSTAIN", "confidenceBps": <0-10000>, "rationaleSummary": "..."}}}',
    received: text.slice(0, 200),
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
  // staleSourceCount: number of steps where the ONLY source was stale.
  let staleSourceCount = 0;
  // distinctSources: set of source identifiers seen across all tool results.
  const distinctSources = new Set<string>();
  // staleObservationInCurrentRun: whether any stale result was seen.
  let anyStaleResult = false;

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
      // Invalid response — feed structured error back to the model.
      const obs = invalidResponseObservation(resp.text);
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
    if (!toolResult.ok) {
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
      staleSourceCount++;
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
  reasons: string[];
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

function buildSystemPrompt(agentId: string, claim: Claim, temperament: Temperament): string {
  const allowed = allowedTools(claim.claimType);
  const toolList = allowed.length > 0 ? allowed.join(", ") : "(none — Tier 3 claim)";
  return [
    `You are agent "${agentId}", an autonomous attestor for real-world-asset claims.`,
    `Claim type: ${claim.claimType} (Tier ${tierOf(claim.claimType).toString()}).`,
    `Available tools: [${toolList}].`,
    `Confidence threshold: ${temperament.thresholdBps.toString()} bps.`,
    `Max steps: ${temperament.maxSteps.toString()}.`,
    `Respond with JSON only: {"thought": "...", "action": {"tool": "...", "input": {...}} | {"finalize": {"decision": "VALID"|"REJECTED"|"ABSTAIN", "confidenceBps": <0-10000>, "rationaleSummary": "..."}}}`,
  ].join("\n");
}

function buildUserPrompt(claim: Claim): string {
  return `Claim to attest: ${JSON.stringify(claim)}`;
}
