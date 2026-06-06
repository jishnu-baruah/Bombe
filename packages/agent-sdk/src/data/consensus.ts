/**
 * data/consensus.ts — Consensus over evidence, deterministic verdict. (BOMBE-V2-PRD D5/D11/D12)
 *
 * The verdict stays deterministic (decideTier1). Consensus runs over the EVIDENCE:
 * N independent evidence-gatherings each reconcile to a per-run value, and at
 * least 2 must agree within tolerance before a verdict is issued. A split, a
 * failed run, or too few usable runs abstains.
 *
 * D6 honesty: with one model in the gateway the mechanism is labeled
 * "single-model triple-run redundancy", never "multi-model consensus". Pass
 * { multiModel: true } only once three genuinely different models are confirmed.
 * D12: hold temperament constant, vary only the model, so a split reflects model
 * (or fetch) disagreement on evidence, not temperament.
 */

import type { Source } from "../attest.js";
import type { Trace } from "../loop.js";
import type { DecisiveClaimInput } from "./decisive-path.js";
import { type Verdict, deterministicVerdict, reconcileLegs } from "./reconciler.js";
import type { ClockLike, DataSource, YieldObservation } from "./types.js";

export interface ConsensusResult {
  agreed: boolean;
  consensusValue: number | null;
  votes: { total: number; usable: number; cluster: number };
  note: string;
}

/**
 * consensusEvidence — does a quorum of runs agree on the evidence?
 *
 * Drops nulls (failed runs), sorts, and finds the largest cluster of values
 * within reconcileToleranceBps of each other (sliding window). A cluster of >=2
 * is a quorum; the consensus value is its mean. Fewer than 2 usable or no cluster
 * of 2 -> null (the caller abstains).
 */
export function consensusEvidence(
  reconciledValues: readonly (number | null)[],
  reconcileToleranceBps: number,
): ConsensusResult {
  const total = reconciledValues.length;
  const usableVals = reconciledValues
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  const usable = usableVals.length;

  if (usable < 2) {
    return {
      agreed: false,
      consensusValue: null,
      votes: { total, usable, cluster: 0 },
      note: `quorum not met: ${usable}/${total} usable runs`,
    };
  }

  let bestStart = 0;
  let bestLen = 1;
  let lo = 0;
  for (let hi = 0; hi < usable; hi++) {
    const high = usableVals[hi] as number;
    while (high - (usableVals[lo] as number) > reconcileToleranceBps) lo++;
    const len = hi - lo + 1;
    if (len > bestLen) {
      bestLen = len;
      bestStart = lo;
    }
  }

  if (bestLen < 2) {
    return {
      agreed: false,
      consensusValue: null,
      votes: { total, usable, cluster: bestLen },
      note: `no quorum: ${usable} usable runs, none within ${reconcileToleranceBps} bps of each other`,
    };
  }

  const cluster = usableVals.slice(bestStart, bestStart + bestLen);
  const consensusValue = cluster.reduce((a, b) => a + b, 0) / cluster.length;
  return {
    agreed: true,
    consensusValue,
    votes: { total, usable, cluster: bestLen },
    note: `${bestLen}/${total} runs agree within ${reconcileToleranceBps} bps`,
  };
}

export interface ConsensusDecisiveResult {
  verdict: Verdict;
  consensus: ConsensusResult;
  perRunValues: (number | null)[];
  mechanismLabel: string;
  trace: Trace;
  sources: Source[];
}

interface ConsensusOpts {
  runs?: number;
  modelLabels?: string[];
  /** Only true once three genuinely different models are confirmed (D6). */
  multiModel?: boolean;
}

/**
 * runConsensusDecisive — N evidence-gatherings, consensus, then deterministic verdict.
 */
