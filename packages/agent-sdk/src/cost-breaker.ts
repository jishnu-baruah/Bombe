/**
 * cost-breaker.ts — Cost circuit breaker. (PRD §6.3.1, T-207)
 *
 * Tracks cumulative estimated USD spend across model calls within a single agent
 * run. When `spentUsd > maxUsd`, `isCapped()` returns true.
 *
 * DESIGN CONTRACT:
 *   - This module only *reports* whether the cap is exceeded.
 *   - The loop (T-213) is responsible for calling `isCapped()` after each model
 *     call and, when true, finalising the run with ABSTAIN(COST_CAPPED).
 *   - CostBreaker never throws and never drives control flow by itself.
 *
 * UNKNOWN MODEL COST:
 *   If `model` is not present in the `costs` map, CostBreaker treats its cost as 0
 *   (no spend is accumulated for that call) and sets an internal `hasUnknownModel`
 *   flag to true. Callers can check `unknownModels` to detect this situation.
 *   Rationale: a missing model entry is a configuration gap, not a runtime crash
 *   condition. The loop should log/warn when `unknownModels.size > 0`.
 */

import type { ModelResponse } from "./seams/types.js";

/** Construction options for CostBreaker. */
export interface CostBreakerOptions {
  /** Maximum allowed cumulative cost in USD per agent run. Default: 0.05 */
  maxUsd: number;
  /** Token-cost table from `loadModelCosts()`. */
  costs: Record<string, { inputPer1k: number; outputPer1k: number }>;
}

/**
 * CostBreaker — accumulates estimated USD cost from model responses and reports
 * when the per-run cap is exceeded.
 *
 * Usage in the loop (T-213):
 *   const breaker = new CostBreaker({ maxUsd: config.maxCostUsdPerRun, costs });
 *   // ... after each model call:
 *   breaker.addResponse(response);
 *   if (breaker.isCapped()) { return finaliseAbstain("COST_CAPPED"); }
 */
export class CostBreaker {
  private readonly maxUsd: number;
  private readonly costs: Record<string, { inputPer1k: number; outputPer1k: number }>;
  private _spentUsd = 0;

  /**
   * Set of model identifiers whose cost was NOT found in the cost table.
   * The loop should log a warning when this set is non-empty.
   */
  readonly unknownModels: Set<string> = new Set();

  constructor(opts: CostBreakerOptions) {
    this.maxUsd = opts.maxUsd;
    this.costs = opts.costs;
  }

  /**
   * Accumulate cost for a single model call.
   *
   * @param model     - Model identifier (e.g. "meta/llama-3.3-70b").
   * @param tokensIn  - Prompt tokens consumed.
   * @param tokensOut - Completion tokens generated.
   *
   * If `model` is not in the cost table, 0 cost is accumulated and the model
   * identifier is added to `this.unknownModels`.
   */
  add(model: string, tokensIn: number, tokensOut: number): void {
    const rates = this.costs[model];
    if (rates === undefined) {
      this.unknownModels.add(model);
      // Treat unknown model cost as 0 — do NOT crash the run.
      return;
    }
    const callCost = (tokensIn / 1000) * rates.inputPer1k + (tokensOut / 1000) * rates.outputPer1k;
    this._spentUsd += callCost;
  }

  /**
   * Convenience wrapper: fold a `ModelResponse` directly.
   * Uses `resp.modelUsed` as the model identifier.
   */
  addResponse(resp: ModelResponse): void {
    this.add(resp.modelUsed, resp.tokensIn, resp.tokensOut);
  }

  /** Cumulative estimated USD spent so far. */
  get spentUsd(): number {
    return this._spentUsd;
  }

  /**
   * Returns true when cumulative spend exceeds the configured cap.
   * The loop should call this after every `addResponse` / `add` and abort
   * the run with ABSTAIN(COST_CAPPED) when true.
   */
  isCapped(): boolean {
    return this._spentUsd > this.maxUsd;
  }

  /**
   * Remaining budget in USD (may be negative if already over cap).
   * Useful for logging and pre-flight checks.
   */
  remainingUsd(): number {
    return this.maxUsd - this._spentUsd;
  }
}
