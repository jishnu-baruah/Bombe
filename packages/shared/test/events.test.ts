import { describe, expect, it } from "vitest";
import {
  AgentDoneEventSchema,
  AgentStepEventSchema,
  ClaimPostedEventSchema,
  DisputeResolvedEventSchema,
  EpochSettledEventSchema,
  HumanQueueUpdateEventSchema,
  SseEventSchema,
} from "../src/events.js";

// ---------------------------------------------------------------------------
// CLAIM_POSTED
// ---------------------------------------------------------------------------
describe("ClaimPostedEventSchema", () => {
  const valid = {
    kind: "CLAIM_POSTED" as const,
    claimId: "0xabc123",
    tier: 1 as const,
    asset: "mETH" as const,
    claimType: "YIELD_BPS" as const,
    payload: { expectedBps: 450 },
    postedAt: 1700000000,
  };

  it("parses a valid CLAIM_POSTED event", () => {
    expect(ClaimPostedEventSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts all three assets", () => {
    for (const asset of ["mETH", "USDY", "PC-POOL-1"] as const) {
      expect(ClaimPostedEventSchema.safeParse({ ...valid, asset }).success).toBe(true);
    }
  });

  it("accepts all tiers 1, 2, 3", () => {
    for (const tier of [1, 2, 3] as const) {
      expect(ClaimPostedEventSchema.safeParse({ ...valid, tier }).success).toBe(true);
    }
  });

  it("rejects an invalid asset", () => {
    expect(ClaimPostedEventSchema.safeParse({ ...valid, asset: "UNKNOWN" }).success).toBe(false);
  });

  it("rejects missing claimId", () => {
    const { claimId: _c, ...without } = valid;
    expect(ClaimPostedEventSchema.safeParse(without).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AGENT_STEP
// ---------------------------------------------------------------------------
describe("AgentStepEventSchema", () => {
  const valid = {
    kind: "AGENT_STEP" as const,
    claimId: "0xabc123",
    agentAddr: "0xdeadbeef",
    step: 1,
    thought: "Checking oracle price",
    action: { tool: "fetch", url: "https://api.example.com" },
    ts: 1700000001,
  };

  it("parses a valid AGENT_STEP event", () => {
    expect(AgentStepEventSchema.safeParse(valid).success).toBe(true);
  });

  it("action can be any shape (permissive)", () => {
    expect(AgentStepEventSchema.safeParse({ ...valid, action: null }).success).toBe(true);
    expect(AgentStepEventSchema.safeParse({ ...valid, action: 42 }).success).toBe(true);
    expect(AgentStepEventSchema.safeParse({ ...valid, action: "string-action" }).success).toBe(
      true,
    );
  });

  it("rejects missing step", () => {
    const { step: _s, ...without } = valid;
    expect(AgentStepEventSchema.safeParse(without).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AGENT_DONE
// ---------------------------------------------------------------------------
describe("AgentDoneEventSchema", () => {
  const valid = {
    kind: "AGENT_DONE" as const,
    claimId: "0xabc123",
    agentAddr: "0xdeadbeef",
    isHuman: false,
    decision: "VALID" as const,
    confidenceBps: 9000,
    latencyMs: 320,
    costUsd: 0.0012,
    reasoningHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
  };

  it("parses a valid AGENT_DONE event", () => {
    expect(AgentDoneEventSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts all three decision values", () => {
    for (const decision of ["VALID", "REJECTED", "ABSTAIN"] as const) {
      expect(AgentDoneEventSchema.safeParse({ ...valid, decision }).success).toBe(true);
    }
  });

  it("parses AGENT_DONE with blockedByProtocol: true", () => {
    const result = AgentDoneEventSchema.safeParse({ ...valid, blockedByProtocol: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockedByProtocol).toBe(true);
    }
  });

  it("blockedByProtocol is optional — omitting it is fine", () => {
    expect(AgentDoneEventSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid decision value", () => {
    expect(AgentDoneEventSchema.safeParse({ ...valid, decision: "MAYBE" }).success).toBe(false);
  });

  it("rejects missing reasoningHash", () => {
    const { reasoningHash: _r, ...without } = valid;
    expect(AgentDoneEventSchema.safeParse(without).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HUMAN_QUEUE_UPDATE
// ---------------------------------------------------------------------------
describe("HumanQueueUpdateEventSchema", () => {
  const valid = {
    kind: "HUMAN_QUEUE_UPDATE" as const,
    claimId: "0xabc123",
    position: 3,
    estimatedWaitMin: 10,
  };

  it("parses a valid HUMAN_QUEUE_UPDATE event", () => {
    expect(HumanQueueUpdateEventSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing position", () => {
    const { position: _p, ...without } = valid;
    expect(HumanQueueUpdateEventSchema.safeParse(without).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EPOCH_SETTLED
// ---------------------------------------------------------------------------
describe("EpochSettledEventSchema", () => {
  const valid = {
    kind: "EPOCH_SETTLED" as const,
    epoch: 5,
    highlights: ["All claims settled", "No disputes"],
  };

  it("parses a valid EPOCH_SETTLED event", () => {
    expect(EpochSettledEventSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts empty highlights array", () => {
    expect(EpochSettledEventSchema.safeParse({ ...valid, highlights: [] }).success).toBe(true);
  });

  it("rejects highlights that is not an array of strings", () => {
    expect(EpochSettledEventSchema.safeParse({ ...valid, highlights: [1, 2, 3] }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// DISPUTE_RESOLVED
// ---------------------------------------------------------------------------
describe("DisputeResolvedEventSchema", () => {
  const valid = {
    kind: "DISPUTE_RESOLVED" as const,
    disputeId: "dispute-001",
    claimId: "0xabc123",
    accused: "0xbadagent",
    verdict: "GUILTY",
    slashAmount: 500,
  };

  it("parses a valid DISPUTE_RESOLVED event", () => {
    expect(DisputeResolvedEventSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing accused", () => {
    const { accused: _a, ...without } = valid;
    expect(DisputeResolvedEventSchema.safeParse(without).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SseEventSchema discriminated union
// ---------------------------------------------------------------------------
describe("SseEventSchema — discriminated union routing", () => {
  it("routes CLAIM_POSTED correctly", () => {
    const event = {
      kind: "CLAIM_POSTED",
      claimId: "0x1",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: {},
      postedAt: 1000,
    };
    const result = SseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("CLAIM_POSTED");
  });

  it("routes AGENT_STEP correctly", () => {
    const event = {
      kind: "AGENT_STEP",
      claimId: "0x1",
      agentAddr: "0xaddr",
      step: 2,
      thought: "thinking",
      action: {},
      ts: 1000,
    };
    const result = SseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("AGENT_STEP");
  });

  it("routes AGENT_DONE correctly", () => {
    const event = {
      kind: "AGENT_DONE",
      claimId: "0x1",
      agentAddr: "0xaddr",
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      latencyMs: 100,
      costUsd: 0,
      reasoningHash: "0xhash",
    };
    const result = SseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("AGENT_DONE");
  });

  it("routes HUMAN_QUEUE_UPDATE correctly", () => {
    const event = { kind: "HUMAN_QUEUE_UPDATE", claimId: "0x1", position: 1, estimatedWaitMin: 5 };
    const result = SseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("HUMAN_QUEUE_UPDATE");
  });

  it("routes EPOCH_SETTLED correctly", () => {
    const event = { kind: "EPOCH_SETTLED", epoch: 1, highlights: ["done"] };
    const result = SseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("EPOCH_SETTLED");
  });

  it("routes DISPUTE_RESOLVED correctly", () => {
    const event = {
      kind: "DISPUTE_RESOLVED",
      disputeId: "d1",
      claimId: "0x1",
      accused: "0xbad",
      verdict: "GUILTY",
      slashAmount: 100,
    };
    const result = SseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("DISPUTE_RESOLVED");
  });

  it("rejects an invalid kind", () => {
    const result = SseEventSchema.safeParse({ kind: "UNKNOWN_EVENT", claimId: "0x1" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing kind", () => {
    const result = SseEventSchema.safeParse({ claimId: "0x1" });
    expect(result.success).toBe(false);
  });

  it("rejects AGENT_DONE with a missing required field (isHuman)", () => {
    const event = {
      kind: "AGENT_DONE",
      claimId: "0x1",
      agentAddr: "0xaddr",
      // isHuman intentionally omitted
      decision: "VALID",
      confidenceBps: 9000,
      latencyMs: 100,
      costUsd: 0,
      reasoningHash: "0xhash",
    };
    expect(SseEventSchema.safeParse(event).success).toBe(false);
  });
});
