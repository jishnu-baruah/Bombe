/**
 * attest.ts — Attestation builder. (PRD §6.3, T-214)
 *
 * Assembles the attestation payload from a completed Trace, hashes sources and
 * reasoning, uploads the trace to blob storage, encodes the on-chain calldata,
 * submits via WalletSeam, and writes an attestation row via the repository seam.
 *
 * Decision enum mapping (PRD §6.2, AgentAttestation.sol):
 *   VALID    = 0
 *   REJECTED = 1
 *   ABSTAIN  = 2
 *
 * sourcesHash sort key:
 *   Sources are sorted first by `name` (ascending lexicographic), then by
 *   `source` (ascending lexicographic) as a tie-breaker. This sort is applied
 *   BEFORE hashing so that different array orderings of the same sources always
 *   produce an identical hash. (canonicalJson sorts object keys but NOT array
 *   order, so caller must sort the array explicitly — PRD §6.3.)
 */

import { canonicalJson, hashCanonical, tierOf } from "@bombe/shared";
import type { Claim } from "@bombe/shared";
import { encodeFunctionData } from "viem";
import type { Trace } from "./loop.js";
import type { BlobSeam, ClockSeam, TxReceipt, WalletSeam } from "./seams/types.js";

// ---------------------------------------------------------------------------
// Source — the tool results gathered during the run
// ---------------------------------------------------------------------------

/**
 * Source — a single data-point gathered by a tool during the ReAct loop.
 * Mirrors the ToolResult shape but is independently typed for the attestation
 * layer so attest.ts does not import from tools/types.
 */
export interface Source {
  /** Human-readable name for the data point (e.g. "mETH 30d yield"). */
  name: string;
  /** The raw value returned by the tool. */
  value: unknown;
  /** Identifier for the data source (e.g. fixture path, oracle URL). */
  source: string;
  /** Unix timestamp (ms) when the data was fetched. */
  fetchedAt: number;
  /** Confidence in basis points (0–10000). */
  confidence: number;
}

// ---------------------------------------------------------------------------
// AttestationPayload — the assembled payload before signing
// ---------------------------------------------------------------------------

/**
 * AttestationPayload — the full set of fields assembled before the tx is sent.
 * Returned alongside the receipt so callers can inspect what was submitted.
 */
export interface AttestationPayload {
  claimId: string;
  /** Authoritative tier derived from claimType via tierOf() — never from submitter. */
  tier: 1 | 2 | 3;
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  confidenceBps: number;
  /** keccak256(canonicalJson(sortedSources)) — 0x-prefixed 32-byte hex. */
  sourcesHash: `0x${string}`;
  /** keccak256(canonicalJson(trace)) — 0x-prefixed 32-byte hex. */
  reasoningHash: `0x${string}`;
  /** Blob URL for the uploaded trace JSON. */
  traceURI: string;
}

// ---------------------------------------------------------------------------
// AttestationRow — the DB record written after submission
// ---------------------------------------------------------------------------

/**
 * AttestationRow — the record inserted into the attestations table.
 * Latency is measured from when the ClaimPosted event was observed to now.
 */
export interface AttestationRow {
  claimId: string;
  agentAddr: string;
  isHuman: boolean;
  decision: string;
  confidenceBps: number;
  sourcesHash: string;
  reasoningHash: string;
  traceURI: string;
  latencyMs: number;
  costUsd: number;
  txHash: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// AttestationRepository — injectable storage seam
// ---------------------------------------------------------------------------

/**
 * AttestationRepository — seam for persisting attestation rows.
 *
 * Live: Postgres via drizzle (wired in T-403).
 * Test: InMemoryAttestationRepository (below).
 */
export interface AttestationRepository {
  insert(row: AttestationRow): Promise<void>;
}

// ---------------------------------------------------------------------------
// InMemoryAttestationRepository — in-memory impl for tests
// ---------------------------------------------------------------------------

/**
 * InMemoryAttestationRepository — stores rows in a plain array.
 * Used in tests and mock mode (no database required).
 */
export class InMemoryAttestationRepository implements AttestationRepository {
  private readonly _rows: AttestationRow[] = [];

