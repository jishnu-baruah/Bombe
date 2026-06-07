/**
 * data/live-source.ts — Live DataSource over an asset-adapter registry. (BOMBE-V2-PRD WS1)
 *
 * Each asset declares its sources in ASSET_ADAPTERS: a list of source configs
 * (leg name, computation kind, DefiLlama pool). getYieldObservation fetches every
 * source, builds one leg per source, and returns them for the reconciler. Adding
 * a source to an asset, or a new asset, is a registry entry, not new control flow.
 * Each leg carries an auditable sourceRef URL.
 *
 * Today mETH and USDY each have a single DefiLlama source. mETH's second leg (the
 * on-chain mETHToETH exchange-rate path) becomes one more source entry once daily
 * rate samples exist (see docs/REALITY-AUDIT.md). Honesty (D10): the word
 * "independent" never appears; mETH is "one ground truth, two computation paths",
 * USDY is a labeled single source (D4a).
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

/** How a source turns a DefiLlama chart into a windowed annualized yield. */
export type SourceKind = "pricePerShare" | "reportedApy";

/** One source (one computation path) for an asset. */
export interface SourceConfig {
  /** Stable leg id, e.g. "defillama-meth". */
  legName: string;
  /** Computation: pricePerShare-derived windowed yield, or reported APY. */
  kind: SourceKind;
  /** DefiLlama pool id this source reads. */
  poolId: string;
}

/** An asset adapter: its sources + the honest source label for the trace. */
export interface AssetAdapter {
  sources: SourceConfig[];
  independenceLabel: string;
}

/**
 * The adapter registry. Add a source by appending to `sources`; add an asset by
 * adding an entry (and the DataAsset union value). No control-flow change.
 */
export const ASSET_ADAPTERS: Record<DataAsset, AssetAdapter> = {
  mETH: {
    sources: [
      {
        legName: "defillama-meth",
        kind: "pricePerShare",
        poolId: "b9f2f00a-ba96-4589-a171-dde979a23d87",
      },
    ],
    independenceLabel:
      "DefiLlama aggregator, pricePerShare-derived. On-chain mETHToETH cross-check pending sample history (one ground truth, two computation paths once live).",
  },
  USDY: {
    sources: [
      {
        legName: "defillama-usdy",
        kind: "reportedApy",
        poolId: "b5d7a190-38d2-4fdd-8c14-1fd00c11bce1",
      },
    ],
    independenceLabel:
      "DefiLlama reported APY (partially issuer-derived). Single source, full transparency; an on-chain accrual leg is pending (D4a). Does not catch issuer fraud.",
  },
};

/** Canonical DefiLlama pool ids, derived from the registry (back-compat export). */
export const POOL_IDS: Record<DataAsset, string> = Object.fromEntries(
  Object.entries(ASSET_ADAPTERS).map(([asset, a]) => [asset, a.sources[0]?.poolId ?? ""]),
) as Record<DataAsset, string>;

/** Latest reported APY (percent) -> bps, for pools without a pricePerShare series. */
function latestReportedApyBps(points: readonly DefiLlamaChartPoint[]): {
  valueBps: number;
  windowDays: number;
} {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i] as DefiLlamaChartPoint;
    const apy = p.apyMean30d ?? p.apy ?? p.apyBase;
    if (typeof apy === "number" && Number.isFinite(apy)) {
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

  /** Build one leg from one source config. */
  private async legFor(source: SourceConfig, requestedWindowDays: number): Promise<SourceLeg> {
    const points = await this.defiLlama.fetchChart(source.poolId);
    let valueBps: number;
    let windowDays: number;
    if (source.kind === "pricePerShare") {
      try {
        const w = windowedAnnualizedYieldBps(points, requestedWindowDays);
        valueBps = w.valueBps;
        windowDays = w.windowDays;
      } catch {
        const a = latestReportedApyBps(points);
        valueBps = a.valueBps;
        windowDays = a.windowDays;
      }
    } else {
      const a = latestReportedApyBps(points);
      valueBps = a.valueBps;
      windowDays = a.windowDays;
    }
    return {
      name: source.legName,
      valueBps,
      windowDays,
      sourceRef: `https://yields.llama.fi/chart/${source.poolId}`,
      raw: { poolId: source.poolId, lastPoint: points[points.length - 1] ?? null },
    };
  }

  async getYieldObservation(query: YieldQuery, clock: ClockLike): Promise<YieldObservation> {
    const adapter = ASSET_ADAPTERS[query.asset];
    const legs: SourceLeg[] = [];
    for (const source of adapter.sources) {
      legs.push(await this.legFor(source, query.requestedWindowDays));
    }
    // Legs must share a window for reconciliation; use the first leg's window.
    const windowDays = legs[0]?.windowDays ?? query.requestedWindowDays;

    return {
      asset: query.asset,
      metric: "annualized_yield_bps",
      windowDays,
      legs,
      independenceLabel: adapter.independenceLabel,
      fetchedAt: clock.now(),
    };
  }
}
