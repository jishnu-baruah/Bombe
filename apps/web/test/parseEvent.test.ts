import { describe, expect, it } from "vitest";
import { parseEvent } from "../lib/parseEvent";

describe("parseEvent", () => {
  it("parses a valid CLAIM_POSTED event", () => {
    const raw = JSON.stringify({
      kind: "CLAIM_POSTED",
      claimId: "0xabc",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { yieldBps: 34 },
      postedAt: 1000,
    });
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.kind).toBe("CLAIM_POSTED");
    }
  });

  it("parses a valid AGENT_DONE event with VALID decision", () => {
    const raw = JSON.stringify({
      kind: "AGENT_DONE",
      claimId: "0xabc",
      agentAddr: "0x123",
      isHuman: false,
      decision: "VALID",
      confidenceBps: 9000,
      latencyMs: 1200,
      costUsd: 0.002,
      reasoningHash: "0xdeadbeef",
    });
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.kind).toBe("AGENT_DONE");
      if (result.event.kind === "AGENT_DONE") {
        expect(result.event.decision).toBe("VALID");
      }
    }
  });

  it("parses AGENT_DONE with ABSTAIN decision", () => {
    const raw = JSON.stringify({
      kind: "AGENT_DONE",
      claimId: "0xabc",
      agentAddr: "0x123",
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      latencyMs: 500,
      costUsd: 0.001,
      reasoningHash: "0xdeadbeef",
    });
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok && result.event.kind === "AGENT_DONE") {
      expect(result.event.decision).toBe("ABSTAIN");
    }
  });

  it("parses AGENT_DONE with blockedByProtocol flag", () => {
    const raw = JSON.stringify({
      kind: "AGENT_DONE",
      claimId: "0xabc",
      agentAddr: "0xPlugboard",
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      latencyMs: 300,
      costUsd: 0.0005,
      reasoningHash: "0xdeadbeef",
      blockedByProtocol: true,
    });
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok && result.event.kind === "AGENT_DONE") {
      expect(result.event.blockedByProtocol).toBe(true);
    }
  });

  it("routes CLAIM_POSTED by kind discriminator with Tier 2 CASHFLOW_MATCH", () => {
    const raw = JSON.stringify({
      kind: "CLAIM_POSTED",
      claimId: "0xabc",
      tier: 2,
      asset: "USDY",
      claimType: "CASHFLOW_MATCH",
      payload: { expected: 50000, actual: 45000 },
      postedAt: 2000,
    });
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const event = result.event;
      if (event.kind === "CLAIM_POSTED") {
        expect(event.claimType).toBe("CASHFLOW_MATCH");
        expect(event.tier).toBe(2);
      } else {
        throw new Error("Expected CLAIM_POSTED kind");
      }
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parseEvent("not json at all {{{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JSON parse failed/);
    }
  });

  it("returns error for unknown kind", () => {
    const result = parseEvent(JSON.stringify({ kind: "UNKNOWN_KIND", foo: "bar" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Schema validation failed/);
    }
  });

  it("returns error for AGENT_DONE missing required decision field", () => {
    const result = parseEvent(
      JSON.stringify({
        kind: "AGENT_DONE",
        claimId: "0xabc",
        agentAddr: "0x123",
        isHuman: false,
        // decision intentionally omitted
        confidenceBps: 9000,
        latencyMs: 1200,
        costUsd: 0.002,
        reasoningHash: "0xdeadbeef",
      }),
    );
    expect(result.ok).toBe(false);
  });
});
