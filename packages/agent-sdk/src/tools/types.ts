/**
 * tools/types.ts — Common contract for all SDK tools. (PRD §6.3, T-210)
 *
 * Every tool returns a `ToolResult` — a zod-validated shape carrying
 * the tool's output value, its data source, a deterministic fetch timestamp,
 * and a confidence score (0–10000 bps, where 10000 = 100%).
 *
 * `ToolDeps` carries injected dependencies so tools are pure and testable:
 *   - `clock`         — deterministic timestamp source (never Date.now directly)
 *   - `historySource` — seam for cross_check_history (real DB wired in T-403)
 *   - `fixturesRoot`  — override repo-root for fixture loading (tests inject this)
 */

import { z } from "zod";
import type { ToolName } from "../router.js";

// ---------------------------------------------------------------------------
// ToolResult — the common return shape for every tool (PRD §6.3)
// ---------------------------------------------------------------------------

/**
 * ToolResultSchema — zod schema validated at every tool boundary.
 *
 * Fields:
 *   value      — the tool's output payload (tool-specific structure)
 *   source     — identifies the data origin (e.g. "chainlink", "fixture", "mock")
 *   fetchedAt  — Unix timestamp ms (from injected clock — never Date.now())
 *   confidence — 0–10000 bps (10000 = 100% confidence)
 */
export const ToolResultSchema = z.object({
  value: z.unknown(),
  source: z.string(),
  fetchedAt: z.number(),
  confidence: z.number(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// ---------------------------------------------------------------------------
// HistorySource — seam for cross_check_history (T-210 / T-401)
// ---------------------------------------------------------------------------

/**
 * PriorAttestation — a single row from the attestation history DB.
 */
export interface PriorAttestation {
  agent: string;
  decision: string;
  confidenceBps: number;
}

/**
 * HistorySource — the seam interface injected into cross_check_history.
 *
 * The real Postgres-backed implementation is wired in T-403.
 * A deterministic mock implementation is provided in this module for tests.
 *
 * SEAM DESIGN NOTE:
 *   Persistent attestation memory lives in the DB, NOT the context window (PRD §6.3).
 *   This interface is the boundary. Any cross_check_history call goes through here.
 *   The runner (T-403) injects a PgliteHistorySource; tests inject MockHistorySource.
 */
export interface HistorySource {
  priorAttestations(claimRef: string): Promise<PriorAttestation[]>;
}

// ---------------------------------------------------------------------------
// MockHistorySource — deterministic in-memory implementation for tests
// ---------------------------------------------------------------------------

/**
 * MockHistorySource — deterministic mock backed by a static in-memory map.
 *
 * Wired via ToolDeps.historySource in tests; produces predictable outputs
 * so snapshot tests never flake on DB connectivity.
 *
 * Usage:
 *   const history = new MockHistorySource({
 *     "claim-A": [{ agent: "rotor", decision: "VALID", confidenceBps: 9000 }],
 *   });
 */
export class MockHistorySource implements HistorySource {
  private readonly data: Record<string, PriorAttestation[]>;

  constructor(data: Record<string, PriorAttestation[]> = {}) {
    this.data = data;
  }

  async priorAttestations(claimRef: string): Promise<PriorAttestation[]> {
    return this.data[claimRef] ?? [];
  }
}

// ---------------------------------------------------------------------------
// ToolDeps — injected dependencies for all tools
// ---------------------------------------------------------------------------

/**
 * ToolDeps — dependencies injected into every tool's `run()` method.
 *
 * Keeping these explicit (rather than importing globals) is what makes
 * tool outputs deterministic and snapshot-testable.
 *
 * Fields:
 *   clock        — returns current time in ms; inject a seeded mock in tests.
 *   historySource — seam for attestation history queries (mock or real Postgres).
 *   fixturesRoot  — optional override for the fixtures root path.
 *                   Defaults to the repo-root detection in @bombe/shared.
 */
export interface ToolDeps {
  clock: { now(): number };
  historySource: HistorySource;
  fixturesRoot?: string | undefined;
}

// ---------------------------------------------------------------------------
// Tool interface
// ---------------------------------------------------------------------------

/**
 * Tool — the interface every tool implementation must satisfy.
 *
 * `name`  — must match a ToolName from router.ts (enforced at TOOLS registration).
 * `run()` — accepts raw (unknown) input, validates it internally with zod,
 *            and returns a validated ToolResult.
 *
 * Design contract:
 *   - Input validation is the tool's own responsibility (per-tool zod schema).
 *   - Output is always validated against ToolResultSchema before returning.
 *   - Tools never read process.env; all config via ToolDeps.
 *   - Tools never call Date.now() or Math.random(); determinism via deps.clock.
 */
export interface Tool {
  name: ToolName;
  run(input: unknown, deps: ToolDeps): Promise<ToolResult>;
}
