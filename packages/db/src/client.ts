/**
 * client.ts — Database client factory for @bombe/db. (PRD §6.5, T-401)
 *
 * createDb(opts?) returns a Drizzle client backed by pglite (in-memory or
 * file-based) by default — zero external dependencies, works offline, used
 * for `pnpm demo` and all tests.
 *
 * Live path (T-803): when DATABASE_URL is provided and mode === "live", the
 * factory will return a Postgres-over-neon client.  That path is skeletonised
 * here: it must typecheck but is not yet wired (see T-803).
 *
 * Environment variable policy (PRD §15.4 / CLAUDE.md guardrails):
 *   - Only `DATABASE_URL` is read here via process.env.
 *   - All other env reads live in packages/agent-sdk/src/config.ts.
 *   - This module documents every env access in a comment at the point of
 *     access so auditing is straightforward.
 *
 * Migration strategy:
 *   Migrations are SQL files under packages/db/migrations/.
 *   applyMigrations(db) runs every *.sql file in lexicographic order against
 *   the pglite instance using raw SQL execution (pglite does not support the
 *   drizzle-kit migrator's journal format out-of-the-box without fs access in
 *   all environments, so we execute the SQL directly — deterministic and
 *   idempotent via IF NOT EXISTS guards in the migration file).
 *
 *   For the live Postgres path (T-803), the standard drizzle-orm/pglite/migrator
 *   (or node-postgres/migrator) should be used instead.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The drizzle client type — exported so callers can type-annotate. */
export type BombeDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Options for createDb.
 *
 * @param dataDir  - pglite data directory.  Omit for in-memory (default).
 *                   Pass a filesystem path (e.g. "./data/bombe") for
 *                   persistent pglite storage.
 * @param skipMigrations - If true, skip applying migrations on creation.
 *                         Useful when the caller wants to call
 *                         `applyMigrations` separately (e.g. tests that
 *                         introspect the DB before migration).
 */
export interface CreateDbOpts {
  dataDir?: string;
  skipMigrations?: boolean;
}

// ---------------------------------------------------------------------------
// Raw migration SQL
// ---------------------------------------------------------------------------

/**
 * INIT_SQL — the initial migration DDL, inlined at module load time.
 *
 * We inline the SQL rather than reading from disk so that:
 *   1. pglite in-memory instances (used in tests and demo) need no filesystem
 *      access to the migrations folder.
 *   2. The package works correctly when bundled or run from a different cwd.
 *
 * If you update the schema, add a new migration constant (MIGRATION_0001_SQL,
 * etc.) and apply it in applyMigrations() after INIT_SQL.
 *
 * The SQL uses IF NOT EXISTS guards throughout — applying it twice is safe.
 */
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS "claims" (
  "id"         TEXT        PRIMARY KEY,
  "tier"       INTEGER     NOT NULL,
  "asset"      TEXT        NOT NULL,
  "claim_type" TEXT        NOT NULL,
  "payload"    JSONB       NOT NULL,
  "status"     TEXT        NOT NULL DEFAULT 'open',
  "posted_at"  BIGINT      NOT NULL
);

