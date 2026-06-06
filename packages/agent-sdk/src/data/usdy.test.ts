import { describe, expect, it } from "vitest";
import { computeDecisiveAttestation } from "./decisive-path.js";
import { MockDataSource } from "./mock-source.js";

const clock = { now: () => 1_000 };

describe("USDY decisive path (D4a single-source)", () => {
  it("is single-leg, VALID at the fixture value, and never claims independence", async () => {
    const ds = new MockDataSource({ period: "30d" });
    const r = await computeDecisiveAttestation(
      {
        claimId: "USDY-T",
        asset: "USDY",
        assertedValueBps: 525,
        reconcileToleranceBps: 5,
        verdictToleranceBps: 5,
        requestedWindowDays: 30,
      },
      ds,
      clock,
      "reflector",
    );
    expect(r.observation.legs).toHaveLength(1);
    expect(r.observation.legs[0]?.valueBps).toBe(525);
    expect(r.decision.verdict).toBe("VALID");
    // D4a / D10 honesty: a single source is never labeled "independent".
    expect(r.observation.independenceLabel).not.toMatch(/\bindependent\b/i);
  });

  it("rejects when the asserted value contradicts the source", async () => {
    const ds = new MockDataSource({ period: "30d" });
    const r = await computeDecisiveAttestation(
      {
        claimId: "USDY-T2",
        asset: "USDY",
        assertedValueBps: 100,
        reconcileToleranceBps: 5,
        verdictToleranceBps: 5,
        requestedWindowDays: 30,
      },
      ds,
      clock,
      "reflector",
    );
    expect(r.decision.verdict).toBe("REJECTED");
  });
});
