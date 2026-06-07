/**
 * data/types.ts — The DataSource seam. (BOMBE-V2-PRD WS1)
 *
 * A DataSource produces a like-for-like yield observation for an asset: every
 * bound source leg measured over the SAME window (D4 cross-check, Q4 windowing).
 * The runner feeds the leg values to the deterministic reconciler (D11) to get a
 * verdict. The observation is recorded verbatim in the trace so a verifier can
 * rerun the reconciliation.
 *
 * Mode selection (live fixture-free vs mock fixture-backed) is by the same MODE
 * switch as the other seams. The live implementation lives in live-source.ts;
 * the fixture/stub implementations live in mock-source.ts.
 *
 * Honesty (D10, Q2/Q3): every observation carries an `independenceLabel`. The
 * word "independent" is never used for mETH or USDY (their legs share one
 * underlying ground truth). Labels are set by the source, surfaced in the trace.
 */

/**
 * An asset symbol. Open by design (docs/OPEN-SOURCE-REGISTRY.md, D20): the network
 * attests any RWA yield, not a fixed list. The curated/verified showcase lives in
 * FEATURED_SYMBOLS (source-registry.ts); any other symbol is valid when accompanied
 * by an AssetSpec describing its sources. Mantle-native RWA is prioritized in the
 * featured set.
 */
export type DataAsset = string;

/** How a source is fetched; a new kind of source is one new fetcher (source-registry). */
export type SourceScheme = "defillama" | "mantle-meth-api" | "custom-http";

/** How a fetched series becomes a windowed annualized yield. */
export type SourceKind = "pricePerShare" | "reportedApy";

/** One source (one computation path) for an asset. */
export interface SourceDescriptor {
  /** HOW to fetch. */
  scheme: SourceScheme;
  /** WHICH one: a DefiLlama poolId, an API URL, or a contract address. */
  ref: string;
  /** Computation: pricePerShare-derived windowed yield, or reported APY. */
  kind: SourceKind;
  /** Stable leg id, e.g. "defillama-meth". */
  legName: string;
  /** Optional human label for the source. */
  label?: string;
}

/** An attestable asset: a symbol, its sources, and an honest source-relationship label. */
export interface AssetSpec {
  /** Open symbol, e.g. "mETH", "rETH", "ISSUER-XYZ-NOTE". */
  symbol: string;
  /** Display name. */
  name?: string;
  /** One or more computation paths. */
  sources: SourceDescriptor[];
  /** Honesty label (D10/D4a). Never the word "independent" for shared-ground-truth legs. */
  independenceLabel: string;
  /** Curated/featured (auto-attested on the streak) vs issuer-specified. */
  verified: boolean;
  /** Where the asset lives, for display/discovery. */
  chain?: string;
}

/** A single source leg: one computation path to the asset's yield. */
export interface SourceLeg {
  /** Stable leg identifier, e.g. "defillama-meth", "mantle-rpc-meth-rate". */
  name: string;
  /** The observed yield for this leg, in basis points, over `windowDays`. */
  valueBps: number;
  /** The window over which this leg's value is measured. Must match across legs. */
  windowDays: number;
  /** A human- and machine-auditable pointer: a URL or an address+method string. */
  sourceRef: string;
  /** The raw fetched payload, kept for the trace so a verifier can re-derive valueBps. */
  raw: unknown;
}

/**
 * A like-for-like yield observation across all bound legs.
 * `legs` are guaranteed to share `windowDays`. Reconciliation and the verdict
 * are computed downstream by the reconciler, not here.
 */
export interface YieldObservation {
  asset: DataAsset;
  /** The metric the claim asserts, e.g. "yield_bps". */
  metric: string;
  /** The common window all legs are measured over (Q4). Displayed everywhere. */
  windowDays: number;
  /** All bound source legs, same window. One leg is valid (single-source, labeled). */
  legs: SourceLeg[];
  /**
   * Honesty label describing the relationship between the legs (D10/Q2/Q3).
   * Never the word "independent" for mETH/USDY.
   */
  independenceLabel: string;
  /** Deterministic fetch timestamp (from the injected clock, never Date.now). */
  fetchedAt: number;
}

/** What the caller asks a DataSource for. */
export interface YieldQuery {
  /** The asset symbol. Featured symbols resolve to a curated spec automatically. */
  asset: DataAsset;
  /**
   * Requested window in days. The live source clamps this to the number of
   * on-chain rate samples it actually has (the short-window rule, Q4), and the
   * returned observation's `windowDays` is the authoritative value.
   */
  requestedWindowDays: number;
  /**
   * The open path: an explicit AssetSpec describing the sources to fetch. When
   * present it is used verbatim (issuer-specified or discovered sources); when
   * absent, `asset` must be a featured symbol that resolves to a curated spec.
   */
  spec?: AssetSpec;
}

/** Minimal clock contract (matches ClockSeam) so sources never call Date.now. */
export interface ClockLike {
  now(): number;
}

/**
 * DataSource — the seam.
 * Live: fetches DefiLlama plus a Mantle RPC read, windows them like-for-like.
 * Mock: reads fixtures (deterministic, keeps the test suite stable).
 * Stub: returns programmed legs (for reconciliation and disagreement tests).
 */
export interface DataSource {
  getYieldObservation(query: YieldQuery, clock: ClockLike): Promise<YieldObservation>;
}
