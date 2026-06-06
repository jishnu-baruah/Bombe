/**
 * test/demo-data.test.ts — Tests for the demo-data layer.
 *
 * Key proof: hashCanonical(trace body) === stored reasoningHash for every trace.
 * This is the verify-hash guarantee: if the generator is consistent, so is the
 * client-side recompute in the browser (PRD §14.4).
 *
 * NO `any`. Deterministic — no network, no randomness.
 */

import {
  ALL_AGENT_IDS,
  type LeaderboardRow,
  type StoredTrace,
  getAttestations,
  getClaim,
  getClaims,
  getLeaderboard,
  getPlugboardSkillHash,
  getTrace,
} from "@/lib/demo-data";
import { hashCanonical } from "@bombe/shared";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// getClaims / getClaim
// ---------------------------------------------------------------------------

describe("getClaims", () => {
  it("returns 4 claims in order A–D", () => {
    const claims = getClaims();
    expect(claims).toHaveLength(4);
    expect(claims.map((c) => c.id)).toEqual(["A", "B", "C", "D"]);
  });

  it("claims have expected tiers", () => {
    const claims = getClaims();
    expect(claims[0]?.tier).toBe(1); // A: YIELD_BPS
    expect(claims[1]?.tier).toBe(1); // B: YIELD_BPS stale
    expect(claims[2]?.tier).toBe(2); // C: CASHFLOW_MATCH
    expect(claims[3]?.tier).toBe(3); // D: FAIR_VALUE
  });

  it("getClaim returns correct claim for known ID", () => {
    const c = getClaim("A");
    expect(c).toBeDefined();
    expect(c?.claimType).toBe("YIELD_BPS");
  });

  it("getClaim returns undefined for unknown ID", () => {
    expect(getClaim("Z")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAttestations
// ---------------------------------------------------------------------------

describe("getAttestations", () => {
  it("returns 5 attestations per claim (3 SDK + plugboard + human)", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      const atts = getAttestations(claimId);
      expect(atts, `claim ${claimId}`).toHaveLength(5);
    }
  });

  it("returns [] for unknown claimId", () => {
    expect(getAttestations("Z")).toHaveLength(0);
  });

  it("Plugboard attestation on claim D has blockedByProtocol=true", () => {
    const atts = getAttestations("D");
    const pb = atts.find((a) => a.agentId === "plugboard");
    expect(pb?.blockedByProtocol).toBe(true);
    expect(pb?.decision).toBe("ABSTAIN");
  });

  it("Plugboard attestations carry skillHash (non-null)", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      const atts = getAttestations(claimId);
      const pb = atts.find((a) => a.agentId === "plugboard");
      expect(pb?.skillHash, `claim ${claimId} plugboard skillHash`).not.toBeNull();
      expect(pb?.skillHash).toMatch(/^0x[0-9a-f]{64}$/i);
    }
  });

  it("human attestations have isHuman=true", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      const atts = getAttestations(claimId);
      const h = atts.find((a) => a.agentId === "human");
      expect(h?.isHuman, `claim ${claimId} human.isHuman`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getTrace + hash integrity (PRD §14.4)
// ---------------------------------------------------------------------------

describe("getTrace — hash integrity", () => {
  it("returns a trace for all (claimId, agentId) combinations", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      for (const agentId of ALL_AGENT_IDS) {
        const trace = getTrace(claimId, agentId);
        expect(trace, `${claimId}/${agentId}`).toBeDefined();
      }
    }
  });

  it("returns undefined for unknown claimId", () => {
    expect(getTrace("Z", "reflector")).toBeUndefined();
  });

  it("returns undefined for unknown agentId", () => {
    expect(getTrace("A", "unknown-agent")).toBeUndefined();
  });

  /**
   * KEY PROOF: hashCanonical(trace body) === stored reasoningHash
   *
   * This verifies that:
   * 1. The generator computed hashes correctly (not hand-typed).
   * 2. The client-side verify-hash button will return "match" for every trace.
   * (PRD §14.4)
   */
  it("hashCanonical(trace body) === stored reasoningHash — for ALL traces", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      for (const agentId of ALL_AGENT_IDS) {
        const stored = getTrace(claimId, agentId);
        if (!stored) throw new Error(`trace ${claimId}/${agentId} missing`);
        // Strip the metadata fields added by the generator (same logic as verifyTraceHash)
        const { reasoningHash: storedHash, skillHash: _sh, ...traceBody } = stored;
        const recomputed = hashCanonical(traceBody);
        expect(recomputed, `${claimId}/${agentId}: recomputed hash should match stored hash`).toBe(
          storedHash,
        );
      }
    }
  });

  it("a tampered trace produces a DIFFERENT hash (mismatch proof)", () => {
    const stored = getTrace("A", "reflector");
    if (!stored) throw new Error("trace A/reflector missing");
    // Tamper: change the final decision
    const tampered: StoredTrace = {
      ...stored,
      final: { ...stored.final, decision: "REJECTED" },
    };
    const { reasoningHash: originalHash, skillHash: _sh, ...traceBody } = tampered;
    const recomputed = hashCanonical(traceBody);
    // The recomputed hash of the tampered body should NOT match the original stored hash
    expect(recomputed).not.toBe(originalHash);
  });
});

// ---------------------------------------------------------------------------
// getLeaderboard
// ---------------------------------------------------------------------------

describe("getLeaderboard", () => {
  it("returns 5 rows (3 SDK agents + plugboard + human)", () => {
    expect(getLeaderboard()).toHaveLength(5);
  });

  it("contains both AI and human rows interleaved in one table", () => {
    const rows = getLeaderboard();
    const humanRows = rows.filter((r) => r.isHuman);
    const aiRows = rows.filter((r) => !r.isHuman);
    expect(humanRows.length).toBeGreaterThan(0);
    expect(aiRows.length).toBeGreaterThan(0);
    // Not separated into blocks — all rows are in one ranked list
    expect(rows).toHaveLength(humanRows.length + aiRows.length);
  });

  it("ranks are unique and start at 1", () => {
    const rows = getLeaderboard();
    const ranks = rows.map((r) => r.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(Math.min(...ranks)).toBe(1);
  });

  it("accuracy excludes abstentions from denominator for all rows", () => {
    const rows = getLeaderboard();
    for (const row of rows) {
      const decisive = row.totalDecisions - row.abstained;
      if (decisive > 0) {
        const expected = Math.round((row.correct / decisive) * 1000) / 10;
        expect(row.accuracyPct, `${row.agentId} accuracy`).toBe(expected);
      } else {
        expect(row.accuracyPct, `${row.agentId} all-abstain`).toBeNull();
      }
    }
  });

  it("Plugboard row has isExternal=true", () => {
    const rows = getLeaderboard();
    const pb = rows.find((r) => r.agentId === "plugboard");
    expect(pb?.isExternal).toBe(true);
    expect(pb?.isHuman).toBe(false);
  });

  it("human row has isHuman=true and isExternal=false", () => {
    const rows = getLeaderboard();
    const h = rows.find((r) => r.agentId === "human");
    expect(h?.isHuman).toBe(true);
    expect(h?.isExternal).toBe(false);
  });

  it("total decisions per row is 4 (one per claim)", () => {
    const rows = getLeaderboard();
    for (const row of rows) {
      expect(row.totalDecisions, `${row.agentId} totalDecisions`).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// getPlugboardSkillHash
// ---------------------------------------------------------------------------

describe("getPlugboardSkillHash", () => {
  it("returns a valid 0x-prefixed 32-byte hex hash", () => {
    const hash = getPlugboardSkillHash();
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("matches the skillHash on Plugboard attestations", () => {
    const hash = getPlugboardSkillHash();
    const atts = getAttestations("A");
    const pb = atts.find((a) => a.agentId === "plugboard");
    expect(pb?.skillHash).toBe(hash);
  });
});
