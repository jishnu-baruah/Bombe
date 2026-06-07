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

/** Read a claim and every attestation on it, straight from the contract. */
export async function readClaim(claimId: string): Promise<PublicClaim> {
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

  return {
    claimId,
    posted: claim.posted,
    tier: claim.tier,
    closed: claim.closed,
    attestorCount: claim.attestorCount,
    attestations,
  };
}
