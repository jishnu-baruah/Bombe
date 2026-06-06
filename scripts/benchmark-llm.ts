/**
 * scripts/benchmark-llm.ts — Real LLM benchmark against Ollama Cloud.
 *
 * Loads .env.local (never committed), wires LiveModelSeam (gpt-oss:20b via
 * https://ollama.com/v1), runs the ReAct loop for all 3 reference agents ×
 * 4 claims (A–D) and prints a results table.
 *
 * NOT in `pnpm run ci` — run manually via: pnpm run benchmark:llm
 *
 * Hardcoded rate (approximate gpt-oss:20b pricing, $0 for self-hosted):
 *   Using $0.0002 / 1K tokens in + $0.0006 / 1K tokens out as rough estimate.
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
    // Strip surrounding quotes if any
    out[key] =
      (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))
        ? val.slice(1, -1)
        : val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tool-deps / fixture helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_ROOT = path.join(REPO_ROOT, "fixtures");

// ---------------------------------------------------------------------------
// Expected outcomes matrix (PRD §6.7)
// ---------------------------------------------------------------------------

const EXPECTED: Record<string, Record<string, string>> = {
  reflector: { A: "VALID", B: "ABSTAIN", C: "REJECTED", D: "ABSTAIN" },
  rotor: { A: "VALID", B: "VALID", C: "REJECTED", D: "ABSTAIN" },
  stator: { A: "VALID", B: "ABSTAIN", C: "REJECTED", D: "ABSTAIN" },
};

// ---------------------------------------------------------------------------
// Cost estimate constants (rough; gpt-oss:20b self-hosted may be $0)
// ---------------------------------------------------------------------------

const COST_IN_PER_1K = 0.0002;
const COST_OUT_PER_1K = 0.0006;

function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1000) * COST_IN_PER_1K + (tokensOut / 1000) * COST_OUT_PER_1K;
}

// ---------------------------------------------------------------------------
// Single run result
// ---------------------------------------------------------------------------

interface RunResult {
  agent: string;
  claimId: string;
  decision: string;
  confidenceBps: number;
  rationaleSummary: string;
  steps: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  expected: string;
  match: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Run a single agent × claim with real LiveModelSeam
// ---------------------------------------------------------------------------

async function runBenchmarkCase(
  agentConfig: ReferenceAgentConfig,
  claim: Claim,
  seam: LiveModelSeam,
): Promise<RunResult> {
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

  // Wrap the seam to track token counts across all steps
  const trackingSeam: typeof seam = {
    async complete(req) {
      const resp = await seam.complete(req);
      totalTokensIn += resp.tokensIn;
      totalTokensOut += resp.tokensOut;
      return resp;
    },
  };

  let trace: Awaited<ReturnType<typeof runLoop>>;
  let errorMsg: string | undefined;

  try {
    trace = await runLoop({
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
  } catch (err) {
    const latencyMs = Date.now() - start;
    const expected = EXPECTED[agentConfig.agentId]?.[claim.id] ?? "?";
    return {
      agent: agentConfig.agentId,
      claimId: claim.id,
      decision: "ERROR",
      confidenceBps: 0,
      rationaleSummary: err instanceof Error ? err.message : String(err),
      steps: 0,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      latencyMs,
      costUsd: estimateCost(totalTokensIn, totalTokensOut),
      expected,
      match: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const latencyMs = Date.now() - start;
  const decision = trace.final.decision;
  const expected = EXPECTED[agentConfig.agentId]?.[claim.id] ?? "?";

  return {
    agent: agentConfig.agentId,
    claimId: claim.id,
    decision,
    confidenceBps: trace.final.confidenceBps,
    rationaleSummary: trace.final.rationaleSummary,
    steps: trace.steps.length,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    latencyMs,
    costUsd: estimateCost(totalTokensIn, totalTokensOut),
    expected,
    match: decision === expected,
    error: errorMsg,
  };
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function printTable(results: RunResult[]): void {
  const header =
    `${pad("AGENT", 10)} ${pad("CLAIM", 6)} ${pad("DECISION", 9)} ${pad("EXPECTED", 9)} ` +
    `${pad("MATCH", 6)} ${pad("LATENCY", 9)} ${pad("TOK_IN", 7)} ${pad("TOK_OUT", 8)} ` +
    `${pad("STEPS", 6)} ${pad("COST_USD", 9)} RATIONALE`;
  const sep = "-".repeat(130);

  console.log(sep);
  console.log(header);
  console.log(sep);

  for (const r of results) {
    const match = r.match ? " YES  " : " NO   ";
    const lat = `${r.latencyMs.toString()}ms`;
    const cost = `$${r.costUsd.toFixed(5)}`;
    const rationale = r.error ? `ERROR: ${r.error.slice(0, 60)}` : r.rationaleSummary.slice(0, 60);

    const line =
      `${pad(r.agent, 10)} ${pad(r.claimId, 6)} ${pad(r.decision, 9)} ${pad(r.expected, 9)} ` +
      `${pad(match, 6)} ${pad(lat, 9)} ${pad(r.tokensIn.toString(), 7)} ` +
      `${pad(r.tokensOut.toString(), 8)} ${pad(r.steps.toString(), 6)} ${pad(cost, 9)} ${rationale}`;
    console.log(line);
  }

  console.log(sep);

  // Summary stats
  const total = results.length;
  const matched = results.filter((r) => r.match).length;
  const errored = results.filter((r) => r.error !== undefined).length;
  const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, total);
  const totalTokensIn = results.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = results.reduce((s, r) => s + r.tokensOut, 0);
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);

  console.log("\nSUMMARY:");
  console.log(
    `  Match rate:      ${matched}/${total} (${((matched / Math.max(1, total)) * 100).toFixed(0)}%)`,
  );
  console.log(`  Errors:          ${errored}`);
  console.log(`  Avg latency:     ${avgLatency.toFixed(0)}ms`);
  console.log(`  Total tokens in: ${totalTokensIn}`);
  console.log(`  Total tokens out:${totalTokensOut}`);
  console.log(
    `  Total cost:      $${totalCost.toFixed(5)} (estimated at $${COST_IN_PER_1K}/1K in, $${COST_OUT_PER_1K}/1K out)`,
  );
  console.log(sep);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Bombe LLM Benchmark — Ollama Cloud (gpt-oss:20b) ===\n");

  // Load .env.local
  const env = loadEnvLocal();

  const baseUrl = env.AI_GATEWAY_BASE_URL ?? "https://ollama.com/v1";
  const apiKey = env.AI_GATEWAY_KEY;
  const rawModels = env.AI_GATEWAY_MODELS ?? "gpt-oss:20b";
  const modelName = rawModels.split(",")[0]?.trim() ?? "gpt-oss:20b";

  if (!apiKey) {
    throw new Error("AI_GATEWAY_KEY not found in .env.local");
  }

  console.log(`Base URL:  ${baseUrl}`);
  console.log(`Model:     ${modelName}`);
  console.log(`Key:       ${apiKey.slice(0, 8)}...${apiKey.slice(-4)} (redacted)`);
  console.log();

  const seam = new LiveModelSeam({ baseUrl, apiKey, modelName, timeoutMs: 60_000 });

  // Load claims
  const claimsRaw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_ROOT, "claims.json"), "utf8"),
  ) as Record<string, Claim>;

  const AGENTS: ReferenceAgentConfig[] = [REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG];
  const CLAIM_IDS: string[] = ["A", "B", "C", "D"];

  const results: RunResult[] = [];

  for (const agentConfig of AGENTS) {
    for (const claimId of CLAIM_IDS) {
      const claim = claimsRaw[claimId];
      if (claim === undefined) {
        console.error(`Claim ${claimId} not found in fixtures`);
        continue;
      }

      process.stdout.write(`Running ${agentConfig.agentId}/${claimId}...`);
      const r = await runBenchmarkCase(agentConfig, claim, seam);
      const matchStr = r.match ? "✓" : "✗";
      process.stdout.write(
        ` ${r.decision} (expected ${r.expected}) ${matchStr} ${r.latencyMs.toString()}ms\n`,
      );
      results.push(r);
    }
  }

  console.log("\n");
  printTable(results);
}

main().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
