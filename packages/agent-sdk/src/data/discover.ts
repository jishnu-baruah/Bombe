/**
 * data/discover.ts — Asset discovery over the live source universe. (D20)
 *
 * Enumerates DefiLlama's yield/RWA universe and maps each pool to a ready-to-attest
 * SourceDescriptor, so "new assets coming up" are in scope the moment any source
 * lists them, with no code change. Filterable by chain, project, symbol, TVL, and an
 * RWA-only restriction. The JSON fetch is injectable so tests never hit the network.
 *
 * Discovery does NOT attest; it returns descriptors a caller can feed to the open
 * LiveDataSource path. Featured (curated/verified) descriptors are flagged so the UI
 * can separate the verified showcase from the long tail.
 */

import { FEATURED_BY_SYMBOL, POOL_IDS } from "./source-registry.js";
import type { SourceDescriptor } from "./types.js";

/**
 * The RWA categories the network can attest. Every category here is real; whether a
 * given chain currently has a live source for it is what discovery reports. Categories
 * with no live source yet are covered by the "request an asset" path, not faked.
 */
export type RwaCategory =
  | "tokenized-treasury"
  | "private-credit"
  | "tokenized-equity"
  | "synthetic-dollar"
  | "liquid-staking"
  | "liquid-restaking"
  | "tokenized-commodity"
  | "real-estate"
  | "lending"
  | "btc-yield"
  | "other";

export const RWA_CATEGORIES: RwaCategory[] = [
  "tokenized-treasury",
  "private-credit",
  "tokenized-equity",
  "synthetic-dollar",
  "liquid-staking",
  "liquid-restaking",
  "tokenized-commodity",
  "real-estate",
  "lending",
  "btc-yield",
];

/**
 * DefiLlama project slug -> RWA category. The keyset is the RWA universe discovery
 * recognizes (rwaOnly). Covers tokenized treasuries, private credit, tokenized
 * equities, synthetic-dollar, staking/restaking, lending, commodities (gold), real
 * estate, and BTC yield, across chains. New protocols are one line here.
 */
const PROJECT_CATEGORY: Record<string, RwaCategory> = {
  // Tokenized US Treasuries / money-market
  "ondo-yield-assets": "tokenized-treasury",
  "blackrock-buidl": "tokenized-treasury",
  "circle-usyc": "tokenized-treasury",
  openeden: "tokenized-treasury",
  superstate: "tokenized-treasury",
  matrixdock: "tokenized-treasury",
  hashnote: "tokenized-treasury",
  "mountain-protocol": "tokenized-treasury",
  sdai: "tokenized-treasury",
  "sky-lending": "tokenized-treasury",
  usual: "tokenized-treasury",
  spiko: "tokenized-treasury",
  // Private credit / institutional lending
  maple: "private-credit",
  syrup: "private-credit",
  "clearpool-lending": "private-credit",
  clearpool: "private-credit",
  goldfinch: "private-credit",
  centrifuge: "private-credit",
  credix: "private-credit",
  tradable: "private-credit",
  // Tokenized equities / structured
  "fluxion-network": "tokenized-equity",
  "backed-fi": "tokenized-equity",
  dinari: "tokenized-equity",
  "ondo-global-markets": "tokenized-equity",
  // Synthetic-dollar yield
  "ethena-usde": "synthetic-dollar",
  elixir: "synthetic-dollar",
  // Liquid staking / restaking
  "meth-protocol": "liquid-staking",
  lido: "liquid-staking",
  "rocket-pool": "liquid-staking",
  "mantle-restaked-eth": "liquid-restaking",
  "ether.fi-stake": "liquid-restaking",
  renzo: "liquid-restaking",
  kelp: "liquid-restaking",
  // Tokenized commodities (gold)
  "tether-gold": "tokenized-commodity",
  "paxos-gold": "tokenized-commodity",
  "matrixdock-gold": "tokenized-commodity",
  // Real estate
  realt: "real-estate",
  tangible: "real-estate",
  propy: "real-estate",
  // Lending venues (RWA-adjacent yield on tokenized collateral)
  "aave-v3": "lending",
  "lendle-pooled-markets": "lending",
  "compound-v3": "lending",
  // BTC yield
  "solv-basis-trading": "btc-yield",
  "solv-protocol": "btc-yield",
};

