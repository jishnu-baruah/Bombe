/**
 * scripts/v2-streak-run.ts — daily streak run, mock or live. (BOMBE-V2-PRD WS3, D13, Q8)
 *
 * One unattended daily run: dedupe (fail-closed), then for each flagship asset
 * compute a decisive attestation and append a streak record. Every 7th run is a
 * self-test that asserts a deliberately wrong value, so the public record visibly
 * contains a REJECTED.
 *
 * MOCK (default): computes both assets from fixtures, writes mock-labeled rows,
 * no keys, no network. Point STREAK_FILE/STREAK_JSON/MARKER_FILE at temp paths to
 * avoid touching the public files.
 *
 * LIVE: posts on-chain. Keys come from CI env (GitHub secrets) first, then
 * .env.local. Per operator authorization the posting key may be the deployer key.
 * A low attestor balance pauses the run (never improvises funding).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type DataAsset,
  type DataSource,
  LiveDataSource,
  MockDataSource,
  type StreakRecord,
  computeDecisiveAttestation,
  decideRun,
  isSelfTestRun,
  streakJsonEntry,
  streakRowMarkdown,
  streakTableHeader,
} from "@bombe/agent-sdk";
import { AgentAttestationAbi, hashCanonical } from "@bombe/shared";
import { http, createPublicClient, createWalletClient, encodeFunctionData, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function loadDotEnv(path: string): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(path, "utf-8").split("\n")) {
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
/** CI env (GitHub secrets) wins; fall back to .env.local for local runs. */
function cfg(name: string): string | undefined {
  return process.env[name] ?? ENV[name];
}

const MODE = process.env.MODE === "live" ? "live" : "mock";
const IS_LIVE = MODE === "live";
const TODAY = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);

const STREAK_MD = resolve(REPO_ROOT, process.env.STREAK_FILE ?? "docs/STREAK.md");
const STREAK_JSON = resolve(REPO_ROOT, process.env.STREAK_JSON ?? "docs/streak/streak.json");
const MARKER_FILE = resolve(REPO_ROOT, process.env.MARKER_FILE ?? "docs/streak/last-run.json");

const ASSETS: { asset: DataAsset; mockPeriod: string; fixtureBps: number }[] = [
  { asset: "mETH", mockPeriod: "30d-fresh", fixtureBps: 34 },
  { asset: "USDY", mockPeriod: "30d", fixtureBps: 525 },
];

const CLAIM_FEE = parseEther("0.01");
const ATTEST_LOCK = parseEther("0.02");
const EXPLORER = "https://sepolia.mantlescan.xyz/tx";
const DECISION_ENUM: Record<"VALID" | "REJECTED" | "ABSTAIN", number> = {
  VALID: 0,
  REJECTED: 1,
  ABSTAIN: 2,
};

