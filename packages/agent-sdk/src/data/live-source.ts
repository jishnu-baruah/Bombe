/**
 * data/live-source.ts — Live DataSource over the open source registry. (D20)
 *
 * LiveDataSource resolves an AssetSpec (a featured symbol, or an explicit spec for
 * issuer-specified/discovered sources) and builds one leg per source via the
 * pluggable SCHEME_FETCHERS. A new asset within a known scheme is pure data; a new
 * kind of source is one new fetcher. Fetching is resilient per source: a source that
 * fails is dropped (with a note) as long as one leg remains, so a single flaky
 * endpoint never sinks an attestation that still has a valid computation path.
 *
 * Honesty (D10/D4a): the spec's independenceLabel is surfaced verbatim; the word
 * "independent" never appears for shared-ground-truth legs; windowDays is carried.
 */

import { DefiLlamaError, HttpDefiLlamaClient } from "./defillama.js";
import type { DefiLlamaClient } from "./defillama.js";
import { SCHEME_FETCHERS, type SchemeDeps, resolveSpec } from "./source-registry.js";
import type {
  AssetSpec,
  ClockLike,
  DataSource,
  SourceLeg,
  YieldObservation,
  YieldQuery,
} from "./types.js";

// Back-compat re-exports for callers that imported these from live-source.
export {
  FEATURED,
  FEATURED_BY_SYMBOL,
  FEATURED_SYMBOLS,
  POOL_IDS,
  resolveSpec,
  SCHEME_FETCHERS,
} from "./source-registry.js";
export type { AssetSpec, SourceDescriptor } from "./types.js";

/** Default JSON fetcher for non-DefiLlama schemes (Mantle API, custom-http). */
async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new DefiLlamaError(`fetch ${url} failed: ${res.status}`);
  return res.json();
}

export class LiveDataSource implements DataSource {
  private readonly deps: SchemeDeps;

  constructor(
    opts: { defiLlama?: DefiLlamaClient; fetchJson?: (url: string) => Promise<unknown> } = {},
  ) {
    this.deps = {
      defiLlama: opts.defiLlama ?? new HttpDefiLlamaClient(),
      fetchJson: opts.fetchJson ?? defaultFetchJson,
    };
  }

  async getYieldObservation(query: YieldQuery, clock: ClockLike): Promise<YieldObservation> {
    const spec: AssetSpec = query.spec ?? resolveSpec(query.asset);
    const legs: SourceLeg[] = [];
    const failures: string[] = [];

    for (const source of spec.sources) {
      const fetcher = SCHEME_FETCHERS[source.scheme];
      if (!fetcher) {
        failures.push(`${source.legName}: unknown scheme ${source.scheme}`);
        continue;
      }
      try {
        legs.push(await fetcher(source, query.requestedWindowDays, this.deps));
      } catch (err) {
        // Resilient per source: drop a failed leg if another path remains.
        failures.push(`${source.legName}: ${(err as Error).message}`);
      }
    }

    if (legs.length === 0) {
      throw new DefiLlamaError(
        `no source leg succeeded for ${spec.symbol}: ${failures.join("; ") || "no sources"}`,
      );
    }

    // Legs must share a window for the cross-check; use the first leg's window and
    // note any source that was dropped so the trace stays honest.
    const windowDays = legs[0]?.windowDays ?? query.requestedWindowDays;
    const label =
      failures.length > 0
        ? `${spec.independenceLabel} [degraded: ${failures.length} source(s) unavailable this run]`
        : spec.independenceLabel;

    return {
      asset: spec.symbol,
      metric: "annualized_yield_bps",
      windowDays,
      legs,
      independenceLabel: label,
      fetchedAt: clock.now(),
    };
  }
}
