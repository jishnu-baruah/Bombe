/**
 * activity.ts, the protocol-activity feed for the /explorer page.
 *
 * Builds a block-explorer-style history of claims and their attestations,
 * read-only and server-side. Three data sources, in preference order:
 *
 *   1. The Graph subgraph, when SUBGRAPH_URL is set (the scaling path). One
 *      GraphQL query returns recent claims + attestations already indexed.
 *   2. viem getLogs against the AgentAttestation contract, over a bounded
 *      recent block range (the default live source, no indexer required).
 *   3. The Neon trace store, as a fallback/enrichment when the chain read is
 *      empty or unavailable (we persist every reasoning trace there).
 *
 * The Neon trace store is also used to enrich on-chain rows with the stored
 * reasoning trace (claim type, asset, rationale) when present.
 *
 * No keys, no writes. Decision values are the on-chain enum, never a model.
 */

import { AgentAttestationAbi } from "@bombe/shared";
import { http, createPublicClient, decodeEventLog, hexToString, parseAbiItem } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";
import { ATTESTATION_ADDRESS } from "./public-api";

const RPC_URL = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const DECISION = ["VALID", "REJECTED", "ABSTAIN"] as const;
const EXPLORER = "https://sepolia.mantlescan.xyz";

// The bounded look-back for the getLogs path. The public Mantle Sepolia RPC
// caps eth_getLogs to ~10000 blocks per call (a larger range throws "Invalid
// parameters"), so we scan a recent window in CHUNKS under that cap. This is the
// honest range bound of the no-indexer path; the subgraph path removes it.
const LOG_LOOKBACK_BLOCKS = BigInt(process.env.EXPLORER_LOG_LOOKBACK ?? "100000");
const LOG_CHUNK_BLOCKS = BigInt(process.env.EXPLORER_LOG_CHUNK ?? "9000");

