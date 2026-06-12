/**
 * db.ts, durable persistence for self-serve paid requests over Neon Postgres.
 *
 * Replaces the per-instance in-memory dedupe with a durable record: a verified
 * payment is recorded once (the tx hash is unique), so a request survives
 * serverless cold starts and the operator can read the pending queue. Falls back
 * to a no-op when DATABASE_URL is unset (local dev / tests), so callers keep
 * their own in-memory dedupe as the fallback.
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

let _sql: ReturnType<typeof neon> | undefined;
let _initialized = false;

export function dbEnabled(): boolean {
  return Boolean(DATABASE_URL);
}

function sql() {
  if (!_sql) _sql = neon(DATABASE_URL as string);
  return _sql;
}

async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS attestation_requests (
      id SERIAL PRIMARY KEY,
      payment_tx_hash TEXT UNIQUE NOT NULL,
      payer TEXT NOT NULL,
      asset TEXT NOT NULL,
      claim_type TEXT NOT NULL,
      asserted_bps INTEGER NOT NULL,
      window_days INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  _initialized = true;
}

export interface AttestationRequest {
  paymentTxHash: string;
  payer: string;
  asset: string;
  claimType: string;
  assertedBps: number;
  windowDays: number;
}

/**
 * Record a verified paid request. Returns true if newly recorded, false if the
 * payment tx hash was already used (durable dedupe). Returns true when the DB is
 * not configured (the caller's in-memory dedupe still applies).
 */
export async function recordRequest(r: AttestationRequest): Promise<boolean> {
  if (!dbEnabled()) return true;
  await ensureTable();
  const rows = (await sql()`
    INSERT INTO attestation_requests
      (payment_tx_hash, payer, asset, claim_type, asserted_bps, window_days)
    VALUES
      (${r.paymentTxHash.toLowerCase()}, ${r.payer.toLowerCase()}, ${r.asset},
       ${r.claimType}, ${r.assertedBps}, ${r.windowDays})
    ON CONFLICT (payment_tx_hash) DO NOTHING
    RETURNING id`) as unknown[];
  return rows.length > 0;
}

/**
 * Resolve the payer (the issuer wallet) that paid for a self-serve REQ claim.
 * Claim ids are `${asset}-REQ-${paymentTxHash.slice(2, 12)}`, so the hex tail
 * after "-REQ-" identifies the payment tx. The on-chain claim carries no poster
 * field, so this is how the claim view shows who actually requested the work.
 * Returns null if the DB is off or no matching request exists.
 */
export async function getPayerByClaimId(claimId: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  const m = /-REQ-([0-9a-fA-F]{6,})$/.exec(claimId);
  if (!m) return null;
  await ensureTable();
  const prefix = `0x${m[1].toLowerCase()}%`;
  const rows = (await sql()`
    SELECT payer FROM attestation_requests
    WHERE payment_tx_hash LIKE ${prefix}
    LIMIT 1`) as Array<{ payer: string }>;
  return rows[0]?.payer ?? null;
}

// ---------------------------------------------------------------------------
// Reasoning-trace storage (T-802 on Neon, no blob store needed).
// A trace is small JSON; storing it as a row is sufficient and lets /verify
// re-derive the hash. Keyed by (claim_id, attestor).
// ---------------------------------------------------------------------------

let _tracesInitialized = false;

async function ensureTracesTable(): Promise<void> {
  if (_tracesInitialized) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS traces (
      claim_id TEXT NOT NULL,
      attestor TEXT NOT NULL,
      trace_json TEXT NOT NULL,
      reasoning_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (claim_id, attestor)
    )`;
  _tracesInitialized = true;
}

/** Persist a reasoning trace (the JSON string) for a claim+attestor. */
export async function storeTrace(
  claimId: string,
  attestor: string,
  traceJson: string,
  reasoningHash: string,
): Promise<void> {
  if (!dbEnabled()) return;
  await ensureTracesTable();
  await sql()`
    INSERT INTO traces (claim_id, attestor, trace_json, reasoning_hash)
    VALUES (${claimId}, ${attestor.toLowerCase()}, ${traceJson}, ${reasoningHash.toLowerCase()})
    ON CONFLICT (claim_id, attestor) DO UPDATE
      SET trace_json = EXCLUDED.trace_json, reasoning_hash = EXCLUDED.reasoning_hash`;
}

/** Fetch a stored trace JSON string for a claim+attestor, or null. */
export async function getStoredTrace(claimId: string, attestor: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  await ensureTracesTable();
  const rows = (await sql()`
    SELECT trace_json FROM traces
    WHERE claim_id = ${claimId} AND attestor = ${attestor.toLowerCase()}
    LIMIT 1`) as { trace_json: string }[];
  return rows[0]?.trace_json ?? null;
}

// ---------------------------------------------------------------------------
// Asset requests ("can't find your asset? request it"). For RWA the network does
// not yet have a live source for (a new protocol, a category like real estate or
// gold with no Mantle pool yet). Recorded for the operator to triage into a new
// source descriptor. Honest: we don't fake a route; we capture the ask.
// ---------------------------------------------------------------------------

let _assetReqInitialized = false;

async function ensureAssetRequestsTable(): Promise<void> {
  if (_assetReqInitialized) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS asset_requests (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      category TEXT,
      source_url TEXT,
      note TEXT,
      contact TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  _assetReqInitialized = true;
}

export interface AssetRequest {
  symbol: string;
  category?: string;
  sourceUrl?: string;
  note?: string;
  contact?: string;
}

/** Record an asset-coverage request. Returns true if stored (or DB disabled). */
export async function recordAssetRequest(r: AssetRequest): Promise<boolean> {
  if (!dbEnabled()) return true;
  await ensureAssetRequestsTable();
  const rows = (await sql()`
    INSERT INTO asset_requests (symbol, category, source_url, note, contact)
    VALUES (${r.symbol}, ${r.category ?? null}, ${r.sourceUrl ?? null},
            ${r.note ?? null}, ${r.contact ?? null})
    RETURNING id`) as unknown[];
  return rows.length > 0;
}
