/**
 * data/decisive-path.ts — Tier-1 decisive attestation, deterministic verdict. (BOMBE-V2-PRD D11/WS1)
 *
 * Wires the DataSource and the reconciler into a hashable attestation trace.
 * The verdict is computed by decideTier1, NOT by a model: fetch the live
 * observation, cross-check the legs, judge against the asserted value.
 *
 * This module builds the Trace + Sources only. Submission (blob upload, calldata,
 * wallet signAndSend, repo insert) is done by buildAndSubmitAttestation, whose
 * signAndSend step needs the operator's posting/attestor keys (OP-8). Everything
 * here is pure given an injected DataSource + clock, so it is fully unit-tested
 * with StubDataSource and a fixed clock.
 */

import type { Source } from "../attest.js";
import type { Trace } from "../loop.js";
import { type DecisionResult, decideTier1 } from "./reconciler.js";
import type { ClockLike, DataAsset, DataSource, YieldObservation } from "./types.js";

/** A Tier-1 yield claim to decide. assertedValueBps is in the same unit the source returns. */
export interface DecisiveClaimInput {
  claimId: string;
  asset: DataAsset;
  /** The value the claim asserts, in the source's annualized basis points. */
  assertedValueBps: number;
  /** Max pairwise gap for the legs to be considered agreeing (D4). */
  reconcileToleranceBps: number;
  /** Max gap between the reconciled value and the assertion for VALID (D11). */
  verdictToleranceBps: number;
  /** Requested window; the source clamps to available data and reports the actual. */
  requestedWindowDays: number;
}

export interface DecisiveResult {
  observation: YieldObservation;
  decision: DecisionResult;
  trace: Trace;
  sources: Source[];
}

/** Confidence reflects determinism, not model uncertainty: decisive = full, abstain = none. */
function confidenceFor(verdict: DecisionResult["verdict"]): number {
  return verdict === "ABSTAIN" ? 0 : 10_000;
}

function rationale(
  input: DecisiveClaimInput,
  obs: YieldObservation,
  decision: DecisionResult,
): string {
  const { reconcile, verdict } = decision;
  const win = `${obs.windowDays}-day window`;
  if (verdict === "ABSTAIN") {
    if (obs.legs.length === 0) {
      return `No source legs available; abstaining (${win}).`;
    }
    return `Source legs disagreed (spread ${reconcile.spreadBps.toFixed(2)} bps > reconcile tolerance ${input.reconcileToleranceBps} bps); abstaining (${win}).`;
  }
  const reconciled = (reconcile.reconciledValue ?? Number.NaN).toFixed(2);
  if (verdict === "VALID") {
    return `Reconciled ${reconciled} bps over the ${win} is within ${input.verdictToleranceBps} bps of the asserted ${input.assertedValueBps} bps. Verdict by deterministic reconciler.`;
  }
  return `Reconciled ${reconciled} bps over the ${win} differs from the asserted ${input.assertedValueBps} bps by more than ${input.verdictToleranceBps} bps. Verdict by deterministic reconciler.`;
}

function reasonsFor(decision: DecisionResult): string[] {
  const reasons = ["DETERMINISTIC_RECONCILER"];
  if (decision.verdict === "ABSTAIN") {
    reasons.push(`SOURCE_DISAGREEMENT(spread=${decision.reconcile.spreadBps.toFixed(2)}bps)`);
  }
  return reasons;
}

/**
 * computeDecisiveAttestation — fetch live evidence, reconcile, and build a hashable trace.
 *
 * The returned trace.final.decision is the deterministic verdict. The trace
 * records the per-leg evidence, the reconciler inputs/output, the windowDays, and
 * the honesty label, so a verifier can rerun the whole judgment from it.
 */
export async function computeDecisiveAttestation(
  input: DecisiveClaimInput,
  dataSource: DataSource,
  clock: ClockLike,
  agentId: string,
): Promise<DecisiveResult> {
  const observation = await dataSource.getYieldObservation(
    { asset: input.asset, requestedWindowDays: input.requestedWindowDays },
    clock,
  );

  const legValues = observation.legs.map((l) => l.valueBps);
  const decision = decideTier1({
    legValues,
    assertedValue: input.assertedValueBps,
    reconcileToleranceBps: input.reconcileToleranceBps,
    verdictToleranceBps: input.verdictToleranceBps,
  });

  const trace: Trace = {
    traceVersion: "1.0",
    agentId,
    claimId: input.claimId,
    steps: [
      {
        step: 0,
        thought: `Fetch the live yield observation for ${input.asset} over ~${input.requestedWindowDays} days from all bound sources.`,
        action: {
          tool: "getYieldObservation",
          input: { asset: input.asset, requestedWindowDays: input.requestedWindowDays },
        },
        observation: {
          metric: observation.metric,
          windowDays: observation.windowDays,
          independenceLabel: observation.independenceLabel,
          legs: observation.legs,
        },
        ts: observation.fetchedAt,
      },
      {
        step: 1,
        thought:
          "Cross-check the legs against each other, then judge the reconciled value against the asserted value. The verdict is deterministic.",
        action: {
          reconcile: {
            assertedValueBps: input.assertedValueBps,
            reconcileToleranceBps: input.reconcileToleranceBps,
            verdictToleranceBps: input.verdictToleranceBps,
          },
        },
        observation: {
          legValues,
          spreadBps: decision.reconcile.spreadBps,
          agree: decision.reconcile.agree,
          reconciledValue: decision.reconcile.reconciledValue,
          verdict: decision.verdict,
        },
        ts: clock.now(),
      },
    ],
    final: {
      decision: decision.verdict,
      confidenceBps: confidenceFor(decision.verdict),
      rationaleSummary: rationale(input, observation, decision),
      reasons: reasonsFor(decision),
    },
  };

  const sources: Source[] = observation.legs.map((l) => ({
    name: l.name,
    value: { valueBps: l.valueBps, windowDays: l.windowDays },
    source: l.sourceRef,
    fetchedAt: observation.fetchedAt,
    confidence: 10_000,
  }));

  return { observation, decision, trace, sources };
}
