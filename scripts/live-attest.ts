/**
 * scripts/live-attest.ts — T-J03: Live on-chain AI attestation proof.
 *
 * Wired as `pnpm live:attest`.
 *
 * Flow:
 *   1. Load .env.local. Build viem clients for Mantle Sepolia.
 *   2. Operator posts a tier-1 YIELD_BPS mETH claim on live AgentAttestation.
 *   3. Run Reflector live with LiveModelSeam (real Ollama LLM).
 *   4. Submit the attestation on-chain via Reflector's wallet (AGENT_KEYS[0]).
 *   5. Verify: read back getAttestation(); assert reasoningHash matches local.
 *   6. Exit 0 on success.
 *
 * No process.env reads here — all via .env.local loaded at the top, then
 * injected into seams. (PRD §15.4 guardrail applies only to *packages*; this
 * is a one-off ops script that IS the config boundary.)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  http,
  type Chain,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

import { REFLECTOR_CONFIG } from "@bombe/agent-reference";
import {
  CostBreaker,
  LiveClockSeam,
  LiveModelSeam,
  MockHistorySource,
  runLoop,
} from "@bombe/agent-sdk";
import type { Trace } from "@bombe/agent-sdk";
import { AgentAttestationAbi, hashCanonical } from "@bombe/shared";

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(REPO_ROOT, ".env.local");

/** Parse KEY=VALUE lines from a .env file (no interpolation needed). */
function loadDotEnv(path: string): Record<string, string> {
  const text = readFileSync(path, "utf-8");
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    env[key] = val;
  }
  return env;
}

const ENV = loadDotEnv(ENV_PATH);

function requireEnv(key: string): string {
  const val = ENV[key];
  if (val === undefined || val === "") {
    throw new Error(`Missing required env var: ${key} (expected in .env.local)`);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Constants from .env.local
// ---------------------------------------------------------------------------

const RPC_URL = requireEnv("RPC_URL");
const DEPLOYER_KEY = requireEnv("DEPLOYER_KEY") as `0x${string}`;
const AGENT_KEYS_RAW = requireEnv("AGENT_KEYS").split(",");
const REFLECTOR_KEY = AGENT_KEYS_RAW[0] as `0x${string}`;
const AI_GATEWAY_BASE_URL = requireEnv("AI_GATEWAY_BASE_URL");
const AI_GATEWAY_KEY = requireEnv("AI_GATEWAY_KEY");
const AI_GATEWAY_MODELS = requireEnv("AI_GATEWAY_MODELS");
const ATTESTATION_ADDRESS = requireEnv("ATTESTATION_ADDRESS") as `0x${string}`;
const EXPLORER_BASE = "https://sepolia.mantlescan.xyz/tx";

const CLAIM_FEE = parseEther("0.01");
const ATTEST_LOCK = parseEther("0.02");

// ---------------------------------------------------------------------------
// Mantle Sepolia viem clients
// ---------------------------------------------------------------------------

const MANTLE_SEPOLIA: Chain = mantleSepoliaTestnet;

const publicClient: PublicClient = createPublicClient({
  chain: MANTLE_SEPOLIA,
  transport: http(RPC_URL),
});

function walletClientFor(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: MANTLE_SEPOLIA,
    transport: http(RPC_URL),
  });
  return { account, client };
}

// ---------------------------------------------------------------------------
// bytes32 helper (UTF-8 string → right-padded bytes32)
// ---------------------------------------------------------------------------

function toBytes32(str: string): `0x${string}` {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  return `0x${Array.from(padded)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

// ---------------------------------------------------------------------------
// Step 1: Operator posts claim on-chain
// ---------------------------------------------------------------------------

/**
 * Claim A definition: tier-1 YIELD_BPS mETH, same payload as the demo fixture.
 * We use a unique ID based on timestamp so re-runs don't hit ClaimExists.
 */
function buildClaimPayload(): {
  claimId: string;
  tier: number;
  claimHashBytes32: `0x${string}`;
  claimURI: string;
  payload: Record<string, unknown>;
} {
  // Use timestamp suffix to avoid ClaimExists on re-run.
  const ts = Math.floor(Date.now() / 1000);
  const claimId = `J03-YIELD-${ts.toString()}`;
  const payload: Record<string, unknown> = {
    id: claimId,
    tier: 1,
    asset: "mETH",
    claimType: "YIELD_BPS",
    payload: { period: "30d-fresh", expectedBps: 34 },
    submitter: "0x000000000000000000000000000000000000dEaD",
    postedAt: ts,
  };
  const claimHashBytes32 = hashCanonical(payload);
  const claimURI = `https://bombe.example/claims/${claimId}`;
  return { claimId, tier: 1, claimHashBytes32, claimURI, payload };
}

