/**
 * data/narrate.ts — real guided-LLM reasoning over the evidence (no templates).
 *
 * The verdict stays deterministic (decideTier1); this asks a real model to write
 * the train of thought and the rationale OVER the fetched evidence, citing each
 * source by name and reference (URL/address), so the trace is genuinely
 * AI-authored and auditable. The model is explicitly told it does NOT decide the
 * verdict; it explains it. If the model errors or returns nothing usable, the
 * caller falls back to a plain factual statement (never a fake reasoning template).
 */

import type { ModelSeam } from "../seams/types.js";
import type { DecisionResult } from "./reconciler.js";
import type { YieldObservation } from "./types.js";

export interface Narration {
  /** Ordered reasoning steps authored by the model, each citing the evidence. */
  thoughts: string[];
  /** The model's one-paragraph rationale for the (deterministic) verdict. */
  rationale: string;
  /** The model id that produced this narration. */
  modelUsed: string;
}

const SYSTEM_PROMPT =
  "You are an on-chain yield attestor explaining a verdict to a skeptical auditor. " +
  "The verdict is computed DETERMINISTICALLY by a reconciler and is GIVEN to you; you must NOT change it or invent one. " +
  "Your job is to write the genuine train of thought that connects the real evidence to that verdict, and to cite every source by its name and reference (URL or contract+method) so a reader can re-check it. " +
  "Be precise, quantitative, and honest about limits (single source, stale data, disagreement). " +
  'Respond with STRICT JSON only, no markdown: {"thoughts": ["step 1 ...", "step 2 ..."], "rationale": "..."}. ' +
  "Each thought is one reasoning step and should reference the relevant source.";

/** Build the user prompt from the real evidence. */
function userPrompt(
  asset: string,
  assertedBps: number,
  observation: YieldObservation,
  decision: DecisionResult,
): string {
  const legs =
    observation.legs.length === 0
      ? "(no source legs were available)"
      : observation.legs
          .map(
            (l) =>
              `- ${l.name}: ${l.valueBps.toFixed(2)} bps over ${l.windowDays}d (source: ${l.sourceRef})`,
          )
          .join("\n");
  const reconciled =
    decision.reconcile.reconciledValue === undefined || decision.reconcile.reconciledValue === null
      ? "n/a"
      : `${decision.reconcile.reconciledValue.toFixed(2)} bps`;
  return [
    `Asset: ${asset}`,
    `Asserted value: ${assertedBps} bps`,
    `Window (windowDays): ${observation.windowDays}`,
    `Source label: ${observation.independenceLabel}`,
    "Evidence legs (real fetched values):",
    legs,
    `Reconciled value: ${reconciled} (pairwise spread ${decision.reconcile.spreadBps.toFixed(2)} bps, legs agree=${decision.reconcile.agree})`,
    `Deterministic verdict (given, do not change): ${decision.verdict}`,
    "Explain, step by step, how the evidence leads to this verdict, citing each source.",
  ].join("\n");
}

/**
 * Ask the model to narrate the reasoning. Returns null if the model produced
 * nothing usable, so the caller can fall back to a factual statement.
 */
export async function narrateDecisive(
  model: ModelSeam,
  args: {
    asset: string;
    assertedBps: number;
    observation: YieldObservation;
    decision: DecisionResult;
    modelId: string;
    maxTokens?: number;
  },
): Promise<Narration | null> {
  const { asset, assertedBps, observation, decision, modelId } = args;
  let resp: { text: string; modelUsed: string };
  try {
    resp = await model.complete({
      model: modelId,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(asset, assertedBps, observation, decision) },
      ],
      maxTokens: args.maxTokens ?? 700,
      temperature: 0.2,
    });
  } catch {
    return null;
  }

  // Lenient JSON parse: pull the first {...} block.
  const match = resp.text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { thoughts?: unknown; rationale?: unknown };
      const thoughts = Array.isArray(parsed.thoughts)
        ? parsed.thoughts.filter((t): t is string => typeof t === "string" && t.trim() !== "")
        : [];
      const rationale = typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
      if (thoughts.length > 0 && rationale !== "") {
        return { thoughts, rationale, modelUsed: resp.modelUsed };
      }
    } catch {
      // fall through
    }
  }

  // Model replied but not as JSON: keep its real text as the rationale.
  const raw = resp.text.trim();
  if (raw !== "") {
    return { thoughts: [], rationale: raw.slice(0, 1200), modelUsed: resp.modelUsed };
  }
  return null;
}
