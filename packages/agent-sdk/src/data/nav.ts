/**
 * data/nav.ts — NAV_PER_SHARE (current), on-chain ERC-4626 read. (ATTESTATION-SCHEMA D25.5 step 2)
 *
 * The one new check kind cleared to build now: it has zero dependency on the blocking
 * locks (D25.1 PRICE dual-source, D25.2 BACKING_RATIO attestor, D25.3 on-chain tier map).
 * It is Tier-1 and genuinely independent of any aggregator: read the vault's share price
 * straight off the chain (`convertToAssets(1e18)`, or `pricePerShare()`), and cross-check
 * the asserted NAV against it within tolerance. No archive RPC needed (current block only);
 * realized-yield-over-window is the archive-gated follow-up, deliberately not built here.
 *
 * Honesty: this attests the vault's on-chain share price, never the strategy quality.
 */

import { hashCanonical } from "@bombe/shared";
import { http, createPublicClient, parseAbi } from "viem";
import type { Source } from "../attest.js";
import type { Trace } from "../loop.js";
import type { ClockLike } from "./types.js";

/** A vault to read the share price from. */
export interface NavRef {
  chain: string;
  contract: string;
  label: string;
}

/** The on-chain read result: assets per 1.0 share, plus how it was read. */
export interface NavRead {
  assetsPerShare: number;
  method: "convertToAssets" | "pricePerShare";
  decimals: number;
  raw: string;
}

export interface NavDeps {
  /** Read the ERC-4626 share price on-chain. Injectable so tests never hit a node. */
  readErc4626: (chain: string, contract: string) => Promise<NavRead>;
}

