/**
 * scripts/v2-attest.ts — v2 Gate-1a decisive attestation. (BOMBE-V2-PRD WS1)
 *
 * Uses the deterministic decisive path: fetch a live observation, cross-check the
 * legs, and compute the verdict with the reconciler (NOT a model, per D11). Then
 * build and submit the attestation.
 *
 * RUN IT IN MOCK to prove the whole pipeline end-to-end with no keys and no
 * network:
 *     MODE=mock pnpm v2:attest
 * It reads the mETH fixture, computes a deterministic VALID/REJECTED/ABSTAIN,
 * hashes the trace, submits via the mock wallet, and re-checks the hash.
 *
 * LIVE mode posts on-chain. Per explicit operator authorization, it uses the
 * deployer key to post the claim (it holds OPERATOR_ROLE) and a registered
 * attestor (AGENT_KEYS[0], Reflector) to attest. The decisive verdict is computed
 * over real DefiLlama data by the reconciler, then posted and verified on-chain:
 *     MODE=live ASSET=mETH pnpm v2:attest
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  InMemoryAttestationRepository,
  LiveDataSource,
  MockDataSource,
  buildAndSubmitAttestation,
  computeDecisiveAttestation,
  createSeams,
} from "@bombe/agent-sdk";
import type { DataAsset } from "@bombe/agent-sdk";
import type { Claim } from "@bombe/shared";
import { AgentAttestationAbi, hashCanonical } from "@bombe/shared";
import { http, createPublicClient, createWalletClient, encodeFunctionData, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

// ---------------------------------------------------------------------------
// .env.local (config boundary for this ops script)
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function loadDotEnv(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, "utf-8");
    const env: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t === "" || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const ENV = loadDotEnv(resolve(REPO_ROOT, ".env.local"));
const MODE = process.env.MODE === "live" ? "live" : "mock";

// Asset is selectable via ASSET (default mETH). In mock mode each asset reads its
// own fixture (mETH 30d-fresh = 34 bps, USDY 30d = 525 bps), so the default
// asserted value yields VALID. USDY is a labeled single source per D4a.
const ASSET: DataAsset = process.env.ASSET === "USDY" ? "USDY" : "mETH";
const ASSET_CONFIG: Record<
  DataAsset,
  { mockPeriod: string; defaultAssertedBps: number; claimId: string }
> = {
  mETH: { mockPeriod: "30d-fresh", defaultAssertedBps: 34, claimId: "METH-V2-MOCK" },
  USDY: { mockPeriod: "30d", defaultAssertedBps: 525, claimId: "USDY-V2-MOCK" },
};
const CFG = ASSET_CONFIG[ASSET];

const ASSERTED_VALUE_BPS = Number(process.env.ASSERTED_BPS ?? String(CFG.defaultAssertedBps));
const REQUESTED_WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? "30");
const RECONCILE_TOLERANCE_BPS = 5;
const VERDICT_TOLERANCE_BPS = 5;

function buildClaim(claimId: string): Claim {
  return {
    id: claimId,
    tier: 1,
    asset: ASSET,
    claimType: "YIELD_BPS",
    payload: {
      assertedValueBps: ASSERTED_VALUE_BPS,
      windowDays: REQUESTED_WINDOW_DAYS,
      metric: "annualized_yield_bps",
    },
    submitter: "0x000000000000000000000000000000000000dEaD",
    postedAt: 0,
  };
}

const CLAIM_FEE = parseEther("0.01");
const ATTEST_LOCK = parseEther("0.02");
const EXPLORER = "https://sepolia.mantlescan.xyz/tx";
const DECISION_ENUM: Record<"VALID" | "REJECTED" | "ABSTAIN", number> = {
  VALID: 0,
  REJECTED: 1,
  ABSTAIN: 2,
};

function toBytes32(s: string): `0x${string}` {
  const bytes = new TextEncoder().encode(s);
  const p = new Uint8Array(32);
  p.set(bytes.slice(0, 32));
  return `0x${Array.from(p)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Live on-chain capture. User-authorized key model: the deployer key posts the
 * claim (it holds OPERATOR_ROLE) and a registered attestor (AGENT_KEYS[0],
 * Reflector) submits attest(); the deployer is not a bonded attestor.
 */
