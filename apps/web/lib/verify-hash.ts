/**
 * lib/verify-hash.ts — Pure verify-hash logic for the /claim/[id] page.
 *
 * Extracted from app/claim/[id]/page.tsx so that:
 *   1. Tests can import and test it directly.
 *   2. The page file only exports `default` (Next.js page constraint).
 *
 * Uses hashCanonical from @bombe-canonical (browser-safe viem-only module).
 * PRD §14.4 — the browser recomputes keccak256(canonicalJson(trace)).
 *
 * NO `any`. Pure function — no side effects.
 */

import type { StoredTrace } from "@/lib/demo-data";
import { hashCanonical } from "@/lib/hash";

/**
 * verifyTraceHash — recomputes hashCanonical(traceBody) and compares to stored.
 *
 * Strips the generator-added metadata fields (reasoningHash, skillHash) before
 * hashing — those were added by gen-demo-data.test.ts as record fields, not
 * part of the original trace body that was hashed.
 *
 * Returns "match" when recomputed === stored.reasoningHash, "mismatch" otherwise.
 * Never throws.
 *
 * PRD §14.4.
 */
export function verifyTraceHash(stored: StoredTrace): "match" | "mismatch" {
  try {
    const { reasoningHash: _rh, skillHash: _sh, ...traceBody } = stored;
    const recomputed = hashCanonical(traceBody);
    return recomputed === stored.reasoningHash ? "match" : "mismatch";
  } catch {
    return "mismatch";
  }
}
