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
