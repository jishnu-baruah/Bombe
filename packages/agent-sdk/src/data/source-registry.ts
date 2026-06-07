/**
 * data/source-registry.ts — Open source resolver. (docs/OPEN-SOURCE-REGISTRY.md, D20)
 *
 * An attestable asset is an AssetSpec: a symbol plus one or more SourceDescriptors
 * and an honest label. A SourceDescriptor names a `scheme` (HOW to fetch: a pluggable
 * adapter) and a `ref` (WHICH one: a poolId/URL/address). A new asset within a known
 * scheme is pure data; a genuinely new kind of source is one new fetcher in
 * SCHEME_FETCHERS. The deterministic reconciler and the honesty rules are unchanged;
 * only the source space opens up.
 *
 * Honesty (D10/D4a): labels never use the word "independent" for sources that share
 * one ground truth; windowDays is always carried; issuer-specified (verified=false)
 * sources are labeled as such by the caller.
 */

import {
  type DefiLlamaChartPoint,
  type DefiLlamaClient,
  DefiLlamaError,
  windowedAnnualizedYieldBps,
} from "./defillama.js";
import type { AssetSpec, SourceDescriptor, SourceLeg, SourceScheme } from "./types.js";

export type { AssetSpec, SourceDescriptor, SourceKind, SourceScheme } from "./types.js";

/** Injected I/O for scheme fetchers, so tests stay deterministic (no network). */
export interface SchemeDeps {
  defiLlama: DefiLlamaClient;
  /** Fetch + parse JSON from an arbitrary URL (Mantle API, custom-http). */
  fetchJson: (url: string) => Promise<unknown>;
}

/** Latest reported APY (percent) -> bps, for series without a pricePerShare path. */
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

/** A scheme fetcher turns one descriptor into one source leg. */
export type SchemeFetcher = (
  descriptor: SourceDescriptor,
  requestedWindowDays: number,
  deps: SchemeDeps,
) => Promise<SourceLeg>;

