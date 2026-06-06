/**
 * data/live-source.ts — Live DataSource (DefiLlama leg). (BOMBE-V2-PRD WS1)
 *
 * Increment 2 wires the DefiLlama leg only. The on-chain mETH rate leg
 * (mETHToETH on Ethereum L1) needs persisted daily rate samples to produce a
 * windowed yield, and those do not exist until the WS3 scheduler runs, so it is
 * honestly reported as pending here. When sample history exists, a second leg is
 * added and the reconciler cross-checks the two computation paths.
 *
 * Honesty (D10, Q2/Q3): the word "independent" never appears. mETH legs are "one
 * ground truth, two computation paths"; USDY is "partial independence" or, per the
 * D4a tripwire, a labeled single source.
 */

import {
  type DefiLlamaChartPoint,
  type DefiLlamaClient,
  DefiLlamaError,
  HttpDefiLlamaClient,
  windowedAnnualizedYieldBps,
} from "./defillama.js";
import type {
  ClockLike,
  DataAsset,
  DataSource,
  SourceLeg,
  YieldObservation,
  YieldQuery,
} from "./types.js";

/** Canonical DefiLlama pool ids (verified live). */
export const POOL_IDS: Record<DataAsset, string> = {
  mETH: "b9f2f00a-ba96-4589-a171-dde979a23d87",
  USDY: "b5d7a190-38d2-4fdd-8c14-1fd00c11bce1",
};

/** Latest reported APY (percent) -> bps, for pools without a pricePerShare series. */
function latestReportedApyBps(points: readonly DefiLlamaChartPoint[]): {
  valueBps: number;
  windowDays: number;
} {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i] as DefiLlamaChartPoint;
    const apy = p.apyMean30d ?? p.apy ?? p.apyBase;
    if (typeof apy === "number" && Number.isFinite(apy)) {
      // apyMean30d is a 30-day mean; apy/apyBase are spot. Window labeled accordingly.
      const windowDays = typeof p.apyMean30d === "number" ? 30 : 1;
      return { valueBps: apy * 100, windowDays };
    }
  }
  throw new DefiLlamaError("no usable APY field in DefiLlama series");
}

export class LiveDataSource implements DataSource {
  private readonly defiLlama: DefiLlamaClient;

  constructor(opts: { defiLlama?: DefiLlamaClient } = {}) {
    this.defiLlama = opts.defiLlama ?? new HttpDefiLlamaClient();
  }

  async getYieldObservation(query: YieldQuery, clock: ClockLike): Promise<YieldObservation> {
    const poolId = POOL_IDS[query.asset];
    const points = await this.defiLlama.fetchChart(poolId);

    let leg: SourceLeg;
    let windowDays: number;
    let independenceLabel: string;

    if (query.asset === "mETH") {
      // Prefer the pricePerShare-derived windowed yield; fall back to reported APY.
      let valueBps: number;
      try {
        const w = windowedAnnualizedYieldBps(points, query.requestedWindowDays);
        valueBps = w.valueBps;
        windowDays = w.windowDays;
      } catch {
        const a = latestReportedApyBps(points);
        valueBps = a.valueBps;
        windowDays = a.windowDays;
      }
      leg = {
        name: "defillama-meth",
        valueBps,
        windowDays,
        sourceRef: `https://yields.llama.fi/chart/${poolId}`,
        raw: { poolId, lastPoint: points[points.length - 1] ?? null },
      };
      independenceLabel =
        "DefiLlama aggregator, pricePerShare-derived. On-chain mETHToETH cross-check pending sample history (one ground truth, two computation paths once live).";
    } else {
      // USDY: no pricePerShare; use reported APY. D4a single-source labeling.
      const a = latestReportedApyBps(points);
      windowDays = a.windowDays;
      leg = {
        name: "defillama-usdy",
        valueBps: a.valueBps,
        windowDays,
        sourceRef: `https://yields.llama.fi/chart/${poolId}`,
        raw: { poolId, lastPoint: points[points.length - 1] ?? null },
      };
      independenceLabel =
        "DefiLlama reported APY (partially issuer-derived). Single source, full transparency; an on-chain accrual leg is pending (D4a). Does not catch issuer fraud.";
    }

    return {
      asset: query.asset,
      metric: "annualized_yield_bps",
      windowDays,
      legs: [leg],
      independenceLabel,
      fetchedAt: clock.now(),
    };
  }
}
