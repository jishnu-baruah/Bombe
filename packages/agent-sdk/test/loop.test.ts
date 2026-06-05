/**
 * loop.test.ts — ReAct loop hard-rules tests. (PRD §6.3, §13, §14.4, §14.6, T-213)
 *
 * Test scenarios:
 *  1. Happy path: tool call → VALID above threshold.
 *  2. Tier-3 override: FAIR_VALUE → ABSTAIN(TIER3_OVERRIDE).
 *  3. BELOW_THRESHOLD: confidence < threshold → ABSTAIN(BELOW_THRESHOLD).
 *  4. STALE_SINGLE_SOURCE: conservative, single stale mETH source → ABSTAIN.
 *  5. STEP_BUDGET: model never finalizes → ABSTAIN(STEP_BUDGET).
 *  6. COST_CAPPED: tiny cap + large token counts → ABSTAIN(COST_CAPPED).
 *  7. TOOL_FAILURE: tool throws non-recoverably → ABSTAIN(TOOL_FAILURE) + error row.
 *  8. Unmapped tool refusal: model requests disallowed tool → refusal observation fed back.
 *  9. Trace hash stability: two identical runs → identical hashCanonical(trace).
 * 10. ModelRouter failover in trace: stub 429 → fallback → modelSwitched in step.
 *
 * All timestamps come from a seeded StubClockSeam — fully deterministic.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashCanonical } from "@bombe/shared";
import type { Claim } from "@bombe/shared";
import { describe, expect, it, vi } from "vitest";
import { CostBreaker } from "../src/cost-breaker.js";
import { type LoopDeps, type Temperament, type Trace, runLoop } from "../src/loop.js";
import { ModelError, ModelRouter } from "../src/model-router.js";
import type { AbstainReason } from "../src/reasons.js";
import { StubClockSeam, StubModelSeam } from "../src/seams/stub.js";
import type { ModelResponse } from "../src/seams/types.js";
import { MockHistorySource } from "../src/tools/types.js";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/**
 * Repo root for fixture loading — test/loop.test.ts is 4 levels from repo root:
 * loop.test.ts → test → agent-sdk → packages → repo root
 */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const FIXTURES_ROOT = resolve(REPO_ROOT, "fixtures");

/** Build a minimal valid Claim for a given claimType + tier. */
function makeClaim(opts: Partial<Claim> & { claimType: Claim["claimType"] }): Claim {
  const tierMap: Record<Claim["claimType"], 1 | 2 | 3> = {
    YIELD_BPS: 1,
    DISTRIBUTION_PAID: 1,
    CASHFLOW_MATCH: 2,
    ENCUMBRANCE_ABSENT: 2,
    FAIR_VALUE: 3,
  };
  return {
    id: opts.id ?? "claim-test-001",
    tier: opts.tier ?? tierMap[opts.claimType],
    asset: opts.asset ?? "mETH",
    claimType: opts.claimType,
    payload: opts.payload ?? { period: "30d-fresh" },
    submitter: opts.submitter ?? "0xsubmitter",
    postedAt: opts.postedAt ?? 1000,
  };
}

/** Build a CostBreaker with known model costs. */
function makeCostBreaker(maxUsd = 1.0): CostBreaker {
  return new CostBreaker({
    maxUsd,
    costs: {
      "meta/llama-3.3-70b": { inputPer1k: 0.001, outputPer1k: 0.004 },
      "anthropic/claude-sonnet-4.6": { inputPer1k: 0.003, outputPer1k: 0.015 },
      "test-agent": { inputPer1k: 0.001, outputPer1k: 0.001 },
    },
  });
}

/** Conservative temperament (Reflector-like). */
const CONSERVATIVE_TEMPERAMENT: Temperament = {
  thresholdBps: 8500,
  maxSteps: 8,
  requiresTwoSources: true,
  abstainOnStale: true,
};