// getLogs over [fromBlock, toBlock] in chunks under the RPC range cap, in
// parallel, tolerating per-chunk RPC failures (a flaky chunk drops, not the feed).
async function getLogsChunked(
  c: ReturnType<typeof createPublicClient>,
  // biome-ignore lint/suspicious/noExplicitAny: the parsed event fragment; viem's getLogs generics are not worth threading here
  event: any,
  fromBlock: bigint,
  toBlock: bigint,
  // biome-ignore lint/suspicious/noExplicitAny: viem narrows the decoded log shape per event; callers re-decode via the ABI
): Promise<any[]> {
  const ranges: [bigint, bigint][] = [];
  for (let from = fromBlock; from <= toBlock; from += LOG_CHUNK_BLOCKS + 1n) {
    const to = from + LOG_CHUNK_BLOCKS > toBlock ? toBlock : from + LOG_CHUNK_BLOCKS;
    ranges.push([from, to]);
  }
  const results = await Promise.all(
    ranges.map(async ([from, to]) => {
      try {
        return await c.getLogs({
          address: ATTESTATION_ADDRESS,
          event,
          fromBlock: from,
          toBlock: to,
        });
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}

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

export interface ActivityAttestation {
  attestor: string;
  decision: string;
  confidenceBps: number;
  txHash: string | null;
  /** Unix seconds, when known. */
  timestamp: number | null;
}

export interface ActivityClaim {
  /** Human-readable claim id (decoded from bytes32 when it was a UTF-8 string). */
  claimId: string;
  /** The raw bytes32 id, for exact /verify lookups and de-duping. */
  claimIdHex: string;
  tier: number;
  /** Best-effort claim type, from the stored trace when present. */
  claimType: string | null;
  /** Best-effort asset symbol, from the stored trace when present. */
  asset: string | null;
  postTxHash: string | null;
  /** Unix seconds of the claim-posted event, when known. */
  timestamp: number | null;
  attestations: ActivityAttestation[];
  /** The headline decision: the first non-abstain, else abstain, else null. */
  decision: string | null;
  /** Where the row came from, for honest UI labelling. */
  source: "subgraph" | "chain" | "store";
}

export interface ActivityFeed {
  claims: ActivityClaim[];
  source: "subgraph" | "chain" | "store" | "empty";
  /** True when the chain read hit its bounded range (honest range disclosure). */
  bounded: boolean;
  generatedAt: number;
}

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER}/tx/${txHash}`;
}

export function explorerAddressUrl(addr: string): string {
  return `${EXPLORER}/address/${addr}`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Decode a bytes32 claim id back to its UTF-8 string when it was posted as one. */
export function decodeClaimId(hex: string): string {
  try {
    const s = hexToString(hex as `0x${string}`, { size: 32 }).replace(/\0+$/, "");
    // Only accept printable ASCII; otherwise show the hex (a real keccak id).
    if (s.length > 0 && /^[\x20-\x7e]+$/.test(s)) return s;
  } catch {
    // fall through
  }
  return hex;
}

function headlineDecision(atts: ActivityAttestation[]): string | null {
  const first = atts[0];
  if (!first) return null;
  const decisive = atts.find((a) => a.decision === "VALID" || a.decision === "REJECTED");
  return decisive ? decisive.decision : first.decision;
}

// ---------------------------------------------------------------------------
// Source 1: The Graph subgraph (preferred when SUBGRAPH_URL is set).
// ---------------------------------------------------------------------------

interface SubgraphClaim {
  id: string;
  tier: number;
  claimType?: string | null;
  asset?: string | null;
  postTxHash?: string | null;
  postedAt?: string | null;
  attestations: {
    attestor: string;
    decision: string;
    confidenceBps: number;
    txHash?: string | null;
    attestedAt?: string | null;
  }[];
}

async function fromSubgraph(limit: number): Promise<ActivityClaim[] | null> {
  const url = process.env.SUBGRAPH_URL;
  if (!url) return null;
  const query = `{
    claims(first: ${limit}, orderBy: postedAt, orderDirection: desc) {
      id tier claimType asset postTxHash postedAt
      attestations(orderBy: attestedAt, orderDirection: asc) {
        attestor decision confidenceBps txHash attestedAt
      }
    }
  }`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { claims?: SubgraphClaim[] } };
    const claims = json.data?.claims;
    if (!claims) return null;
    return claims.map((c) => {
      const atts: ActivityAttestation[] = c.attestations.map((a) => ({
        attestor: a.attestor,
        decision: a.decision,
        confidenceBps: Number(a.confidenceBps),
        txHash: a.txHash ?? null,
        timestamp: a.attestedAt ? Number(a.attestedAt) : null,
      }));
      return {
        claimId: decodeClaimId(c.id),
        claimIdHex: c.id,
        tier: Number(c.tier),
        claimType: c.claimType ?? null,
        asset: c.asset ?? null,
        postTxHash: c.postTxHash ?? null,
        timestamp: c.postedAt ? Number(c.postedAt) : null,
        attestations: atts,
        decision: headlineDecision(atts),
        source: "subgraph" as const,
      };
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 2: viem getLogs over a bounded recent range.
// ---------------------------------------------------------------------------

// Typed event fragments for getLogs (decodeEventLog uses the full ABI). Declared
// with parseAbiItem so viem narrows the filter and the decoded args precisely.
const CLAIM_POSTED_EVENT = parseAbiItem(
  "event ClaimPosted(bytes32 indexed claimId, uint8 tier, bytes32 claimHash, string claimURI, uint256 claimFee)",
);
const ATTESTED_EVENT = parseAbiItem(
  "event Attested(bytes32 indexed claimId, address indexed attestor, uint8 decision, uint16 confidenceBps, uint256 lockedStake)",
);

async function fromChain(
  limit: number,
): Promise<{ claims: ActivityClaim[]; bounded: boolean } | null> {
  const c = client();
  let latest: bigint;
  try {
    latest = await c.getBlockNumber();
  } catch {
    return null;
  }
  const fromBlock = latest > LOG_LOOKBACK_BLOCKS ? latest - LOG_LOOKBACK_BLOCKS : 0n;
  const bounded = fromBlock > 0n;

  const [postedLogs, attestedLogs] = await Promise.all([
    getLogsChunked(c, CLAIM_POSTED_EVENT, fromBlock, latest),
    getLogsChunked(c, ATTESTED_EVENT, fromBlock, latest),
  ]);

  // Resolve block timestamps once per unique block.
  const blockNums = new Set<bigint>();
  for (const l of [...postedLogs, ...attestedLogs]) {
    if (l.blockNumber != null) blockNums.add(l.blockNumber);
  }
  const tsByBlock = new Map<bigint, number>();
  await Promise.all(
    [...blockNums].map(async (bn) => {
      try {
        const b = await c.getBlock({ blockNumber: bn });
        tsByBlock.set(bn, Number(b.timestamp));
      } catch {
        // leave unknown
      }
    }),
  );

  // Attestations grouped by claim id (hex).
  const attsByClaim = new Map<string, ActivityAttestation[]>();
  for (const log of attestedLogs) {
    try {
      const { args } = decodeEventLog({
        abi: AgentAttestationAbi,
        eventName: "Attested",
        data: log.data,
        topics: log.topics,
      });
      const a = args as unknown as {
        claimId: string;
        attestor: string;
        decision: number;
        confidenceBps: number;
      };
      const key = a.claimId.toLowerCase();
      const list = attsByClaim.get(key) ?? [];
      list.push({
        attestor: a.attestor,
        decision: DECISION[a.decision] ?? `UNKNOWN(${a.decision})`,
        confidenceBps: Number(a.confidenceBps),
        txHash: log.transactionHash,
        timestamp: log.blockNumber != null ? (tsByBlock.get(log.blockNumber) ?? null) : null,
      });
      attsByClaim.set(key, list);
    } catch {
      // skip undecodable log
    }
  }

  const claims: ActivityClaim[] = [];
  for (const log of postedLogs) {
    try {
      const { args } = decodeEventLog({
        abi: AgentAttestationAbi,
        eventName: "ClaimPosted",
        data: log.data,
        topics: log.topics,
      });
      const p = args as unknown as { claimId: string; tier: number };
      const key = p.claimId.toLowerCase();
      const atts = attsByClaim.get(key) ?? [];
      claims.push({
        claimId: decodeClaimId(p.claimId),
        claimIdHex: p.claimId,
        tier: Number(p.tier),
        claimType: null,
        asset: null,
        postTxHash: log.transactionHash,
        timestamp: log.blockNumber != null ? (tsByBlock.get(log.blockNumber) ?? null) : null,
        attestations: atts,
        decision: headlineDecision(atts),
        source: "chain" as const,
      });
    } catch {
      // skip undecodable log
    }
  }

  // Newest first; fall back to insertion order when timestamps are unknown.
  claims.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return { claims: claims.slice(0, limit), bounded };
}

// ---------------------------------------------------------------------------
// Enrichment + Neon fallback.
// ---------------------------------------------------------------------------

interface TraceMeta {
  claimType?: string;
  asset?: string;
}

// The live attestor trace records the measured quantity as a `metric` inside
// each reasoning step's observation (e.g. "annualized_yield_bps"), not as a
// top-level claimType. Map the metric onto a claim type label for the table.
const METRIC_TO_TYPE: Array<[RegExp, string]> = [
  [/yield/i, "YIELD_BPS"],
  [/nav|fair.?value|price/i, "FAIR_VALUE"],
];

function deriveTypeFromMetric(metric: unknown): string | undefined {
  if (typeof metric !== "string") return undefined;
  for (const [re, type] of METRIC_TO_TYPE) if (re.test(metric)) return type;
  return undefined;
}

/** Pull claimType/asset out of a stored trace JSON without dumping it on screen. */
function metaFromTrace(traceJson: string): TraceMeta {
  try {
    const t = JSON.parse(traceJson) as Record<string, unknown>;
    const claim = (t.claim ?? t) as Record<string, unknown>;
    let claimType =
      (claim.claimType as string) ?? (t.claimType as string) ?? (claim.type as string);
    let asset = (claim.asset as string) ?? (t.asset as string) ?? (claim.symbol as string);

    // Reasoning-trace format: claimType + asset live inside steps[].observation.
    if (!claimType || !asset) {
      const steps = Array.isArray(t.steps) ? (t.steps as Array<Record<string, unknown>>) : [];
      for (const s of steps) {
        const obs = s.observation as Record<string, unknown> | undefined;
        if (!obs) continue;
        if (!claimType) claimType = deriveTypeFromMetric(obs.metric);
        if (!asset && typeof obs.asset === "string") asset = obs.asset;
        if (claimType && asset) break;
      }
    }
    // Asset of last resort: claim ids are "{ASSET}-...".
    if (!asset && typeof t.claimId === "string") {
      const prefix = (t.claimId as string).split("-")[0];
      if (prefix) asset = prefix;
    }

    return {
      claimType: typeof claimType === "string" ? claimType : undefined,
      asset: typeof asset === "string" ? asset : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Enrich on-chain rows with stored-trace metadata (claim type, asset) when the
 * Neon store is configured. Best-effort; never throws.
 */
async function enrichWithStore(claims: ActivityClaim[]): Promise<void> {
  let db: typeof import("./db");
  try {
    db = await import("./db");
  } catch {
    return;
  }
  if (!db.dbEnabled()) return;
  await Promise.all(
    claims.map(async (claim) => {
      if (claim.attestations.length === 0) return;
      // Any one attestor's trace carries the claim metadata.
      for (const att of claim.attestations) {
        try {
          const raw = await db.getStoredTrace(claim.claimId, att.attestor);
          if (!raw) continue;
          const meta = metaFromTrace(raw);
          if (meta.claimType && !claim.claimType) claim.claimType = meta.claimType;
          if (meta.asset && !claim.asset) claim.asset = meta.asset;
          if (claim.claimType && claim.asset) break;
        } catch {
          // try the next attestor
        }
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Build the recent protocol-activity feed. Uncached: callers should wrap this
 * with getActivityFeed (activity-cache.ts) for the Redis/ISR layer.
 */
export async function buildActivityFeed(limit = 40): Promise<ActivityFeed> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Subgraph (scaling path).
  const sub = await fromSubgraph(limit);
  if (sub && sub.length > 0) {
    await enrichWithStore(sub);
    return { claims: sub, source: "subgraph", bounded: false, generatedAt: now };
  }

  // 2. On-chain getLogs (bounded recent range).
  const chain = await fromChain(limit);
  if (chain && chain.claims.length > 0) {
    await enrichWithStore(chain.claims);
    return { claims: chain.claims, source: "chain", bounded: chain.bounded, generatedAt: now };
  }

  // Reaching here means no rows from chain/subgraph. Return an empty (but valid)
  // feed; the Neon store holds traces keyed by claim+attestor but is not a
  // claim-ordered index, so it is enrichment only, not a primary recent feed.
  return {
    claims: [],
    source: chain ? "chain" : "empty",
    bounded: chain?.bounded ?? false,
    generatedAt: now,
  };
}
