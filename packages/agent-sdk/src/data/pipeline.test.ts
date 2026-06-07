import { describe, expect, it } from "vitest";
import { boundsGate, freshnessGate, pipelineFor, runGates } from "./pipeline.js";
import type { YieldObservation } from "./types.js";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function obs(valueBps: number, asOf: number | undefined, windowDays = 30): YieldObservation {
  return {
    asset: "TEST",
    metric: "annualized_yield_bps",
    windowDays,
    legs: [{ name: "leg", valueBps, windowDays, sourceRef: "ref", asOf, raw: null }],
    independenceLabel: "test",
    fetchedAt: NOW,
  };
}

describe("pipelineFor", () => {
  it("auto-selects a tuned pipeline by category, default 'other'", () => {
    expect(pipelineFor({ symbol: "x", category: "tokenized-treasury" }).gates.maxBps).toBe(1500);
    expect(pipelineFor({ symbol: "x", category: "private-credit" }).gates.maxStalenessDays).toBe(
      40,
    );
    expect(pipelineFor({ symbol: "x" }).name).toBe("other-default");
  });

  it("every pipeline runs the gated base steps", () => {
    const p = pipelineFor({ symbol: "x", category: "liquid-staking" });
    expect(p.steps).toContain("freshness-gate");
    expect(p.steps).toContain("bounds-gate");
    expect(p.steps).toContain("reconcile");
  });
});

describe("freshnessGate", () => {
  const cfg = { maxStalenessDays: 5, minBps: 0, maxBps: 1500 };
  it("passes fresh data", () => {
    expect(freshnessGate(obs(300, NOW - 2 * DAY), NOW, cfg).forceAbstain).toBe(false);
  });
  it("forces abstain on stale data", () => {
    const g = freshnessGate(obs(300, NOW - 10 * DAY), NOW, cfg);
    expect(g.passed).toBe(false);
    expect(g.forceAbstain).toBe(true);
  });
  it("passes (skips) when no leg carries a timestamp", () => {
    expect(freshnessGate(obs(300, undefined), NOW, cfg).passed).toBe(true);
  });
});

describe("boundsGate", () => {
  const cfg = { maxStalenessDays: 5, minBps: 0, maxBps: 1500 };
  it("passes an in-range yield", () => {
    expect(boundsGate(obs(355, NOW), cfg).forceAbstain).toBe(false);
  });
  it("forces abstain on an absurd yield (misparse guard)", () => {
    const g = boundsGate(obs(90_000, NOW), cfg); // 900% APY
    expect(g.passed).toBe(false);
    expect(g.forceAbstain).toBe(true);
  });
});

describe("runGates", () => {
  it("aggregates gate results and the abstain decision", () => {
    const p = pipelineFor({ symbol: "x", category: "tokenized-treasury" });
    const { results, forceAbstain } = runGates(p, obs(90_000, NOW - 2 * DAY), NOW);
    expect(forceAbstain).toBe(true);
    expect(results.map((r) => r.gate)).toEqual(["freshness", "bounds"]);
  });
});
