/**
 * T-703: unit tests for the pure assertion logic in scripts/test-demo.ts.
 *
 * Tests the §6.7 expected-matrix comparison functions WITHOUT running the
 * full test:demo suite. Fast (no model calls, no file I/O beyond imports).
 *
 * Covers:
 *   - assertOutcome: correct pass/fail for each decision + reason + blockedByProtocol
 *   - assertMatrix: full matrix pass when all outcomes match §6.7
 *   - assertMatrix: detects individual failures in the matrix
 *   - assertMatrix: handles missing claims gracefully
 *   - EXPECTED_MATRIX shape: all 4 claims × 4 agents present
 */

import { describe, expect, it } from "vitest";
import { EXPECTED_MATRIX, assertMatrix, assertOutcome } from "../test-demo.js";
import type { ActualOutcome, ClaimResult } from "../test-demo.js";

// ---------------------------------------------------------------------------
// assertOutcome — unit tests
// ---------------------------------------------------------------------------

describe("assertOutcome", () => {
  it("passes when decision matches and no reason constraint", () => {
    const result = assertOutcome("A", "reflector", { decision: "VALID" }, { decision: "VALID" });
    expect(result.pass).toBe(true);
    expect(result.message).toMatch(/PASS/);
  });

  it("fails when decision does not match", () => {
    const result = assertOutcome("A", "reflector", { decision: "VALID" }, { decision: "ABSTAIN" });
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/FAIL/);
    expect(result.message).toMatch(/VALID/);
    expect(result.message).toMatch(/ABSTAIN/);
  });

  it("passes when reasonContains is satisfied", () => {
    const result = assertOutcome(
      "B",
      "reflector",
      { decision: "ABSTAIN", reasonContains: "STALE_SINGLE_SOURCE" },
      { decision: "ABSTAIN", reasons: ["STALE_SINGLE_SOURCE"] },
    );
    expect(result.pass).toBe(true);
  });

  it("fails when reasonContains is not found in reasons", () => {
    const result = assertOutcome(
      "B",
      "reflector",
      { decision: "ABSTAIN", reasonContains: "STALE_SINGLE_SOURCE" },
      { decision: "ABSTAIN", reasons: ["MODEL_ABSTAIN"] },
    );
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/STALE_SINGLE_SOURCE/);
  });

  it("passes with partial reason match (contains check)", () => {
    const result = assertOutcome(
      "D",
      "reflector",
      { decision: "ABSTAIN", reasonContains: "TIER3" },
      { decision: "ABSTAIN", reasons: ["TIER3_OVERRIDE"] },
    );
    expect(result.pass).toBe(true);
  });

  it("passes when blockedByProtocol is expected and present", () => {
    const result = assertOutcome(
      "D",
      "plugboard",
      { decision: "ABSTAIN", blockedByProtocol: true },
      { decision: "ABSTAIN", blockedByProtocol: true },
    );
    expect(result.pass).toBe(true);
  });

  it("fails when blockedByProtocol expected but absent", () => {
    const result = assertOutcome(
      "D",
      "plugboard",
      { decision: "ABSTAIN", blockedByProtocol: true },
      { decision: "ABSTAIN", blockedByProtocol: false },
    );
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/blockedByProtocol/);
  });

  it("passes for REJECTED decision (claim C)", () => {
    const result = assertOutcome("C", "rotor", { decision: "REJECTED" }, { decision: "REJECTED" });
    expect(result.pass).toBe(true);
  });

  it("does not require reasonContains when reasons is empty array", () => {
    // reasonContains only applies when specified in expected
    const result = assertOutcome(
      "A",
      "rotor",
      { decision: "VALID" },
      { decision: "VALID", reasons: [] },
    );
    expect(result.pass).toBe(true);
  });

  it("fails when reasonContains specified but reasons is undefined", () => {
    const result = assertOutcome(
      "B",
      "reflector",
      { decision: "ABSTAIN", reasonContains: "STALE_SINGLE_SOURCE" },
      { decision: "ABSTAIN" }, // no reasons field
    );
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertMatrix — unit tests
// ---------------------------------------------------------------------------

/** Build a ClaimResult matching the §6.7 expected outcomes exactly. */
function makeCorrectResults(): Record<string, ClaimResult> {
  return {
    A: {
      claimId: "A",
      reflector: { decision: "VALID", reasons: [] },
      rotor: { decision: "VALID", reasons: [] },
      stator: { decision: "VALID", reasons: [] },
      plugboard: { decision: "VALID", blockedByProtocol: false },
    },
    B: {
      claimId: "B",
      reflector: { decision: "ABSTAIN", reasons: ["STALE_SINGLE_SOURCE"] },
      rotor: { decision: "VALID", reasons: [] },
      stator: { decision: "ABSTAIN", reasons: ["MODEL_ABSTAIN"] },
      plugboard: { decision: "ABSTAIN", blockedByProtocol: false },
    },
    C: {
      claimId: "C",
      reflector: { decision: "REJECTED", reasons: [] },
      rotor: { decision: "REJECTED", reasons: [] },
      stator: { decision: "REJECTED", reasons: [] },
      plugboard: { decision: "REJECTED", blockedByProtocol: false },
    },
    D: {
      claimId: "D",
      reflector: { decision: "ABSTAIN", reasons: ["TIER3_OVERRIDE"] },
      rotor: { decision: "ABSTAIN", reasons: ["TIER3_OVERRIDE"] },
      stator: { decision: "ABSTAIN", reasons: ["TIER3_OVERRIDE"] },
      plugboard: { decision: "ABSTAIN", blockedByProtocol: true },
    },
  };
}

describe("assertMatrix", () => {
  it("all pass when results exactly match §6.7 expected matrix", () => {
    const results = makeCorrectResults();
    const assertions = assertMatrix(results, EXPECTED_MATRIX);

    expect(assertions.length).toBe(16); // 4 claims × 4 agents
    for (const a of assertions) {
      expect(a.pass).toBe(true);
    }
  });

  it("detects a single decision mismatch", () => {
    const results = makeCorrectResults();
    // Flip Rotor/B to ABSTAIN (should be VALID)
    (results.B as ClaimResult).rotor = { decision: "ABSTAIN", reasons: ["MODEL_ABSTAIN"] };

    const assertions = assertMatrix(results, EXPECTED_MATRIX);
    const failed = assertions.filter((a) => !a.pass);

    expect(failed).toHaveLength(1);
    expect(failed[0]?.claimId).toBe("B");
    expect(failed[0]?.agentKey).toBe("rotor");
    expect(failed[0]?.message).toMatch(/FAIL/);
  });

  it("detects missing STALE_SINGLE_SOURCE reason for Reflector/B", () => {
    const results = makeCorrectResults();
    // Reflector abstains but without the expected reason
    (results.B as ClaimResult).reflector = { decision: "ABSTAIN", reasons: ["MODEL_ABSTAIN"] };

    const assertions = assertMatrix(results, EXPECTED_MATRIX);
    const failed = assertions.filter((a) => !a.pass);

    expect(failed).toHaveLength(1);
    expect(failed[0]?.agentKey).toBe("reflector");
    expect(failed[0]?.message).toMatch(/STALE_SINGLE_SOURCE/);
  });

  it("detects missing blockedByProtocol for Plugboard/D", () => {
    const results = makeCorrectResults();
    (results.D as ClaimResult).plugboard = { decision: "ABSTAIN", blockedByProtocol: false };

    const assertions = assertMatrix(results, EXPECTED_MATRIX);
    const failed = assertions.filter((a) => !a.pass);

    expect(failed).toHaveLength(1);
    expect(failed[0]?.agentKey).toBe("plugboard");
    expect(failed[0]?.claimId).toBe("D");
    expect(failed[0]?.message).toMatch(/blockedByProtocol/);
  });

  it("detects all 4 agents wrong for claim C (all VALID instead of REJECTED)", () => {
    const results = makeCorrectResults();
    (results.C as ClaimResult).reflector = { decision: "VALID", reasons: [] };
    (results.C as ClaimResult).rotor = { decision: "VALID", reasons: [] };
    (results.C as ClaimResult).stator = { decision: "VALID", reasons: [] };
    (results.C as ClaimResult).plugboard = { decision: "VALID", blockedByProtocol: false };

    const assertions = assertMatrix(results, EXPECTED_MATRIX);
    const claimCFailed = assertions.filter((a) => a.claimId === "C" && !a.pass);

    expect(claimCFailed).toHaveLength(4);
  });

  it("handles missing claim in results (returns 4 failures for that claim)", () => {
    const results = makeCorrectResults();
    // Remove claim B entirely
    const { B: _removed, ...rest } = results;
    void _removed;

    const assertions = assertMatrix(rest, EXPECTED_MATRIX);
    const bFailed = assertions.filter((a) => a.claimId === "B" && !a.pass);

    expect(bFailed).toHaveLength(4); // all 4 agents fail
  });

  it("returns exactly 16 assertions for the full A→D run", () => {
    const results = makeCorrectResults();
    const assertions = assertMatrix(results, EXPECTED_MATRIX);
    expect(assertions).toHaveLength(16);
  });

  it("handles SDK TIER3_OVERRIDE reason with 'contains' check for claim D", () => {
    const results = makeCorrectResults();
    // TIER3_OVERRIDE is a valid reason string containing "TIER3"
    const assertions = assertMatrix(results, EXPECTED_MATRIX);
    const dAssertions = assertions.filter((a) => a.claimId === "D");

    // SDK agents (reflector/rotor/stator) for D should all pass
    const dSdkPass = dAssertions.filter((a) => a.agentKey !== "plugboard").every((a) => a.pass);
    expect(dSdkPass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EXPECTED_MATRIX shape
// ---------------------------------------------------------------------------

describe("EXPECTED_MATRIX", () => {
  it("has entries for all four claims A, B, C, D", () => {
    expect(Object.keys(EXPECTED_MATRIX).sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("has all four agent keys for each claim", () => {
    const expectedAgents = ["plugboard", "reflector", "rotor", "stator"];
    for (const claimId of ["A", "B", "C", "D"]) {
      const entry = EXPECTED_MATRIX[claimId];
      expect(entry).toBeDefined();
      expect(Object.keys(entry as object).sort()).toEqual(expectedAgents);
    }
  });

  it("claim A: all agents VALID", () => {
    for (const agentKey of ["reflector", "rotor", "stator", "plugboard"] as const) {
      expect(EXPECTED_MATRIX.A?.[agentKey]?.decision).toBe("VALID");
    }
  });

  it("claim B: Reflector ABSTAIN(STALE_SINGLE_SOURCE), Rotor VALID, Stator ABSTAIN, Plugboard ABSTAIN", () => {
    expect(EXPECTED_MATRIX.B?.reflector.decision).toBe("ABSTAIN");
    expect(EXPECTED_MATRIX.B?.reflector.reasonContains).toBe("STALE_SINGLE_SOURCE");
    expect(EXPECTED_MATRIX.B?.rotor.decision).toBe("VALID");
    expect(EXPECTED_MATRIX.B?.stator.decision).toBe("ABSTAIN");
    expect(EXPECTED_MATRIX.B?.plugboard.decision).toBe("ABSTAIN");
  });

  it("claim C: all agents REJECTED", () => {
    for (const agentKey of ["reflector", "rotor", "stator", "plugboard"] as const) {
      expect(EXPECTED_MATRIX.C?.[agentKey]?.decision).toBe("REJECTED");
    }
  });

  it("claim D: SDK agents ABSTAIN(TIER3), Plugboard ABSTAIN + blockedByProtocol", () => {
    for (const agentKey of ["reflector", "rotor", "stator"] as const) {
      expect(EXPECTED_MATRIX.D?.[agentKey]?.decision).toBe("ABSTAIN");
      expect(EXPECTED_MATRIX.D?.[agentKey]?.reasonContains).toBe("TIER3");
    }
    expect(EXPECTED_MATRIX.D?.plugboard.decision).toBe("ABSTAIN");
    expect(EXPECTED_MATRIX.D?.plugboard.blockedByProtocol).toBe(true);
  });
});
