/**
 * schema.ts — Drizzle ORM schema for @bombe/db. (PRD §6.5, T-401)
 *
 * Six tables:
 *   claims          — posted RWA claims
 *   attestations    — agent/human attestation records
 *   agents          — registered agent/human roster
 *   epoch_stats     — per-agent per-epoch aggregate stats
 *   events          — append-only SSE feed
 *   errors          — every tool/loop/runner failure (no silent failures)
 *
 * Dialect: pg-core (pglite speaks the Postgres wire protocol).
 * JSON/JSONB columns use drizzle's `jsonb` type for structured payload fields.
 *
 * Exported: table objects (for queries) + inferred Insert/Select types.
 */

import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// claims
// ---------------------------------------------------------------------------

/**
 * claims — every RWA claim posted to the network.
 *
 * - id:         unique claim identifier (e.g. "A", "B", "claim-xyz")
 * - tier:       1 = deterministic, 2 = document-falsifiable, 3 = judgment
 * - asset:      asset identifier (e.g. "mETH", "PC-POOL-1")
 * - claim_type: ClaimType string (YIELD_BPS, CASHFLOW_MATCH, etc.)
 * - payload:    arbitrary claim parameters (oracle values, document refs, …)
 * - status:     "open" | "closed" | "disputed"
 * - posted_at:  Unix timestamp (ms) when the claim was posted
 */
