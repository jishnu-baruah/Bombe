/**
 * scripts/v2-streak-run.ts — WS3-full daily streak entry. (BOMBE-V2-PRD WS3, D13, Q8)
 *
 * One unattended daily run: dedupe (fail-closed), then for each flagship asset
 * compute a decisive attestation and append a streak record (including the
 * windowDays and an honest config label). Every 7th run is a self-test that
 * asserts a deliberately wrong value, so the public record visibly contains a
 * REJECTED, not just a wall of VALID.
 *
 * MOCK (default) proves the flow with no keys and no network: it computes both
 * assets from fixtures and writes clearly-labeled mock streak rows (point
 * STREAK_FILE/STREAK_JSON/MARKER_FILE at temp paths to avoid touching the public
 * files). LIVE posting is gated on OP-8 (POSTING_KEY + ATTESTOR_KEY); the deployer
 * key is never used.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type DataAsset,
  MockDataSource,
  type StreakRecord,
  computeDecisiveAttestation,
  createSeams,
  decideRun,
  isSelfTestRun,
  streakJsonEntry,
  streakRowMarkdown,
  streakTableHeader,
} from "@bombe/agent-sdk";
import { hashCanonical } from "@bombe/shared";

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
const MODE = process.env.MODE === "live" ? "live" : "mock";
const TODAY = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);

const STREAK_MD = resolve(REPO_ROOT, process.env.STREAK_FILE ?? "docs/STREAK.md");
const STREAK_JSON = resolve(REPO_ROOT, process.env.STREAK_JSON ?? "docs/streak/streak.json");
const MARKER_FILE = resolve(REPO_ROOT, process.env.MARKER_FILE ?? "docs/streak/last-run.json");

const ASSETS: { asset: DataAsset; mockPeriod: string; fixtureBps: number }[] = [
  { asset: "mETH", mockPeriod: "30d-fresh", fixtureBps: 34 },
  { asset: "USDY", mockPeriod: "30d", fixtureBps: 525 },
];

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

async function main(): Promise<void> {
  console.log(`\n[v2-streak] === daily run ${TODAY} (mode: ${MODE}) ===`);

  // Live posting is gated on OP-8.
  if (MODE === "live" && (!ENV.POSTING_KEY || !ENV.ATTESTOR_KEY)) {
    console.error(
      "[v2-streak] OP-8 BLOCKED: live needs POSTING_KEY + ATTESTOR_KEY. The deployer key is never used.",
    );
    process.exit(1);
  }
  if (MODE === "live") {
    console.error(
      "[v2-streak] OP-8 keys present, but the live post path is not yet enabled. Aborting without posting.",
    );
    process.exit(1);
  }

  // 1. Dedupe (D13). The chain leg is a live concern (pending); the committed
  //    marker is the available leg in mock. Fail-closed if neither is reachable.
  const { marker, reachable: markerReachable } = readMarker();
  const decision = decideRun({
    today: TODAY,
    chainReachable: false,
    markerReachable,
    chainHasRunToday: false,
    committedMarkerDate: marker.lastRunDate,
  });
  console.log(
    `[v2-streak] dedupe -> ${decision} (marker lastRun=${marker.lastRunDate ?? "none"}, runCount=${marker.runCount})`,
  );
  if (decision !== "run") {
    console.log("[v2-streak] nothing to do today.");
    return;
  }

  const selfTest = isSelfTestRun(marker.runCount);
  if (selfTest)
    console.log(
      "[v2-streak] this is a SELF-TEST run (asserts a deliberately wrong value -> expect REJECTED).",
    );

  // 2. Compute a decisive attestation per asset.
  const seams = createSeams();
  const records: StreakRecord[] = [];
  for (const { asset, mockPeriod, fixtureBps } of ASSETS) {
    const assertedValueBps = selfTest ? fixtureBps + 1000 : fixtureBps;
    const dataSource = new MockDataSource({ period: mockPeriod });
    const {
      observation,
      decision: dec,
      trace,
    } = await computeDecisiveAttestation(
      {
        claimId: `${asset}-${TODAY}${selfTest ? "-selftest" : ""}`,
        asset,
        assertedValueBps,
        reconcileToleranceBps: 5,
        verdictToleranceBps: 5,
        requestedWindowDays: 30,
      },
      dataSource,
      seams.clock,
      "reflector",
    );
    records.push({
      date: TODAY,
      asset,
      decision: dec.verdict,
      txHash: "mock",
      reasoningHash: hashCanonical(trace),
      windowDays: observation.windowDays,
      configLabel: "single-model, mock",
      selfTest,
    });
    console.log(`[v2-streak]   ${asset}: ${dec.verdict}${selfTest ? " (self-test)" : ""}`);
  }

  // 3. Append to the streak surfaces.
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

  // 4. Update the marker.
  const next: Marker = { lastRunDate: TODAY, runCount: marker.runCount + 1 };
  ensureFile(MARKER_FILE, "{}");
  writeFileSync(MARKER_FILE, `${JSON.stringify(next, null, 2)}\n`);

  console.log(`[v2-streak] wrote ${records.length} streak rows; runCount -> ${next.runCount}.`);
  console.log("[v2-streak] === done ===\n");
}

main().catch((err: unknown) => {
  console.error("[v2-streak] FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
