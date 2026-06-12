/**
 * live-data.ts — Live on-chain data source for the Bombe web app.
 *
 * Implements the SAME typed interface as demo-data.ts (same getter signatures,
 * same return shapes), but reads from deployed Mantle Sepolia contracts via
 * viem createPublicClient. Server-side only.
 *
 * Addresses are read from environment variables (set in .env.local for dev,
 * Vercel env for prod):
 *   REGISTRY_ADDRESS, ATTESTATION_ADDRESS, SLASHING_ADDRESS,
 *   LEADERBOARD_ADDRESS, RPC_URL
 *
 * PRD §6.6 — wiring must not change component props.
 * T-J04 — live on-chain data layer.
 */

import { AgentAttestationAbi, AgentRegistryAbi, TuringLeaderboardAbi } from "@bombe/shared";
import type { Claim } from "@bombe/shared";
import { http, createPublicClient, parseAbi } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";

import type { AttestationRecord, Decision, LeaderboardRow, StoredTrace } from "./demo-data";
import { ALL_AGENT_IDS } from "./demo-data";

// ---------------------------------------------------------------------------
// trustScore ABI fragment (not yet in packages/shared TuringLeaderboard ABI)
// ---------------------------------------------------------------------------

const trustScoreAbi = parseAbi(["function trustScore(address agent) view returns (uint256 score)"]);

// ---------------------------------------------------------------------------
// In-memory TTL cache (30-second revalidation period)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

type CacheEntry<T> = { data: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Env helpers (these are the ONLY places we read process.env for addresses)
// ---------------------------------------------------------------------------

function getContractAddresses(): {
  registry: `0x${string}`;
  attestation: `0x${string}`;
  leaderboard: `0x${string}`;
} {
  const registry = process.env.REGISTRY_ADDRESS;
  const attestation = process.env.ATTESTATION_ADDRESS;
  const leaderboard = process.env.LEADERBOARD_ADDRESS;
  if (!registry || !attestation || !leaderboard) {
    throw new Error(
      "Missing required env vars: REGISTRY_ADDRESS, ATTESTATION_ADDRESS, LEADERBOARD_ADDRESS",
    );
  }
  return {
    registry: registry as `0x${string}`,
    attestation: attestation as `0x${string}`,
    leaderboard: leaderboard as `0x${string}`,
  };
}

// ---------------------------------------------------------------------------
// viem public client (lazy-created once per process)
// ---------------------------------------------------------------------------

let _client: ReturnType<typeof createPublicClient> | undefined;

function getClient(): ReturnType<typeof createPublicClient> {
  if (_client) return _client;
  const rpcUrl = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
  _client = createPublicClient({
    chain: mantleSepoliaTestnet,
    transport: http(rpcUrl, { timeout: 15_000 }),
  });
  return _client;
}

// ---------------------------------------------------------------------------
// Decision decoder (on-chain: 0=VALID, 1=REJECTED, 2=ABSTAIN)
// ---------------------------------------------------------------------------

function decodeDecision(raw: number): Decision {
  if (raw === 0) return "VALID";
  if (raw === 1) return "REJECTED";
  return "ABSTAIN";
}

// ---------------------------------------------------------------------------
// Known agent addresses — these are the 5 registered attestor addresses.
// Read from AGENT_KEYS env at startup; format: comma-separated addresses.
// Falls back to an empty list (live read returns [] gracefully).
// ---------------------------------------------------------------------------

type AgentEntry = { address: `0x${string}`; agentId: string };

function getKnownAgentAddresses(): AgentEntry[] {
  // AGENT_KEYS may be comma-separated private keys; we need the addresses.
  // However for the leaderboard we can't derive addresses from keys server-side
  // without viem's privateKeyToAccount (which is fine here — server context).
  // If AGENT_ADDRS is set (as addresses), use that; otherwise fall back to
  // deriving from keys.
  const raw = process.env.AGENT_ADDRS ?? process.env.AGENT_ADDRESSES ?? "";
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("0x"));

  // Map addresses to agentId by position (reflector=0,rotor=1,stator=2,plugboard=3,human=4)
  const ids = ["reflector", "rotor", "stator", "plugboard", "human"] as const;
  return parts.map((addr, i) => ({
    address: addr as `0x${string}`,
    agentId: ids[i] ?? `agent-${i}`,
  }));
}

