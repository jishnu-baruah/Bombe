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
  /** Extra attestor ids (rotor/stator) that also attested this claim, best-effort. */
  corroborators: string[];
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
  // The same deterministic reconciler, run once per attestor id. Each attestor
  // independently re-derives the verdict over live data (single-model triple-run
  // redundancy, not multi-model consensus): the verdict is always the reconciler's;
  // the agentId only labels whose run produced this trace.
  const runReconcile = (agentId: string) =>
    computeDecisiveAttestation(
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
      agentId,
      narrator ? { narrator, modelId } : undefined,
    );

  const reflectorRes = await runReconcile("reflector");
  const { observation, decision, trace, sources } = reflectorRes;

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
      args: [toBytes32(claimId), 1, claimHash, `${SITE}/api/v1/claims/${claimId}`],
    }),
    value: CLAIM_FEE,
    chain,
  });
  await pub.waitForTransactionReceipt({ hash: postTx });

  // 3. Attest. Reflector is the primary (required) attestor; rotor and stator, when
  //    their keys are present and funded, add corroborating attestations so a fresh
  //    claim carries the triple-run redundancy by default. This layer NEVER funds a
  //    key (the deployer/admin key is off-limits here): a missing or underfunded
  //    extra attestor is skipped, leaving the reflector attestation intact.
  const attestAndStore = async (
    account: ReturnType<typeof privateKeyToAccount>,
    res: Awaited<ReturnType<typeof runReconcile>>,
  ): Promise<string> => {
    const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
    const rHash = hashCanonical(res.trace);
    const sorted = [...res.sources].sort((a, b) => {
      const n = a.name.localeCompare(b.name);
      return n !== 0 ? n : a.source.localeCompare(b.source);
    });
    const sHash = hashCanonical(sorted);
    const lock = res.decision.verdict === "ABSTAIN" ? 0n : ATTEST_LOCK;
    const uri = `${SITE}/api/trace/${claimId}/${account.address.toLowerCase()}`;
    const tx = await wallet.sendTransaction({
      account,
      to: ATTESTATION_ADDRESS,
      data: encodeFunctionData({
        abi: AgentAttestationAbi,
        functionName: "attest",
        args: [
          toBytes32(claimId),
          DECISION_ENUM[res.decision.verdict],
          res.trace.final.confidenceBps,
          sHash,
          rHash,
          uri,
        ],
      }),
      value: lock,
      chain,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    await storeTrace(claimId, account.address, JSON.stringify(res.trace), rHash);
    return tx;
  };

  // Reflector attestation (required: this is the issuer's paid attestation).
  const reasoningHash = hashCanonical(trace);
  const attestTx = await attestAndStore(attestor, reflectorRes);

  // Corroborating attestors (best-effort). AGENT_KEYS is reflector,rotor,stator;
  // index 0 is the reflector primary above, so only rotor/stator run here. Each
  // re-runs the reconciler over fresh live data, so all three traces verify.
  const agentKeys = (process.env.AGENT_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extras: { id: string; key: string }[] = [];
  if (agentKeys[1]) extras.push({ id: "rotor", key: agentKeys[1] });
  if (agentKeys[2]) extras.push({ id: "stator", key: agentKeys[2] });
  const corroborators: string[] = [];
  for (const ex of extras) {
    try {
      const acct = privateKeyToAccount(ex.key as `0x${string}`);
      if (acct.address.toLowerCase() === attestor.address.toLowerCase()) continue;
      // Never fund here; skip an underfunded extra rather than touch a funding key.
      const bal = await pub.getBalance({ address: acct.address });
      if (bal < ATTEST_LOCK + parseEther("0.1")) continue;
      await attestAndStore(acct, await runReconcile(ex.id));
      corroborators.push(ex.id);
    } catch {
      // Best-effort: the reflector attestation already stands; an extra attestor
      // failing (RPC, balance, race) must not fail the issuer's paid request.
    }
  }

  return {
    claimId,
    decision: decision.verdict,
    reasoningHash,
    postTx,
    attestTx,
    corroborators,
  };
}