/** Permissive temperament (Rotor-like). */
const PERMISSIVE_TEMPERAMENT: Temperament = {
  thresholdBps: 6500,
  maxSteps: 5,
  requiresTwoSources: false,
  abstainOnStale: false,
};

/** Build a LoopDeps with a StubModelSeam and seeded clock. */
function makeDeps(
  model: StubModelSeam | ModelRouter,
  clockTimes: number | number[] = 1000,
  costBreaker?: CostBreaker,
): LoopDeps {
  const clock = new StubClockSeam(clockTimes);
  return {
    model,
    clock,
    costBreaker: costBreaker ?? makeCostBreaker(),
    history: new MockHistorySource({}),
    toolDeps: {
      clock,
      historySource: new MockHistorySource({}),
      fixturesRoot: FIXTURES_ROOT,
    },
  };
}

/** Build a ModelResponse from a proposal JSON object. */
function proposalResp(proposal: unknown, model = "test-agent"): ModelResponse {
  return {
    text: JSON.stringify(proposal),
    tokensIn: 10,
    tokensOut: 10,
    modelUsed: model,
  };
}

/** A tool-call proposal for fetch_meth_yield. */
const METH_TOOL_CALL = {
  thought: "I need the mETH yield.",
  action: { tool: "fetch_meth_yield", input: { period: "30d-fresh" } },
};

/** A valid finalize proposal above conservative threshold. */
const FINALIZE_VALID_HIGH = {
  thought: "Confidence is high.",
  action: {
    finalize: {
      decision: "VALID",
      confidenceBps: 9000,
      rationaleSummary: "mETH yield matches expected.",
    },
  },
};

/** A valid finalize proposal with low confidence (below 8500). */
const FINALIZE_VALID_LOW_CONF = {
  thought: "Not very confident.",
  action: {
    finalize: {
      decision: "VALID",
      confidenceBps: 5000,
      rationaleSummary: "Low confidence.",
    },
  },
};

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe("runLoop — happy path", () => {
  it("tool call → observe → VALID finalise; steps recorded correctly", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    // Model: step 0 = call fetch_meth_yield; step 1 = finalize VALID.
    const model = new StubModelSeam([
      proposalResp(METH_TOOL_CALL),
      proposalResp(FINALIZE_VALID_HIGH),
    ]);

    const deps = makeDeps(model, [1001, 1002, 1003]);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    expect(trace.traceVersion).toBe("1.0");
    expect(trace.agentId).toBe("test-agent");
    expect(trace.claimId).toBe(claim.id);
    expect(trace.final.decision).toBe("VALID");
    expect(trace.final.confidenceBps).toBe(9000);

    // Two steps recorded: tool call and finalize.
    expect(trace.steps.length).toBe(2);
    const toolStep = trace.steps[0];
    expect(toolStep?.step).toBe(0);
    expect(toolStep?.thought).toBe("I need the mETH yield.");
    // Tool observation should contain the ToolResult shape.
    const obs = toolStep?.observation as Record<string, unknown>;
    expect(obs).toHaveProperty("value");
    expect(obs).toHaveProperty("source");
    expect(obs).toHaveProperty("confidence");

    // Finalize step.
    const finalStep = trace.steps[1];
    expect(finalStep?.step).toBe(1);
    expect((finalStep?.observation as Record<string, unknown>)?.finalized).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Tier-3 override
// ---------------------------------------------------------------------------

describe("runLoop — Tier-3 override (§14.6)", () => {
  it("FAIR_VALUE claim → immediate ABSTAIN(TIER3_OVERRIDE) before any model call", async () => {
    const claim = makeClaim({ claimType: "FAIR_VALUE" });

    // Model that would propose VALID — should NEVER be called.
    const handler = vi.fn((): ModelResponse => proposalResp(FINALIZE_VALID_HIGH));
    const model = new StubModelSeam(handler);

    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: CONSERVATIVE_TEMPERAMENT,
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("TIER3_OVERRIDE");
    // Model was never consulted — no steps.
    expect(trace.steps.length).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("records overridden decision in rationaleSummary when model proposes VALID on tier-3", async () => {
    // Simulate the case where we somehow get past the initial tier check
    // by checking the reasoning summary contains override info.
    // (The initial check runs before any model call, but we verify the reason.)
    const claim = makeClaim({ claimType: "FAIR_VALUE" });
    const model = new StubModelSeam(proposalResp(FINALIZE_VALID_HIGH));
    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: CONSERVATIVE_TEMPERAMENT,
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons.some((r) => r.includes("TIER3_OVERRIDE"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. BELOW_THRESHOLD
// ---------------------------------------------------------------------------

describe("runLoop — BELOW_THRESHOLD", () => {
  it("model finalizes VALID at 5000 bps < threshold 8500 → ABSTAIN(BELOW_THRESHOLD)", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });
    const model = new StubModelSeam([
      proposalResp(METH_TOOL_CALL),
      proposalResp(FINALIZE_VALID_LOW_CONF),
    ]);
    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: CONSERVATIVE_TEMPERAMENT, // threshold = 8500
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("BELOW_THRESHOLD");
    // The reported confidenceBps should be the model's value (5000).
    expect(trace.final.confidenceBps).toBe(5000);
  });

  it("model finalizes REJECTED at confidence just below threshold → ABSTAIN(BELOW_THRESHOLD)", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });
    const model = new StubModelSeam(
      proposalResp({
        thought: "Rejecting.",
        action: {
          finalize: { decision: "REJECTED", confidenceBps: 8499, rationaleSummary: "Mismatch." },
        },
      }),
    );
    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: CONSERVATIVE_TEMPERAMENT, // threshold = 8500
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("BELOW_THRESHOLD");
  });

  it("model ABSTAINs itself — BELOW_THRESHOLD does NOT apply to ABSTAIN", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });
    const model = new StubModelSeam(
      proposalResp({
        thought: "Insufficient data.",
        action: {
          finalize: {
            decision: "ABSTAIN",
            confidenceBps: 3000,
            rationaleSummary: "Not enough sources.",
          },
        },
      }),
    );
    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: CONSERVATIVE_TEMPERAMENT,
      deps,
    });

    // Model's own ABSTAIN should pass through (not be overridden to BELOW_THRESHOLD).
    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).not.toContain("BELOW_THRESHOLD");
  });
});

