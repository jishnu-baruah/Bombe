import { describe, expect, it } from "vitest";
import {
  type DefiLlamaChartPoint,
  type DefiLlamaClient,
  type FetchLike,
  HttpDefiLlamaClient,
  windowedAnnualizedYieldBps,
} from "./defillama.js";
import { LiveDataSource } from "./live-source.js";
import { reconcileLegs } from "./reconciler.js";

const clock = { now: () => 1_700_000_000_000 };

function ppsPoint(timestamp: string, pricePerShare: number): DefiLlamaChartPoint {
  return { timestamp, pricePerShare, apy: null, apyBase: null, apyMean30d: null };
}

class StubClient implements DefiLlamaClient {
  constructor(private readonly points: DefiLlamaChartPoint[]) {}
  async fetchChart(): Promise<DefiLlamaChartPoint[]> {
    return this.points;
  }
}

describe("windowedAnnualizedYieldBps", () => {
  it("annualizes a realized pricePerShare gain over the window", () => {
    const points = [ppsPoint("2026-01-01T00:00:00Z", 1.0), ppsPoint("2026-01-08T00:00:00Z", 1.001)];
    const w = windowedAnnualizedYieldBps(points, 7);
    // 0.001 over 7 days, annualized: 0.001 * (365/7) = 0.052143 -> 521.43 bps
    expect(w.windowDays).toBe(7);
    expect(w.valueBps).toBeCloseTo(521.43, 1);
  });

  it("clamps the window to the available history", () => {
    const points = [ppsPoint("2026-01-01T00:00:00Z", 1.0), ppsPoint("2026-01-08T00:00:00Z", 1.001)];
    const w = windowedAnnualizedYieldBps(points, 30); // only 7 days exist
    expect(w.windowDays).toBe(7);
  });

  it("throws on insufficient pricePerShare history", () => {
    expect(() => windowedAnnualizedYieldBps([ppsPoint("2026-01-01T00:00:00Z", 1.0)], 7)).toThrow();
  });
});

describe("HttpDefiLlamaClient (mocked fetch)", () => {
  it("parses a chart response", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        data: [ppsPoint("2026-01-01T00:00:00Z", 1.0), ppsPoint("2026-01-08T00:00:00Z", 1.001)],
      }),
      text: async () => "",
    });
    const client = new HttpDefiLlamaClient({ fetchImpl });
    const points = await client.fetchChart("pool-x");
    expect(points).toHaveLength(2);
    expect(points[1]?.pricePerShare).toBe(1.001);
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => "rate limited",
    });
    const client = new HttpDefiLlamaClient({ fetchImpl });
    await expect(client.fetchChart("pool-x")).rejects.toThrow(/429/);
  });
});

describe("LiveDataSource", () => {
  // A canned Mantle mETH API response (fields are fractions: 0.0199 = 1.99%).
  const mantleApiJson = {
    data: [{ METHtoETH: "1.0931", OneDayAPY: "0.0193", WeekAPY: "0.0203", MonthAPY: "0.0199" }],
  };

  it("mETH: two computation paths (DefiLlama + Mantle API), honest label, no 'independent'", async () => {
    const points = [
      ppsPoint("2026-01-01T00:00:00Z", 1.09),
      ppsPoint("2026-01-08T00:00:00Z", 1.09042),
    ];
    const src = new LiveDataSource({
      defiLlama: new StubClient(points),
      fetchJson: async () => mantleApiJson,
    });
    const obs = await src.getYieldObservation({ asset: "mETH", requestedWindowDays: 7 }, clock);
    expect(obs.legs).toHaveLength(2);
    expect(obs.legs.map((l) => l.name)).toContain("defillama-meth");
    expect(obs.legs.map((l) => l.name)).toContain("mantle-meth-api");
    expect(obs.metric).toBe("annualized_yield_bps");
    expect(obs.fetchedAt).toBe(1_700_000_000_000);
    expect(obs.independenceLabel).toMatch(/two computation paths/i);
    expect(obs.independenceLabel).not.toMatch(/\bindependent\b/i);
  });

  it("mETH: resilient when the Mantle API leg fails (still one DefiLlama leg)", async () => {
    const points = [
      ppsPoint("2026-01-01T00:00:00Z", 1.09),
      ppsPoint("2026-01-08T00:00:00Z", 1.09042),
    ];
    const src = new LiveDataSource({
      defiLlama: new StubClient(points),
      fetchJson: async () => {
        throw new Error("mantle api down");
      },
    });
    const obs = await src.getYieldObservation({ asset: "mETH", requestedWindowDays: 7 }, clock);
    expect(obs.legs).toHaveLength(1);
    expect(obs.legs[0]?.name).toBe("defillama-meth");
    expect(obs.independenceLabel).toMatch(/degraded/i);
    const r = reconcileLegs([obs.legs[0]?.valueBps ?? Number.NaN], 50);
    expect(r.agree).toBe(true);
  });

  it("USDY: falls back to reported APY and is labeled single-source", async () => {
    const points: DefiLlamaChartPoint[] = [
      { timestamp: "2026-01-08T00:00:00Z", apyMean30d: 3.55, apy: 3.55, apyBase: 3.55 },
    ];
    const src = new LiveDataSource({ defiLlama: new StubClient(points) });
    const obs = await src.getYieldObservation({ asset: "USDY", requestedWindowDays: 30 }, clock);
    expect(obs.legs[0]?.valueBps).toBeCloseTo(355, 5); // 3.55% -> 355 bps
    expect(obs.windowDays).toBe(30);
    expect(obs.independenceLabel).toMatch(/single source/i);
    expect(obs.independenceLabel).not.toMatch(/\bindependent\b/i);
  });

  it("open path: attests an issuer-specified spec with no code change", async () => {
    const points: DefiLlamaChartPoint[] = [
      { timestamp: "2026-01-08T00:00:00Z", apy: 4.2, apyBase: 4.2 },
    ];
    const src = new LiveDataSource({ defiLlama: new StubClient(points) });
    const obs = await src.getYieldObservation(
      {
        asset: "ISSUER-XYZ-NOTE",
        requestedWindowDays: 30,
        spec: {
          symbol: "ISSUER-XYZ-NOTE",
          verified: false,
          sources: [
            { scheme: "defillama", ref: "some-pool", kind: "reportedApy", legName: "issuer-leg" },
          ],
          independenceLabel: "Issuer-specified source; verify the ref. Single source.",
        },
      },
      clock,
    );
    expect(obs.asset).toBe("ISSUER-XYZ-NOTE");
    expect(obs.legs[0]?.valueBps).toBeCloseTo(420, 5);
  });
});
