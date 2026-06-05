/**
 * tools/index.ts — Tool registry for @bombe/agent-sdk. (PRD §6.3, T-210/T-211/T-212)
 *
 * TOOLS — the authoritative Record<ToolName, Tool> for all six SDK tools.
 * getTool — type-safe accessor. Throws if a name is somehow not in the map
 *           (shouldn't happen with ToolName exhaustiveness, but defensive).
 *
 * Tool list (PRD §6.3):
 *   T-210 feeds:
 *     fetch_chainlink_price — generic oracle snapshot by (asset, period)
 *     fetch_meth_yield      — mETH yield; stale-aware for claim B
 *     fetch_usdy_yield      — USDY yield
 *   T-211 chain + compute:
 *     query_chain_state     — DSL: balanceOf | eventOccurred (fixture-backed)
 *     compute_expected      — pure ±2 bps tolerance math
 *   T-212 document + history:
 *     read_document         — reads servicer report / bank statement
 *     cross_check_history   — queries attestation history via HistorySource seam
 */

import type { ToolName } from "../router.js";
import { computeExpectedTool, queryChainStateTool } from "./chain-compute.js";
import { crossCheckHistoryTool, readDocumentTool } from "./doc-history.js";
import { fetchChainlinkPriceTool, fetchMethYieldTool, fetchUsdyYieldTool } from "./feeds.js";
import type { Tool } from "./types.js";

// ---------------------------------------------------------------------------
// TOOLS registry
// ---------------------------------------------------------------------------

/**
 * TOOLS — the complete record of all SDK tools, keyed by ToolName.
 *
 * TypeScript enforces exhaustiveness: every ToolName must appear as a key.
 * Adding a new ToolName without updating this map is a compile error.
 */
export const TOOLS: Record<ToolName, Tool> = {
  fetch_chainlink_price: fetchChainlinkPriceTool,
  fetch_meth_yield: fetchMethYieldTool,
  fetch_usdy_yield: fetchUsdyYieldTool,
  query_chain_state: queryChainStateTool,
  compute_expected: computeExpectedTool,
  read_document: readDocumentTool,
  cross_check_history: crossCheckHistoryTool,
};

// ---------------------------------------------------------------------------
// getTool
// ---------------------------------------------------------------------------

/**
 * getTool — returns the Tool implementation for a given ToolName.
 *
 * Because TOOLS is typed as Record<ToolName, Tool>, the return is always
 * defined for valid ToolName values. The runtime guard is defensive only.
 */
export function getTool(name: ToolName): Tool {
  const tool = TOOLS[name];
  // Defensive: this branch is unreachable if ToolName and TOOLS stay in sync.
  if (tool === undefined) {
    throw new Error(`getTool: unknown tool "${name}"`);
  }
  return tool;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type { Tool, ToolResult, ToolDeps, HistorySource, PriorAttestation } from "./types.js";
export { ToolResultSchema, MockHistorySource } from "./types.js";