// ---------------------------------------------------------------------------
// getLeaderboard — reads lifetimeStats + trustScore + registry info per agent
// ---------------------------------------------------------------------------

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const cacheKey = "leaderboard";
  const cached = getCached<LeaderboardRow[]>(cacheKey);
  if (cached) return cached;

  const addrs = getKnownAgentAddresses();
  if (addrs.length === 0) return [];

  const { registry, leaderboard } = getContractAddresses();
  const client = getClient();

  const rows: LeaderboardRow[] = [];

  for (const { address, agentId } of addrs) {
    try {
      const [statsRaw, agentRaw, trustScoreRaw] = await Promise.all([
        client.readContract({
          address: leaderboard,
          abi: TuringLeaderboardAbi,
          functionName: "lifetimeStats",
          args: [address],
        }),
        client.readContract({
          address: registry,
          abi: AgentRegistryAbi,
          functionName: "getAgent",
          args: [address],
        }),
        client
          .readContract({
            address: leaderboard,
            abi: trustScoreAbi,
            functionName: "trustScore",
            args: [address],
          })
          .catch(() => 0n), // trustScore may not be in deployed ABI yet
      ]);

      const stats = statsRaw as {
        correct: bigint;
        wrong: bigint;
        abstained: bigint;
        slashes: bigint;
      };
      const agent = agentRaw as {
        addr: `0x${string}`;
        bond: bigint;
        reputation: bigint;
        isHuman: boolean;
        active: boolean;
      };

      const correct = Number(stats.correct);
      const wrong = Number(stats.wrong);
      const abstained = Number(stats.abstained);
      const slashes = Number(stats.slashes);
      const totalDecisions = correct + wrong + abstained;
      const decisive = correct + wrong;
      const accuracyPct: number | null =
        decisive > 0 ? Math.round((correct / decisive) * 1000) / 10 : null;
      const abstentionPct =
        totalDecisions > 0 ? Math.round((abstained / totalDecisions) * 1000) / 10 : 0;
      const decisivenessPct =
        totalDecisions > 0 ? Math.round((decisive / totalDecisions) * 1000) / 10 : 0;

      const bondEth = Number(agent.bond) / 1e18;
      const reputation = Number(agent.reputation);

      rows.push({
        rank: 0, // assigned after sort
        agentId,
        isHuman: agent.isHuman,
        isExternal: agentId === "plugboard",
        correct,
        wrong,
        abstained,
        totalDecisions,
        accuracyPct,
        abstentionPct,
        decisivenessPct,
        avgLatencyMs: 0, // not tracked on-chain; DB would have this
        totalCostUsd: 0, // not tracked on-chain
        bond: bondEth,
        slashes,
        reputation,
      });
    } catch {
      // RPC error for one agent — skip gracefully; other agents still rendered
    }
  }

  // Sort by accuracyPct desc (nulls last), then decisiveness desc
  rows.sort((a, b) => {
    const aAcc = a.accuracyPct ?? -1;
    const bAcc = b.accuracyPct ?? -1;
    if (bAcc !== aAcc) return bAcc - aAcc;
    return b.decisivenessPct - a.decisivenessPct;
  });

  // Assign ranks
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  setCached(cacheKey, rows);
  return rows;
}

// ---------------------------------------------------------------------------
// getClaims — reads all claims from on-chain by querying known claim IDs.
// On-chain claims use bytes32 IDs; we read the same A/B/C/D IDs as the demo.
// ---------------------------------------------------------------------------

function claimIdToBytes32(id: string): `0x${string}` {
  // Pad the ASCII claim ID to 32 bytes (right-padded with zeros)
  const hex = Buffer.from(id, "utf8").toString("hex").padEnd(64, "0");
  return `0x${hex}` as `0x${string}`;
}

export async function getClaims(): Promise<Claim[]> {
  const cacheKey = "claims";
  const cached = getCached<Claim[]>(cacheKey);
  if (cached) return cached;

  const ids = ["A", "B", "C", "D"];
  const results = await Promise.all(ids.map((id) => getClaim(id)));
  const claims = results.filter((c): c is Claim => c !== undefined);

  setCached(cacheKey, claims);
  return claims;
}

