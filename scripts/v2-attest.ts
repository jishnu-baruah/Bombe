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
 * LIVE mode is blocked on OP-8: it needs a POSTING_KEY (OPERATOR_ROLE, for
 * postClaim) and an ATTESTOR_KEY (for attest), set in .env.local. The deployer/
 * admin key must NEVER be used. Until those keys exist, live mode exits with an
 * OP-8 message rather than touching the deployer key or fabricating a result.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  InMemoryAttestationRepository,
  buildAndSubmitAttestation,
  computeDecisiveAttestation,
  createDataSource,
  createSeams,
} from "@bombe/agent-sdk";
import type { Claim } from "@bombe/shared";
import { hashCanonical } from "@bombe/shared";

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

// The claim we attest. assertedValueBps is in the source's annualized basis points.
// In mock mode the fixture mETH value is 34; assert 34 for a VALID demo.
const ASSERTED_VALUE_BPS = Number(process.env.ASSERTED_BPS ?? "34");
const REQUESTED_WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? "30");
const RECONCILE_TOLERANCE_BPS = 5;
const VERDICT_TOLERANCE_BPS = 5;

function buildClaim(claimId: string): Claim {
  return {
    id: claimId,
    tier: 1,
    asset: "mETH",
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

async function main(): Promise<void> {
  console.log("\n[v2-attest] === v2 decisive attestation (Gate 1a) ===");
  console.log(`[v2-attest] mode: ${MODE}`);

  if (MODE === "live") {
    const postingKey = ENV.POSTING_KEY;
    const attestorKey = ENV.ATTESTOR_KEY;
    if (!postingKey || !attestorKey) {
      console.error(
        "[v2-attest] OP-8 BLOCKED: live mode needs POSTING_KEY (OPERATOR_ROLE) and ATTESTOR_KEY in .env.local.",
      );
      console.error(
        "[v2-attest] The deployer/admin key must NOT be used. Run `MODE=mock pnpm v2:attest` to exercise the pipeline.",
      );
      process.exit(1);
    }
    // Live posting wiring (postClaim with POSTING_KEY, then attest with ATTESTOR_KEY
    // via a LiveWalletSeam) is enabled once OP-8 keys are confirmed. Not yet active.
    console.error(
      "[v2-attest] OP-8 keys present, but the live post path is not yet enabled in v2-attest. Aborting without posting.",
    );
    process.exit(1);
  }

  // Mock path: deterministic, no keys, no network.
  const seams = createSeams();
  const dataSource = createDataSource();
  const claimId = "METH-V2-MOCK";
  const claim = buildClaim(claimId);

  const { observation, decision, trace, sources } = await computeDecisiveAttestation(
    {
      claimId,
      asset: "mETH",
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
