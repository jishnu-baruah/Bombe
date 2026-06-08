/**
 * data/pipeline.ts — Per-asset verification pipeline. (docs/OPEN-SOURCE-REGISTRY.md, D21)
 *
 * Above the source resolver sits a pipeline: an ordered set of deterministic steps an
 * asset runs through. The default is fetch -> reconcile -> judge. A category (or a
 * protocol override) can add GATES that force ABSTAIN/flag (never an opinion): a
 * freshness gate (stale data abstains) and a bounds/sanity gate (an out-of-range yield
 * abstains). A `document` step (Tier-2: pin+hash a doc, extract with citations,
 * cross-check) plugs in here for asset types that need a report checked.
 *
 * The pipeline is auto-selected by the asset's category, so a newly discovered asset
 * inherits its category's pipeline with no code. Honesty: every step is deterministic
 * evidence or a gate; the verdict remains the reconciler's, never a model's.
 */

import type { AssetSpec, YieldObservation } from "./types.js";

/** The kinds of step a pipeline can run. `document` is the Tier-2 slot (built next). */
export type StepKind =
  | "fetch"
  | "freshness-gate"
  | "bounds-gate"
  | "peg-gate"
  | "document"
  | "reconcile"
  | "judge";

/** The outcome of one gate. A failed gate that is `forceAbstain` overrides the verdict. */
export interface GateResult {
  gate: string;
  passed: boolean;
  detail: string;
  /** When true, a failure forces the verdict to ABSTAIN. */
  forceAbstain: boolean;
}

/** A category's gate configuration. Tuned per RWA type; "other" is the permissive default. */
export interface GateConfig {
  /** Max age of the freshest leg, in days, before the freshness gate abstains. */
  maxStalenessDays: number;
  /** Plausible annualized-yield band in bps; outside it, the bounds gate abstains. */
  minBps: number;
  maxBps: number;
}

/**
 * Category -> gate config. Bands reflect what is plausible for each RWA type, so an
 * absurd or stale value abstains rather than attesting noise. A new category inherits
 * "other" until tuned here.
 */
/** The permissive default for unknown/untuned categories. */
export const DEFAULT_GATES: GateConfig = { maxStalenessDays: 21, minBps: -10000, maxBps: 20000 };

export const CATEGORY_GATES: Record<string, GateConfig> = {
  "tokenized-treasury": { maxStalenessDays: 5, minBps: 0, maxBps: 1500 },
  "synthetic-dollar": { maxStalenessDays: 5, minBps: 0, maxBps: 5000 },
  "liquid-staking": { maxStalenessDays: 10, minBps: 0, maxBps: 2000 },
  "liquid-restaking": { maxStalenessDays: 10, minBps: 0, maxBps: 3000 },
  "private-credit": { maxStalenessDays: 40, minBps: 0, maxBps: 4000 },
  "tokenized-equity": { maxStalenessDays: 10, minBps: -5000, maxBps: 10000 },
  "tokenized-commodity": { maxStalenessDays: 10, minBps: -3000, maxBps: 5000 },
  "real-estate": { maxStalenessDays: 120, minBps: 0, maxBps: 3000 },
  lending: { maxStalenessDays: 5, minBps: 0, maxBps: 5000 },
  "btc-yield": { maxStalenessDays: 10, minBps: 0, maxBps: 5000 },
  vault: { maxStalenessDays: 7, minBps: 0, maxBps: 5000 },
  other: DEFAULT_GATES,
};

/** A verification pipeline: the ordered step kinds + the gate config for the gates. */
export interface Pipeline {
  name: string;
  steps: StepKind[];
  gates: GateConfig;
}

/** The generic pipeline shape: fetch, gate, reconcile, judge. Document steps add to this. */
const BASE_STEPS: StepKind[] = ["fetch", "freshness-gate", "bounds-gate", "reconcile", "judge"];

/**
 * Select the pipeline for an asset, automatically, by its category. A protocol override
 * could be added by keying on spec.symbol; today every category uses the gated base
 * pipeline with its tuned config.
 */
export function pipelineFor(spec: Pick<AssetSpec, "category" | "symbol">): Pipeline {
  const category = spec.category ?? "other";
  const gates = CATEGORY_GATES[category] ?? DEFAULT_GATES;
  return { name: `${category}-default`, steps: BASE_STEPS, gates };
}

const MS_PER_DAY = 86_400_000;

/**
 * Freshness gate: the freshest leg must be within maxStalenessDays of `now`. Legs with
 * no `asOf` are skipped (we cannot assess them); if NO leg carries a timestamp the gate
 * passes (nothing to judge). A stale freshest leg forces ABSTAIN.
 */
export function freshnessGate(obs: YieldObservation, now: number, cfg: GateConfig): GateResult {
  const stamps = obs.legs
    .map((l) => l.asOf)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (stamps.length === 0) {
    return {
      gate: "freshness",
      passed: true,
      detail: "no leg carries a timestamp",
      forceAbstain: false,
    };
  }
  const freshest = Math.max(...stamps);
  const ageDays = (now - freshest) / MS_PER_DAY;
  const passed = ageDays <= cfg.maxStalenessDays;
  return {
    gate: "freshness",
    passed,
    detail: passed
      ? `freshest leg is ${ageDays.toFixed(1)}d old (<= ${cfg.maxStalenessDays}d)`
      : `freshest leg is ${ageDays.toFixed(1)}d old (> ${cfg.maxStalenessDays}d); abstaining on stale data`,
    forceAbstain: !passed,
  };
}

/**
 * Bounds/sanity gate: every leg's annualized yield must fall in the category's plausible
 * band. An out-of-range value (e.g. a misparsed 900% APY) forces ABSTAIN rather than
 * attesting noise.
 */
export function boundsGate(obs: YieldObservation, cfg: GateConfig): GateResult {
  const offending = obs.legs.filter((l) => l.valueBps < cfg.minBps || l.valueBps > cfg.maxBps);
  const passed = offending.length === 0;
  return {
    gate: "bounds",
    passed,
    detail: passed
      ? `all legs within [${cfg.minBps}, ${cfg.maxBps}] bps`
      : `${offending.length} leg(s) outside [${cfg.minBps}, ${cfg.maxBps}] bps (e.g. ${offending[0]?.valueBps.toFixed(0)} bps); abstaining`,
    forceAbstain: !passed,
  };
}

/** Run the gate steps of a pipeline over an observation. */
export function runGates(
  pipeline: Pipeline,
  obs: YieldObservation,
  now: number,
): { results: GateResult[]; forceAbstain: boolean } {
  const results: GateResult[] = [];
  for (const step of pipeline.steps) {
    if (step === "freshness-gate") results.push(freshnessGate(obs, now, pipeline.gates));
    else if (step === "bounds-gate") results.push(boundsGate(obs, pipeline.gates));
  }
  return { results, forceAbstain: results.some((r) => r.forceAbstain) };
}
