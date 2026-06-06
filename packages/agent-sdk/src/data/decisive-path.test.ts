import { hashCanonical } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import { TraceSchema } from "../loop.js";
import { computeDecisiveAttestation } from "./decisive-path.js";
import { StubDataSource } from "./mock-source.js";

const clock = { now: () => 1_700_000_500_000 };

function run(legValuesBps: number[], assertedValueBps: number) {
  const src = StubDataSource.fromValues("mETH", legValuesBps, { windowDays: 7 });
  return computeDecisiveAttestation(
    {
      claimId: "METH-YIELD-TEST",
      asset: "mETH",
      assertedValueBps,
      reconcileToleranceBps: 25,
      verdictToleranceBps: 25,
      requestedWindowDays: 7,
    },
    src,
    clock,
    "reflector",
  );
}

describe("computeDecisiveAttestation (D11 decisive path)", () => {
  it("agreeing legs matching the assertion -> VALID, full confidence", async () => {
    const r = await run([255, 256], 255);
    expect(r.decision.verdict).toBe("VALID");
    expect(r.trace.final.decision).toBe("VALID");
    expect(r.trace.final.confidenceBps).toBe(10_000);
    expect(r.trace.final.reasons).toContain("DETERMINISTIC_RECONCILER");
  });

  it("agreeing legs contradicting the assertion -> REJECTED", async () => {
    const r = await run([255, 256], 1000);
    expect(r.decision.verdict).toBe("REJECTED");
    expect(r.trace.final.decision).toBe("REJECTED");
  });

  it("disagreeing legs -> ABSTAIN, zero confidence, disagreement reason (Gate 1c shape)", async () => {
    const r = await run([255, 900], 255);
    expect(r.decision.verdict).toBe("ABSTAIN");
    expect(r.trace.final.confidenceBps).toBe(0);
    expect(r.trace.final.reasons.some((x) => x.startsWith("SOURCE_DISAGREEMENT"))).toBe(true);
  });

  it("produces a schema-valid trace that carries windowDays and the honesty label", async () => {
    const r = await run([255, 256], 255);
    expect(() => TraceSchema.parse(r.trace)).not.toThrow();
    const step0 = r.trace.steps[0]?.observation as {
      windowDays: number;
      independenceLabel: string;
    };
    expect(step0.windowDays).toBe(7);
    expect(step0.independenceLabel).toBeTypeOf("string");
    // Honesty: the stub label is not "independent".
    expect(step0.independenceLabel).not.toMatch(/\bindependent\b/i);
  });

  it("reasoning hash is stable and recomputable from the trace", async () => {
    const r = await run([255, 256], 255);
    const h1 = hashCanonical(r.trace);
    const h2 = hashCanonical(r.trace);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("maps legs to sources for the sources hash", async () => {
    const r = await run([255, 256], 255);
    expect(r.sources).toHaveLength(2);
    expect(r.sources[0]?.source).toMatch(/^stub:/);
  });
});
