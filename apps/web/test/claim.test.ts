/**
 * test/claim.test.ts — Tests for the verify-hash logic on /claim/[id].
 *
 * Tests the pure verifyTraceHash function. The key properties:
 * 1. Returns "match" for any valid stored trace.
 * 2. Returns "mismatch" for a tampered trace.
 * NO `any`. Deterministic.
 */

import { ALL_AGENT_IDS, type StoredTrace, getTrace } from "@/lib/demo-data";
// Note: @bombe/shared is fine in vitest (Node.js context — fs/events are available).
// For the browser (Next.js build), verify-hash.ts imports only the canonical submodule.
import { verifyTraceHash } from "@/lib/verify-hash";
import { hashCanonical } from "@bombe/shared";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// verifyTraceHash — pure comparison
// ---------------------------------------------------------------------------

describe("verifyTraceHash", () => {
  it("returns 'match' for all stored traces (all claims, all agents)", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      for (const agentId of ALL_AGENT_IDS) {
        const trace = getTrace(claimId, agentId);
        if (!trace) continue;
        const result = verifyTraceHash(trace);
        expect(result, `${claimId}/${agentId}`).toBe("match");
      }
    }
  });

  it("returns 'mismatch' when the final decision is tampered", () => {
    const stored = getTrace("A", "reflector");
    if (!stored) throw new Error("trace A/reflector missing");
    const tampered: StoredTrace = {
      ...stored,
      final: { ...stored.final, decision: "REJECTED" },
    };
    expect(verifyTraceHash(tampered)).toBe("mismatch");
  });

  it("returns 'mismatch' when a step thought is tampered", () => {
    const stored = getTrace("A", "reflector");
    if (!stored) throw new Error("trace A/reflector missing");
    const steps = [...stored.steps];
    if (steps.length === 0) return; // no steps to tamper — skip
    const step0 = steps[0];
    if (!step0) return;
    steps[0] = { ...step0, thought: "TAMPERED thought" };
    const tampered: StoredTrace = { ...stored, steps };
    expect(verifyTraceHash(tampered)).toBe("mismatch");
  });

  it("returns 'mismatch' when confidenceBps is changed", () => {
    const stored = getTrace("C", "rotor");
    if (!stored) throw new Error("trace C/rotor missing");
    const tampered: StoredTrace = {
      ...stored,
      final: { ...stored.final, confidenceBps: 9999 },
    };
    expect(verifyTraceHash(tampered)).toBe("mismatch");
  });

  it("returns 'match' for Plugboard traces (which have skillHash field)", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      const trace = getTrace(claimId, "plugboard");
      if (!trace) continue;
      expect(verifyTraceHash(trace), `plugboard/${claimId}`).toBe("match");
    }
  });

  it("returns 'match' for human traces (which have empty steps)", () => {
    for (const claimId of ["A", "B", "C", "D"]) {
      const trace = getTrace(claimId, "human");
      if (!trace) continue;
      expect(verifyTraceHash(trace), `human/${claimId}`).toBe("match");
    }
  });

  it("match/mismatch is deterministic — calling twice gives same result", () => {
    const stored = getTrace("B", "rotor");
    if (!stored) throw new Error("trace B/rotor missing");
    const r1 = verifyTraceHash(stored);
    const r2 = verifyTraceHash(stored);
    expect(r1).toBe(r2);
    expect(r1).toBe("match");
  });
});

// ---------------------------------------------------------------------------
// hashCanonical determinism (mirrors the M2 checkpoint guarantee)
// ---------------------------------------------------------------------------

describe("hashCanonical determinism", () => {
  it("two calls on structurally identical objects produce identical hashes", () => {
    const trace = getTrace("A", "reflector");
    if (!trace) throw new Error("trace A/reflector missing");
    const { reasoningHash: _rh, skillHash: _sh, ...body } = trace;
    const h1 = hashCanonical(body);
    const h2 = hashCanonical(body);
    expect(h1).toBe(h2);
  });

  it("key insertion order does not affect the hash", () => {
    // Construct two objects with same keys in different order
    const objA = { b: 2, a: 1 };
    const objB = { a: 1, b: 2 };
    expect(hashCanonical(objA)).toBe(hashCanonical(objB));
  });
});
