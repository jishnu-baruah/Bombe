/**
 * fulfill.ts, the autonomous paid-attestation pipeline (T-612).
 *
 * Reuses the same deterministic path the streak/attest script uses: gather live
 * evidence (LiveDataSource), reconcile to a verdict (computeDecisiveAttestation,
 * no model), post the claim with the posting key, attest with the attestor key,
 * and store the trace so it is stranger-verifiable. Server-side only; runs only
 * when PAID_FLOW_LIVE=1 and both keys are configured.
 *
 * Tier-1 yield is deterministic, so no AI gateway is needed at this layer.
 */

import {
  LiveDataSource,
  ModelRouter,
  computeDecisiveAttestation,
  createLiveModelSeam,
} from "@bombe/agent-sdk";
import type { AssetSpec, DataAsset } from "@bombe/agent-sdk";
import { AgentAttestationAbi, type Claim, hashCanonical } from "@bombe/shared";
import { http, createPublicClient, createWalletClient, encodeFunctionData, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";
import { storeTrace } from "./db";
import { ATTESTATION_ADDRESS, toBytes32 } from "./public-api";

const RPC_URL = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const SITE = process.env.SITE_URL ?? "https://bombe-web.vercel.app";
const CLAIM_FEE = parseEther("0.01");
const ATTEST_LOCK = parseEther("0.02");
const DECISION_ENUM: Record<string, number> = { VALID: 0, REJECTED: 1, ABSTAIN: 2 };

/** True only when the operator has enabled live posting and both keys are set. */
export function paidFlowLive(): boolean {
  return (
    process.env.PAID_FLOW_LIVE === "1" &&
    Boolean(process.env.POSTING_KEY) &&
    Boolean(process.env.ATTESTOR_KEY)
  );
}

export interface FulfillResult {
  claimId: string;
  decision: string;
  reasoningHash: string;
  postTx: string;
  attestTx: string;
}

/**
 * Post + attest a supported-type yield claim on behalf of a paying issuer.
 * Deterministic verdict over YIELD_BPS for any featured asset, or any open AssetSpec
 * passed in (the asset registry + discovery are the extension points).
 */
export async function fulfillAttestation(params: {
  claimId: string;
  asset: DataAsset;
  assertedBps: number;
  windowDays: number;
  /** Open path: an issuer-specified/discovered source spec for a non-featured asset. */
  spec?: AssetSpec;
}): Promise<FulfillResult> {
  const { claimId, asset, assertedBps, windowDays, spec } = params;

  const posting = privateKeyToAccount(process.env.POSTING_KEY as `0x${string}`);
  const attestor = privateKeyToAccount(process.env.ATTESTOR_KEY as `0x${string}`);
  const chain = mantleSepoliaTestnet;
  const pub = createPublicClient({ chain, transport: http(RPC_URL) });
  const postWallet = createWalletClient({ account: posting, chain, transport: http(RPC_URL) });
  const attWallet = createWalletClient({ account: attestor, chain, transport: http(RPC_URL) });

  // 1. Deterministic verdict over live data, with a real guided-LLM train of
  //    thought when a gateway is configured (the verdict stays deterministic).
  //
  //    Narrator resilience: when NARRATOR_PRIMARY_* is set we run a fast primary
  //    provider (Mistral) with the AI_GATEWAY_* provider (Gemma via Ollama) as an
  //    automatic failover, wired through ModelRouter so any switch is recorded in
  //    the trace. With only AI_GATEWAY_* set, behaviour is unchanged (single seam).
  //    Two genuinely different confirmed providers; the verdict is still the
  //    deterministic reconciler, so this is resilience + latency, not "consensus".
  const ds = new LiveDataSource();
  const clock = { now: () => Date.now() };

  const primarySeam = process.env.NARRATOR_PRIMARY_KEY
    ? createLiveModelSeam({
        aiGatewayKey: process.env.NARRATOR_PRIMARY_KEY,
        aiGatewayBaseUrl: process.env.NARRATOR_PRIMARY_BASE_URL,
        aiGatewayModels: process.env.NARRATOR_PRIMARY_MODEL,
      })
    : undefined;
  const fallbackSeam = process.env.AI_GATEWAY_KEY
    ? createLiveModelSeam({
        aiGatewayKey: process.env.AI_GATEWAY_KEY,
        aiGatewayBaseUrl: process.env.AI_GATEWAY_BASE_URL,
        aiGatewayModels: process.env.AI_GATEWAY_MODELS,
      })
    : undefined;
  const fallbackModel = (process.env.AI_GATEWAY_MODELS ?? "").split(",")[0]?.trim() || "gemma3:12b";

  // Primary + fallback both present → ModelRouter (no mock fallback: if both live
  // providers fail, the narrate path falls back to a plain factual description,
  // never a fabricated template). Otherwise use whichever single seam exists.
  let narrator: ReturnType<typeof createLiveModelSeam> | ModelRouter | undefined;
  if (primarySeam && fallbackSeam) {
    narrator = new ModelRouter({ primary: primarySeam, fallback: fallbackSeam, fallbackModel });
  } else {
    narrator = primarySeam ?? fallbackSeam;
  }
  const modelId = primarySeam
    ? (process.env.NARRATOR_PRIMARY_MODEL ?? "mistral-small-latest").split(",")[0]?.trim() ||
      "mistral-small-latest"
    : fallbackModel;
  const { observation, decision, trace, sources } = await computeDecisiveAttestation(
    {
      claimId,
      asset,
      spec,
      assertedValueBps: assertedBps,
      reconcileToleranceBps: 50,
      verdictToleranceBps: 50,
      requestedWindowDays: windowDays,
    },
    ds,
    clock,
    "reflector",
    narrator ? { narrator, modelId } : undefined,
  );

  // 2. Post the claim (posting key, OPERATOR_ROLE).
  const claimObj: Claim = {
    id: claimId,
    // Featured symbols are in the taxonomy enum; open/discovered symbols are carried
    // verbatim (the deterministic verdict + trace, not the symbol string, are the safety).
    asset: asset as Claim["asset"],
    tier: 1,
    claimType: "YIELD_BPS",
    payload: {
      assertedValueBps: assertedBps,
      windowDays: observation.windowDays,
      metric: "annualized_yield_bps",
    },
    submitter: posting.address,
    postedAt: Math.floor(Date.now() / 1000),
  };
  const claimHash = hashCanonical(claimObj);
  const postTx = await postWallet.sendTransaction({
    account: posting,
    to: ATTESTATION_ADDRESS,
    data: encodeFunctionData({
      abi: AgentAttestationAbi,
      functionName: "postClaim",
      args: [toBytes32(claimId), 1, claimHash, `${SITE}/api/claim/${claimId}`],
    }),
    value: CLAIM_FEE,
    chain,
  });
  await pub.waitForTransactionReceipt({ hash: postTx });

  // 3. Attest (attestor key).
  const reasoningHash = hashCanonical(trace);
  const sorted = [...sources].sort((a, b) => {
    const n = a.name.localeCompare(b.name);
    return n !== 0 ? n : a.source.localeCompare(b.source);
  });
  const sourcesHash = hashCanonical(sorted);
  const lock = decision.verdict === "ABSTAIN" ? 0n : ATTEST_LOCK;
  const traceURI = `${SITE}/api/trace/${claimId}/${attestor.address.toLowerCase()}`;
  const attestTx = await attWallet.sendTransaction({
    account: attestor,
    to: ATTESTATION_ADDRESS,
    data: encodeFunctionData({
      abi: AgentAttestationAbi,
      functionName: "attest",
      args: [
        toBytes32(claimId),
        DECISION_ENUM[decision.verdict],
        trace.final.confidenceBps,
        sourcesHash,
        reasoningHash,
        traceURI,
      ],
    }),
    value: lock,
    chain,
  });
  await pub.waitForTransactionReceipt({ hash: attestTx });

  // 4. Store the trace so the attestation is stranger-verifiable.
  await storeTrace(claimId, attestor.address, JSON.stringify(trace), reasoningHash);

  return {
    claimId,
    decision: decision.verdict,
    reasoningHash,
    postTx,
    attestTx,
  };
}
