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
import type { ModelSeam } from "../seams/types.js";
import { narrateDecisive } from "./narrate.js";
import { type GateResult, type Pipeline, pipelineFor, runGates } from "./pipeline.js";
import { type DecisionResult, decideTier1 } from "./reconciler.js";
import { resolveSpec } from "./source-registry.js";
import type { AssetSpec, ClockLike, DataAsset, DataSource, YieldObservation } from "./types.js";

/** Optional real-LLM narration of the reasoning (the verdict stays deterministic). */
export interface DecisiveOptions {
  narrator?: ModelSeam;
  modelId?: string;
}

/** A Tier-1 yield claim to decide. assertedValueBps is in the same unit the source returns. */
export interface DecisiveClaimInput {
  claimId: string;
  asset: DataAsset;
  /**
   * The open path: an explicit AssetSpec for issuer-specified or discovered sources.
   * When absent, `asset` must be a featured symbol that resolves to a curated spec.
   */
  spec?: AssetSpec;
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

/**
 * Build the provenance DAG for the trace: one source node + one evidence node per
 * leg, all feeding a reconcile node, which feeds the verdict node. A verifier walks
 * verdict -> reconcile -> evidence -> source (with its URL). With multiple
 * sources/schemes the graph branches; the cross-check is visible at the reconcile
 * node. (docs/OPEN-SOURCE-REGISTRY.md)
 */
function buildProvenance(
  input: DecisiveClaimInput,
  obs: YieldObservation,
  decision: DecisionResult,
  gates: GateResult[],
): Trace["provenance"] {
  const nodes: NonNullable<Trace["provenance"]>["nodes"] = [];
  const edges: NonNullable<Trace["provenance"]>["edges"] = [];

  obs.legs.forEach((leg, i) => {
    const srcId = `source:${leg.name}`;
    const evId = `evidence:${leg.name}`;
    nodes.push({ id: srcId, type: "source", label: leg.name, ref: leg.sourceRef });
    nodes.push({
      id: evId,
      type: "evidence",
      label: `${leg.valueBps.toFixed(2)} bps over ${leg.windowDays}d`,
      value: { valueBps: leg.valueBps, windowDays: leg.windowDays, legIndex: i, asOf: leg.asOf },
    });
    edges.push({ from: srcId, to: evId });
    edges.push({ from: evId, to: "reconcile" });
  });

  nodes.push({
    id: "reconcile",
    type: "reconcile",
    label: obs.legs.length > 1 ? "cross-check legs, then judge" : "single-source judge",
    value: {
      spreadBps: decision.reconcile.spreadBps,
      agree: decision.reconcile.agree,
      reconciledValue: decision.reconcile.reconciledValue,
      reconcileToleranceBps: input.reconcileToleranceBps,
      windowDays: obs.windowDays,
      independenceLabel: obs.independenceLabel,
    },
  });

  // Gate nodes sit between reconcile and verdict; a failed gate is visible here.
  let upstream = "reconcile";
  for (const g of gates) {
    const id = `gate:${g.gate}`;
    nodes.push({
      id,
      type: "gate",
      label: `${g.gate}: ${g.passed ? "pass" : "FAIL"}`,
      value: { passed: g.passed, detail: g.detail, forceAbstain: g.forceAbstain },
    });
    edges.push({ from: upstream, to: id });
    upstream = id;
  }

  nodes.push({
    id: "verdict",
    type: "verdict",
    label: decision.verdict,
    value: {
      decision: decision.verdict,
      assertedValueBps: input.assertedValueBps,
      verdictToleranceBps: input.verdictToleranceBps,
    },
  });
  edges.push({ from: upstream, to: "verdict" });

  return { nodes, edges };
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
  options?: DecisiveOptions,
): Promise<DecisiveResult> {
  const observation = await dataSource.getYieldObservation(
    { asset: input.asset, requestedWindowDays: input.requestedWindowDays, spec: input.spec },
    clock,
  );

  const legValues = observation.legs.map((l) => l.valueBps);
  const reconcilerDecision = decideTier1({
    legValues,
    assertedValue: input.assertedValueBps,
    reconcileToleranceBps: input.reconcileToleranceBps,
    verdictToleranceBps: input.verdictToleranceBps,
  });

  // Verification pipeline: auto-select by the asset's category and run its gates over
  // the observation. A failed gate (stale data, out-of-range yield) forces ABSTAIN; the
  // verdict otherwise stays the reconciler's. (D21)
  let pipeline: Pipeline;
  try {
    const spec = input.spec ?? resolveSpec(input.asset);
    pipeline = pipelineFor(spec);
  } catch {
    pipeline = pipelineFor({ symbol: input.asset, category: "other" });
  }
  const { results: gateResults, forceAbstain } = runGates(pipeline, observation, clock.now());
  const decision: DecisionResult = forceAbstain
    ? { ...reconcilerDecision, verdict: "ABSTAIN" }
    : reconcilerDecision;
  const failedGates = gateResults.filter((g) => !g.passed);

  // Real guided-LLM reasoning over the evidence (verdict stays deterministic).
  // When no narrator is provided (tests), the trace uses a plain factual
  // description, never a fake reasoning template that pretends to be a model.
  const narration = options?.narrator
    ? await narrateDecisive(options.narrator, {
        asset: input.asset,
        assertedBps: input.assertedValueBps,
        observation,
        decision,
        modelId: options.modelId ?? "default",
      })
    : null;

  const step0Thought =
    narration && narration.thoughts.length > 0
      ? narration.thoughts.join(" ")
      : `Fetch the live yield observation for ${input.asset} over ~${input.requestedWindowDays} days from all bound sources.`;
  const step1Thought = narration
    ? "Apply the deterministic reconciler verdict to the cross-checked evidence (reasoning above; rationale below)."
    : "Cross-check the legs against each other, then judge the reconciled value against the asserted value. The verdict is deterministic.";
  // A gate-forced ABSTAIN is the decisive reason; say so plainly (do not let the
  // narrator's evidence rationale imply a verdict the gate overruled).
  const gateDetail = failedGates.map((g) => g.detail).join("; ");
  const rationaleSummary = forceAbstain
    ? `Abstaining on a verification gate (${observation.windowDays}-day window): ${gateDetail}.`
    : (narration?.rationale ?? rationale(input, observation, decision));

  const reasons = ["DETERMINISTIC_RECONCILER"];
  if (reconcilerDecision.verdict === "ABSTAIN") {
    reasons.push(
      `SOURCE_DISAGREEMENT(spread=${reconcilerDecision.reconcile.spreadBps.toFixed(2)}bps)`,
    );
  }
  for (const g of failedGates) reasons.push(`GATE_ABSTAIN(${g.gate})`);
  if (narration) reasons.push(`LLM_NARRATED(${narration.modelUsed})`);

  const trace: Trace = {
    traceVersion: "1.0",
    agentId,
    claimId: input.claimId,
    steps: [
      {
        step: 0,
        thought: step0Thought,
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
        thought: step1Thought,
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
      rationaleSummary,
      reasons,
    },
    provenance: buildProvenance(input, observation, decision, gateResults),
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