  async insert(row: AttestationRow): Promise<void> {
    this._rows.push(row);
  }

  /** Inspect stored rows (for tests). */
  get rows(): readonly AttestationRow[] {
    return this._rows;
  }

  /** Clear all stored rows. */
  clear(): void {
    this._rows.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Decision enum mapping (PRD §6.2)
// ---------------------------------------------------------------------------

/**
 * Decision enum values matching the on-chain AgentAttestation.sol Decision enum:
 *   VALID    = 0
 *   REJECTED = 1
 *   ABSTAIN  = 2
 */
const DECISION_ENUM: Record<"VALID" | "REJECTED" | "ABSTAIN", number> = {
  VALID: 0,
  REJECTED: 1,
  ABSTAIN: 2,
} as const;

// ---------------------------------------------------------------------------
// Minimal ABI fragment for AgentAttestation.attest()
// ---------------------------------------------------------------------------

/**
 * Minimal ABI fragment for the on-chain attest() function.
 * Defined inline — attest.ts does not depend on the contracts package.
 *
 * Signature: attest(bytes32 claimId, uint8 decision, uint16 confidenceBps,
 *                   bytes32 sourcesHash, bytes32 reasoningHash, string traceURI)
 *
 * Note: Decision is an enum (uint8 in ABI encoding).
 */
const ATTEST_ABI = [
  {
    name: "attest",
    type: "function",
    inputs: [
      { name: "claimId", type: "bytes32" },
      { name: "decision", type: "uint8" },
      { name: "confidenceBps", type: "uint16" },
      { name: "sourcesHash", type: "bytes32" },
      { name: "reasoningHash", type: "bytes32" },
      { name: "traceURI", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ---------------------------------------------------------------------------
// Placeholder attestation contract address
// ---------------------------------------------------------------------------

/**
 * PLACEHOLDER_ATTESTATION_ADDRESS — zero address used as a default when no
 * real contract address is provided. The runner (T-403) injects the real
 * deployed address from config. This placeholder is documented here so
 * the builder is always type-safe; submitting to the zero address on a live
 * network will fail (expected — you must pass the real address).
 */
export const PLACEHOLDER_ATTESTATION_ADDRESS: `0x${string}` =
  "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// sortSources — deterministic sort for sourcesHash
// ---------------------------------------------------------------------------

/**
 * sortSources — produces a stable-sorted copy of the sources array.
 *
 * Sort key: (name ASC, source ASC)
 *   1. Primary: `name` — ascending lexicographic order.
 *   2. Tie-breaker: `source` — ascending lexicographic order.
 *
 * This sort MUST be applied before hashing because canonicalJson preserves
 * array order and only sorts object keys. Two runs with the same sources in
 * different insertion order must produce the same sourcesHash.
 */
function sortSources(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    return a.source.localeCompare(b.source);
  });
}

// ---------------------------------------------------------------------------
// padClaimId — ensure claimId is a valid bytes32 hex string
// ---------------------------------------------------------------------------

/**
 * padClaimId — convert a string claimId to a 0x-prefixed 32-byte hex value
 * suitable for ABI encoding as bytes32.
 *
 * If the claimId is already a 0x-prefixed 64-hex-char string (66 chars total),
 * it is returned as-is. Otherwise it is treated as a UTF-8 string and
 * zero-padded on the right to 32 bytes (standard Solidity bytes32 padding
 * for string-shaped IDs used in the fixtures/tests).
 */
function padClaimId(claimId: string): `0x${string}` {
  // Already a proper 0x bytes32 hex?
  if (/^0x[0-9a-fA-F]{64}$/.test(claimId)) {
    return claimId as `0x${string}`;
  }
  // Encode UTF-8 bytes and right-pad to 32 bytes.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(claimId);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32)); // truncate if longer than 32 bytes
  const hex = Array.from(padded)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

// ---------------------------------------------------------------------------
// buildAndSubmitAttestation — main entry point
// ---------------------------------------------------------------------------

/**
 * buildAndSubmitAttestation — assembles an attestation payload from a completed
 * trace, signs and submits the on-chain tx, and writes a row to the repository.
 *
 * Flow:
 *   1. Upload trace to blob storage → traceURI.
 *   2. Hash the trace → reasoningHash.
 *   3. Sort sources (by name ASC, source ASC) and hash → sourcesHash.
 *   4. Encode on-chain calldata for attest() using viem encodeFunctionData.
 *   5. Send tx via WalletSeam → TxReceipt.
 *   6. Compute latencyMs = clock.now() - postedAtMs.
 *   7. Assemble and insert AttestationRow.
 *   8. Return { payload, receipt, row }.
 *
 * The decision and confidenceBps come from trace.final (authoritative — hard
 * rules have already been applied by the loop). tier is derived from
 * tierOf(claim.claimType) and is never sourced from the submitter.
 *
 * @param args.attestationAddress — optional deployed contract address.
 *   Defaults to PLACEHOLDER_ATTESTATION_ADDRESS. Pass the real address in
 *   production (T-403 runner wires this from config).
 */
export async function buildAndSubmitAttestation(args: {
  agentId: string;
  agentAddr: string;
  isHuman: boolean;
  claim: Claim;
  trace: Trace;
  sources: Source[];
  costUsd: number;
  postedAtMs: number;
  attestationAddress?: `0x${string}`;
  deps: {
    wallet: WalletSeam;
    blob: BlobSeam;
    clock: ClockSeam;
    repo: AttestationRepository;
  };
}): Promise<{ payload: AttestationPayload; receipt: TxReceipt; row: AttestationRow }> {
  const {
    agentId,
    agentAddr,
    isHuman,
    claim,
    trace,
    sources,
    costUsd,
    postedAtMs,
    attestationAddress = PLACEHOLDER_ATTESTATION_ADDRESS,
    deps: { wallet, blob, clock, repo },
  } = args;

  const claimId = claim.id;

  // 1. Upload trace to blob storage → traceURI
  const traceKey = `trace/${claimId}/${agentId}`;
  const { url: traceURI } = await blob.put(traceKey, canonicalJson(trace));

  // 2. Hash the trace → reasoningHash
  const reasoningHash: `0x${string}` = hashCanonical(trace);

  // 3. Sort sources and hash → sourcesHash
  const sorted = sortSources(sources);
  const sourcesHash: `0x${string}` = hashCanonical(sorted);

  // 4. Extract decision and confidenceBps from trace.final (authoritative)
  const decision = trace.final.decision;
  const confidenceBps = trace.final.confidenceBps;

  // Derive tier from claimType — never from submitter (PRD §6.1)
  const tier = tierOf(claim.claimType);

  // Build payload
  const payload: AttestationPayload = {
    claimId,
    tier,
    decision,
    confidenceBps,
    sourcesHash,
    reasoningHash,
    traceURI,
  };

  // 5. Encode calldata for on-chain attest()
  const decisionEnum = DECISION_ENUM[decision];
  const claimIdBytes32 = padClaimId(claimId);

  const data = encodeFunctionData({
    abi: ATTEST_ABI,
    functionName: "attest",
    args: [claimIdBytes32, decisionEnum, confidenceBps, sourcesHash, reasoningHash, traceURI],
  });

  const tx = {
    to: attestationAddress,
    data,
    value: 0n,
  };

  // 6. Send tx via WalletSeam
  const receipt = await wallet.signAndSend(tx);

  // 7. Compute latencyMs and assemble row
  const now = clock.now();
  const latencyMs = now - postedAtMs;

  const row: AttestationRow = {
    claimId,
    agentAddr,
    isHuman,
    decision,
    confidenceBps,
    sourcesHash,
    reasoningHash,
    traceURI,
    latencyMs,
    costUsd,
    txHash: receipt.txHash,
    createdAt: now,
  };

  // 8. Insert row
  await repo.insert(row);

  return { payload, receipt, row };
}
