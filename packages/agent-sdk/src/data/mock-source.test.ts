import { loadOracleSnapshot } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import { MockDataSource, StubDataSource } from "./mock-source.js";
import { reconcileLegs } from "./reconciler.js";

const clock = { now: () => 1_000 };

describe("MockDataSource (fixture-backed)", () => {
  it("returns a single-leg observation whose value matches the fixture", async () => {
    const src = new MockDataSource({ period: "30d-fresh" });
    const obs = await src.getYieldObservation({ asset: "mETH", requestedWindowDays: 30 }, clock);

    const fixture = loadOracleSnapshot("mETH", "30d-fresh");
    expect(obs.legs).toHaveLength(1);
    expect(obs.legs[0]?.valueBps).toBe(fixture.value);
    expect(obs.asset).toBe("mETH");
    expect(obs.windowDays).toBe(30);
    expect(obs.fetchedAt).toBe(1_000);
    expect(obs.independenceLabel).toMatch(/fixture/i);
    // Honesty: the mock never claims independence.
    expect(obs.independenceLabel).not.toMatch(/independent/i);
  });
});

describe("StubDataSource (programmable)", () => {
  it("builds agreeing legs from raw values", async () => {
    const src = StubDataSource.fromValues("mETH", [34.0, 34.1], { windowDays: 7 });
    const obs = await src.getYieldObservation({ asset: "mETH", requestedWindowDays: 7 }, clock);
    expect(obs.legs.map((l) => l.valueBps)).toEqual([34.0, 34.1]);
    expect(obs.windowDays).toBe(7);
    const r = reconcileLegs(
      obs.legs.map((l) => l.valueBps),
      5,
    );
    expect(r.agree).toBe(true);
  });

  it("can produce a disagreement for the forced-abstain path (Gate 1c)", async () => {
    const src = StubDataSource.fromValues("mETH", [34, 90], { windowDays: 7 });
    const obs = await src.getYieldObservation({ asset: "mETH", requestedWindowDays: 7 }, clock);
    const r = reconcileLegs(
      obs.legs.map((l) => l.valueBps),
      5,
    );
    expect(r.agree).toBe(false);
    expect(r.reconciledValue).toBeNull();
  });
});