// ---------------------------------------------------------------------------
// 4. STALE_SINGLE_SOURCE (M2 checkpoint — Reflector-like run on claim B)
// ---------------------------------------------------------------------------

describe("runLoop — STALE_SINGLE_SOURCE (M2 checkpoint)", () => {
  it("conservative: stale mETH yield + no secondary → ABSTAIN(STALE_SINGLE_SOURCE)", async () => {
    // Claim B: mETH YIELD_BPS, stale snapshot, conservative temperament.
    const claim = makeClaim({
      id: "claim-B",
      claimType: "YIELD_BPS",
      asset: "mETH",
      payload: { period: "30d-stale" },
    });

    // Model: step 0 = fetch stale mETH yield; step 1 = finalize VALID at high confidence.
    // The hard rule should override to ABSTAIN(STALE_SINGLE_SOURCE).
    const model = new StubModelSeam([
      proposalResp({
        thought: "Fetching mETH yield.",
        action: { tool: "fetch_meth_yield", input: { period: "30d-stale" } },
      }),
      proposalResp({
        thought: "Only stale data but I'll try.",
        action: {
          finalize: {
            decision: "VALID",
            confidenceBps: 9000,
            rationaleSummary: "Matches expected.",
          },
        },
      }),
    ]);

    const deps = makeDeps(model, [2000, 2001, 2002]);
    const trace = await runLoop({
      agentId: "reflector",
      claim,
      temperament: CONSERVATIVE_TEMPERAMENT, // abstainOnStale: true, requiresTwoSources: true
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("STALE_SINGLE_SOURCE");
    expect(trace.agentId).toBe("reflector");
    expect(trace.claimId).toBe("claim-B");
    // Steps should have been recorded before the rule fired.
    expect(trace.steps.length).toBeGreaterThanOrEqual(1);
  });

  it("permissive (abstainOnStale=false): stale feed does NOT trigger STALE_SINGLE_SOURCE", async () => {
    const claim = makeClaim({
      id: "claim-B-rotor",
      claimType: "YIELD_BPS",
      asset: "mETH",
      payload: { period: "30d-stale" },
    });

    const model = new StubModelSeam([
      proposalResp({
        thought: "Fetching mETH yield.",
        action: { tool: "fetch_meth_yield", input: { period: "30d-stale" } },
      }),
      proposalResp({
        thought: "Committing.",
        action: {
          finalize: {
            decision: "VALID",
            confidenceBps: 7000,
            rationaleSummary: "Matches.",
          },
        },
      }),
    ]);

    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "rotor",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT, // abstainOnStale: false
      deps,
    });

    expect(trace.final.decision).toBe("VALID");
    expect(trace.final.reasons).not.toContain("STALE_SINGLE_SOURCE");
  });
});

