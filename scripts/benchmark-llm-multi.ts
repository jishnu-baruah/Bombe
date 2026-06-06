/**
 * scripts/benchmark-llm-multi.ts — Multi-run LLM benchmark against Ollama Cloud.
 *
 * Runs N=3 passes per (agent × claim) to obtain a statistically meaningful match
 * rate rather than a single noisy sample.
 *
 * Per-cell report:
 *   - The 3 decisions
 *   - Modal decision (majority vote)
 *   - Match vs §6.7 expected
 *   - Mean latency, mean steps
 *   - Dominant failure reason (STEP_BUDGET / TOOL_FAILURE / BELOW_THRESHOLD / etc.)
 *
 * Summary:
 *   - Mean match rate ± stability (stable = all 3 runs agree; flaky = partial agreement)
 *   - BEFORE vs AFTER tuning comparison when run with --compare flag
 *
 * NOT in `pnpm run ci` — run manually via: pnpm run benchmark:llm:multi
 *
 * Tuning applied (T-017):
 *   1. Stator maxSteps 4→6  (agents.ts — cures STEP_BUDGET on claim C)
 *   2. Temperature 0.15      (LiveModelSeam constructor + seam.complete)
 *   3. Prompt BUDGET RULE    (loop.ts buildSystemPrompt — finalize-early nudge)
 *   4. Tool-failure 1-retry  (loop.ts — gives model one corrective turn)
 *
 * Expected §6.7 outcomes:
 *   A: all VALID
 *   B: Reflector ABSTAIN, Rotor VALID, Stator ABSTAIN
 *   C: all REJECTED
 *   D: all ABSTAIN (TIER3_OVERRIDE, never reaches model)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG } from "@bombe/agent-reference";
import type { ReferenceAgentConfig } from "@bombe/agent-reference";
import {
  CostBreaker,
  LiveClockSeam,
  LiveModelSeam,
  MockHistorySource,
  runLoop,
} from "@bombe/agent-sdk";
import { loadModelCosts } from "@bombe/shared";
import type { Claim } from "@bombe/shared";

// ---------------------------------------------------------------------------
// .env.local loader (manual parse — no dotenv prod dep)
// ---------------------------------------------------------------------------

function loadEnvLocal(): Record<string, string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const envPath = path.join(root, ".env.local");

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing .env.local at ${envPath}. Add AI_GATEWAY_BASE_URL and AI_GATEWAY_KEY.`,
    );
  }

  const out: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    out[key] =
      (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))
        ? val.slice(1, -1)
        : val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_ROOT = path.join(REPO_ROOT, "fixtures");

/** Number of independent runs per (agent, claim) cell. */
const N_RUNS = 3;

/** Temperature for steady tool-calling JSON (T-017 tuning). */
const TEMPERATURE = 0.15;

/** Expected outcomes matrix (PRD §6.7). */
const EXPECTED: Record<string, Record<string, string>> = {
  reflector: { A: "VALID", B: "ABSTAIN", C: "REJECTED", D: "ABSTAIN" },
  rotor: { A: "VALID", B: "VALID", C: "REJECTED", D: "ABSTAIN" },
  stator: { A: "VALID", B: "ABSTAIN", C: "REJECTED", D: "ABSTAIN" },
};

// ---------------------------------------------------------------------------
// Per-run result
// ---------------------------------------------------------------------------

interface SingleRunResult {
  decision: string;
  steps: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  /** Primary abstain/failure reason if decision === ABSTAIN, else "". */
  failureReason: string;
  error?: string;
}

interface CellResult {
  agent: string;
  claimId: string;
  expected: string;
  runs: SingleRunResult[];
  /** Modal (majority-vote) decision. */
  modal: string;
  /** True if modal decision matches expected. */
  match: boolean;
  /** "stable" = all runs agree; "flaky" = runs disagree. */
  stability: "stable" | "flaky";
  meanLatencyMs: number;
  meanSteps: number;
  /** Most frequent failure reason, or "" if no failures. */
  dominantFailureReason: string;
}

// ---------------------------------------------------------------------------
// Run helpers
// ---------------------------------------------------------------------------

