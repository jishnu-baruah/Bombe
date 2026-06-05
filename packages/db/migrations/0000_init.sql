-- 0000_init.sql — Initial schema migration for @bombe/db (T-401)
-- Creates all 6 tables: claims, attestations, agents, epoch_stats, events, errors.
-- Applied at runtime via migrate() helper using pglite in-process Postgres.

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
