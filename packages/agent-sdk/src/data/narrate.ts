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
  "NEVER describe the sources as 'independent'; they may share one underlying ground truth. Use the provided source label's framing (e.g. 'two computation paths', 'cross-check', 'single source'). " +
  "Do not re-annualize or recompute the legs; the values given are already annualized in bps. " +
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
/**
 * Parse the model's reply into thoughts + rationale, salvaging values from
 * imperfect or truncated JSON (small models do not always close the JSON). Never
 * emits raw JSON as the rationale; returns null only if nothing is recoverable.
 */
function parseNarration(textRaw: string, modelUsed: string): Narration | null {
  const block = textRaw.match(/\{[\s\S]*\}?/)?.[0] ?? textRaw;
  let thoughts: string[] = [];
  let rationale = "";

  try {
    const p = JSON.parse(block) as { thoughts?: unknown; rationale?: unknown };
    if (Array.isArray(p.thoughts)) {
      thoughts = p.thoughts
        .filter((t): t is string => typeof t === "string" && t.trim() !== "")
        .map((t) => t.trim());
    }
    if (typeof p.rationale === "string") rationale = p.rationale.trim();
  } catch {
    // Salvage from truncated/imperfect JSON via regex.
    const tBlock = block.match(/"thoughts"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
    if (tBlock?.[1]) {
      thoughts = [...tBlock[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
        .map((m) => (m[1] ?? "").replace(/\\"/g, '"').replace(/\\n/g, " ").trim())
        .filter((s) => s !== "");
    }
    const rBlock = block.match(/"rationale"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (rBlock?.[1]) rationale = rBlock[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
  }

  if (rationale === "" && thoughts.length > 0) rationale = thoughts[thoughts.length - 1] ?? "";
  if (thoughts.length === 0 && rationale === "") return null;
  return { thoughts, rationale, modelUsed };
}

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
  try {
    const resp = await model.complete({
      model: modelId,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(asset, assertedBps, observation, decision) },
      ],
      maxTokens: args.maxTokens ?? 1000,
      temperature: 0.2,
    });
    return parseNarration(resp.text, resp.modelUsed);
  } catch {
    return null;
  }
}