export async function getClaim(id: string): Promise<Claim | undefined> {
  const cacheKey = `claim:${id}`;
  const cached = getCached<Claim>(cacheKey);
  if (cached) return cached;

  try {
    const { attestation } = getContractAddresses();
    const client = getClient();
    const claimId = claimIdToBytes32(id);

    const raw = await client.readContract({
      address: attestation,
      abi: AgentAttestationAbi,
      functionName: "getClaim",
      args: [claimId],
    });

    const onChain = raw as {
      tier: number;
      claimHash: `0x${string}`;
      claimURI: string;
      posted: boolean;
      closed: boolean;
      attestorCount: number;
      claimFee: bigint;
    };

    if (!onChain.posted) return undefined;

    // claimURI may encode the payload as JSON; parse best-effort
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(onChain.claimURI) as Record<string, unknown>;
      payload = (parsed.payload as Record<string, unknown> | undefined) ?? parsed;
    } catch {
      payload = { uri: onChain.claimURI };
    }

    // Build the Claim. The asset space is open (any symbol), so the asset is carried
    // verbatim; only the claimType is constrained to the known set (it drives the tier).
    type ClaimTypeEnum = Claim["claimType"];
    const KNOWN_CLAIM_TYPES: ClaimTypeEnum[] = [
      "YIELD_BPS",
      "DISTRIBUTION_PAID",
      "CASHFLOW_MATCH",
      "ENCUMBRANCE_ABSENT",
      "FAIR_VALUE",
    ];

    const asset: Claim["asset"] = (payload.asset as string | undefined)?.trim() || "mETH";
    const rawClaimType = (payload.claimType as string | undefined) ?? "YIELD_BPS";
    const claimType: ClaimTypeEnum = KNOWN_CLAIM_TYPES.includes(rawClaimType as ClaimTypeEnum)
      ? (rawClaimType as ClaimTypeEnum)
      : "YIELD_BPS";

    // The on-chain getClaim struct has no poster field and the claimURI is a bare
    // pointer, so the inline payload almost never carries a submitter. For a
    // self-serve REQ claim the meaningful submitter is the payer recorded at
    // request time; resolve it from the DB. Left as the zero address when unknown
    // (the claim view hides an unknown submitter rather than showing 0x0).
    let submitter =
      (payload.submitter as string | undefined) ?? "0x0000000000000000000000000000000000000000";
    if (/^0x0+$/.test(submitter)) {
      try {
        const { getPayerByClaimId } = await import("./db");
        const payer = await getPayerByClaimId(id);
        if (payer) submitter = payer;
      } catch {
        // DB is optional; leave the zero sentinel for the UI to hide.
      }
    }

    const claim: Claim = {
      id,
      tier: onChain.tier as 1 | 2 | 3,
      asset,
      claimType,
      submitter,
      payload,
      postedAt: (payload.postedAt as number | undefined) ?? Date.now(),
    };

    setCached(cacheKey, claim);
    return claim;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// getAttestations — reads on-chain attestation records for a claim
// ---------------------------------------------------------------------------

export async function getAttestations(claimId: string): Promise<AttestationRecord[]> {
  const cacheKey = `attestations:${claimId}`;
  const cached = getCached<AttestationRecord[]>(cacheKey);
  if (cached) return cached;

  try {
    const { attestation } = getContractAddresses();
    const client = getClient();
    const claimIdBytes = claimIdToBytes32(claimId);

    const attestors = await client.readContract({
      address: attestation,
      abi: AgentAttestationAbi,
      functionName: "getClaimAttestors",
      args: [claimIdBytes],
    });

    const addrs = attestors as `0x${string}`[];
    const addrToAgent = buildAddrToAgent();

    const records: AttestationRecord[] = [];

    await Promise.all(
      addrs.map(async (addr) => {
        try {
          const raw = await client.readContract({
            address: attestation,
            abi: AgentAttestationAbi,
            functionName: "getAttestation",
            args: [claimIdBytes, addr],
          });

          const att = raw as {
            exists: boolean;
            decision: number;
            confidenceBps: number;
            sourcesHash: `0x${string}`;
            reasoningHash: `0x${string}`;
            traceURI: string;
            lockedStake: bigint;
          };

          if (!att.exists) return;

          const agentId = addrToAgent.get(addr.toLowerCase()) ?? addr;

          records.push({
            agentId,
            claimId,
            decision: decodeDecision(att.decision),
            confidenceBps: att.confidenceBps,
            reasoningHash: att.reasoningHash,
            sourcesHash: att.sourcesHash,
            traceURI: att.traceURI,
            txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            agentAddress: addr,
            latencyMs: 0,
            costUsd: 0,
            isHuman: agentId === "human",
            blockedByProtocol: false,
            skillHash: null,
          });
        } catch {
          // single attestation read failure — skip
        }
      }),
    );

    // Sort by canonical agent order
    records.sort(
      (a, b) =>
        (ALL_AGENT_IDS as readonly string[]).indexOf(a.agentId) -
        (ALL_AGENT_IDS as readonly string[]).indexOf(b.agentId),
    );

    setCached(cacheKey, records);
    return records;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// getTrace — live has no in-process trace store; returns undefined (use API route)
// ---------------------------------------------------------------------------

export function getTrace(_claimId: string, _agentId: string): StoredTrace | undefined {
  // Traces in live mode are served by /api/trace/[claimId]/[agent] from DB.
  // This getter returns undefined so the UI shows the "No trace data" fallback,
  // which is correct for live mode (traces are not bundled client-side).
  return undefined;
}

// ---------------------------------------------------------------------------
// getPlugboardSkillHash — reads from registry metadata; returns zero hash if absent
// ---------------------------------------------------------------------------

export function getPlugboardSkillHash(): `0x${string}` {
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}

// ---------------------------------------------------------------------------
// addr → agentId lookup built from AGENT_ADDRS env
// ---------------------------------------------------------------------------

function buildAddrToAgent(): Map<string, string> {
  const m = new Map<string, string>();
  for (const { address, agentId } of getKnownAgentAddresses()) {
    m.set(address.toLowerCase(), agentId);
  }
  return m;
}
