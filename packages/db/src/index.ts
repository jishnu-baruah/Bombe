/**
 * index.ts — Public API barrel for @bombe/db. (T-401)
 *
 * Re-exports:
 *   - Schema table objects + inferred types (from schema.ts)
 *   - Client factory + migration helper (from client.ts)
 *   - Repository implementations + upsert helpers (from repositories.ts)
 */

// Schema
export {
  // Table objects (for drizzle queries)
  claims,
  attestations,
  agents,
  epochStats,
  events,
  errors,
  // Inferred Select types
  type ClaimRow,
  type AttestationTableRow,
  type AgentRow,
  type EpochStatsRow,
  type EventRow,
  type ErrorRow,
  // Inferred Insert types
  type NewClaimRow,
  type NewAttestationTableRow,
  type NewAgentRow,
  type NewEpochStatsRow,
  type NewEventRow,
  type NewErrorRow,
} from "./schema.js";

// Client
export {
  createDb,
  applyMigrations,
  type BombeDb,
  type CreateDbOpts,
} from "./client.js";

// Repositories
export {
  DrizzleAttestationRepository,
  upsertAttestation,
  findAttestationByTxHash,
  type UpsertAttestationInput,
} from "./repositories.js";