/** Compute the modal value of a string array. Ties broken by first seen. */
function modal(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

/** Dominant value among non-empty strings. */
function dominant(values: string[]): string {
  const nonEmpty = values.filter((v) => v !== "");
  return nonEmpty.length > 0 ? modal(nonEmpty) : "";
}

async function runOnce(
  agentConfig: ReferenceAgentConfig,
  claim: Claim,
  seam: LiveModelSeam,
): Promise<SingleRunResult> {
  const start = Date.now();

  let costs: Record<string, { inputPer1k: number; outputPer1k: number }> = {};
  try {
    costs = loadModelCosts(FIXTURES_ROOT);
  } catch {
    costs = {};
  }

  const clock = new LiveClockSeam();
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  const trackingSeam: typeof seam = {
    async complete(req) {
      const resp = await seam.complete(req);
      totalTokensIn += resp.tokensIn;
      totalTokensOut += resp.tokensOut;
      return resp;
    },
  };

  try {
    const trace = await runLoop({
      agentId: agentConfig.agentId,
      claim,
      temperament: agentConfig.temperament,
      deps: {
        model: trackingSeam,
        clock,
        costBreaker: new CostBreaker({ maxUsd: 0.25, costs }),
        history: new MockHistorySource({}),
        toolDeps: {
          clock,
          historySource: new MockHistorySource({}),
          fixturesRoot: FIXTURES_ROOT,
        },
      },
    });

    const latencyMs = Date.now() - start;
    const failureReason = trace.final.decision === "ABSTAIN" ? (trace.final.reasons[0] ?? "") : "";

    return {
      decision: trace.final.decision,
      steps: trace.steps.length,
      latencyMs,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      failureReason,
    };
  } catch (err) {
    return {
      decision: "ERROR",
      steps: 0,
      latencyMs: Date.now() - start,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      failureReason: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runCell(
  agentConfig: ReferenceAgentConfig,
  claim: Claim,
  seam: LiveModelSeam,
): Promise<CellResult> {
  const expected = EXPECTED[agentConfig.agentId]?.[claim.id] ?? "?";
  const runs: SingleRunResult[] = [];

  for (let i = 0; i < N_RUNS; i++) {
    process.stdout.write(`  run ${(i + 1).toString()}/${N_RUNS.toString()}...`);
    const r = await runOnce(agentConfig, claim, seam);
    process.stdout.write(` ${r.decision} (${r.steps.toString()}s, ${r.latencyMs.toString()}ms)\n`);
    runs.push(r);
  }

  const decisions = runs.map((r) => r.decision);
  const modalDecision = modal(decisions);
  const allAgree = decisions.every((d) => d === decisions[0]);

  return {
    agent: agentConfig.agentId,
    claimId: claim.id,
    expected,
    runs,
    modal: modalDecision,
    match: modalDecision === expected,
    stability: allAgree ? "stable" : "flaky",
    meanLatencyMs: runs.reduce((s, r) => s + r.latencyMs, 0) / N_RUNS,
    meanSteps: runs.reduce((s, r) => s + r.steps, 0) / N_RUNS,
    dominantFailureReason: dominant(runs.map((r) => r.failureReason)),
  };
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function printResultsTable(cells: CellResult[]): void {
  const sep = "-".repeat(120);

  console.log(sep);
  console.log(
    `${pad("AGENT", 11)} ${pad("CLAIM", 6)} ${pad("MODAL", 9)} ${pad("EXP", 9)} ` +
      `${pad("MATCH", 6)} ${pad("STAB", 8)} ${pad("DECISIONS", 25)} ` +
      `${pad("AVG_LAT", 9)} ${pad("AVG_STEP", 9)} FAIL_REASON`,
  );
  console.log(sep);

  for (const c of cells) {
    const matchStr = c.match ? " YES  " : " NO   ";
    const stabStr = c.stability === "stable" ? "stable " : "FLAKY  ";
    const decisStr = c.runs.map((r) => r.decision.slice(0, 7)).join(",");
    const lat = `${c.meanLatencyMs.toFixed(0)}ms`;
    const steps = c.meanSteps.toFixed(1);

    console.log(
      `${pad(c.agent, 11)} ${pad(c.claimId, 6)} ${pad(c.modal, 9)} ${pad(c.expected, 9)} ` +
        `${pad(matchStr, 6)} ${pad(stabStr, 8)} ${pad(decisStr, 25)} ` +
        `${pad(lat, 9)} ${pad(steps, 9)} ${c.dominantFailureReason}`,
    );
  }

  console.log(sep);

  // Summary
  const total = cells.length;
  const matched = cells.filter((c) => c.match).length;
  const stable = cells.filter((c) => c.stability === "stable").length;
  const flaky = cells.filter((c) => c.stability === "flaky").length;
  const avgLat = cells.reduce((s, c) => s + c.meanLatencyMs, 0) / Math.max(1, total);
  const avgSteps = cells.reduce((s, c) => s + c.meanSteps, 0) / Math.max(1, total);

  console.log("\nSUMMARY:");
  console.log(
    `  Match rate:       ${matched.toString()}/${total.toString()} (${((matched / Math.max(1, total)) * 100).toFixed(0)}%) — based on modal decision across ${N_RUNS.toString()} runs`,
  );
  console.log(
    `  Stable cells:     ${stable.toString()}/${total.toString()} (all ${N_RUNS.toString()} runs agree)`,
  );
  console.log(`  Flaky cells:      ${flaky.toString()}/${total.toString()} (runs disagree)`);
  console.log(`  Avg latency/cell: ${avgLat.toFixed(0)}ms`);
  console.log(`  Avg steps/cell:   ${avgSteps.toFixed(1)}`);

  // Failure breakdown
  const failCounts = new Map<string, number>();
  for (const c of cells) {
    if (!c.match && c.dominantFailureReason) {
      failCounts.set(c.dominantFailureReason, (failCounts.get(c.dominantFailureReason) ?? 0) + 1);
    }
  }
  if (failCounts.size > 0) {
    console.log("  Failure reasons (mismatched cells):");
    for (const [reason, count] of [...failCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason}: ${count.toString()}`);
    }
  }

  console.log(sep);

  // Shippability verdict
  const matchPct = (matched / Math.max(1, total)) * 100;
  console.log("\nVERDICT:");
  if (matchPct >= 90) {
    console.log(
      `  SHIP-ON-FREE: ${matched.toString()}/${total.toString()} (${matchPct.toFixed(0)}%) — free model meets production bar.`,
    );
  } else if (matchPct >= 70) {
    console.log(
      `  CONDITIONAL: ${matched.toString()}/${total.toString()} (${matchPct.toFixed(0)}%) — acceptable for scripted demo (100% deterministic); live-LLM path has gaps.`,
    );
    console.log("  RECOMMENDATION: use free model for demo; paid model for production accuracy.");
  } else {
    console.log(
      `  PAID-NEEDED: ${matched.toString()}/${total.toString()} (${matchPct.toFixed(0)}%) — free model insufficient for reliable live attestation.`,
    );
    console.log(
      "  RECOMMENDATION: paid model (claude-sonnet, gpt-4o) likely adds 20-40% accuracy.",
    );
  }
  console.log(sep);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Bombe Multi-Run LLM Benchmark — Ollama Cloud (gpt-oss:20b) ===");
  console.log(`Runs per cell: N=${N_RUNS.toString()}, Temperature: ${TEMPERATURE.toString()}\n`);

  const env = loadEnvLocal();
  const baseUrl = env.AI_GATEWAY_BASE_URL ?? "https://ollama.com/v1";
  const apiKey = env.AI_GATEWAY_KEY;
  const rawModels = env.AI_GATEWAY_MODELS ?? "gpt-oss:20b";
  const modelName = rawModels.split(",")[0]?.trim() ?? "gpt-oss:20b";

  if (!apiKey) {
    throw new Error("AI_GATEWAY_KEY not found in .env.local");
  }

  // NEVER print the full key.
  console.log(`Base URL:    ${baseUrl}`);
  console.log(`Model:       ${modelName}`);
  console.log(`Key:         ${apiKey.slice(0, 8)}...[redacted]`);
  console.log(`Temperature: ${TEMPERATURE.toString()}`);
  console.log(
    "Tuning:      Stator maxSteps=6, temp=0.15, BUDGET_RULE prompt, tool-failure 1-retry",
  );
  console.log();

  const seam = new LiveModelSeam({
    baseUrl,
    apiKey,
    modelName,
    timeoutMs: 90_000,
    temperature: TEMPERATURE,
  });

  const claimsRaw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_ROOT, "claims.json"), "utf8"),
  ) as Record<string, Claim>;

  const AGENTS: ReferenceAgentConfig[] = [REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG];
  const CLAIM_IDS: string[] = ["A", "B", "C", "D"];

  const cells: CellResult[] = [];

  for (const agentConfig of AGENTS) {
    for (const claimId of CLAIM_IDS) {
      const claim = claimsRaw[claimId];
      if (claim === undefined) {
        console.error(`Claim ${claimId} not found`);
        continue;
      }

      console.log(
        `--- ${agentConfig.agentId.toUpperCase()}/${claimId} (expected: ${EXPECTED[agentConfig.agentId]?.[claimId] ?? "?"}) ---`,
      );
      const cell = await runCell(agentConfig, claim, seam);
      cells.push(cell);
      const resultStr = cell.match ? "MATCH" : `MISS (modal=${cell.modal})`;
      console.log(`  => ${resultStr} | stability=${cell.stability}\n`);
    }
  }

  console.log("\n");
  printResultsTable(cells);
}

main().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
