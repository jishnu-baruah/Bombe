/**
 * lib/public-api.ts — read helpers for the public agent-facing API (v3 read layer).
 *
 * Self-contained: reads the live AgentAttestation contract on Mantle Sepolia via
 * viem. The address and RPC fall back to public values so the API works without
 * special env. Server-side only. No keys, no writes; purely the permissionless
 * read path that any agent could call directly.
 */

import { AgentAttestationAbi } from "@bombe/shared";
import { http, createPublicClient } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";
import { cacheGetJson, cacheSetJson } from "./cache";

export const ATTESTATION_ADDRESS = (process.env.ATTESTATION_ADDRESS ??
  "0xf2473a0a55D997233C8fBF987c197e7d2180470A") as `0x${string}`;
const RPC_URL = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const DECISION = ["VALID", "REJECTED", "ABSTAIN"] as const;

let _client: ReturnType<typeof createPublicClient> | undefined;
function client(): ReturnType<typeof createPublicClient> {
  if (!_client) {
    _client = createPublicClient({
      chain: mantleSepoliaTestnet,
      transport: http(RPC_URL, { timeout: 15_000 }),
    });
  }
  return _client;
}

/** UTF-8 string claim id, right-padded to bytes32 (matches the posting path). */
export function toBytes32(s: string): `0x${string}` {
  const b = new TextEncoder().encode(s);
  const p = new Uint8Array(32);
  p.set(b.slice(0, 32));
  return `0x${Array.from(p)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}

export interface PublicAttestation {
  attestor: string;
  decision: string;
  confidenceBps: number;
  reasoningHash: string;
  sourcesHash: string;
  traceURI: string;
  lockedStakeWei: string;
}

export interface PublicClaim {
  claimId: string;
  posted: boolean;
  tier: number;
  closed: boolean;
  attestorCount: number;
  attestations: PublicAttestation[];
}

interface RawAttestation {
  exists: boolean;
  decision: number;
  confidenceBps: number;
  sourcesHash: `0x${string}`;
  reasoningHash: `0x${string}`;
  traceURI: string;
  lockedStake: bigint;
}

/**
 * The bounded set of claim IDs we probe for aggregate reads and reverse lookups:
 * the A-D demo claims plus the daily streak pattern (mETH/USDY) for the last N days.
 * There is no global on-chain index of claim IDs yet, so this is the honest scope.
 */
export function candidateClaimIds(days = 21): string[] {
  const ids = ["A", "B", "C", "D"];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const ymd = d.toISOString().slice(0, 10);
    ids.push(`mETH-${ymd}`, `USDY-${ymd}`);
  }
  return ids;
}

export interface NetworkStats {
  attestations: number;
  claims: number;
  assets: number;
}

/**
 * Aggregate live network stats, read robustly from a bounded set of known claim
 * IDs (the daily streak pattern plus the demo claims) rather than a full-chain
 * log scan, which is slow and flaky on the public RPC. Cached in Redis (shared
 * across serverless instances). Returns null if every read fails.
 */
export async function getNetworkStats(): Promise<NetworkStats | null> {
  const cached = await cacheGetJson<NetworkStats>("v1:stats:network");
  if (cached) return cached;

  const ids = candidateClaimIds();
  const c = client();
  let attestations = 0;
  let claims = 0;
  let anyOk = false;
  const assetSet = new Set<string>();

  const results = await Promise.allSettled(
    ids.map((id) =>
      c.readContract({
        address: ATTESTATION_ADDRESS,
        abi: AgentAttestationAbi,
        functionName: "getClaim",
        args: [toBytes32(id)],
      }),
    ),
  );

  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    anyOk = true;
    const claim = r.value as { posted: boolean; attestorCount: number };
    if (claim.posted) {
      claims += 1;
      attestations += Number(claim.attestorCount);
      const id = ids[i];
      if (id?.startsWith("mETH")) assetSet.add("mETH");
      else if (id?.startsWith("USDY")) assetSet.add("USDY");
    }
  });

  if (!anyOk) return null;

  const data: NetworkStats = {
    attestations,
    claims,
    assets: Math.max(assetSet.size, 0),
  };
  await cacheSetJson("v1:stats:network", data, 120);
  return data;
}

/** Read a claim and every attestation on it, straight from the contract (Redis-cached). */
export async function readClaim(claimId: string): Promise<PublicClaim> {
  const cacheKey = `v1:claim:${claimId}`;
  const cached = await cacheGetJson<PublicClaim>(cacheKey);
  if (cached) return cached;

  const id = toBytes32(claimId);
  const c = client();
  const claim = (await c.readContract({
    address: ATTESTATION_ADDRESS,
    abi: AgentAttestationAbi,
    functionName: "getClaim",
    args: [id],
  })) as { tier: number; posted: boolean; closed: boolean; attestorCount: number };

  const attestors = (await c.readContract({
    address: ATTESTATION_ADDRESS,
    abi: AgentAttestationAbi,
    functionName: "getClaimAttestors",
    args: [id],
  })) as readonly `0x${string}`[];

  const attestations: PublicAttestation[] = [];
  for (const a of attestors) {
    const att = (await c.readContract({
      address: ATTESTATION_ADDRESS,
      abi: AgentAttestationAbi,
      functionName: "getAttestation",
      args: [id, a],
    })) as RawAttestation;
    if (!att.exists) continue;
    attestations.push({
      attestor: a,
      decision: DECISION[att.decision] ?? `UNKNOWN(${att.decision})`,
      confidenceBps: att.confidenceBps,
      reasoningHash: att.reasoningHash,
      sourcesHash: att.sourcesHash,
      traceURI: att.traceURI,
      lockedStakeWei: att.lockedStake.toString(),
    });
  }

  const result: PublicClaim = {
    claimId,
    posted: claim.posted,
    tier: claim.tier,
    closed: claim.closed,
    attestorCount: claim.attestorCount,
    attestations,
  };
  // Cache only posted claims (avoid caching a transient not-found).
  if (result.posted) await cacheSetJson(cacheKey, result, 30);
  return result;
}

export type LookupKind = "claimId" | "reasoningHash" | "txHash" | "empty";

export interface LookupResult {
  query: string;
  kind: LookupKind;
  found: boolean;
  claim?: PublicClaim;
  matchedAttestor?: string;
  explorerUrl?: string;
  message?: string;
}

const EXPLORER = "https://sepolia.mantlescan.xyz";

/** Scan the bounded recent claim set for an attestation whose reasoningHash matches. */
async function findByReasoningHash(
  hash: string,
): Promise<{ claim: PublicClaim; attestor: string } | null> {
  const target = hash.toLowerCase();
  const ids = candidateClaimIds();
  const claims = await Promise.allSettled(ids.map((id) => readClaim(id)));
  for (const r of claims) {
    if (r.status !== "fulfilled" || !r.value.posted) continue;
    const hit = r.value.attestations.find((a) => a.reasoningHash.toLowerCase() === target);
    if (hit) return { claim: r.value, attestor: hit.attestor };
  }
  return null;
}

/**
 * Resolve a free-text lookup: a claim ID, a reasoning hash (0x, 32 bytes), or a
 * tx hash. A 32-byte hash is first reverse-matched against recent reasoning
 * hashes; if none matches it is shown as a transaction on the explorer. Read-only.
 */
export async function lookup(q: string): Promise<LookupResult> {
  const query = q.trim();
  if (!query) {
    return {
      query,
      kind: "empty",
      found: false,
      message: "Enter a claim ID, a reasoning hash, or a transaction hash.",
    };
  }

  const is32ByteHex = /^0x[0-9a-fA-F]{64}$/.test(query);
  if (is32ByteHex) {
    const match = await findByReasoningHash(query);
    if (match) {
      return {
        query,
        kind: "reasoningHash",
        found: true,
        claim: match.claim,
        matchedAttestor: match.attestor,
      };
    }
    return {
      query,
      kind: "txHash",
      found: true,
      explorerUrl: `${EXPLORER}/tx/${query}`,
      message:
        "No attestation in the recent set matches this as a reasoning hash. Showing it as a transaction on the Mantle explorer.",
    };
  }

  try {
    const claim = await readClaim(query);
    if (claim.posted) return { query, kind: "claimId", found: true, claim };
    return {
      query,
      kind: "claimId",
      found: false,
      message: "No posted claim with that ID was found on-chain.",
    };
  } catch {
    return {
      query,
      kind: "claimId",
      found: false,
      message: "Could not read that claim from the chain. Check the ID and try again.",
    };
  }
}

/** Convenience for building explorer links in the UI. */
export function explorerAddressUrl(addr: string): string {
  return `${EXPLORER}/address/${addr}`;
}