const ERC4626_ABI = parseAbi([
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/** Public RPCs for current-block reads (no archive). Extend as needed. */
const RPCS: Record<string, string> = {
  ethereum: "https://eth.llamarpc.com",
  mantle: "https://rpc.mantle.xyz",
  "mantle sepolia": "https://rpc.sepolia.mantle.xyz",
  base: "https://mainnet.base.org",
  arbitrum: "https://arb1.arbitrum.io/rpc",
};

/** Default reader over viem: tries convertToAssets(1e18), falls back to pricePerShare(). */
export async function defaultReadErc4626(chain: string, contract: string): Promise<NavRead> {
  const rpc = RPCS[chain.toLowerCase()];
  if (!rpc) throw new Error(`no RPC configured for chain "${chain}"`);
  const client = createPublicClient({ transport: http(rpc) });
  const address = contract as `0x${string}`;
  let decimals = 18;
  try {
    decimals = Number(
      await client.readContract({ address, abi: ERC4626_ABI, functionName: "decimals" }),
    );
  } catch {
    // default 18
  }
  const scale = 10 ** decimals;
  try {
    const one = BigInt(Math.round(scale));
    const out = (await client.readContract({
      address,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [one],
    })) as bigint;
    return {
      assetsPerShare: Number(out) / scale,
      method: "convertToAssets",
      decimals,
      raw: out.toString(),
    };
  } catch {
    const out = (await client.readContract({
      address,
      abi: ERC4626_ABI,
      functionName: "pricePerShare",
    })) as bigint;
    return {
      assetsPerShare: Number(out) / scale,
      method: "pricePerShare",
      decimals,
      raw: out.toString(),
    };
  }
}

/** A NAV_PER_SHARE claim to decide. assertedNav is assets per 1.0 share. */
export interface NavClaimInput {
  claimId: string;
  asset: string;
  assertedNav: number;
  /** Max relative gap (percent) between the on-chain NAV and the asserted NAV. */
  tolerancePct: number;
  ref: NavRef;
}

export interface NavVerdict {
  verdict: "VALID" | "REJECTED" | "ABSTAIN";
  detail: string;
}

export interface NavResult {
  read: NavRead | null;
  verdict: NavVerdict;
  trace: Trace;
  sources: Source[];
}

/** Deterministic cross-check of the asserted NAV against the on-chain read. */
export function crossCheckNav(
  assertedNav: number,
  read: NavRead | null,
  tolerancePct: number,
  error?: string,
): NavVerdict {
  if (!read) {
    return {
      verdict: "ABSTAIN",
      detail: `Could not read the vault on-chain (${error ?? "no value"}); abstaining.`,
    };
  }
  if (read.assetsPerShare <= 0) {
    return { verdict: "ABSTAIN", detail: "On-chain share price is non-positive; abstaining." };
  }
  const gapPct = (Math.abs(assertedNav - read.assetsPerShare) / read.assetsPerShare) * 100;
  if (gapPct <= tolerancePct) {
    return {
      verdict: "VALID",
      detail: `Asserted NAV ${assertedNav} is within ${tolerancePct}% of the on-chain ${read.method} value ${read.assetsPerShare.toFixed(6)} (gap ${gapPct.toFixed(3)}%).`,
    };
  }
  return {
    verdict: "REJECTED",
    detail: `Asserted NAV ${assertedNav} differs from the on-chain value ${read.assetsPerShare.toFixed(6)} by ${gapPct.toFixed(3)}% (> ${tolerancePct}%).`,
  };
}

/**
 * computeNavAttestation — read the vault share price on-chain, cross-check the asserted
 * NAV, and package a hashable trace with a provenance DAG (vault -> read -> cross-check ->
 * verdict). Genuinely independent: the evidence is the chain itself, not an aggregator.
 */
export async function computeNavAttestation(
  input: NavClaimInput,
  deps: NavDeps,
  clock: ClockLike,
  agentId: string,
): Promise<NavResult> {
  let read: NavRead | null = null;
  let error: string | undefined;
  try {
    read = await deps.readErc4626(input.ref.chain, input.ref.contract);
  } catch (err) {
    error = (err as Error).message;
  }
  const verdict = crossCheckNav(input.assertedNav, read, input.tolerancePct, error);
  const confidence = verdict.verdict === "ABSTAIN" ? 0 : 10_000;

  const nodes: NonNullable<Trace["provenance"]>["nodes"] = [
    {
      id: "vault",
      type: "source",
      label: input.ref.label,
      ref: `${input.ref.chain}:${input.ref.contract}`,
      value: { chain: input.ref.chain, contract: input.ref.contract },
    },
  ];
  const edges: NonNullable<Trace["provenance"]>["edges"] = [];
  if (read) {
    nodes.push({
      id: "read",
      type: "evidence",
      label: `${read.assetsPerShare.toFixed(6)} assets/share (${read.method})`,
      value: {
        assetsPerShare: read.assetsPerShare,
        method: read.method,
        decimals: read.decimals,
        raw: read.raw,
      },
    });
    edges.push({ from: "vault", to: "read" }, { from: "read", to: "crosscheck" });
  } else {
    edges.push({ from: "vault", to: "crosscheck" });
  }
  nodes.push({
    id: "crosscheck",
    type: "reconcile",
    label: "deterministic NAV cross-check",
    value: { assertedNav: input.assertedNav, tolerancePct: input.tolerancePct },
  });
  nodes.push({
    id: "verdict",
    type: "verdict",
    label: verdict.verdict,
    value: { detail: verdict.detail },
  });
  edges.push({ from: "crosscheck", to: "verdict" });

  const reasons = ["ONCHAIN_NAV_CROSSCHECK"];
  if (read) reasons.push(`READ(${read.method})`);
  if (verdict.verdict === "ABSTAIN") reasons.push("VAULT_UNREADABLE");

  const trace: Trace = {
    traceVersion: "1.0",
    agentId,
    claimId: input.claimId,
    steps: [
      {
        step: 0,
        thought: `Read the ERC-4626 share price for ${input.ref.label} directly on ${input.ref.chain}.`,
        action: {
          tool: "readErc4626",
          input: { chain: input.ref.chain, contract: input.ref.contract },
        },
        observation: read
          ? { assetsPerShare: read.assetsPerShare, method: read.method, decimals: read.decimals }
          : { error: error ?? "read failed" },
        ts: clock.now(),
      },
      {
        step: 1,
        thought:
          "Cross-check the asserted NAV against the on-chain value within tolerance. Deterministic.",
        action: {
          crossCheck: { assertedNav: input.assertedNav, tolerancePct: input.tolerancePct },
        },
        observation: { verdict: verdict.verdict, detail: verdict.detail },
        ts: clock.now(),
      },
    ],
    final: {
      decision: verdict.verdict,
      confidenceBps: confidence,
      rationaleSummary: verdict.detail,
      reasons,
    },
    provenance: { nodes, edges },
  };

  const sources: Source[] = [
    {
      name: input.ref.label,
      value: { assetsPerShare: read?.assetsPerShare ?? null, method: read?.method ?? null },
      source: `${input.ref.chain}:${input.ref.contract}`,
      fetchedAt: clock.now(),
      confidence: read ? 10_000 : 0,
    },
  ];

  return { read, verdict, trace, sources };
}
