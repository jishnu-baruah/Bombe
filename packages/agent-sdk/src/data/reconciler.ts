/**
 * data/reconciler.ts — Deterministic verdict logic for Tier-1 claims. (BOMBE-V2-PRD D11)
 *
 * The Tier-1 verdict is NOT decided by a model. It is a pure function of the
 * reconciled observed value, the asserted value, and a tolerance, so any verifier
 * can rerun it from the trace and get the same answer.
 *
 * Two distinct tolerances:
 *   - reconcileToleranceBps: do the source legs agree with EACH OTHER (cross-check, D4)?
 *   - verdictToleranceBps:   does the reconciled value match the ASSERTED value (D11)?
 *
 * No Date.now, no Math.random, no I/O. Pure arithmetic.
 */

export type Verdict = "VALID" | "REJECTED" | "ABSTAIN";

/**
 * Result of reconciling several source legs against each other.
 *   agree           — true when every pairwise gap is within reconcileToleranceBps
 *   reconciledValue — the mean of the legs when they agree, otherwise null
 *   spreadBps       — the largest pairwise absolute gap (the disagreement size)
 */
export interface ReconcileResult {
  agree: boolean;
  reconciledValue: number | null;
  spreadBps: number;
}

/**
 * reconcileLegs — cross-check rule (D4).
 *
 * Returns agree=true only when all legs are within reconcileToleranceBps of each
 * other. A single leg trivially agrees with itself. Zero legs never agree (a
 * source failure must abstain, never silently pass).
 */
export function reconcileLegs(values: readonly number[], reconcileToleranceBps: number): ReconcileResult {
  if (reconcileToleranceBps < 0) {
    throw new Error("reconcileLegs: reconcileToleranceBps must be >= 0");
  }
  if (values.length === 0) {
    return { agree: false, reconciledValue: null, spreadBps: Number.POSITIVE_INFINITY };
  }

  let min = values[0] as number;
  let max = values[0] as number;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const spreadBps = max - min;
  const agree = spreadBps <= reconcileToleranceBps;

  if (!agree) {
    return { agree: false, reconciledValue: null, spreadBps };
  }

  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;
  return { agree: true, reconciledValue: mean, spreadBps };
}

/**
 * deterministicVerdict — the Tier-1 verdict (D11).
 *
 *   reconciledValue === null            -> ABSTAIN (legs disagreed or a source failed)
 *   |reconciled - asserted| <= tolerance -> VALID
 *   otherwise                            -> REJECTED
 */
export function deterministicVerdict(
  reconciledValue: number | null,
  assertedValue: number,
  verdictToleranceBps: number,
): Verdict {
  if (verdictToleranceBps < 0) {
    throw new Error("deterministicVerdict: verdictToleranceBps must be >= 0");
  }
  if (reconciledValue === null) {
    return "ABSTAIN";
  }
  const gap = Math.abs(reconciledValue - assertedValue);
  return gap <= verdictToleranceBps ? "VALID" : "REJECTED";
}

/**
 * The full deterministic decision over already-fetched leg values.
 * Convenience wrapper used by the runner: reconcile, then judge.
 */
export interface DecisionInputs {
  legValues: readonly number[];
  assertedValue: number;
  reconcileToleranceBps: number;
  verdictToleranceBps: number;
}

export interface DecisionResult {
  verdict: Verdict;
  reconcile: ReconcileResult;
}

export function decideTier1(inputs: DecisionInputs): DecisionResult {
  const reconcile = reconcileLegs(inputs.legValues, inputs.reconcileToleranceBps);
  const verdict = deterministicVerdict(
    reconcile.reconciledValue,
    inputs.assertedValue,
    inputs.verdictToleranceBps,
  );
  return { verdict, reconcile };
}