async function runLive(): Promise<void> {
  const deployerKey = ENV.DEPLOYER_KEY as `0x${string}` | undefined;
  const attestorKey = (ENV.AGENT_KEYS ?? "").split(",")[0]?.trim() as `0x${string}` | undefined;
  const rpc = ENV.RPC_URL;
  const attAddr = ENV.ATTESTATION_ADDRESS as `0x${string}` | undefined;
  if (!deployerKey || !attestorKey || !rpc || !attAddr) {
    console.error(
      "[v2-attest] live needs DEPLOYER_KEY, AGENT_KEYS, RPC_URL, ATTESTATION_ADDRESS in .env.local.",
    );
    process.exit(1);
  }

  const chain = mantleSepoliaTestnet;
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const deployer = privateKeyToAccount(deployerKey);
  const attestor = privateKeyToAccount(attestorKey);
  const deployerWallet = createWalletClient({ account: deployer, chain, transport: http(rpc) });
  const attestorWallet = createWalletClient({ account: attestor, chain, transport: http(rpc) });

  console.log(`[v2-attest] asset=${ASSET} poster=${deployer.address} attestor=${attestor.address}`);
  const [depBal, attBal] = await Promise.all([
    pub.getBalance({ address: deployer.address }),
    pub.getBalance({ address: attestor.address }),
  ]);
  console.log(
    `[v2-attest] balances: poster=${depBal.toString()} wei, attestor=${attBal.toString()} wei`,
  );
  if (depBal < CLAIM_FEE * 3n) {
    console.error("[v2-attest] poster underfunded (need > 0.03 MNT).");
    process.exit(1);
  }
  if (attBal < ATTEST_LOCK * 2n) {
    console.error("[v2-attest] attestor underfunded (need > 0.04 MNT for ATTEST_LOCK + gas).");
    process.exit(1);
  }

  // 1. Decisive attestation over LIVE data.
  const ds = new LiveDataSource();
  const clock = { now: () => Date.now() };
  const probe = await ds.getYieldObservation(
    { asset: ASSET, requestedWindowDays: REQUESTED_WINDOW_DAYS },
    clock,
  );
  const observedBps = probe.legs[0]?.valueBps ?? 0;
  const assertedValueBps = process.env.ASSERTED_BPS
    ? Number(process.env.ASSERTED_BPS)
    : Math.round(observedBps);
  const claimId = `${ASSET}-V2-${Math.floor(Date.now() / 1000).toString()}`;
  const { observation, decision, trace, sources } = await computeDecisiveAttestation(
    {
      claimId,
      asset: ASSET,
      assertedValueBps,
      reconcileToleranceBps: 50,
      verdictToleranceBps: 50,
      requestedWindowDays: REQUESTED_WINDOW_DAYS,
    },
    ds,
    clock,
    "reflector",
  );
  console.log(
    `[v2-attest] observed=${observedBps.toFixed(2)} asserted=${assertedValueBps} -> ${decision.verdict} (window ${observation.windowDays.toString()}d)`,
  );

  // 2. Post the claim (deployer / OPERATOR_ROLE).
  const claimObj: Claim = {
    id: claimId,
    tier: 1,
    asset: ASSET,
    claimType: "YIELD_BPS",
    payload: {
      assertedValueBps,
      windowDays: observation.windowDays,
      metric: "annualized_yield_bps",
    },
    submitter: deployer.address,
    postedAt: Math.floor(Date.now() / 1000),
  };
  const claimHash = hashCanonical(claimObj);
  const claimURI = `https://bombe.example/claims/${claimId}`;
  console.log("[v2-attest] posting claim (0.01 MNT)...");
  const postTx = await deployerWallet.sendTransaction({
    account: deployer,
    to: attAddr,
    data: encodeFunctionData({
      abi: AgentAttestationAbi,
      functionName: "postClaim",
      args: [toBytes32(claimId), 1, claimHash, claimURI],
    }),
    value: CLAIM_FEE,
    chain,
  });
  const postRcpt = await pub.waitForTransactionReceipt({ hash: postTx });
  if (postRcpt.status !== "success") throw new Error(`postClaim reverted: ${postTx}`);
  console.log(`[v2-attest]   postClaim: ${EXPLORER}/${postTx}`);

  // 3. Attest (Reflector).
  const reasoningHash = hashCanonical(trace);
  const sorted = [...sources].sort((a, b) => {
    const n = a.name.localeCompare(b.name);
    return n !== 0 ? n : a.source.localeCompare(b.source);
  });
  const sourcesHash = hashCanonical(sorted);
  const lockValue = decision.verdict === "ABSTAIN" ? 0n : ATTEST_LOCK;
  const traceURI = `https://bombe.example/traces/${claimId}/reflector`;
  console.log(
    `[v2-attest] attesting ${decision.verdict} (${lockValue === 0n ? "0" : "0.02"} MNT)...`,
  );
  const attTx = await attestorWallet.sendTransaction({
    account: attestor,
    to: attAddr,
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
    value: lockValue,
    chain,
  });
  const attRcpt = await pub.waitForTransactionReceipt({ hash: attTx });
  if (attRcpt.status !== "success") throw new Error(`attest reverted: ${attTx}`);
  console.log(`[v2-attest]   attest: ${EXPLORER}/${attTx}`);

  // 4. Verify on-chain reasoningHash (retry for state propagation lag).
  let onchain: { reasoningHash: `0x${string}`; exists: boolean } = {
    reasoningHash: "0x",
    exists: false,
  };
  for (let i = 1; i <= 6; i++) {
    if (i > 1) await new Promise<void>((r) => setTimeout(r, 3_000));
    onchain = (await pub.readContract({
      address: attAddr,
      abi: AgentAttestationAbi,
      functionName: "getAttestation",
      args: [toBytes32(claimId), attestor.address],
    })) as { reasoningHash: `0x${string}`; exists: boolean };
    if (onchain.exists) break;
  }
  const match = onchain.reasoningHash.toLowerCase() === reasoningHash.toLowerCase();

  console.log("\n[v2-attest] ===== LIVE RESULT =====");
  console.log(`  claimId:        ${claimId}`);
  console.log(`  decision:       ${decision.verdict}`);
  console.log(
    `  observed/asserted: ${observedBps.toFixed(2)} / ${assertedValueBps} bps (window ${observation.windowDays.toString()}d)`,
  );
  console.log(`  postClaim tx:   ${EXPLORER}/${postTx}`);
  console.log(`  attest tx:      ${EXPLORER}/${attTx}`);
  console.log(`  reasoningHash:  ${reasoningHash}`);
  console.log(
    `  on-chain reasoningHash == local hashCanonical(trace): ${match ? "MATCH" : "MISMATCH"}`,
  );
  console.log(`  source label:   ${observation.independenceLabel}`);
  console.log("[v2-attest] ========================\n");
  if (!match) throw new Error("reasoningHash MISMATCH");
}