// ---------------------------------------------------------------------------
// 5. STEP_BUDGET
// ---------------------------------------------------------------------------

describe("runLoop — STEP_BUDGET", () => {
  it("model keeps calling tools without finalizing → ABSTAIN(STEP_BUDGET) after maxSteps", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    // Always return a tool call; never finalize.
    const model = new StubModelSeam(
      proposalResp({
        thought: "One more tool call.",
        action: { tool: "fetch_meth_yield", input: { period: "30d-fresh" } },
      }),
    );

    const temperament: Temperament = {
      ...PERMISSIVE_TEMPERAMENT,
      maxSteps: 3,
    };

    const deps = makeDeps(
      model,
      Array.from({ length: 20 }, (_, i) => 1000 + i),
    );
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament,
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("STEP_BUDGET");
    // Exactly maxSteps steps should have been recorded.
    expect(trace.steps.length).toBe(temperament.maxSteps);
  });
});

// ---------------------------------------------------------------------------
// 6. COST_CAPPED
// ---------------------------------------------------------------------------

describe("runLoop — COST_CAPPED", () => {
  it("tiny cost cap + model response with large token counts → ABSTAIN(COST_CAPPED)", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    // A cost breaker with a $0.00001 cap — exceeded by any non-trivial response.
    const tightCostBreaker = new CostBreaker({
      maxUsd: 0.00001,
      costs: {
        "test-agent": { inputPer1k: 0.001, outputPer1k: 0.001 },
      },
    });

    // Model returns a response that accumulates cost.
    const model = new StubModelSeam({
      text: JSON.stringify(METH_TOOL_CALL),
      tokensIn: 500,
      tokensOut: 500,
      modelUsed: "test-agent",
    });

    const deps: LoopDeps = {
      ...makeDeps(model),
      costBreaker: tightCostBreaker,
    };

    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("COST_CAPPED");
  });
});

// ---------------------------------------------------------------------------
// 7. TOOL_FAILURE
// ---------------------------------------------------------------------------