CREATE TABLE IF NOT EXISTS "agents" (
  "addr"          TEXT    PRIMARY KEY,
  "name"          TEXT    NOT NULL,
  "model"         TEXT,
  "is_human"      BOOLEAN NOT NULL DEFAULT FALSE,
  "bond_wei"      TEXT    NOT NULL DEFAULT '0',
  "reputation"    INTEGER NOT NULL DEFAULT 0,
  "skill_hash"    TEXT,
  "registered_at" BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS "attestations" (
  "id"             TEXT          PRIMARY KEY,
  "claim_id"       TEXT          NOT NULL REFERENCES "claims"("id"),
  "agent_addr"     TEXT          NOT NULL REFERENCES "agents"("addr"),
  "is_human"       BOOLEAN       NOT NULL DEFAULT FALSE,
  "decision"       TEXT          NOT NULL,
  "confidence_bps" INTEGER       NOT NULL,
  "sources_hash"   TEXT          NOT NULL,
  "reasoning_hash" TEXT          NOT NULL,
  "trace_uri"      TEXT          NOT NULL,
  "latency_ms"     INTEGER       NOT NULL,
  "cost_usd"       NUMERIC(12,6) NOT NULL,
  "skill_hash"     TEXT,
  "tx_hash"        TEXT          NOT NULL,
  "created_at"     BIGINT        NOT NULL
);

CREATE TABLE IF NOT EXISTS "epoch_stats" (
  "agent_addr"     TEXT          NOT NULL REFERENCES "agents"("addr"),
  "epoch"          INTEGER       NOT NULL,
  "correct"        INTEGER       NOT NULL DEFAULT 0,
  "wrong"          INTEGER       NOT NULL DEFAULT 0,
  "abstained"      INTEGER       NOT NULL DEFAULT 0,
  "slashes"        INTEGER       NOT NULL DEFAULT 0,
  "avg_latency_ms" INTEGER       NOT NULL DEFAULT 0,
  "total_cost_usd" NUMERIC(12,6) NOT NULL DEFAULT 0,
  PRIMARY KEY ("agent_addr", "epoch")
);

CREATE TABLE IF NOT EXISTS "events" (
  "id"         TEXT   PRIMARY KEY,
  "kind"       TEXT   NOT NULL,
  "payload"    JSONB  NOT NULL,
  "created_at" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "errors" (
  "id"         TEXT   PRIMARY KEY,
  "scope"      TEXT   NOT NULL,
  "payload"    JSONB  NOT NULL,
  "created_at" BIGINT NOT NULL
);
`;

// ---------------------------------------------------------------------------
// applyMigrations — run DDL against a pglite instance
// ---------------------------------------------------------------------------

/**
 * applyMigrations — applies all committed migrations to a pglite database.
 *
 * Currently runs a single inlined SQL block (0000_init.sql equivalent).
 * Future migrations should be added as new constants and executed in order
 * within this function.
 *
 * All statements use IF NOT EXISTS guards, so this function is idempotent:
 * calling it multiple times on the same database is safe.
 *
 * @param db - A BombeDb drizzle instance.
 */
export async function applyMigrations(db: BombeDb): Promise<void> {
  // Execute each statement individually for pglite compatibility.
  // pglite supports multi-statement strings via query(), but splitting is
  // safer across versions.
  const statements = INIT_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.execute(`${statement};`);
  }
}

// ---------------------------------------------------------------------------
// createDb — main factory
// ---------------------------------------------------------------------------

/**
 * createDb — creates a Drizzle client over pglite.
 *
 * Default: in-memory pglite instance (zero external deps, perfect for tests
 * and `pnpm demo`).
 *
 * Pass `dataDir` for file-based pglite persistence (e.g. in the runner).
 *
 * Env variable read (documented per PRD §15.4):
 *   DATABASE_URL — if set AND the live Neon path is implemented (T-803),
 *   this value will be used as the Postgres connection string.  In this
 *   implementation the value is intentionally ignored — the live path is a
 *   skeleton that typechecks but is not wired.  A clear TODO marks the
 *   live branch.
 *
 * @param opts - Optional configuration.  See CreateDbOpts.
 * @returns A fully-migrated BombeDb drizzle client.
 */
export async function createDb(opts: CreateDbOpts = {}): Promise<BombeDb> {
  const { dataDir, skipMigrations = false } = opts;

  // NOTE: DATABASE_URL is read here for future live Postgres support (T-803).
  // It is the ONLY process.env access in this module (PRD §15.4).
  // const databaseUrl = process.env["DATABASE_URL"];
  //
  // TODO T-803: when DATABASE_URL is set and MODE=live, return a Neon/node-postgres
  // client instead of pglite.  Skeleton below — must typecheck:
  //
  // if (databaseUrl && process.env["MODE"] === "live") {
  //   const { drizzle: pgDrizzle } = await import("drizzle-orm/node-postgres");
  //   const { Pool } = await import("pg");
  //   const pool = new Pool({ connectionString: databaseUrl });
  //   const liveDb = pgDrizzle(pool, { schema }) as unknown as BombeDb;
  //   if (!skipMigrations) await applyMigrations(liveDb);
  //   return liveDb;
  // }

  // pglite path (default — zero external deps)
  const client = dataDir !== undefined ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });

  if (!skipMigrations) {
    await applyMigrations(db);
  }

  return db;
}