async function postClaimOnChain(
  claimId: string,
  tier: number,
  claimHashBytes32: `0x${string}`,
  claimURI: string,
): Promise<`0x${string}`> {
  const { account, client } = walletClientFor(DEPLOYER_KEY);
  const data = encodeFunctionData({
    abi: AgentAttestationAbi,
    functionName: "postClaim",
    args: [toBytes32(claimId), tier, claimHashBytes32, claimURI],
  });
  console.log(`[live-attest] Posting claim ${claimId} on-chain (value = 0.01 MNT)...`);
  const txHash = await client.sendTransaction({
    account,
    to: ATTESTATION_ADDRESS,
    data,
    value: CLAIM_FEE,
    chain: MANTLE_SEPOLIA,
  });
  console.log(`[live-attest]   postClaim tx submitted: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`postClaim reverted — tx ${txHash}`);
  }
  console.log(`[live-attest]   postClaim confirmed. Block: ${receipt.blockNumber.toString()}`);
  return txHash;
}

// ---------------------------------------------------------------------------
// Step 2: Run Reflector with live LLM
// ---------------------------------------------------------------------------

async function runReflectorLive(
  claimId: string,
  payload: Record<string, unknown>,
  postedAt: number,
): Promise<{ trace: Trace; latencyMs: number; tokensIn: number; tokensOut: number }> {
  const modelName = AI_GATEWAY_MODELS.split(",")[0]?.trim() ?? "gpt-oss:20b";
  const liveModel = new LiveModelSeam({
    baseUrl: AI_GATEWAY_BASE_URL,
    apiKey: AI_GATEWAY_KEY,
    modelName,
    temperature: 0.15,
  });

  const claim = {
    id: claimId,
    tier: 1 as const,
    asset: "mETH" as const,
    claimType: "YIELD_BPS" as const,
    payload,
    submitter: "0x000000000000000000000000000000000000dEaD",
    postedAt,
  };

  const clock = new LiveClockSeam();
  const costs: Record<string, { inputPer1k: number; outputPer1k: number }> = {};
  const costBreaker = new CostBreaker({ maxUsd: 0.05, costs });
  const history = new MockHistorySource({});

  const toolDeps = {
    clock,
    historySource: history,
  };

  // Track token usage via a wrapping model seam.
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const trackingModel = {
    async complete(req: Parameters<typeof liveModel.complete>[0]) {
      const resp = await liveModel.complete(req);
      totalTokensIn += resp.tokensIn;
      totalTokensOut += resp.tokensOut;
      return resp;
    },
  };

  console.log(`[live-attest] Running Reflector with live LLM (${modelName})...`);
  const start = Date.now();

  const trace = await runLoop({
    agentId: REFLECTOR_CONFIG.agentId,
    claim,
    temperament: REFLECTOR_CONFIG.temperament,
    deps: {
      model: trackingModel,
      clock,
      costBreaker,
      history,
      toolDeps,
    },
  });

  const latencyMs = Date.now() - start;

  console.log(
    `[live-attest]   LLM decision: ${trace.final.decision}  ` +
      `confidence: ${trace.final.confidenceBps.toString()} bps  ` +
      `steps: ${trace.steps.length.toString()}  ` +
      `latency: ${latencyMs.toString()}ms  ` +
      `tokens: ${totalTokensIn.toString()} in / ${totalTokensOut.toString()} out`,
  );
  console.log(`[live-attest]   Rationale: ${trace.final.rationaleSummary}`);

  return { trace, latencyMs, tokensIn: totalTokensIn, tokensOut: totalTokensOut };
}

// ---------------------------------------------------------------------------
// Step 3: Submit attestation on-chain as Reflector
// ---------------------------------------------------------------------------

async function submitAttestationOnChain(
  claimId: string,
  trace: Trace,
): Promise<{
  txHash: `0x${string}`;
  reasoningHashLocal: `0x${string}`;
  sourcesHashLocal: `0x${string}`;
}> {
  const { account, client } = walletClientFor(REFLECTOR_KEY);
  const reflectorAddr = account.address;

  // Compute hashes.
  const reasoningHashLocal: `0x${string}` = hashCanonical(trace);

  // Build sources from trace observations.
  const sources: Array<{
    name: string;
    value: unknown;
    source: string;
    fetchedAt: number;
    confidence: number;
  }> = [];
  for (const step of trace.steps) {
    const obs = step.observation;
    if (obs !== null && obs !== undefined && typeof obs === "object" && "source" in obs) {
      const o = obs as Record<string, unknown>;
      sources.push({
        name: String(o.source ?? "unknown"),
        value: o.value ?? null,
        source: String(o.source ?? "unknown"),
        fetchedAt: typeof o.fetchedAt === "number" ? o.fetchedAt : Date.now(),
        confidence: typeof o.confidence === "number" ? o.confidence : 5000,
      });
    }
  }
  if (sources.length === 0) {
    sources.push({
      name: "live-run",
      value: null,
      source: `live:reflector/${claimId}`,
      fetchedAt: Date.now(),
      confidence: trace.final.confidenceBps,
    });
  }
  const sortedSources = [...sources].sort((a, b) => {
    const n = a.name.localeCompare(b.name);
    return n !== 0 ? n : a.source.localeCompare(b.source);
  });
  const sourcesHashLocal: `0x${string}` = hashCanonical(sortedSources);

  const DECISION_ENUM: Record<"VALID" | "REJECTED" | "ABSTAIN", number> = {
    VALID: 0,
    REJECTED: 1,
    ABSTAIN: 2,
  };
  const decisionNum = DECISION_ENUM[trace.final.decision];
  const value = trace.final.decision === "ABSTAIN" ? 0n : ATTEST_LOCK;

  const traceURI = `https://bombe.example/traces/${claimId}/reflector`;

  const data = encodeFunctionData({
    abi: AgentAttestationAbi,
    functionName: "attest",
    args: [
      toBytes32(claimId),
      decisionNum,
      trace.final.confidenceBps,
      sourcesHashLocal,
      reasoningHashLocal,
      traceURI,
    ],
  });

  const valueLabel = trace.final.decision === "ABSTAIN" ? "0" : "0.02";
  console.log(
    `[live-attest] Submitting attestation on-chain as Reflector (${reflectorAddr}, value = ${valueLabel} MNT)...`,
  );

  const txHash = await client.sendTransaction({
    account,
    to: ATTESTATION_ADDRESS,
    data,
    value,
    chain: MANTLE_SEPOLIA,
  });

  console.log(`[live-attest]   attest tx submitted: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`attest() reverted — tx ${txHash}`);
  }
  console.log(`[live-attest]   attest confirmed. Block: ${receipt.blockNumber.toString()}`);

  return { txHash, reasoningHashLocal, sourcesHashLocal };
}

// ---------------------------------------------------------------------------
// Step 4: Verify on-chain
// ---------------------------------------------------------------------------

async function verifyOnChain(
  claimId: string,
  reflectorAddr: `0x${string}`,
  reasoningHashLocal: `0x${string}`,
  decision: "VALID" | "REJECTED" | "ABSTAIN",
): Promise<void> {
  console.log("[live-attest] Verifying on-chain state...");

  // Retry up to 5 times with 3s backoff to handle RPC propagation lag.
  let attestation: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (attempt > 1) {
      console.log(
        `[live-attest]   (retry ${attempt.toString()}/5 — waiting 3s for state propagation)`,
      );
      await new Promise<void>((r) => setTimeout(r, 3_000));
    }
    attestation = await publicClient.readContract({
      address: ATTESTATION_ADDRESS,
      abi: AgentAttestationAbi,
      functionName: "getAttestation",
      args: [toBytes32(claimId), reflectorAddr],
    });
    const a = attestation as { exists: boolean };
    if (a.exists) break;
  }

  // getAttestation returns a struct; viem returns it as an object.
  const att = attestation as {
    exists: boolean;
    decision: number;
    confidenceBps: number;
    sourcesHash: `0x${string}`;
    reasoningHash: `0x${string}`;
    traceURI: string;
    lockedStake: bigint;
  };

  if (!att.exists) {
    throw new Error("Attestation not found on-chain after submission");
  }

  const DECISION_NAMES: Record<number, string> = { 0: "VALID", 1: "REJECTED", 2: "ABSTAIN" };
  const onChainDecision = DECISION_NAMES[att.decision] ?? `UNKNOWN(${att.decision.toString()})`;
  const hashMatch =
    att.reasoningHash.toLowerCase() === reasoningHashLocal.toLowerCase() ? "MATCH" : "MISMATCH";

  console.log(`[live-attest]   on-chain decision:      ${onChainDecision}`);
  console.log(`[live-attest]   on-chain reasoningHash: ${att.reasoningHash}`);
  console.log(`[live-attest]   local  reasoningHash:   ${reasoningHashLocal}`);
  console.log(`[live-attest]   on-chain reasoningHash == local hashCanonical(trace): ${hashMatch}`);
  console.log(`[live-attest]   on-chain confidenceBps: ${att.confidenceBps.toString()}`);
  console.log(`[live-attest]   lockedStake:            ${att.lockedStake.toString()} wei`);

  if (hashMatch !== "MATCH") {
    throw new Error(
      `reasoningHash MISMATCH: on-chain ${att.reasoningHash} !== local ${reasoningHashLocal}`,
    );
  }
  if (onChainDecision !== decision) {
    throw new Error(`decision MISMATCH: on-chain ${onChainDecision} !== local ${decision}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n[live-attest] === T-J03: Live Mantle Sepolia AI attestation ===\n");
  console.log("[live-attest] Chain:       Mantle Sepolia (5003)");
  console.log(`[live-attest] RPC:         ${RPC_URL}`);
  console.log(`[live-attest] Attestation: ${ATTESTATION_ADDRESS}`);

  // Step 1: Post claim.
  const { claimId, tier, claimHashBytes32, claimURI, payload } = buildClaimPayload();
  const postClaimTxHash = await postClaimOnChain(claimId, tier, claimHashBytes32, claimURI);
  const postedAt = Math.floor(Date.now() / 1000);

  // Step 2: Run Reflector live.
  const { trace, latencyMs, tokensIn, tokensOut } = await runReflectorLive(
    claimId,
    payload,
    postedAt,
  );

  // Step 3: Submit attestation.
  const reflectorAccount = privateKeyToAccount(REFLECTOR_KEY);
  const reflectorAddr = reflectorAccount.address;
  const { txHash: attestTxHash, reasoningHashLocal } = await submitAttestationOnChain(
    claimId,
    trace,
  );

  // Step 4: Verify.
  await verifyOnChain(claimId, reflectorAddr, reasoningHashLocal, trace.final.decision);

  // ---------------------------------------------------------------------------
  // Final summary
  // ---------------------------------------------------------------------------
  console.log("\n[live-attest] ===== T-J03 LIVE ATTEST SUMMARY =====");
  console.log(`  Claim ID:        ${claimId}`);
  console.log(`  postClaim tx:    ${postClaimTxHash}`);
  console.log(`  postClaim link:  ${EXPLORER_BASE}/${postClaimTxHash}`);
  console.log(`  LLM decision:    ${trace.final.decision}`);
  console.log(`  Confidence:      ${trace.final.confidenceBps.toString()} bps`);
  console.log(`  Latency:         ${latencyMs.toString()} ms`);
  console.log(`  Tokens:          ${tokensIn.toString()} in / ${tokensOut.toString()} out`);
  console.log(`  attest tx:       ${attestTxHash}`);
  console.log(`  attest link:     ${EXPLORER_BASE}/${attestTxHash}`);
  console.log(`  reasoningHash:   ${reasoningHashLocal}`);
  console.log("  on-chain reasoningHash == local hashCanonical(trace): MATCH");
  console.log("\n[live-attest] STATUS: DONE — live AI inference → on-chain attestation verified.");
  console.log("[live-attest] ============================================\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[live-attest] FATAL:", msg);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
