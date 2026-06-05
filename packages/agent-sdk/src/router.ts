/**
 * router.ts — Deterministic task router. (PRD §6.3.2, T-209)
 *
 * Tool availability per claim is NOT LLM discretion. This module provides a
 * static mapping from `ClaimType` to the exact set of `ToolName` values the
 * loop is permitted to expose to the model.
 *
 * Key design decisions:
 *   - `TOOL_MAP` is a compile-time constant — no runtime branching.
 *   - `allowedTools` returns a *copy* of the array to prevent mutation.
 *   - `FAIR_VALUE` maps to [] (empty): Tier-3 has no tools, so the loop
 *     receives an empty tool list and must immediately ABSTAIN(TIER3_OVERRIDE).
 *     The router itself does not force the abstain — it reports empty tools.
 *   - `refusalObservation` is called when the model requests a tool not in the
 *     mapped set. The loop feeds the returned observation back to the model as
 *     a user-turn message, so the model can revise its next action without
 *     crashing the run.
 */

import type { ClaimType } from "@bombe/shared";

// ---------------------------------------------------------------------------
// ToolName — exhaustive union of all tool identifiers in the system
// ---------------------------------------------------------------------------

/**
 * ToolName — the complete set of tool identifiers the SDK exposes.
 * Any tool the model can reference must appear here AND in TOOL_MAP.
 */
export type ToolName =
  | "fetch_chainlink_price"
  | "fetch_meth_yield"
  | "fetch_usdy_yield"
  | "query_chain_state"
  | "compute_expected"
  | "cross_check_history"
  | "read_document";

// ---------------------------------------------------------------------------
// TOOL_MAP — static mapping per PRD §6.3.2
// ---------------------------------------------------------------------------

/**
 * TOOL_MAP — authoritative per-ClaimType tool allowlist.
 *
 * Source of truth: PRD §6.3.2.
 *
 *   YIELD_BPS:          price feeds + chain state + compute + history
 *   DISTRIBUTION_PAID:  chain state + compute + history
 *   CASHFLOW_MATCH:     document reading + compute + history
 *   ENCUMBRANCE_ABSENT: document reading + chain state + history
 *   FAIR_VALUE:         [] — Tier 3, no tools, immediate ABSTAIN
 *
 * TypeScript exhaustiveness: every key in `ClaimType` must appear here.
 * A compile error fires if a new ClaimType is added without updating this map.
 */
export const TOOL_MAP: Record<ClaimType, ToolName[]> = {
  YIELD_BPS: [
    "fetch_chainlink_price",
    "fetch_meth_yield",
    "fetch_usdy_yield",
    "query_chain_state",
    "compute_expected",
    "cross_check_history",
  ],
  DISTRIBUTION_PAID: ["query_chain_state", "compute_expected", "cross_check_history"],
  CASHFLOW_MATCH: ["read_document", "compute_expected", "cross_check_history"],
  ENCUMBRANCE_ABSENT: ["read_document", "query_chain_state", "cross_check_history"],
  FAIR_VALUE: [], // Tier 3: no tools — loop must immediately ABSTAIN(TIER3_OVERRIDE)
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * allowedTools — returns the list of tools permitted for a given claim type.
 *
 * Returns a shallow copy of the array; mutations do not affect TOOL_MAP.
 * Returns [] for FAIR_VALUE (Tier 3) — the loop should ABSTAIN immediately.
 */
export function allowedTools(claimType: ClaimType): ToolName[] {
  return [...TOOL_MAP[claimType]];
}

/**
 * isToolAllowed — returns true when `tool` is in the mapped set for `claimType`.
 */
export function isToolAllowed(claimType: ClaimType, tool: ToolName): boolean {
  return TOOL_MAP[claimType].includes(tool);
}

/**
 * refusalObservation — produces a structured refusal observation for a tool
 * request that is not mapped to the given claim type.
 *
 * The loop feeds this back to the model as a user-turn observation so the
 * model can revise its next action. (PRD §6.3.2: "requests for unmapped tools
 * return a structured refusal observation.")
 *
 * @param claimType - The claim type currently being processed.
 * @param tool      - The tool name the model requested (may not be a ToolName).
 *
 * Returns `{ refused: true; reason: string }`.
 */
export function refusalObservation(
  claimType: ClaimType,
  tool: string,
): { refused: true; reason: string } {
  const allowed = TOOL_MAP[claimType];
  const allowedStr = allowed.length > 0 ? allowed.join(", ") : "(none — Tier 3 claim)";
  return {
    refused: true,
    reason: `Tool "${tool}" is not permitted for claim type "${claimType}". Allowed tools: [${allowedStr}].`,
  };
}