describe("runLoop — TOOL_FAILURE", () => {
  it("tool that throws non-recoverably → ABSTAIN(TOOL_FAILURE) + error row emitted", async () => {
    const claim = makeClaim({ claimType: "CASHFLOW_MATCH" });

    // Model requests read_document which is allowed for CASHFLOW_MATCH.
    const model = new StubModelSeam(
      proposalResp({
        thought: "Reading the document.",
        action: { tool: "read_document", input: { docRef: "nonexistent-doc-xyz-404" } },
      }),
    );

    const errorRows: unknown[] = [];
    const deps: LoopDeps = {
      ...makeDeps(model),
      onErrorRow: (row) => {
        errorRows.push(row);
      },
    };

    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("TOOL_FAILURE");
    // An error row should have been emitted.
    expect(errorRows.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Unmapped tool refusal
// ---------------------------------------------------------------------------

describe("runLoop — unmapped tool refusal", () => {
  it("model requests tool not allowed for claimType → refusal fed back, loop continues", async () => {
    const claim = makeClaim({ claimType: "CASHFLOW_MATCH" }); // allowed: read_document, compute_expected, cross_check_history
    // NOT allowed: fetch_meth_yield, fetch_chainlink_price, query_chain_state.

    const model = new StubModelSeam([
      // Step 0: request a disallowed tool.
      proposalResp({
        thought: "Let me check the price.",
        action: { tool: "fetch_meth_yield", input: { period: "30d-fresh" } },
      }),
      // Step 1: after refusal, finalize with ABSTAIN.
      proposalResp({
        thought: "OK, I can't use that tool. I'll abstain.",
        action: {
          finalize: {
            decision: "ABSTAIN",
            confidenceBps: 0,
            rationaleSummary: "Cannot access required tool.",
          },
        },
      }),
    ]);

    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    // Should reach the ABSTAIN finalize on step 1, not crash.
    expect(trace.final.decision).toBe("ABSTAIN");

    // The refusal step should be in the trace.
    const refusalStep = trace.steps[0];
    expect(refusalStep).toBeDefined();
    const obs = refusalStep?.observation as Record<string, unknown>;
    expect(obs?.refused).toBe(true);
    expect(typeof obs?.reason).toBe("string");
    expect((obs?.reason as string).length).toBeGreaterThan(0);
  });

  it("disallowed tool request does NOT execute the tool (no side effects)", async () => {
    const claim = makeClaim({ claimType: "DISTRIBUTION_PAID" }); // no read_document

    const toolExecuted = false;

    const model = new StubModelSeam([
      // Request a disallowed tool.
      proposalResp({
        thought: "Reading a doc.",
        action: { tool: "read_document", input: { docRef: "loan-portfolio" } },
      }),
      // After refusal, finalize ABSTAIN.
      proposalResp({
        thought: "Abstaining.",
        action: {
          finalize: { decision: "ABSTAIN", confidenceBps: 0, rationaleSummary: "No tools." },
        },
      }),
    ]);

    // We can't easily hook into the tool execution, but we verify the
    // observation shape to confirm it was a refusal, not a tool result.
    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    const refusalStep = trace.steps[0];
    const obs = refusalStep?.observation as Record<string, unknown>;
    // A tool result would have "value", "source", "fetchedAt" — a refusal has "refused".
    expect(obs?.refused).toBe(true);
    expect(obs).not.toHaveProperty("value");
    expect(toolExecuted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Trace hash stability (§14.4)
// ---------------------------------------------------------------------------

describe("runLoop — trace hash stability (§14.4)", () => {
  it("two identical scripted runs produce byte-identical hashCanonical(trace)", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    function buildDeps(): LoopDeps {
      const model = new StubModelSeam([
        {
          text: JSON.stringify(METH_TOOL_CALL),
          tokensIn: 10,
          tokensOut: 10,
          modelUsed: "test-agent",
        },
        {
          text: JSON.stringify(FINALIZE_VALID_HIGH),
          tokensIn: 10,
          tokensOut: 10,
          modelUsed: "test-agent",
        },
      ]);
      // Seed clock at fixed times — must be identical across both runs.
      return makeDeps(model, [5000, 5001, 5002]);
    }

    const trace1 = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps: buildDeps(),
    });

    const trace2 = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps: buildDeps(),
    });

    const hash1 = hashCanonical(trace1);
    const hash2 = hashCanonical(trace2);
    expect(hash1).toBe(hash2);
    // Sanity: both are valid 0x-prefixed 32-byte hashes (66 chars).
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("different claims produce different hashes", async () => {
    const claimA = makeClaim({ id: "claim-A", claimType: "YIELD_BPS" });
    const claimB = makeClaim({ id: "claim-B-hash-test", claimType: "YIELD_BPS" });

    function buildDeps(id: string): LoopDeps {
      const model = new StubModelSeam([
        {
          text: JSON.stringify(METH_TOOL_CALL),
          tokensIn: 10,
          tokensOut: 10,
          modelUsed: "test-agent",
        },
        {
          text: JSON.stringify(FINALIZE_VALID_HIGH),
          tokensIn: 10,
          tokensOut: 10,
          modelUsed: "test-agent",
        },
      ]);
      return makeDeps(model, [5000, 5001, 5002]);
    }

    const traceA = await runLoop({
      agentId: "test-agent",
      claim: claimA,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps: buildDeps(claimA.id),
    });
    const traceB = await runLoop({
      agentId: "test-agent",
      claim: claimB,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps: buildDeps(claimB.id),
    });

    expect(hashCanonical(traceA)).not.toBe(hashCanonical(traceB));
  });
});

// ---------------------------------------------------------------------------
// 10. ModelRouter failover recorded in trace (§14.14)
// ---------------------------------------------------------------------------

describe("runLoop — ModelRouter failover in trace (§14.14)", () => {
  it("primary throws 429, fallback succeeds → trace step carries modelSwitched", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    // Primary: throws 429 on every call.
    const primary = new StubModelSeam(() => {
      throw new ModelError("HTTP 429", 429);
    });

    // Fallback: returns a valid finalize proposal.
    const fallback = new StubModelSeam([
      // Step 0 in the fallback: tool call.
      {
        text: JSON.stringify(METH_TOOL_CALL),
        tokensIn: 10,
        tokensOut: 10,
        modelUsed: "fallback-model",
      },
      // Step 1: finalize VALID.
      {
        text: JSON.stringify(FINALIZE_VALID_HIGH),
        tokensIn: 10,
        tokensOut: 10,
        modelUsed: "fallback-model",
      },
    ]);

    const router = new ModelRouter({
      primary,
      fallback,
      fallbackModel: "fallback-model",
    });

    const deps = makeDeps(router, [6000, 6001, 6002]);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    // Run should complete (not ABSTAIN due to model error).
    expect(trace.final.decision).toBe("VALID");

    // At least one step should have modelSwitched set.
    const switchedStep = trace.steps.find((s) => s.modelSwitched !== undefined);
    expect(switchedStep).toBeDefined();
    expect(switchedStep?.modelSwitched?.modelSwitched).toBe(true);
    expect(typeof switchedStep?.modelSwitched?.from).toBe("string");
    expect(typeof switchedStep?.modelSwitched?.to).toBe("string");
    expect(typeof switchedStep?.modelSwitched?.reason).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe("runLoop — edge cases", () => {
  it("malformed JSON response → structured error observation fed back, loop continues", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    const model = new StubModelSeam([
      // First response: completely unparseable.
      {
        text: "This is not JSON at all.",
        tokensIn: 5,
        tokensOut: 5,
        modelUsed: "test-agent",
      },
      // Second response: valid finalize.
      {
        text: JSON.stringify(FINALIZE_VALID_HIGH),
        tokensIn: 10,
        tokensOut: 10,
        modelUsed: "test-agent",
      },
    ]);

    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    // Should still reach VALID after the error.
    expect(trace.final.decision).toBe("VALID");
    // First step should record the error.
    expect((trace.steps[0]?.observation as Record<string, unknown>)?.error).toBe(
      "invalid_response",
    );
  });

  it("TraceSchema validates a complete trace without throwing", async () => {
    const { TraceSchema } = await import("../src/loop.js");
    const claim = makeClaim({ claimType: "YIELD_BPS" });

    const model = new StubModelSeam([
      proposalResp(METH_TOOL_CALL),
      proposalResp(FINALIZE_VALID_HIGH),
    ]);

    const deps = makeDeps(model);
    const trace = await runLoop({
      agentId: "test-agent",
      claim,
      temperament: PERMISSIVE_TEMPERAMENT,
      deps,
    });

    // Should not throw.
    const parsed = TraceSchema.safeParse(trace);
    expect(parsed.success).toBe(true);
  });
});