async function main(): Promise<void> {
  console.log("\n[v2-attest] === v2 decisive attestation (Gate 1a) ===");
  console.log(`[v2-attest] mode: ${MODE}`);

  if (MODE === "live") {
    await runLive();
    return;
  }

  // Mock path: deterministic, no keys, no network.
  const seams = createSeams();
  const dataSource = new MockDataSource({ period: CFG.mockPeriod });
  const claimId = CFG.claimId;
  const claim = buildClaim(claimId);

  console.log(`[v2-attest] asset: ${ASSET}  asserted: ${ASSERTED_VALUE_BPS} bps`);

  const { observation, decision, trace, sources } = await computeDecisiveAttestation(
    {
      claimId,
      asset: ASSET,
      assertedValueBps: ASSERTED_VALUE_BPS,
      reconcileToleranceBps: RECONCILE_TOLERANCE_BPS,
      verdictToleranceBps: VERDICT_TOLERANCE_BPS,
      requestedWindowDays: REQUESTED_WINDOW_DAYS,
    },
    dataSource,
    seams.clock,
    "reflector",
  );

  console.log(`[v2-attest] source label: ${observation.independenceLabel}`);
  console.log(
    `[v2-attest] legs: ${observation.legs.map((l) => `${l.name}=${l.valueBps}bps@${l.windowDays}d`).join(", ")}`,
  );
  console.log(
    `[v2-attest] reconciled=${decision.reconcile.reconciledValue ?? "null"} spread=${decision.reconcile.spreadBps.toFixed(2)}bps`,
  );

  const repo = new InMemoryAttestationRepository();
  const { payload, receipt } = await buildAndSubmitAttestation({
    agentId: "reflector",
    agentAddr: seams.wallet.address(),
    isHuman: false,
    claim,
    trace,
    sources,
    costUsd: 0,
    postedAtMs: seams.clock.now(),
    attestationAddress: (ENV.ATTESTATION_ADDRESS as `0x${string}`) ?? undefined,
    deps: { wallet: seams.wallet, blob: seams.blob, clock: seams.clock, repo },
  });

  const recomputed = hashCanonical(trace);
  const match = recomputed === payload.reasoningHash ? "MATCH" : "MISMATCH";

  console.log("\n[v2-attest] ===== RESULT =====");
  console.log(`  decision:       ${payload.decision}`);
  console.log(`  windowDays:     ${observation.windowDays}`);
  console.log(`  reasoningHash:  ${payload.reasoningHash}`);
  console.log(`  recomputed:     ${recomputed}`);
  console.log(`  hash recompute: ${match}`);
  console.log(`  (mock) tx:      ${receipt.txHash}`);
  console.log(`  rationale:      ${trace.final.rationaleSummary}`);
  console.log("[v2-attest] ==================\n");

  if (match !== "MATCH") {
    throw new Error("reasoningHash recompute mismatch");
  }
}

main().catch((err: unknown) => {
  console.error("[v2-attest] FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