function toBytes32(s: string): `0x${string}` {
  const b = new TextEncoder().encode(s);
  const p = new Uint8Array(32);
  p.set(b.slice(0, 32));
  return `0x${Array.from(p)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}

interface Marker {
  lastRunDate: string | null;
  runCount: number;
}

function readMarker(): { marker: Marker; reachable: boolean } {
  try {
    if (!existsSync(MARKER_FILE))
      return { marker: { lastRunDate: null, runCount: 0 }, reachable: true };
    const m = JSON.parse(readFileSync(MARKER_FILE, "utf-8")) as Marker;
    return {
      marker: { lastRunDate: m.lastRunDate ?? null, runCount: m.runCount ?? 0 },
      reachable: true,
    };
  } catch {
    return { marker: { lastRunDate: null, runCount: 0 }, reachable: false };
  }
}

function ensureFile(path: string, initial: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, initial);
}

// Live on-chain clients, resolved once if live.
function liveClients() {
  const postingKey = (cfg("POSTING_KEY") ?? cfg("DEPLOYER_KEY")) as `0x${string}` | undefined;
  const attestorKey = (cfg("ATTESTOR_KEY") ?? (cfg("AGENT_KEYS") ?? "").split(",")[0]?.trim()) as
    | `0x${string}`
    | undefined;
  const rpc = cfg("RPC_URL");
  const attAddr = cfg("ATTESTATION_ADDRESS") as `0x${string}` | undefined;
  if (!postingKey || !attestorKey || !rpc || !attAddr) {
    console.error(
      "[v2-streak] live needs POSTING_KEY/DEPLOYER_KEY, ATTESTOR_KEY/AGENT_KEYS, RPC_URL, ATTESTATION_ADDRESS.",
    );
    process.exit(1);
  }
  const chain = mantleSepoliaTestnet;
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const poster = privateKeyToAccount(postingKey);
  const attestor = privateKeyToAccount(attestorKey);
  return {
    chain,
    pub,
    poster,
    attestor,
    attAddr,
    posterWallet: createWalletClient({ account: poster, chain, transport: http(rpc) }),
    attestorWallet: createWalletClient({ account: attestor, chain, transport: http(rpc) }),
  };
}

async function main(): Promise<void> {
  console.log(`\n[v2-streak] === daily run ${TODAY} (mode: ${MODE}) ===`);

  const live = IS_LIVE ? liveClients() : null;

  // 1. Dedupe (D13). LIVE: the on-chain history is the source of truth, so we read
  //    whether today's claim is already posted. MOCK: the committed marker. Either
  //    way, fail-closed if the source is unreachable.
  let chainReachable = false;
  let chainHasRunToday = false;
  let markerReachable = false;
  let committedMarkerDate: string | null = null;
  let runCount = 0;
  if (live) {
    try {
      const c = (await live.pub.readContract({
        address: live.attAddr,
        abi: AgentAttestationAbi,
        functionName: "getClaim",
        args: [toBytes32(`mETH-${TODAY}`)],
      })) as { posted: boolean };
      chainReachable = true;
      chainHasRunToday = c.posted;
    } catch {
      chainReachable = false;
    }
  } else {
    const m = readMarker();
    markerReachable = m.reachable;
    committedMarkerDate = m.marker.lastRunDate;
    runCount = m.marker.runCount;
  }
  const runDecision = decideRun({
    today: TODAY,
    chainReachable,
    markerReachable,
    chainHasRunToday,
    committedMarkerDate,
  });
  console.log(`[v2-streak] dedupe -> ${runDecision}`);
  if (runDecision !== "run") {
    console.log(
      "[v2-streak] already ran today, or source unreachable (fail-closed). Nothing to do.",
    );
    return;
  }

  // Self-test cadence (Q8): marker-driven in mock, date-derived in live (every 7th day).
  const selfTest = live
    ? Math.floor(Date.parse(TODAY) / 86_400_000) % 7 === 0
    : isSelfTestRun(runCount);
  if (selfTest)
    console.log("[v2-streak] SELF-TEST run (asserts a wrong value -> expect REJECTED).");

  if (live) {
    // Low-balance guard: pause rather than improvise funding (D13/constitution).
    const attBal = await live.pub.getBalance({ address: live.attestor.address });
    console.log(`[v2-streak] attestor ${live.attestor.address} balance ${attBal.toString()} wei`);
    if (attBal < ATTEST_LOCK * 2n * BigInt(ASSETS.length)) {
      console.error("::warning:: attestor balance low; pausing the streak. Top up and re-run.");
      process.exit(0);
    }
  }

  const records: StreakRecord[] = [];
  for (const { asset, mockPeriod, fixtureBps } of ASSETS) {
    const dataSource: DataSource = live
      ? new LiveDataSource()
      : new MockDataSource({ period: mockPeriod });
    const clock = { now: () => Date.now() };

    // asserted value: mock uses the fixture; live uses the observed value (so VALID),
    // and a self-test asserts a clearly-wrong value (so REJECTED).
    let assertedValueBps: number;
    if (live) {
      const probe = await dataSource.getYieldObservation({ asset, requestedWindowDays: 30 }, clock);
      const observed = probe.legs[0]?.valueBps ?? 0;
      assertedValueBps = selfTest ? Math.round(observed) + 1000 : Math.round(observed);
    } else {
      assertedValueBps = selfTest ? fixtureBps + 1000 : fixtureBps;
    }

    const claimId = `${asset}-${TODAY}${selfTest ? "-selftest" : ""}`;
    const { observation, decision, trace, sources } = await computeDecisiveAttestation(
      {
        claimId,
        asset,
        assertedValueBps,
        reconcileToleranceBps: 50,
        verdictToleranceBps: 50,
        requestedWindowDays: 30,
      },
      dataSource,
      clock,
      "reflector",
    );

    let txHash = "mock";
    if (live) {
      // post (poster / OPERATOR_ROLE) then attest (attestor).
      const claimHash = hashCanonical({
        id: claimId,
        tier: 1,
        asset,
        claimType: "YIELD_BPS",
        payload: { assertedValueBps, windowDays: observation.windowDays },
        submitter: live.poster.address,
        postedAt: 0,
      });
      const postTx = await live.posterWallet.sendTransaction({
        account: live.poster,
        to: live.attAddr,
        data: encodeFunctionData({
          abi: AgentAttestationAbi,
          functionName: "postClaim",
          args: [toBytes32(claimId), 1, claimHash, `https://bombe.example/claims/${claimId}`],
        }),
        value: CLAIM_FEE,
        chain: live.chain,
      });
      await live.pub.waitForTransactionReceipt({ hash: postTx });

      const sorted = [...sources].sort((a, b) => {
        const n = a.name.localeCompare(b.name);
        return n !== 0 ? n : a.source.localeCompare(b.source);
      });
      const lockValue = decision.verdict === "ABSTAIN" ? 0n : ATTEST_LOCK;
      const attTx = await live.attestorWallet.sendTransaction({
        account: live.attestor,
        to: live.attAddr,
        data: encodeFunctionData({
          abi: AgentAttestationAbi,
          functionName: "attest",
          args: [
            toBytes32(claimId),
            DECISION_ENUM[decision.verdict],
            trace.final.confidenceBps,
            hashCanonical(sorted),
            hashCanonical(trace),
            `https://bombe.example/traces/${claimId}/reflector`,
          ],
        }),
        value: lockValue,
        chain: live.chain,
      });
      await live.pub.waitForTransactionReceipt({ hash: attTx });
      txHash = attTx;
      console.log(`[v2-streak]   ${asset}: ${decision.verdict} ${EXPLORER}/${attTx}`);
    } else {
      console.log(`[v2-streak]   ${asset}: ${decision.verdict}${selfTest ? " (self-test)" : ""}`);
    }

    records.push({
      date: TODAY,
      asset,
      decision: decision.verdict,
      txHash,
      reasoningHash: hashCanonical(trace),
      windowDays: observation.windowDays,
      configLabel: live ? "single-model, live" : "single-model, mock",
      selfTest,
    });
  }

  if (live) {
    // The on-chain attestations ARE the streak (D13); nothing to persist to git.
    console.log(
      `[v2-streak] posted ${records.length.toString()} on-chain attestations for ${TODAY}.`,
    );
  } else {
    // Mock: write the local mirror + marker (used by the demo and the dedupe tests).
    ensureFile(
      STREAK_MD,
      `# Bombe attestation streak\n\nEvery run is listed, including abstains, self-test rejections, and failures. Mock rows are labeled and are never on-chain.\n\n${streakTableHeader()}\n`,
    );
    ensureFile(STREAK_JSON, "[]\n");

    const mdRows = `${records.map(streakRowMarkdown).join("\n")}\n`;
    writeFileSync(STREAK_MD, readFileSync(STREAK_MD, "utf-8").replace(/\n*$/, "\n") + mdRows);

    const existing = JSON.parse(readFileSync(STREAK_JSON, "utf-8")) as ReturnType<
      typeof streakJsonEntry
    >[];
    existing.push(...records.map(streakJsonEntry));
    writeFileSync(STREAK_JSON, `${JSON.stringify(existing, null, 2)}\n`);

    const next: Marker = { lastRunDate: TODAY, runCount: runCount + 1 };
    ensureFile(MARKER_FILE, "{}");
    writeFileSync(MARKER_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(
      `[v2-streak] wrote ${records.length.toString()} rows; runCount -> ${next.runCount.toString()}.`,
    );
  }
  console.log("[v2-streak] === done ===\n");
}

main().catch((err: unknown) => {
  console.error("[v2-streak] FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
