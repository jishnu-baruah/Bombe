/**
 * data/mock-source.ts — Fixture-backed and programmable DataSources. (BOMBE-V2-PRD WS1)
 *
 * MockDataSource keeps the test suite deterministic by reading the same oracle
 * fixtures the tools already use. It is the DataSource selected when MODE != live,
 * so no network or live data is reachable from tests.
 *
 * StubDataSource returns caller-programmed legs, used to exercise reconciliation,
 * the disagreement-to-abstain path (Gate 1c), and the short-window labeling without
 * any I/O.
 */

import { loadOracleSnapshot } from "@bombe/shared";
import type { ClockLike, DataAsset, DataSource, SourceLeg, YieldObservation, YieldQuery } from "./types.js";

/**
 * MockDataSource — reads a yield fixture and returns a single-leg observation.
 *
 * Single leg is honest for the mock: there is one fixture value, not two
 * computations of a live ground truth. The label says so. Tests that need the
 * cross-check or disagreement paths use StubDataSource instead.
 */
export class MockDataSource implements DataSource {
  private readonly period: string;
  private readonly fixturesRoot: string | undefined;

  constructor(opts: { period?: string; fixturesRoot?: string } = {}) {
    this.period = opts.period ?? "30d-fresh";
    this.fixturesRoot = opts.fixturesRoot;
  }

  async getYieldObservation(query: YieldQuery, clock: ClockLike): Promise<YieldObservation> {
    const snapshot = loadOracleSnapshot(query.asset, this.period, this.fixturesRoot);
    const leg: SourceLeg = {
      name: `fixture-${query.asset}`,
      valueBps: snapshot.value,
      windowDays: 30,
      sourceRef: `fixture://oracles/${query.asset}/${this.period}`,
      raw: snapshot,
    };
    return {
      asset: query.asset,
      metric: "yield_bps",
      windowDays: 30,
      legs: [leg],
      independenceLabel: "fixture (test mode), single leg",
      fetchedAt: clock.now(),
    };
  }
}

/**
 * StubDataSource — returns a fixed observation, or one built from raw leg values.
 *
 * Use the (asset, legValues, windowDays, label) constructor to quickly build a
 * multi-leg observation for reconciliation and disagreement tests.
 */
export class StubDataSource implements DataSource {
  private readonly observation: YieldObservation;

  constructor(observation: YieldObservation) {
    this.observation = observation;
  }

  /** Build a stub from bare leg values, all sharing one window. */
  static fromValues(
    asset: DataAsset,
    legValuesBps: readonly number[],
    opts: { windowDays?: number; label?: string } = {},
  ): StubDataSource {
    const windowDays = opts.windowDays ?? 7;
    const legs: SourceLeg[] = legValuesBps.map((valueBps, i) => ({
      name: `stub-leg-${i}`,
      valueBps,
      windowDays,
      sourceRef: `stub://leg/${i}`,
      raw: { valueBps },
    }));
    return new StubDataSource({
      asset,
      metric: "yield_bps",
      windowDays,
      legs,
      independenceLabel: opts.label ?? "stub",
      fetchedAt: 0,
    });
  }

  async getYieldObservation(_query: YieldQuery, clock: ClockLike): Promise<YieldObservation> {
    return { ...this.observation, fetchedAt: clock.now() };
  }
}