export const claims = pgTable("claims", {
  id: text("id").primaryKey(),
  tier: integer("tier").notNull(),
  asset: text("asset").notNull(),
  claimType: text("claim_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("open"),
  postedAt: bigint("posted_at", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// attestations
// ---------------------------------------------------------------------------

/**
 * attestations — one row per agent/human attestation per claim.
 *
 * - id:             surrogate PK (claim_id + agent_addr concatenation or UUID)
 * - claim_id:       FK → claims.id
 * - agent_addr:     on-chain wallet address of the attesting agent
 * - is_human:       true for human attestors (registered via registerHuman)
 * - decision:       "VALID" | "REJECTED" | "ABSTAIN"
 * - confidence_bps: confidence in basis points (0–10000)
 * - sources_hash:   keccak256(canonicalJson(sortedSources))
 * - reasoning_hash: keccak256(canonicalJson(trace))
 * - trace_uri:      blob storage URL for the full reasoning trace
 * - latency_ms:     ms from ClaimPosted to attestation submission
 * - cost_usd:       estimated inference cost for this run
 * - skill_hash:     keccak256 of the Plugboard skill file active at run time
 *                   (null for SDK agents and humans)
 * - tx_hash:        on-chain transaction hash of the attest() call
 * - created_at:     Unix timestamp (ms) when this row was written
 */
export const attestations = pgTable("attestations", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  agentAddr: text("agent_addr").notNull(),
  isHuman: boolean("is_human").notNull().default(false),
  decision: text("decision").notNull(),
  confidenceBps: integer("confidence_bps").notNull(),
  sourcesHash: text("sources_hash").notNull(),
  reasoningHash: text("reasoning_hash").notNull(),
  traceUri: text("trace_uri").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
  skillHash: text("skill_hash"),
  txHash: text("tx_hash").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// agents
// ---------------------------------------------------------------------------

/**
 * agents — registered agent + human attestor roster.
 *
 * - addr:          on-chain wallet address (PK)
 * - name:          display name (e.g. "Reflector", "Rotor", "Plugboard")
 * - model:         model identifier used for AI agents (null for humans)
 * - is_human:      true for human attestors
 * - bond_wei:      current bond in wei (stored as text to avoid bigint overflow)
 * - reputation:    int256 reputation score (stored as integer — range safe for demo)
 * - skill_hash:    keccak256 of the Plugboard active skill file; null for others
 * - registered_at: Unix timestamp (ms) of registration
 */
export const agents = pgTable("agents", {
  addr: text("addr").primaryKey(),
  name: text("name").notNull(),
  model: text("model"),
  isHuman: boolean("is_human").notNull().default(false),
  bondWei: text("bond_wei").notNull().default("0"),
  reputation: integer("reputation").notNull().default(0),
  skillHash: text("skill_hash"),
  registeredAt: bigint("registered_at", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// epoch_stats
// ---------------------------------------------------------------------------

/**
 * epoch_stats — aggregate performance stats per agent per epoch.
 *
 * Composite PK: (agent_addr, epoch).
 * Updated by the indexer as claims are settled.
 *
 * - agent_addr:    FK → agents.addr
 * - epoch:         integer epoch number
 * - correct:       count of correct attestations (VALID on correct, REJECTED on wrong)
 * - wrong:         count of incorrect attestations
 * - abstained:     count of ABSTAIN decisions
 * - slashes:       count of slash events
 * - avg_latency_ms: average latency across attestations this epoch
 * - total_cost_usd: total inference cost this epoch
 */
export const epochStats = pgTable(
  "epoch_stats",
  {
    agentAddr: text("agent_addr")
      .notNull()
      .references(() => agents.addr),
    epoch: integer("epoch").notNull(),
    correct: integer("correct").notNull().default(0),
    wrong: integer("wrong").notNull().default(0),
    abstained: integer("abstained").notNull().default(0),
    slashes: integer("slashes").notNull().default(0),
    avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  },
  (table) => [primaryKey({ columns: [table.agentAddr, table.epoch] })],
);

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

/**
 * events — append-only feed of SSE events.
 *
 * Every event posted to the SSE stream is also persisted here so the
 * web app can replay history on reconnect.
 *
 * - id:         surrogate PK
 * - kind:       SSE event kind (CLAIM_POSTED, AGENT_STEP, AGENT_DONE, …)
 * - payload:    full event payload (zod-validated by packages/shared/events.ts)
 * - created_at: Unix timestamp (ms)
 */
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

/**
 * errors — every tool/loop/runner failure.
 *
 * No silent failures: every caught error that affects the attestation flow is
 * logged here. The runner and tool-recovery layer write to this table.
 *
 * - id:         surrogate PK
 * - scope:      where the failure occurred (e.g. "tool:fetch_meth_yield",
 *               "loop:step3", "runner:agentTimeout")
 * - payload:    structured error info (message, stack, recoverable flag, …)
 * - created_at: Unix timestamp (ms)
 */
export const errors = pgTable("errors", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// Inferred types for Insert and Select operations
// ---------------------------------------------------------------------------

/** Inferred row shape for SELECT from claims. */
export type ClaimRow = typeof claims.$inferSelect;
/** Inferred row shape for INSERT into claims. */
export type NewClaimRow = typeof claims.$inferInsert;

/** Inferred row shape for SELECT from attestations. */
export type AttestationTableRow = typeof attestations.$inferSelect;
/** Inferred row shape for INSERT into attestations. */
export type NewAttestationTableRow = typeof attestations.$inferInsert;

/** Inferred row shape for SELECT from agents. */
export type AgentRow = typeof agents.$inferSelect;
/** Inferred row shape for INSERT into agents. */
export type NewAgentRow = typeof agents.$inferInsert;

/** Inferred row shape for SELECT from epoch_stats. */
export type EpochStatsRow = typeof epochStats.$inferSelect;
/** Inferred row shape for INSERT into epoch_stats. */
export type NewEpochStatsRow = typeof epochStats.$inferInsert;

/** Inferred row shape for SELECT from events. */
export type EventRow = typeof events.$inferSelect;
/** Inferred row shape for INSERT into events. */
export type NewEventRow = typeof events.$inferInsert;

/** Inferred row shape for SELECT from errors. */
export type ErrorRow = typeof errors.$inferSelect;
/** Inferred row shape for INSERT into errors. */
export type NewErrorRow = typeof errors.$inferInsert;