const RWA_PROJECTS = new Set(Object.keys(PROJECT_CATEGORY));

/** Map a project slug to its RWA category (default "other"). */
export function categoryOf(project: string): RwaCategory {
  return PROJECT_CATEGORY[project] ?? "other";
}

/** Filter for {@link discoverAssets}. All fields optional; omitted = no constraint. */
export interface DiscoverFilter {
  /** e.g. "Mantle" (case-insensitive). */
  chain?: string;
  /** Allowlist of DefiLlama project slugs. */
  project?: string[];
  /** Symbol or name substring (case-insensitive). */
  query?: string;
  /** Minimum pool TVL in USD. */
  minTvlUsd?: number;
  /** Restrict to known RWA / tokenized-treasury / staking projects. */
  rwaOnly?: boolean;
  /** Restrict to one RWA category. */
  category?: RwaCategory;
  /** Max results (default 50). */
  limit?: number;
}

/** A discovered, ready-to-attest asset. */
export interface DiscoveredAsset {
  symbol: string;
  project: string;
  chain: string;
  /** The RWA category this asset belongs to. */
  category: RwaCategory;
  apy: number | null;
  tvlUsd: number;
  poolId: string;
  /** A descriptor the open LiveDataSource path can attest directly. */
  descriptor: SourceDescriptor;
  /** True when this pool is part of the curated/verified featured set. */
  verified: boolean;
}

interface RawPool {
  symbol?: string;
  project?: string;
  chain?: string;
  apy?: number | null;
  apyMean30d?: number | null;
  tvlUsd?: number | null;
  pool?: string;
}

const POOLS_URL = "https://yields.llama.fi/pools";

/** The set of featured DefiLlama pool ids, for the verified flag. */
const FEATURED_POOL_IDS = new Set(Object.values(POOL_IDS).filter(Boolean));

/**
 * discoverAssets — list attestable assets from the live source universe.
 *
 * @param filter constraints (chain/project/query/minTvl/rwaOnly/limit)
 * @param opts   injectable JSON fetch (defaults to global fetch); never hits network in tests
 */
export async function discoverAssets(
  filter: DiscoverFilter = {},
  opts: { fetchJson?: (url: string) => Promise<unknown> } = {},
): Promise<DiscoveredAsset[]> {
  const fetchJson =
    opts.fetchJson ??
    (async (url: string) => {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`discover fetch failed: ${res.status}`);
      return res.json();
    });

  const body = (await fetchJson(POOLS_URL)) as { data?: RawPool[] } | RawPool[];
  const pools: RawPool[] = Array.isArray(body) ? body : (body.data ?? []);

  const chain = filter.chain?.toLowerCase();
  const projectAllow = filter.project ? new Set(filter.project) : null;
  const query = filter.query?.toLowerCase();
  const limit = filter.limit ?? 50;

  const out: DiscoveredAsset[] = [];
  for (const p of pools) {
    if (!p.pool || !p.symbol || !p.project) continue;
    if (chain && (p.chain ?? "").toLowerCase() !== chain) continue;
    if (projectAllow && !projectAllow.has(p.project)) continue;
    if (filter.rwaOnly && !RWA_PROJECTS.has(p.project)) continue;
    const category = categoryOf(p.project);
    if (filter.category && category !== filter.category) continue;
    if (typeof filter.minTvlUsd === "number" && (p.tvlUsd ?? 0) < filter.minTvlUsd) continue;
    if (query) {
      const hay = `${p.symbol} ${p.project}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    out.push({
      symbol: p.symbol,
      project: p.project,
      chain: p.chain ?? "unknown",
      category,
      apy: typeof p.apy === "number" ? p.apy : null,
      tvlUsd: Math.round(p.tvlUsd ?? 0),
      poolId: p.pool,
      verified: FEATURED_POOL_IDS.has(p.pool) || p.symbol in FEATURED_BY_SYMBOL,
      descriptor: {
        scheme: "defillama",
        ref: p.pool,
        kind: "reportedApy",
        legName: `defillama-${p.symbol.toLowerCase()}`,
        label: `${p.project} on ${p.chain ?? "unknown"} (DefiLlama)`,
      },
    });
  }

  // Highest TVL first; verified featured assets surface at the top.
  out.sort((a, b) => Number(b.verified) - Number(a.verified) || b.tvlUsd - a.tvlUsd);
  return out.slice(0, limit);
}
