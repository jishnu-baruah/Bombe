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

/** Which flagship asset this observation is for. v2 supports exactly these two. */
export type DataAsset = "mETH" | "USDY";

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
  asset: DataAsset;
  /**
   * Requested window in days. The live source clamps this to the number of
   * on-chain rate samples it actually has (the short-window rule, Q4), and the
   * returned observation's `windowDays` is the authoritative value.
   */
  requestedWindowDays: number;
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
