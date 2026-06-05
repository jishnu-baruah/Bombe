/**
 * tools/feeds.ts — Price/yield feed tools. (PRD §6.3, T-210)
 *
 * Implements three tools backed by oracle snapshot fixtures:
 *   fetch_chainlink_price — generic oracle snapshot by (asset, period)
 *   fetch_meth_yield      — mETH yield snapshot; stale-aware (claim B)
 *   fetch_usdy_yield      — USDY yield snapshot
 *
 * STALE HANDLING (fetch_meth_yield / claim B):
 *   When the loaded snapshot has `stale: true`, confidence is set LOW (2000 bps)
 *   and the value object carries `stale: true` so the loop's STALE_SINGLE_SOURCE
 *   rule can fire. A fresh snapshot gets HIGH confidence (9500 bps).
 *
 * All tools:
 *   - Validate input with a per-tool zod schema.
 *   - Validate output against ToolResultSchema before returning.
 *   - Never read process.env or call Date.now() — use deps.clock.
 */

import { loadOracleSnapshot } from "@bombe/shared";
import { z } from "zod";
import { ToolResultSchema } from "./types.js";
import type { Tool, ToolDeps, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Confidence constants
// ---------------------------------------------------------------------------

const CONFIDENCE_HIGH = 9500; // 95% — fresh, single authoritative source
const CONFIDENCE_LOW = 2000; // 20% — stale feed, STALE_SINGLE_SOURCE may fire

// ---------------------------------------------------------------------------
// fetch_chainlink_price
// ---------------------------------------------------------------------------

const FetchChainlinkPriceInputSchema = z.object({
  asset: z.string().min(1),
  period: z.string().min(1),
});

/**
 * fetch_chainlink_price — reads a generic oracle snapshot by (asset, period).
 *
 * Input:  { asset: string; period: string }
 *         e.g. { asset: "mETH", period: "30d-fresh" }
 *
 * Output: ToolResult where value is the snapshot's numeric value (bps or price),
 *         source is "chainlink", fetchedAt from deps.clock, confidence HIGH.
 *
 * Stale snapshots are surfaced as-is with the snapshot's stale flag in value;
 * confidence adjustment is intentionally left to fetch_meth_yield / fetch_usdy_yield
 * since those tools have the domain-specific stale policy (claim B).
 */
const fetchChainlinkPriceTool: Tool = {
  name: "fetch_chainlink_price",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const { asset, period } = FetchChainlinkPriceInputSchema.parse(input);
    const snapshot = loadOracleSnapshot(asset, period, deps.fixturesRoot);

    const result = ToolResultSchema.parse({
      value: {
        asset: snapshot.asset,
        period: snapshot.period,
        priceBps: snapshot.value,
        stale: snapshot.stale ?? false,
      },
      source: snapshot.source,
      fetchedAt: deps.clock.now(),
      confidence: snapshot.stale === true ? CONFIDENCE_LOW : CONFIDENCE_HIGH,
    });

    return result;
  },
};

// ---------------------------------------------------------------------------
// fetch_meth_yield
// ---------------------------------------------------------------------------

const FetchMethYieldInputSchema = z.object({
  period: z.string().min(1).default("30d-fresh"),
});

/**
 * fetch_meth_yield — reads the mETH yield oracle snapshot for a given period.
 *
 * Input:  { period?: string }  (default "30d-fresh")
 *
 * Stale policy (claim B — STALE_SINGLE_SOURCE):
 *   If the loaded snapshot has stale: true, confidence is set to CONFIDENCE_LOW
 *   (2000 bps) and value.stale is set to true. The ReAct loop's hard rule
 *   "stale single source + conservative temperament → ABSTAIN STALE_SINGLE_SOURCE"
 *   keys on this low confidence. (PRD §6.3)
 *
 * Output: ToolResult where value = { asset, period, yieldBps, stale }.
 */
const fetchMethYieldTool: Tool = {
  name: "fetch_meth_yield",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const { period } = FetchMethYieldInputSchema.parse(input);
    const snapshot = loadOracleSnapshot("mETH", period, deps.fixturesRoot);

    const isStale = snapshot.stale === true;
    const confidence = isStale ? CONFIDENCE_LOW : CONFIDENCE_HIGH;

    const result = ToolResultSchema.parse({
      value: {
        asset: "mETH",
        period: snapshot.period,
        yieldBps: snapshot.value,
        stale: isStale,
      },
      source: snapshot.source,
      fetchedAt: deps.clock.now(),
      confidence,
    });

    return result;
  },
};

// ---------------------------------------------------------------------------
// fetch_usdy_yield
// ---------------------------------------------------------------------------

const FetchUsdyYieldInputSchema = z.object({
  period: z.string().min(1).default("30d"),
});

/**
 * fetch_usdy_yield — reads the USDY yield oracle snapshot for a given period.
 *
 * Input:  { period?: string }  (default "30d")
 *
 * Output: ToolResult where value = { asset, period, yieldBps, stale }.
 *         Confidence follows the same stale policy as fetch_meth_yield.
 */
const fetchUsdyYieldTool: Tool = {
  name: "fetch_usdy_yield",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const { period } = FetchUsdyYieldInputSchema.parse(input);
    const snapshot = loadOracleSnapshot("USDY", period, deps.fixturesRoot);

    const isStale = snapshot.stale === true;
    const confidence = isStale ? CONFIDENCE_LOW : CONFIDENCE_HIGH;

    const result = ToolResultSchema.parse({
      value: {
        asset: "USDY",
        period: snapshot.period,
        yieldBps: snapshot.value,
        stale: isStale,
      },
      source: snapshot.source,
      fetchedAt: deps.clock.now(),
      confidence,
    });

    return result;
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { fetchChainlinkPriceTool, fetchMethYieldTool, fetchUsdyYieldTool };