/** Read a finite number out of an unknown JSON value at one of several keys. */
function numAt(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : Number.NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * SCHEME_FETCHERS — the pluggable source adapters. Add a kind of source here; add an
 * asset by writing a descriptor (data), no code.
 */
export const SCHEME_FETCHERS: Record<SourceScheme, SchemeFetcher> = {
  // DefiLlama yields: covers the whole DefiLlama yield/RWA universe.
  defillama: async (d, requestedWindowDays, deps) => {
    const points = await deps.defiLlama.fetchChart(d.ref);
    let valueBps: number;
    let windowDays: number;
    if (d.kind === "pricePerShare") {
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
    const last = points[points.length - 1] ?? null;
    const asOf = last?.timestamp ? Date.parse(last.timestamp) : undefined;
    return {
      name: d.legName,
      valueBps,
      windowDays,
      sourceRef: `https://yields.llama.fi/chart/${d.ref}`,
      asOf: Number.isFinite(asOf) ? asOf : undefined,
      raw: { scheme: d.scheme, poolId: d.ref, lastPoint: last },
    };
  },

  // Mantle protocol API: live METHtoETH rate + reported APY windows. A real second
  // computation path for mETH (protocol-reported), proving the registry is not
  // DefiLlama-only. Fields are fractions (0.0199 = 1.99%).
  "mantle-meth-api": async (d, requestedWindowDays, deps) => {
    const body = (await deps.fetchJson(d.ref)) as { data?: unknown[] } | unknown[];
    const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    const latest = (rows[0] ?? {}) as Record<string, unknown>;
    const apyFrac =
      requestedWindowDays <= 1
        ? numAt(latest, "OneDayAPY", "WeekAPY", "MonthAPY")
        : requestedWindowDays <= 7
          ? numAt(latest, "WeekAPY", "MonthAPY", "OneDayAPY")
          : numAt(latest, "MonthAPY", "WeekAPY", "OneDayAPY");
    if (apyFrac === null) {
      throw new DefiLlamaError("no usable APY field in Mantle mETH API response");
    }
    const windowDays = requestedWindowDays <= 1 ? 1 : requestedWindowDays <= 7 ? 7 : 30;
    const ts = typeof latest.TimeStamp === "string" ? Date.parse(latest.TimeStamp) : Number.NaN;
    return {
      name: d.legName,
      valueBps: apyFrac * 10_000,
      windowDays,
      sourceRef: d.ref,
      asOf: Number.isFinite(ts) ? ts : undefined,
      raw: { scheme: d.scheme, methToEth: latest.METHtoETH ?? null, apyFrac, windowDays },
    };
  },

  // Issuer-supplied endpoint. Always UNVERIFIED. Ships in a later pass.
  "custom-http": async (d) => {
    throw new DefiLlamaError(`custom-http source not yet enabled (${d.ref})`);
  },
};

/**
 * FEATURED — the curated, verified showcase. Mantle-native RWA first. Each is data;
 * the open path accepts any AssetSpec, featured or issuer-specified.
 */
export const FEATURED: AssetSpec[] = [
  {
    symbol: "mETH",
    name: "Mantle Staked ETH",
    verified: true,
    chain: "Mantle",
    category: "liquid-staking",
    sources: [
      {
        scheme: "defillama",
        ref: "b9f2f00a-ba96-4589-a171-dde979a23d87",
        kind: "pricePerShare",
        legName: "defillama-meth",
        label: "DefiLlama aggregator, pricePerShare-derived",
      },
      {
        scheme: "mantle-meth-api",
        ref: "https://meth.mantle.xyz/api/stats/apy",
        kind: "reportedApy",
        legName: "mantle-meth-api",
        label: "Mantle protocol API, reported APY (METHtoETH rate)",
      },
    ],
    independenceLabel:
      "mETH staking yield: one ground truth, two computation paths (DefiLlama aggregator pricePerShare vs Mantle protocol-reported APY). Both derive from the same underlying staking, so they cross-check the computation, not the source.",
  },
  {
    symbol: "USDY",
    name: "Ondo US Dollar Yield (tokenized US T-bills, on Mantle)",
    verified: true,
    chain: "Mantle",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "b5d7a190-38d2-4fdd-8c14-1fd00c11bce1",
        kind: "reportedApy",
        legName: "defillama-usdy",
      },
    ],
    independenceLabel:
      "Ondo USD Yield (tokenized US T-bills), DefiLlama Mantle pool, issuer-derived reported APY. Single source, full transparency; an on-chain accrual leg is pending (D4a). Does not catch issuer fraud.",
  },
  {
    symbol: "sUSDe",
    name: "Ethena Staked USDe (synthetic-dollar yield, on Mantle)",
    verified: true,
    chain: "Mantle",
    category: "synthetic-dollar",
    sources: [
      {
        scheme: "defillama",
        ref: "a4e37545-203b-4412-9acd-3e8b1aa4d744",
        kind: "reportedApy",
        legName: "defillama-susde-mantle",
      },
    ],
    independenceLabel:
      "Ethena staked USDe (synthetic-dollar yield) on Mantle, DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "BUIDL",
    name: "BlackRock USD Institutional Digital Liquidity Fund (tokenized US Treasuries)",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "b663ca59-c7e6-4435-ae4a-28d339ce6a15",
        kind: "reportedApy",
        legName: "defillama-buidl",
      },
    ],
    independenceLabel:
      "BlackRock BUIDL (tokenized US Treasuries). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
  {
    symbol: "OUSG",
    name: "Ondo Short-Term US Government Bond Fund (tokenized US Treasuries)",
    verified: true,
    chain: "Ethereum",
    category: "tokenized-treasury",
    sources: [
      {
        scheme: "defillama",
        ref: "7436db9b-2872-46c8-81a2-da6baff902b7",
        kind: "reportedApy",
        legName: "defillama-ousg",
      },
    ],
    independenceLabel:
      "Ondo OUSG (tokenized US Treasuries). DefiLlama reported APY, issuer-derived. Single source, full transparency; does not catch issuer fraud.",
  },
];

/** Featured specs keyed by symbol. */
export const FEATURED_BY_SYMBOL: Record<string, AssetSpec> = Object.fromEntries(
  FEATURED.map((s) => [s.symbol, s]),
);

/** The featured symbols, in display order. */
export const FEATURED_SYMBOLS: string[] = FEATURED.map((s) => s.symbol);

/**
 * Resolve an input to an AssetSpec. A featured symbol resolves to its curated spec;
 * an AssetSpec passes through (the open path: issuer-specified or discovered sources).
 */
export function resolveSpec(input: string | AssetSpec): AssetSpec {
  if (typeof input === "string") {
    const spec = FEATURED_BY_SYMBOL[input];
    if (!spec)
      throw new Error(`unknown featured asset "${input}"; pass an AssetSpec for open sources`);
    return spec;
  }
  return input;
}

/** Back-compat: featured DefiLlama pool ids, keyed by symbol. */
export const POOL_IDS: Record<string, string> = Object.fromEntries(
  FEATURED.map((s) => [s.symbol, s.sources.find((src) => src.scheme === "defillama")?.ref ?? ""]),
);
