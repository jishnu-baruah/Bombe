import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Repo-root resolution
// ---------------------------------------------------------------------------

/**
 * Derive the repo root from this file's location.
 * This file lives at  <repo>/packages/shared/src/fixtures.ts
 * so the repo root is three levels up.
 */
const DEFAULT_FIXTURES_ROOT: string = resolve(
  fileURLToPath(import.meta.url),
  "../../../..", // src → shared → packages → repo root
  "fixtures",
);

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

/**
 * Thrown when a requested fixture file does not exist on disk.
 * Callers can `instanceof FixtureNotFound` to distinguish missing-file from
 * parse errors.
 */
export class FixtureNotFound extends Error {
  constructor(path: string) {
    super(`FixtureNotFound: ${path}`);
    this.name = "FixtureNotFound";
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/**
 * Read and JSON.parse a file, throwing FixtureNotFound on ENOENT.
 */
function readJson(filePath: string): unknown {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FixtureNotFound(filePath);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schemas + types  (parse-at-boundary, PRD §8)
// ---------------------------------------------------------------------------

export const OracleSnapshotSchema = z.object({
  asset: z.string(),
  period: z.string(),
  value: z.number(),
  fetchedAt: z.string(),
  stale: z.boolean().optional(),
  source: z.string(),
});
export type OracleSnapshot = z.infer<typeof OracleSnapshotSchema>;

export const DocumentFixtureSchema = z.object({
  docRef: z.string(),
  docType: z.string(),
  version: z.string(),
  fields: z.record(z.unknown()),
});
export type DocumentFixture = z.infer<typeof DocumentFixtureSchema>;

export const HumanDecisionSchema = z.object({
  decision: z.enum(["VALID", "REJECTED", "ABSTAIN"]),
  confidenceBps: z.number().int().min(0).max(10000),
});
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

// ---------------------------------------------------------------------------
// Loader functions
// ---------------------------------------------------------------------------

/**
 * Load an oracle yield/price snapshot.
 * Reads `fixtures/oracles/<asset>/<period>.json`.
 *
 * @param asset  - e.g. "mETH", "USDY"
 * @param period - e.g. "30d-fresh", "30d-stale", "30d"
 * @param root   - override repo root (defaults to auto-resolved repo root)
 */
export function loadOracleSnapshot(
  asset: string,
  period: string,
  root: string = DEFAULT_FIXTURES_ROOT,
): OracleSnapshot {
  const filePath = join(root, "oracles", asset, `${period}.json`);
  const raw = readJson(filePath);
  return OracleSnapshotSchema.parse(raw);
}

/**
 * Load a document fixture (servicer report, bank statement, etc.).
 * Reads `fixtures/documents/<version>/<docRef>.json`.
 *
 * @param docRef  - e.g. "pc-pool-1-servicer", "pc-pool-1-statement"
 * @param version - document schema version (default "v1")
 * @param root    - override repo root
 */
export function loadDocument(
  docRef: string,
  version = "v1",
  root: string = DEFAULT_FIXTURES_ROOT,
): DocumentFixture {
  const filePath = join(root, "documents", version, `${docRef}.json`);
  const raw = readJson(filePath);
  return DocumentFixtureSchema.parse(raw);
}

/**
 * Load a mock model-script (agent reasoning transcript) for replay.
 * Reads `fixtures/model-scripts/<agentId>/<claimId>.json`.
 * The shape firms up in T-304/T-505; returned as `unknown` to avoid premature
 * structural commitment while still being strictly typed (no `any`).
 *
 * @param agentId - e.g. "reflector", "plugboard"
 * @param claimId - e.g. "A", "B", "_sample"
 * @param root    - override repo root
 */
export function loadModelScript(
  agentId: string,
  claimId: string,
  root: string = DEFAULT_FIXTURES_ROOT,
): unknown {
  const filePath = join(root, "model-scripts", agentId, `${claimId}.json`);
  return readJson(filePath);
}

/**
 * Load the human decision for a claim.
 * Reads `fixtures/human-decisions.json` (a map claimId → HumanDecision).
 * Throws a clear error if the claimId is not present in the map.
 *
 * @param claimId - e.g. "A", "B", "C", "D"
 * @param root    - override repo root
 */
export function loadHumanDecision(
  claimId: string,
  root: string = DEFAULT_FIXTURES_ROOT,
): HumanDecision {
  const filePath = join(root, "human-decisions.json");
  const raw = readJson(filePath);

  const mapSchema = z.record(HumanDecisionSchema);
  const decisions = mapSchema.parse(raw);

  const entry = decisions[claimId];
  if (entry === undefined) {
    throw new Error(`loadHumanDecision: no decision found for claimId "${claimId}" in ${filePath}`);
  }
  return entry;
}

/**
 * Load the model token-cost table used by the cost circuit breaker.
 * Reads `fixtures/model-costs.json`.
 * Returns a map of model identifier → { inputPer1k, outputPer1k } (USD).
 *
 * @param root - override repo root
 */
export function loadModelCosts(
  root: string = DEFAULT_FIXTURES_ROOT,
): Record<string, { inputPer1k: number; outputPer1k: number }> {
  const filePath = join(root, "model-costs.json");
  const raw = readJson(filePath);

  const schema = z.record(
    z.object({
      inputPer1k: z.number().nonnegative(),
      outputPer1k: z.number().nonnegative(),
    }),
  );
  return schema.parse(raw);
}
