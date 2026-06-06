import { describe, expect, it } from "vitest";
import { TraceSchema } from "../loop.js";
import { consensusEvidence, runConsensusDecisive } from "./consensus.js";
import type { ClockLike, DataSource, YieldObservation, YieldQuery } from "./types.js";

const clock: ClockLike = { now: () => 1_700_000_000_000 };

/** Test source that returns a different per-run value (or throws) each call. */
class SeqSource implements DataSource {
  private i = 0;
  constructor(private readonly seq: (number | "throw")[]) {}
  async getYieldObservation(q: YieldQuery, c: ClockLike): Promise<YieldObservation> {
    const idx = Math.min(this.i, this.seq.length - 1);
    this.i++;
    const v = this.seq[idx];
    if (v === "throw") throw new Error("fetch failed");
    return {
      asset: q.asset,
      metric: "annualized_yield_bps",
      windowDays: 7,
      legs: [
        { name: "seq", valueBps: v as number, windowDays: 7, sourceRef: "stub://seq", raw: {} },
      ],
      independenceLabel: "stub-seq",
      fetchedAt: c.now(),
    };
  }
}

describe("consensusEvidence", () => {
  it("all three within tolerance -> agreed, mean of all", () => {
    const r = consensusEvidence([255, 256, 254], 5);
    expect(r.agreed).toBe(true);
    expect(r.consensusValue).toBeCloseTo(255, 5);
    expect(r.votes.cluster).toBe(3);
  });

  it("one outlier but two agree -> consensus on the agreeing pair", () => {
    const r = consensusEvidence([255, 256, 900], 5);
    expect(r.agreed).toBe(true);
    expect(r.consensusValue).toBeCloseTo(255.5, 5);
    expect(r.votes.cluster).toBe(2);
  });

  it("all differ -> no quorum", () => {
    const r = consensusEvidence([255, 500, 900], 5);
    expect(r.agreed).toBe(false);
    expect(r.consensusValue).toBeNull();
  });

  it("fewer than two usable -> no quorum", () => {
    expect(consensusEvidence([255, null, null], 5).agreed).toBe(false);
    expect(consensusEvidence([null, null, null], 5).agreed).toBe(false);
  });

  it("two usable that agree -> quorum", () => {
    const r = consensusEvidence([255, 256, null], 5);
    expect(r.agreed).toBe(true);
    expect(r.votes.usable).toBe(2);
  });
});

const input = {
  claimId: "METH-CONS",
  asset: "mETH" as const,
  assertedValueBps: 255,
  reconcileToleranceBps: 5,
  verdictToleranceBps: 5,
  requestedWindowDays: 7,
};

describe("runConsensusDecisive", () => {
  it("three agreeing runs matching the assertion -> VALID", async () => {
    const r = await runConsensusDecisive(input, new SeqSource([255, 256, 254]), clock, "reflector");
    expect(r.verdict).toBe("VALID");
    expect(r.mechanismLabel).toBe("single-model triple-run redundancy");
    expect(() => TraceSchema.parse(r.trace)).not.toThrow();
  });

  it("one outlier, two agree -> consensus on the two, VALID", async () => {
    const r = await runConsensusDecisive(input, new SeqSource([255, 256, 900]), clock, "reflector");
    expect(r.verdict).toBe("VALID");
    expect(r.consensus.votes.cluster).toBe(2);
  });

  it("all three differ -> ABSTAIN", async () => {
    const r = await runConsensusDecisive(input, new SeqSource([255, 500, 900]), clock, "reflector");
    expect(r.verdict).toBe("ABSTAIN");
    expect(r.trace.final.decision).toBe("ABSTAIN");
  });

  it("two of three runs throw -> too few usable -> ABSTAIN", async () => {
    const r = await runConsensusDecisive(
      input,
      new SeqSource([255, "throw", "throw"]),
      clock,
      "reflector",
    );
    expect(r.verdict).toBe("ABSTAIN");
    expect(r.perRunValues.filter((v) => v !== null)).toHaveLength(1);
  });

  it("consensus agreeing but contradicting the assertion -> REJECTED", async () => {
    const r = await runConsensusDecisive(
      { ...input, assertedValueBps: 1000 },
      new SeqSource([255, 256, 254]),
      clock,
      "reflector",
    );
    expect(r.verdict).toBe("REJECTED");
  });

  it("never labels itself multi-model unless told", async () => {
    const r = await runConsensusDecisive(input, new SeqSource([255, 256, 254]), clock, "reflector");
    expect(r.trace.final.reasons.join(" ")).not.toMatch(/multi-model/);
    const multi = await runConsensusDecisive(
      input,
      new SeqSource([255, 256, 254]),
      clock,
      "reflector",
      {
        multiModel: true,
      },
    );
    expect(multi.mechanismLabel).toBe("multi-model consensus");
  });
});
