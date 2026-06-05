/**
 * router.test.ts — Unit tests for the deterministic task router. (PRD §6.3.2, T-209)
 *
 * Covers:
 *  1. TOOL_MAP exact per claimType (all 5 entries).
 *  2. allowedTools() returns the correct list and a copy (mutation-safe).
 *  3. isToolAllowed() returns true/false correctly.
 *  4. FAIR_VALUE maps to [] (no tools → Tier 3 must ABSTAIN).
 *  5. refusalObservation() returns { refused:true, reason: string } for unmapped tool.
 *  6. refusalObservation() includes the tool name and allowed set in the reason.
 */

import { describe, expect, it } from "vitest";
import { TOOL_MAP, allowedTools, isToolAllowed, refusalObservation } from "../src/router.js";
import type { ToolName } from "../src/router.js";

// ---------------------------------------------------------------------------
// 1. TOOL_MAP exact contents per PRD §6.3.2
// ---------------------------------------------------------------------------

describe("TOOL_MAP — exact per PRD §6.3.2", () => {
  it("YIELD_BPS contains exactly the 6 correct tools in order", () => {
    expect(TOOL_MAP.YIELD_BPS).toEqual([
      "fetch_chainlink_price",
      "fetch_meth_yield",
      "fetch_usdy_yield",
      "query_chain_state",
      "compute_expected",
      "cross_check_history",
    ]);
  });

  it("DISTRIBUTION_PAID contains exactly 3 tools", () => {
    expect(TOOL_MAP.DISTRIBUTION_PAID).toEqual([
      "query_chain_state",
      "compute_expected",
      "cross_check_history",
    ]);
  });

  it("CASHFLOW_MATCH contains exactly 3 tools", () => {
    expect(TOOL_MAP.CASHFLOW_MATCH).toEqual([
      "read_document",
      "compute_expected",
      "cross_check_history",
    ]);
  });

  it("ENCUMBRANCE_ABSENT contains exactly 3 tools", () => {
    expect(TOOL_MAP.ENCUMBRANCE_ABSENT).toEqual([
      "read_document",
      "query_chain_state",
      "cross_check_history",
    ]);
  });

  it("FAIR_VALUE is an empty array", () => {
    expect(TOOL_MAP.FAIR_VALUE).toEqual([]);
  });

  it("TOOL_MAP covers exactly 5 claim types", () => {
    const keys = Object.keys(TOOL_MAP);
    expect(keys).toHaveLength(5);
    expect(keys).toContain("YIELD_BPS");
    expect(keys).toContain("DISTRIBUTION_PAID");
    expect(keys).toContain("CASHFLOW_MATCH");
    expect(keys).toContain("ENCUMBRANCE_ABSENT");
    expect(keys).toContain("FAIR_VALUE");
  });
});

// ---------------------------------------------------------------------------
// 2. allowedTools()
// ---------------------------------------------------------------------------

describe("allowedTools()", () => {
  it("returns the correct tools for YIELD_BPS", () => {
    expect(allowedTools("YIELD_BPS")).toEqual(TOOL_MAP.YIELD_BPS);
  });

  it("returns the correct tools for DISTRIBUTION_PAID", () => {
    expect(allowedTools("DISTRIBUTION_PAID")).toEqual(TOOL_MAP.DISTRIBUTION_PAID);
  });

  it("returns the correct tools for CASHFLOW_MATCH", () => {
    expect(allowedTools("CASHFLOW_MATCH")).toEqual(TOOL_MAP.CASHFLOW_MATCH);
  });

  it("returns the correct tools for ENCUMBRANCE_ABSENT", () => {
    expect(allowedTools("ENCUMBRANCE_ABSENT")).toEqual(TOOL_MAP.ENCUMBRANCE_ABSENT);
  });

  it("returns [] for FAIR_VALUE", () => {
    expect(allowedTools("FAIR_VALUE")).toEqual([]);
  });

  it("returns a copy — mutating result does not affect TOOL_MAP", () => {
    const tools = allowedTools("YIELD_BPS");
    const originalLength = TOOL_MAP.YIELD_BPS.length;
    tools.push("read_document" as ToolName);
    expect(TOOL_MAP.YIELD_BPS).toHaveLength(originalLength);
  });
});

