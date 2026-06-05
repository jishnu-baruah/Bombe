/**
 * reasons.ts — Shared AbstainReason union for all ABSTAIN paths in the SDK.
 *
 * The loop (T-213) uses this full set to finalize ABSTAIN outcomes.
 * Individual modules (cost-breaker, tool-recovery, router, loop) import from here.
 *
 * Reason catalogue:
 *   BELOW_THRESHOLD     — agent confidence is below the per-agent threshold.
 *   STALE_SINGLE_SOURCE — only a single stale source is available; no secondary.
 *   STEP_BUDGET         — max ReAct steps exhausted without a finalization decision.
 *   COST_CAPPED         — cumulative token cost exceeded MAX_COST_USD_PER_RUN.
 *   TOOL_FAILURE        — a tool threw an unrecoverable error (or retry also failed).
 *   TIER3_OVERRIDE      — claim is Tier 3 (FAIR_VALUE); attestation is forbidden.
 */
export type AbstainReason =
  | "BELOW_THRESHOLD"
  | "STALE_SINGLE_SOURCE"
  | "STEP_BUDGET"
  | "COST_CAPPED"
  | "TOOL_FAILURE"
  | "TIER3_OVERRIDE";
