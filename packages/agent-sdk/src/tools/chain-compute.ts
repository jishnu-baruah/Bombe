/**
 * tools/chain-compute.ts — Chain state query and pure math compute tools.
 * (PRD §6.3, T-211)
 *
 * Implements two tools:
 *
 * query_chain_state
 *   A small DSL for querying deterministic mock chain state.
 *   Backed by `fixtures/chain/state.json` for determinism.
 *   Supported ops:
 *     { op: "balanceOf", account: string, token: string }
 *       → returns the token balance for the account
 *     { op: "eventOccurred", claimRef: string }
 *       → returns whether a distribution/payment event occurred
 *
 *   DSL DESIGN NOTE:
 *     In mock mode the fixture provides deterministic answers keyed by
 *     "<account>:<token>" (balanceOf) or "<claimRef>" (eventOccurred).
 *     The real on-chain implementation (T-801) replaces the fixture lookup
 *     with viem calls to Mantle Sepolia — the DSL surface stays identical.
 *
 * compute_expected
 *   PURE math — no fixtures, no I/O, no side effects.
 *   Given (observedBps, expectedBps) computes whether the observed value
 *   falls within ±2 bps of the expected value (PRD §6.3 tolerance).
 *   Returns: { observedBps, expectedBps, deltaBps, withinTolerance }.
 *   Confidence is always HIGH (9500 bps) — the math is deterministic.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ToolResultSchema } from "./types.js";
import type { Tool, ToolDeps, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_HIGH = 9500;
const TOLERANCE_BPS = 2; // ±2 bps tolerance (PRD §6.3)

// ---------------------------------------------------------------------------
// Repo root for fixture loading
// ---------------------------------------------------------------------------

/**
 * Derive the repo root from this file's location.
 * File lives at <repo>/packages/agent-sdk/src/tools/chain-compute.ts.
 * URL "../" traversal from a file URL goes up one directory per step:
 *   1 "../"  → src/
 *   2 "../../" → agent-sdk/
 *   3 "../../../" → packages/
 *   4 "../../../../" → repo root
 */
const DEFAULT_REPO_ROOT: string = (() => {
  try {
    return fileURLToPath(new URL("../../../../", import.meta.url));
  } catch {
    // Fallback for environments where import.meta.url is unavailable
    return process.cwd();
  }
})();

// ---------------------------------------------------------------------------
// Chain state fixture loader
// ---------------------------------------------------------------------------

interface ChainStateFn {
  balanceOf: Record<string, { balance: string; token: string; account: string }>;
  eventOccurred: Record<
    string,
    { occurred: boolean; claimRef: string; txHash: string; blockNumber: number }
  >;
}

function loadChainStateFixture(fixturesRoot?: string): ChainStateFn {
  const root = fixturesRoot ?? join(DEFAULT_REPO_ROOT, "fixtures");
  const filePath = join(root, "chain", "state.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ChainStateFn;
}

// ---------------------------------------------------------------------------
// query_chain_state DSL
// ---------------------------------------------------------------------------

/**
 * Input schema for query_chain_state.
 *
 * DSL:
 *   balanceOf:     { op: "balanceOf", account: string, token: string }
 *   eventOccurred: { op: "eventOccurred", claimRef: string }
 */
const QueryChainStateInputSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("balanceOf"),
    account: z.string().min(1),
    token: z.string().min(1),
  }),
  z.object({
    op: z.literal("eventOccurred"),
    claimRef: z.string().min(1),
  }),
]);

/**
 * query_chain_state — deterministic mock chain state via DSL.
 *
 * Reads from `fixtures/chain/state.json` (fixture-backed for determinism).
 * The real Mantle Sepolia implementation (T-801) replaces the fixture
 * lookup with viem calls — the DSL surface is unchanged.
 *
 * balanceOf example:
 *   input: { op: "balanceOf", account: "0xTREASURY_mETH", token: "mETH" }
 *   value: { op, account, token, balance }
 *
 * eventOccurred example:
 *   input: { op: "eventOccurred", claimRef: "DIST-2026-05" }
 *   value: { op, claimRef, occurred, txHash?, blockNumber? }
 */
const queryChainStateTool: Tool = {
  name: "query_chain_state",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const parsed = QueryChainStateInputSchema.parse(input);
    const fixture = loadChainStateFixture(deps.fixturesRoot);

    if (parsed.op === "balanceOf") {
      const key = `${parsed.account}:${parsed.token}`;
      const row = fixture.balanceOf[key];
      if (row === undefined) {
        // Not found in fixture — return zero balance deterministically
        const result = ToolResultSchema.parse({
          value: {
            op: "balanceOf",
            account: parsed.account,
            token: parsed.token,
            balance: "0",
            found: false,
          },
          source: "mock-chain",
          fetchedAt: deps.clock.now(),
          confidence: CONFIDENCE_HIGH,
        });
        return result;
      }

      const result = ToolResultSchema.parse({
        value: {
          op: "balanceOf",
          account: row.account,
          token: row.token,
          balance: row.balance,
          found: true,
        },
        source: "mock-chain",
        fetchedAt: deps.clock.now(),
        confidence: CONFIDENCE_HIGH,
      });
      return result;
    }

    // op === "eventOccurred"
    const row = fixture.eventOccurred[parsed.claimRef];
    if (row === undefined) {
      const result = ToolResultSchema.parse({
        value: {
          op: "eventOccurred",
          claimRef: parsed.claimRef,
          occurred: false,
          found: false,
        },
        source: "mock-chain",
        fetchedAt: deps.clock.now(),
        confidence: CONFIDENCE_HIGH,
      });
      return result;
    }

    const result = ToolResultSchema.parse({
      value: {
        op: "eventOccurred",
        claimRef: row.claimRef,
        occurred: row.occurred,
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        found: true,
      },
      source: "mock-chain",
      fetchedAt: deps.clock.now(),
      confidence: CONFIDENCE_HIGH,
    });
    return result;
  },
};

// ---------------------------------------------------------------------------
// compute_expected — PURE math, no I/O
// ---------------------------------------------------------------------------

const ComputeExpectedInputSchema = z.object({
  observedBps: z.number(),
  expectedBps: z.number(),
});

/**
 * compute_expected — pure ±2 bps tolerance math. (PRD §6.3)
 *
 * Input:  { observedBps: number; expectedBps: number }
 * Output: ToolResult where value = {
 *           observedBps, expectedBps, deltaBps, withinTolerance
 *         }
 *
 * withinTolerance is true when |observedBps - expectedBps| <= 2.
 *
 * This tool is PURE — no fixtures, no I/O, no randomness. Given the same
 * inputs it always returns the same output. Confidence is always HIGH.
 *
 * Used by:
 *   - Claim A: observed mETH yield 34 bps, expected 34 bps → withinTolerance: true
 *   - Claim B: same math but the loop may already ABSTAIN before compute_expected
 *   - Claim C: CASHFLOW_MATCH uses read_document + compute_expected for the delta
 */
const computeExpectedTool: Tool = {
  name: "compute_expected",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const { observedBps, expectedBps } = ComputeExpectedInputSchema.parse(input);

    const deltaBps = Math.abs(observedBps - expectedBps);
    const withinTolerance = deltaBps <= TOLERANCE_BPS;

    const result = ToolResultSchema.parse({
      value: {
        observedBps,
        expectedBps,
        deltaBps,
        withinTolerance,
      },
      source: "compute",
      fetchedAt: deps.clock.now(),
      confidence: CONFIDENCE_HIGH,
    });

    return result;
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { queryChainStateTool, computeExpectedTool };