// ---------------------------------------------------------------------------
// 3. isToolAllowed()
// ---------------------------------------------------------------------------

describe("isToolAllowed()", () => {
  it("returns true for fetch_chainlink_price on YIELD_BPS", () => {
    expect(isToolAllowed("YIELD_BPS", "fetch_chainlink_price")).toBe(true);
  });

  it("returns true for cross_check_history on YIELD_BPS", () => {
    expect(isToolAllowed("YIELD_BPS", "cross_check_history")).toBe(true);
  });

  it("returns false for read_document on YIELD_BPS (not in that map)", () => {
    expect(isToolAllowed("YIELD_BPS", "read_document")).toBe(false);
  });

  it("returns true for read_document on CASHFLOW_MATCH", () => {
    expect(isToolAllowed("CASHFLOW_MATCH", "read_document")).toBe(true);
  });

  it("returns false for fetch_chainlink_price on CASHFLOW_MATCH", () => {
    expect(isToolAllowed("CASHFLOW_MATCH", "fetch_chainlink_price")).toBe(false);
  });

  it("returns true for query_chain_state on DISTRIBUTION_PAID", () => {
    expect(isToolAllowed("DISTRIBUTION_PAID", "query_chain_state")).toBe(true);
  });

  it("returns false for read_document on DISTRIBUTION_PAID", () => {
    expect(isToolAllowed("DISTRIBUTION_PAID", "read_document")).toBe(false);
  });

  it("returns false for any tool on FAIR_VALUE", () => {
    const allTools: ToolName[] = [
      "fetch_chainlink_price",
      "fetch_meth_yield",
      "fetch_usdy_yield",
      "query_chain_state",
      "compute_expected",
      "cross_check_history",
      "read_document",
    ];
    for (const tool of allTools) {
      expect(isToolAllowed("FAIR_VALUE", tool)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. FAIR_VALUE is empty (Tier-3, immediate ABSTAIN)
// ---------------------------------------------------------------------------

describe("FAIR_VALUE — no tools (Tier 3)", () => {
  it("TOOL_MAP.FAIR_VALUE has length 0", () => {
    expect(TOOL_MAP.FAIR_VALUE).toHaveLength(0);
  });

  it("allowedTools('FAIR_VALUE') has length 0", () => {
    expect(allowedTools("FAIR_VALUE")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. refusalObservation() shape
// ---------------------------------------------------------------------------

describe("refusalObservation() — shape", () => {
  it("returns { refused: true, reason: string }", () => {
    const obs = refusalObservation("YIELD_BPS", "read_document");
    expect(obs.refused).toBe(true);
    expect(typeof obs.reason).toBe("string");
  });

  it("includes the tool name in the reason string", () => {
    const obs = refusalObservation("YIELD_BPS", "read_document");
    expect(obs.reason).toContain("read_document");
  });

  it("includes the claim type in the reason string", () => {
    const obs = refusalObservation("CASHFLOW_MATCH", "fetch_chainlink_price");
    expect(obs.reason).toContain("CASHFLOW_MATCH");
  });

  it("includes the allowed tools in the reason string for YIELD_BPS", () => {
    const obs = refusalObservation("YIELD_BPS", "some_unknown_tool");
    expect(obs.reason).toContain("fetch_chainlink_price");
  });

  it("indicates no tools in reason for FAIR_VALUE", () => {
    const obs = refusalObservation("FAIR_VALUE", "fetch_chainlink_price");
    expect(obs.reason.toLowerCase()).toMatch(/none|tier.?3|no tool/i);
  });
});

// ---------------------------------------------------------------------------
// 6. refusalObservation() for a completely unknown tool string
// ---------------------------------------------------------------------------

describe("refusalObservation() — unknown tool strings", () => {
  it("handles arbitrary string (not a ToolName) without throwing", () => {
    expect(() => refusalObservation("YIELD_BPS", "hacked_tool_xyz")).not.toThrow();
  });

  it("returns refused:true for an unknown tool string", () => {
    const obs = refusalObservation("DISTRIBUTION_PAID", "hacked_tool");
    expect(obs.refused).toBe(true);
  });
});
