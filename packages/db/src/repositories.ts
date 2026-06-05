/**
 * repositories.ts — Drizzle-backed repository implementations. (PRD §6.5, T-401)
 *
 * Exports:
 *   DrizzleAttestationRepository — implements AttestationRepository from
 *     @bombe/agent-sdk, writing rows to the `attestations` table.
 *
 *   upsertAttestation — idempotent upsert helper used by the indexer (T-402).
 *     Upserts on (tx_hash) — a tx_hash uniquely identifies an on-chain
 *     attestation event. Inserting the same tx_hash twice is a no-op (the
 *     existing row is preserved, keeping ON CONFLICT DO NOTHING semantics per
 *     PRD §6.5 "upserts idempotently on (txHash, logIndex)").
 */

import type { AttestationRepository, AttestationRow } from "@bombe/agent-sdk";
import { eq } from "drizzle-orm";
import type { BombeDb } from "./client.js";
import { attestations } from "./schema.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * makeAttestationId — derives a stable surrogate PK from (claimId, agentAddr).
 *
 * Using a deterministic ID means the repository is idempotent: inserting the
 * same attestation twice (same claim + agent) will hit a PK conflict which
 * the caller can handle, or use upsertAttestation instead.
 *
 * Format: "attest:<claimId>:<agentAddr>" (ASCII-safe, URL-safe, human-readable).
 */
function makeAttestationId(claimId: string, agentAddr: string): string {
  return `attest:${claimId}:${agentAddr}`;
}

// ---------------------------------------------------------------------------
// DrizzleAttestationRepository
// ---------------------------------------------------------------------------

/**
 * DrizzleAttestationRepository — Drizzle-backed implementation of the
 * AttestationRepository interface defined in @bombe/agent-sdk/src/attest.ts.
 *
 * Injects a BombeDb client at construction time (no global state).
 * Used by the agent runner (T-403) and tests.
 */
export class DrizzleAttestationRepository implements AttestationRepository {
  constructor(private readonly db: BombeDb) {}

  /**
   * insert — writes a new AttestationRow to the attestations table.
   *
   * Maps the SDK's AttestationRow (camelCase) to the DB schema's snake_case
   * columns.  Uses a deterministic id derived from (claimId, agentAddr).
   *
   * @throws if the (id) PK already exists — callers wanting idempotency
   *         should use upsertAttestation() instead.
   */
  async insert(row: AttestationRow): Promise<void> {
    const id = makeAttestationId(row.claimId, row.agentAddr);

    await this.db.insert(attestations).values({
      id,
      claimId: row.claimId,
      agentAddr: row.agentAddr,
      isHuman: row.isHuman,
      decision: row.decision,
      confidenceBps: row.confidenceBps,
      sourcesHash: row.sourcesHash,
      reasoningHash: row.reasoningHash,
      traceUri: row.traceURI,
      latencyMs: row.latencyMs,
      costUsd: String(row.costUsd),
      skillHash: null,
      txHash: row.txHash,
      createdAt: row.createdAt,
    });
  }
}

// ---------------------------------------------------------------------------
// upsertAttestation — idempotent helper for the indexer
// ---------------------------------------------------------------------------

/**
 * UpsertAttestationInput — the data needed for an idempotent upsert.
 *
 * This mirrors AttestationRow but is a separate type so the indexer (T-402)
 * can add indexer-specific fields (logIndex, blockNumber) in the future
 * without touching the SDK interface.
 */
export interface UpsertAttestationInput {
  /** Surrogate PK for this row. */
  id: string;
  claimId: string;
  agentAddr: string;
  isHuman: boolean;
  decision: string;
  confidenceBps: number;
  sourcesHash: string;
  reasoningHash: string;
  traceUri: string;
  latencyMs: number;
  /** Cost as a decimal string to avoid float precision loss. */
  costUsd: string;
  skillHash: string | null;
  txHash: string;
  createdAt: number;
}

/**
 * upsertAttestation — idempotent insert into the attestations table.
 *
 * Uniqueness key: `id` (the surrogate PK).  If a row with the same `id`
 * already exists the operation is a no-op (DO NOTHING), preserving the
 * existing row.
 *
 * Per PRD §6.5: "upserts idempotently on (txHash, logIndex)".  The indexer
 * (T-402) is responsible for constructing the `id` as a stable function of
 * (txHash, logIndex) before calling this helper.
 *
 * @param db    - A BombeDb drizzle client.
 * @param input - The attestation data to upsert.
 */
export async function upsertAttestation(db: BombeDb, input: UpsertAttestationInput): Promise<void> {
  await db
    .insert(attestations)
    .values({
      id: input.id,
      claimId: input.claimId,
      agentAddr: input.agentAddr,
      isHuman: input.isHuman,
      decision: input.decision,
      confidenceBps: input.confidenceBps,
      sourcesHash: input.sourcesHash,
      reasoningHash: input.reasoningHash,
      traceUri: input.traceUri,
      latencyMs: input.latencyMs,
      costUsd: input.costUsd,
      skillHash: input.skillHash,
      txHash: input.txHash,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing({ target: attestations.id });
}

// ---------------------------------------------------------------------------
// findAttestationByTxHash — query helper for the indexer
// ---------------------------------------------------------------------------

/**
 * findAttestationByTxHash — look up an attestation row by its on-chain tx hash.
 *
 * Returns the first matching row, or undefined if no row exists.
 * Used by the indexer to detect already-processed events.
 */
export async function findAttestationByTxHash(
  db: BombeDb,
  txHash: string,
): Promise<typeof attestations.$inferSelect | undefined> {
  const rows = await db.select().from(attestations).where(eq(attestations.txHash, txHash)).limit(1);
  return rows[0];
}