export async function runConsensusDecisive(
  input: DecisiveClaimInput,
  dataSource: DataSource,
  clock: ClockLike,
  agentId: string,
  opts: ConsensusOpts = {},
): Promise<ConsensusDecisiveResult> {
  const runs = opts.runs ?? 3;
  const labels =
    opts.modelLabels ?? Array.from({ length: runs }, (_, i) => `run-${(i + 1).toString()}`);
  const mechanismLabel = opts.multiModel
    ? "multi-model consensus"
    : "single-model triple-run redundancy";

  const perRunValues: (number | null)[] = [];
  const perRunObs: (YieldObservation | null)[] = [];
  for (let i = 0; i < runs; i++) {
    try {
      const obs = await dataSource.getYieldObservation(
        { asset: input.asset, requestedWindowDays: input.requestedWindowDays },
        clock,
      );
      const rec = reconcileLegs(
        obs.legs.map((l) => l.valueBps),
        input.reconcileToleranceBps,
      );
      perRunObs.push(obs);
      perRunValues.push(rec.reconciledValue);
    } catch {
      perRunObs.push(null);
      perRunValues.push(null);
    }
  }

  const consensus = consensusEvidence(perRunValues, input.reconcileToleranceBps);
  const verdict: Verdict =
    consensus.consensusValue === null
      ? "ABSTAIN"
      : deterministicVerdict(
          consensus.consensusValue,
          input.assertedValueBps,
          input.verdictToleranceBps,
        );

  const windowDays = perRunObs.find((o) => o !== null)?.windowDays ?? input.requestedWindowDays;

  const runSteps = perRunObs.map((obs, i) => ({
    step: i,
    thought: `Evidence run ${(i + 1).toString()} (${labels[i] ?? `run-${(i + 1).toString()}`}).`,
    action: { evidenceRun: { modelId: labels[i] ?? `run-${(i + 1).toString()}` } },
    observation:
      obs === null
        ? { failed: true, value: null }
        : { value: perRunValues[i], legs: obs.legs, windowDays: obs.windowDays },
    ts: clock.now(),
  }));

  const confidenceBps = verdict === "ABSTAIN" ? 0 : 10_000;
  const reasons = ["DETERMINISTIC_RECONCILER", `CONSENSUS:${mechanismLabel}`];
  if (verdict === "ABSTAIN") reasons.push(`NO_QUORUM(${consensus.note})`);

  const trace: Trace = {
    traceVersion: "1.0",
    agentId,
    claimId: input.claimId,
    steps: [
      ...runSteps,
      {
        step: runs,
        thought:
          "Take consensus over the per-run evidence, then judge the consensus value against the assertion. The verdict is deterministic.",
        action: {
          consensus: {
            mechanism: mechanismLabel,
            reconcileToleranceBps: input.reconcileToleranceBps,
            verdictToleranceBps: input.verdictToleranceBps,
            assertedValueBps: input.assertedValueBps,
          },
        },
        observation: {
          perRunValues,
          consensus,
          verdict,
        },
        ts: clock.now(),
      },
    ],
    final: {
      decision: verdict,
      confidenceBps,
      rationaleSummary:
        verdict === "ABSTAIN"
          ? `No evidence quorum (${consensus.note}); abstaining (${windowDays}-day window, ${mechanismLabel}).`
          : `Consensus ${(consensus.consensusValue ?? Number.NaN).toFixed(2)} bps over a ${windowDays}-day window is ${verdict === "VALID" ? "within" : "outside"} ${input.verdictToleranceBps} bps of the asserted ${input.assertedValueBps} bps (${mechanismLabel}). Verdict by deterministic reconciler.`,
      reasons,
    },
  };

  const sources: Source[] = [];
  perRunObs.forEach((obs, i) => {
    if (obs === null) return;
    for (const leg of obs.legs) {
      sources.push({
        name: `${labels[i] ?? `run-${(i + 1).toString()}`}:${leg.name}`,
        value: { valueBps: leg.valueBps, windowDays: leg.windowDays },
        source: leg.sourceRef,
        fetchedAt: obs.fetchedAt,
        confidence: 10_000,
      });
    }
  });

  return { verdict, consensus, perRunValues, mechanismLabel, trace, sources };
}
