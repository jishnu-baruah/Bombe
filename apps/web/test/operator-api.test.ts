/**
 * test/operator-api.test.ts — T-606 operator API tests
 *
 * Tests pure gating/validation logic without needing Next.js route machinery.
 * Covers:
 *   - missing key → 401 gating logic
 *   - correct key → 200 with expected ack shape
 *   - seed-claim validation
 *   - human-attest validation
 *   - freeze-plugboard ack shape
 *
 * All tests are deterministic — no network, no randomness.
 * NO `any` anywhere.
 */

import {
  type FreezePlugboardAck,
  type HumanAttestAck,
  type SeedClaimAck,
  parseHumanAttestBody,
  parseRegisterAgentBody,
  parseSeedClaimBody,
  parseSettleBody,
} from "@/lib/operator-schemas";
import {
  advanceDemo,
  freezePlugboard,
  getOperatorState,
  humanAttest,
  registerAgent,
  resetOperatorState,
  seedClaim,
  unfreezePlugboard,
} from "@/lib/operator-state";
import { validateOperatorKey } from "@/lib/server-config";
import { beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Headers-like object for gating tests. */
function makeHeaders(key?: string): Headers {
  const h = new Headers();
  if (key !== undefined) h.set("x-operator-key", key);
  return h;
}

beforeEach(() => {
  resetOperatorState();
});

// ---------------------------------------------------------------------------
// 1. Key gating — validateOperatorKey
// ---------------------------------------------------------------------------

describe("validateOperatorKey", () => {
  it("missing x-operator-key → false (maps to 401)", () => {
    const headers = makeHeaders();
    expect(validateOperatorKey(headers)).toBe(false);
  });

  it("wrong key → false (maps to 401)", () => {
    const headers = makeHeaders("wrong-key");
    expect(validateOperatorKey(headers)).toBe(false);
  });

  it("correct default key (dev-operator) → true (maps to 200)", () => {
    const headers = makeHeaders("dev-operator");
    expect(validateOperatorKey(headers)).toBe(true);
  });

  it("empty string key → false", () => {
    const headers = makeHeaders("");
    expect(validateOperatorKey(headers)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. parseSeedClaimBody
// ---------------------------------------------------------------------------

describe("parseSeedClaimBody", () => {
  it("valid body → success with correct data", () => {
    const result = parseSeedClaimBody({
      claimId: "A",
      claimType: "YIELD_BPS",
      asset: "mETH",
      payload: { yieldBps: 450 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimId).toBe("A");
      expect(result.data.claimType).toBe("YIELD_BPS");
      expect(result.data.asset).toBe("mETH");
      expect(result.data.payload).toEqual({ yieldBps: 450 });
    }
  });

  it("missing claimId → error", () => {
    const result = parseSeedClaimBody({
      claimType: "YIELD_BPS",
      asset: "mETH",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("invalid claimType → error", () => {
    const result = parseSeedClaimBody({
      claimId: "A",
      claimType: "NOT_A_TYPE",
      asset: "mETH",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("payload is array → error", () => {
    const result = parseSeedClaimBody({
      claimId: "A",
      claimType: "YIELD_BPS",
      asset: "mETH",
      payload: [1, 2, 3],
    });
    expect(result.success).toBe(false);
  });

  it("null body → error", () => {
    expect(parseSeedClaimBody(null).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. parseHumanAttestBody
// ---------------------------------------------------------------------------

describe("parseHumanAttestBody", () => {
  it("valid body → success", () => {
    const result = parseHumanAttestBody({
      claimId: "B",
      decision: "ABSTAIN",
      confidenceBps: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimId).toBe("B");
      expect(result.data.decision).toBe("ABSTAIN");
      expect(result.data.confidenceBps).toBe(5000);
    }
  });

  it("invalid decision → error", () => {
    const result = parseHumanAttestBody({
      claimId: "A",
      decision: "MAYBE",
      confidenceBps: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("confidenceBps out of range (> 10000) → error", () => {
    const result = parseHumanAttestBody({
      claimId: "A",
      decision: "VALID",
      confidenceBps: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("confidenceBps negative → error", () => {
    const result = parseHumanAttestBody({
      claimId: "A",
      decision: "VALID",
      confidenceBps: -1,
    });
    expect(result.success).toBe(false);
  });

  it("confidenceBps not integer → error", () => {
    const result = parseHumanAttestBody({
      claimId: "A",
      decision: "VALID",
      confidenceBps: 42.5,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. seedClaim → returns expected ack shape
// ---------------------------------------------------------------------------

describe("seedClaim (mock state)", () => {
  it("returns ack with ok=true and expected fields", () => {
    const result = seedClaim("A", "YIELD_BPS", "mETH", { yieldBps: 450 });
    const ack: SeedClaimAck = { ok: true, ...result };
    expect(ack.ok).toBe(true);
    expect(ack.claimId).toBe("A");
    expect(ack.txHash).toMatch(/^0xmock-seed-/);
    expect(typeof ack.seededAt).toBe("number");
    expect(ack.seededAt).toBeGreaterThan(0);
  });

  it("adds claim to operator state", () => {
    seedClaim("B", "CASHFLOW_MATCH", "PC-POOL-1", { expected: 100 });
    const state = getOperatorState();
    expect(state.seededClaims).toHaveLength(1);
    expect(state.seededClaims[0]?.claimId).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// 5. humanAttest → returns expected ack shape
// ---------------------------------------------------------------------------

describe("humanAttest (mock state)", () => {
  it("returns ack with ok=true and expected fields", () => {
    const result = humanAttest("C", "REJECTED", 7500);
    const ack: HumanAttestAck = { ok: true, ...result };
    expect(ack.ok).toBe(true);
    expect(ack.claimId).toBe("C");
    expect(ack.decision).toBe("REJECTED");
    expect(ack.confidenceBps).toBe(7500);
    expect(ack.txHash).toMatch(/^0xmock-human-attest-/);
    expect(typeof ack.attestedAt).toBe("number");
  });

  it("records attestation in operator state", () => {
    humanAttest("A", "VALID", 9000);
    const state = getOperatorState();
    expect(state.humanAttestations).toHaveLength(1);
    expect(state.humanAttestations[0]?.decision).toBe("VALID");
  });
});

// ---------------------------------------------------------------------------
// 6. freezePlugboard → returns expected ack shape
// ---------------------------------------------------------------------------

describe("freezePlugboard (mock state)", () => {
  it("returns ack with frozen=true, snapshotHash, frozenAt", () => {
    const result = freezePlugboard();
    const ack: FreezePlugboardAck = { ok: true, ...result };
    expect(ack.ok).toBe(true);
    expect(ack.frozen).toBe(true);
    expect(ack.snapshotHash).toMatch(/^0xmock-skill-snapshot-/);
    expect(typeof ack.frozenAt).toBe("number");
  });

  it("sets plugboardFrozen=true in state", () => {
    freezePlugboard();
    expect(getOperatorState().plugboardFrozen).toBe(true);
  });

  it("unfreeze sets plugboardFrozen=false", () => {
    freezePlugboard();
    const result = unfreezePlugboard();
    expect(result.frozen).toBe(false);
    expect(getOperatorState().plugboardFrozen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. registerAgent
// ---------------------------------------------------------------------------

describe("registerAgent (mock state)", () => {
  it("returns an agent with mock address", () => {
    const agent = registerAgent("test-agent", "claude-3-5-sonnet", false, "1000000000000000000");
    expect(agent.name).toBe("test-agent");
    expect(agent.address).toMatch(/^0xmock-agent-/);
    expect(typeof agent.registeredAt).toBe("number");
  });

  it("multiple registrations get distinct addresses", () => {
    const a1 = registerAgent("alpha", "model-a", false, "1000");
    const a2 = registerAgent("beta", "model-b", true, "2000");
    expect(a1.address).not.toBe(a2.address);
  });
});

// ---------------------------------------------------------------------------
// 8. advanceDemo
// ---------------------------------------------------------------------------

describe("advanceDemo (mock state)", () => {
  it("starts at A and advances to B", () => {
    const result = advanceDemo();
    expect(result.previousClaim).toBe("A");
    expect(result.nextClaim).toBe("B");
  });

  it("full cycle A→B→C→D→A", () => {
    const steps = [advanceDemo(), advanceDemo(), advanceDemo(), advanceDemo()];
    expect(steps[0]?.previousClaim).toBe("A");
    expect(steps[1]?.previousClaim).toBe("B");
    expect(steps[2]?.previousClaim).toBe("C");
    expect(steps[3]?.previousClaim).toBe("D");
    // Wraps back to A
    expect(steps[3]?.nextClaim).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// 9. parseSettleBody
// ---------------------------------------------------------------------------

describe("parseSettleBody", () => {
  it("valid body → success", () => {
    const result = parseSettleBody({ claimId: "A", groundTruth: "VALID" });
    expect(result.success).toBe(true);
  });

  it("invalid groundTruth → error", () => {
    const result = parseSettleBody({ claimId: "A", groundTruth: "WRONG" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. parseRegisterAgentBody
// ---------------------------------------------------------------------------

describe("parseRegisterAgentBody", () => {
  it("valid body → success", () => {
    const result = parseRegisterAgentBody({
      name: "reflector",
      model: "claude-3-5-sonnet",
      isHuman: false,
      bondWei: "1000000000000000000",
    });
    expect(result.success).toBe(true);
  });

  it("isHuman as string → error (must be boolean)", () => {
    const result = parseRegisterAgentBody({
      name: "agent",
      model: "model",
      isHuman: "true",
      bondWei: "1000",
    });
    expect(result.success).toBe(false);
  });
});
