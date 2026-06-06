#!/usr/bin/env node
/**
 * T-703: scripts/test-demo.ts — Golden-path validator (PRD §15.2)
 *
 * Headless, deterministic, mock-mode (NO anvil, NO network, NO live LLM).
 * Boots the mock stack, advances claims A→D, asserts the exact §6.7 outcome
 * matrix, validates trace-hash stability, and writes .test-reports/demo.json.
 *
 * Exit codes:
 *   0 — all outcomes match + hash stable
 *   1 — one or more outcomes mismatch OR hash unstable
 *
 * Must complete in < 30 s. Prints elapsed time.
 *
 * §14.3 / §14.16 acceptance: `pnpm test:demo` is the "can we submit" oracle.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REFLECTOR_CONFIG,
  ROTOR_CONFIG,
  STATOR_CONFIG,
  ScriptedModelSeam,
  runReferenceAgent,
} from "@bombe/agent-reference";
import type { ModelScript } from "@bombe/agent-reference";
import type { ReplayDeps } from "@bombe/plugboard";
import {
  MockGatewayClient,
  MockRevertingWalletSeam,
  PlugboardTranscriptSchema,
  makeEpochSnapshot,
  replayTranscript,
  validateTranscriptHash,
} from "@bombe/plugboard";
import type { PlugboardTranscript } from "@bombe/plugboard";
import { ClaimSchema, hashCanonical, loadModelScript } from "@bombe/shared";
import type { Claim, TestReport } from "@bombe/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const REPORTS_DIR = resolve(ROOT, ".test-reports");
const FIXTURES_ROOT = resolve(ROOT, "fixtures");
const SKILL_CONTENT = "bombe-attestor epoch-0 skill (mock)";

// ---------------------------------------------------------------------------
// §6.7 expected decision matrix (exported for unit tests)
// ---------------------------------------------------------------------------

export interface ExpectedOutcome {
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  /** If set, at least one entry in trace.final.reasons must contain this string. */
  reasonContains?: string | undefined;
  /** For Plugboard only: expect blockedByProtocol === true in the replay result. */
  blockedByProtocol?: boolean | undefined;
}

export type AgentKey = "reflector" | "rotor" | "stator" | "plugboard";

/**
 * §6.7 expected outcome matrix.
 *
 * A: Tier 1 fresh — all SDK VALID + Plugboard VALID
 * B: Tier 1 stale — Reflector ABSTAIN(STALE_SINGLE_SOURCE), Rotor VALID,
 *    Stator ABSTAIN, Plugboard ABSTAIN
 * C: Tier 2 mismatch — all REJECTED
 * D: Tier 3 judgment — SDK all ABSTAIN(TIER3_OVERRIDE),
 *    Plugboard blockedByProtocol then ABSTAIN
 */
export const EXPECTED_MATRIX: Record<string, Record<AgentKey, ExpectedOutcome>> = {
  A: {
    reflector: { decision: "VALID" },
    rotor: { decision: "VALID" },
    stator: { decision: "VALID" },
    plugboard: { decision: "VALID" },
  },
  B: {
    reflector: { decision: "ABSTAIN", reasonContains: "STALE_SINGLE_SOURCE" },
    rotor: { decision: "VALID" },
    stator: { decision: "ABSTAIN" },
    plugboard: { decision: "ABSTAIN" },
  },
  C: {
    reflector: { decision: "REJECTED" },
    rotor: { decision: "REJECTED" },
    stator: { decision: "REJECTED" },
    plugboard: { decision: "REJECTED" },
  },
  D: {
    reflector: { decision: "ABSTAIN", reasonContains: "TIER3" },
    rotor: { decision: "ABSTAIN", reasonContains: "TIER3" },
    stator: { decision: "ABSTAIN", reasonContains: "TIER3" },
    plugboard: { decision: "ABSTAIN", blockedByProtocol: true },
  },
};

// ---------------------------------------------------------------------------
// Assertion logic (pure functions — exported for unit tests)
// ---------------------------------------------------------------------------

export interface ActualOutcome {
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  reasons?: string[] | undefined;
  blockedByProtocol?: boolean | undefined;
}

export interface AssertionResult {
  claimId: string;
  agentKey: AgentKey;
  expected: ExpectedOutcome;
  actual: ActualOutcome;
  pass: boolean;
  message: string;
}

/** Compare one agent's actual result against the expected outcome. */
export function assertOutcome(
  claimId: string,
  agentKey: AgentKey,
  expected: ExpectedOutcome,
  actual: ActualOutcome,
): AssertionResult {
  const messages: string[] = [];
  let pass = true;

  if (actual.decision !== expected.decision) {
    pass = false;
    messages.push(`decision: expected ${expected.decision}, got ${actual.decision}`);
  }

  if (expected.reasonContains !== undefined) {
    const reasons = actual.reasons ?? [];
    const found = reasons.some((r) => r.includes(expected.reasonContains as string));
    if (!found) {
      pass = false;
      messages.push(`reason "${expected.reasonContains}" not found in [${reasons.join(", ")}]`);
    }
  }

  if (expected.blockedByProtocol === true && actual.blockedByProtocol !== true) {
    pass = false;
    messages.push("expected blockedByProtocol=true, got false/undefined");
  }

  return {
    claimId,
    agentKey,
    expected,
    actual,
    pass,
    message: pass
      ? `PASS — ${agentKey}/${claimId} → ${actual.decision}`
      : `FAIL — ${agentKey}/${claimId}: ${messages.join("; ")}`,
  };
}

export interface ClaimResult {
  claimId: string;
  reflector: { decision: "VALID" | "REJECTED" | "ABSTAIN"; reasons: string[] };
  rotor: { decision: "VALID" | "REJECTED" | "ABSTAIN"; reasons: string[] };
  stator: { decision: "VALID" | "REJECTED" | "ABSTAIN"; reasons: string[] };
  plugboard: { decision: "VALID" | "REJECTED" | "ABSTAIN"; blockedByProtocol: boolean };
}

/** Assert the full §6.7 matrix against collected results. Returns all assertion results. */
export function assertMatrix(
  results: Record<string, ClaimResult>,
  expected: Record<string, Record<AgentKey, ExpectedOutcome>>,
): AssertionResult[] {
  const assertions: AssertionResult[] = [];

  for (const claimId of ["A", "B", "C", "D"]) {
    const result = results[claimId];
    const claimExpected = expected[claimId];

    if (result === undefined || claimExpected === undefined) {
      for (const agentKey of ["reflector", "rotor", "stator", "plugboard"] as AgentKey[]) {
        assertions.push({
          claimId,
          agentKey,
          expected: claimExpected?.[agentKey] ?? { decision: "ABSTAIN" },
          actual: { decision: "ABSTAIN" },
          pass: false,
          message: `FAIL — ${agentKey}/${claimId}: claim not run`,
        });
      }
      continue;
    }

    for (const agentKey of ["reflector", "rotor", "stator"] as const) {
      const exp = claimExpected[agentKey];
      const r = result[agentKey];
      if (exp === undefined) continue;
      assertions.push(
        assertOutcome(claimId, agentKey, exp, {
          decision: r.decision,
          reasons: r.reasons,
        }),
      );
    }

    const pbExp = claimExpected.plugboard;
    if (pbExp !== undefined) {
      assertions.push(
        assertOutcome(claimId, "plugboard", pbExp, {
          decision: result.plugboard.decision,
          blockedByProtocol: result.plugboard.blockedByProtocol,
        }),
      );
    }
  }

  return assertions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureReportsDir(): void {
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function getCurrentCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    return "unknown";
  }
}

function loadClaimsDirect(): Record<string, Claim> {
  const claimsPath = resolve(FIXTURES_ROOT, "claims.json");
  const raw = JSON.parse(readFileSync(claimsPath, "utf8")) as Record<string, unknown>;
  const result: Record<string, Claim> = {};
  for (const [id, entry] of Object.entries(raw)) {
    result[id] = ClaimSchema.parse(entry);
  }
  return result;
}

// ---------------------------------------------------------------------------
// SDK agent runner
// ---------------------------------------------------------------------------

type SdkDecision = "VALID" | "REJECTED" | "ABSTAIN";

async function runSdkAgents(claim: Claim): Promise<{
  reflector: { decision: SdkDecision; reasons: string[] };
  rotor: { decision: SdkDecision; reasons: string[] };
  stator: { decision: SdkDecision; reasons: string[] };
}> {
  const results: Partial<
    Record<"reflector" | "rotor" | "stator", { decision: SdkDecision; reasons: string[] }>
  > = {};

  for (const config of [REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG]) {
    const agentId = config.agentId as "reflector" | "rotor" | "stator";
    const rawScript = loadModelScript(agentId, claim.id, FIXTURES_ROOT) as ModelScript;
    const seam = new ScriptedModelSeam(rawScript, config.model);

    const trace = await runReferenceAgent({
      model: seam,
      claim,
      config,
      fixturesRoot: FIXTURES_ROOT,
      clockSeed: 0,
    });

    results[agentId] = {
      decision: trace.final.decision,
      reasons: trace.final.reasons,
    };
  }

  return results as {
    reflector: { decision: SdkDecision; reasons: string[] };
    rotor: { decision: SdkDecision; reasons: string[] };
    stator: { decision: SdkDecision; reasons: string[] };
  };
}

// ---------------------------------------------------------------------------
// Plugboard replay runner
// ---------------------------------------------------------------------------

async function runPlugboard(claim: Claim): Promise<{
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  blockedByProtocol: boolean;
}> {
  const rawTranscript = loadModelScript("plugboard", claim.id, FIXTURES_ROOT);
  const transcript = PlugboardTranscriptSchema.parse(rawTranscript) as PlugboardTranscript;

  // Validate stored hash integrity before replaying.
  validateTranscriptHash(transcript);

  const skillSnapshot = makeEpochSnapshot(0, SKILL_CONTENT);

  // Wallet configured to simulate the JudgmentTierRequiresAbstain revert for claim D.
  const wallet = new MockRevertingWalletSeam({ revertOn: "JudgmentTierRequiresAbstain" });
  const gateway = new MockGatewayClient();

  const deps: ReplayDeps = {
    gateway,
    wallet,
    skillSnapshot,
    hermesAvailable: false, // offline/replay mode — no live Hermes runtime
  };

  const result = await replayTranscript(transcript, deps);

  return {
    decision: result.finalDecision,
    blockedByProtocol: result.blockedByProtocol,
  };
}

// ---------------------------------------------------------------------------
// Hash stability check
// ---------------------------------------------------------------------------

export interface HashStabilityResult {
  pass: boolean;
  hash1: string;
  hash2: string;
  message: string;
}

/**
 * Run Reflector on claim B twice with identical inputs.
 * Both hashes must be identical (determinism contract, PRD §6.3 / M2 checkpoint).
 */
export async function checkHashStability(claimB: Claim): Promise<HashStabilityResult> {
  const runOnce = async (): Promise<string> => {
    const rawScript = loadModelScript("reflector", "B", FIXTURES_ROOT) as ModelScript;
    const seam = new ScriptedModelSeam(rawScript, REFLECTOR_CONFIG.model);
    const trace = await runReferenceAgent({
      model: seam,
      claim: claimB,
      config: REFLECTOR_CONFIG,
      fixturesRoot: FIXTURES_ROOT,
      clockSeed: 0,
    });
    return hashCanonical(trace);
  };

  const hash1 = await runOnce();
  const hash2 = await runOnce();
  const pass = hash1 === hash2;

  return {
    pass,
    hash1,
    hash2,
    message: pass
      ? `hash stable: ${hash1.slice(0, 18)}…`
      : `hash MISMATCH: run1=${hash1.slice(0, 18)}… run2=${hash2.slice(0, 18)}…`,
  };
}

// ---------------------------------------------------------------------------
// Matrix printer
// ---------------------------------------------------------------------------

function formatDecision(decision: string, reasons: string[] = [], blocked = false): string {
  let s = decision;
  const key = reasons.find(
    (r) =>
      r.includes("STALE_SINGLE_SOURCE") ||
      r.includes("TIER3") ||
      r.includes("STEP_BUDGET") ||
      r.includes("COST_CAPPED") ||
      r.includes("TOOL_FAILURE") ||
      r.includes("MODEL_ABSTAIN"),
  );
  if (key !== undefined) s += `(${key})`;
  if (blocked) s += "+BLOCKED";
  return s;
}

function printMatrix(results: Record<string, ClaimResult>): void {
  process.stdout.write("\n═══════════════ §6.7 OUTCOME MATRIX ═══════════════\n");
  const header = [
    "CLAIM".padEnd(6),
    "REFLECTOR".padEnd(30),
    "ROTOR".padEnd(18),
    "STATOR".padEnd(18),
    "PLUGBOARD",
  ].join(" ");
  process.stdout.write(`${header}\n`);
  process.stdout.write(`${"─".repeat(95)}\n`);

  for (const claimId of ["A", "B", "C", "D"]) {
    const r = results[claimId];
    if (r === undefined) continue;
    const row = [
      claimId.padEnd(6),
      formatDecision(r.reflector.decision, r.reflector.reasons).padEnd(30),
      formatDecision(r.rotor.decision, r.rotor.reasons).padEnd(18),
      formatDecision(r.stator.decision, r.stator.reasons).padEnd(18),
      formatDecision(r.plugboard.decision, [], r.plugboard.blockedByProtocol),
    ].join(" ");
    process.stdout.write(`${row}\n`);
  }

  process.stdout.write(`${"─".repeat(95)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startMs = Date.now();
  ensureReportsDir();

  const commit = getCurrentCommit();
  const timestamp = new Date().toISOString();

  process.stdout.write("pnpm test:demo — Bombe golden-path validator (PRD §15.2)\n");
  process.stdout.write(`commit: ${commit}  timestamp: ${timestamp}\n\n`);

  // Load all claims from fixtures/claims.json
  const claims = loadClaimsDirect();

  // Run all four claims concurrently where possible.
  // SDK agents and Plugboard for each claim can run in parallel.
  const claimResults: Record<string, ClaimResult> = {};

  for (const claimId of ["A", "B", "C", "D"]) {
    const claim = claims[claimId];
    if (claim === undefined) {
      throw new Error(`Claim ${claimId} not found in fixtures/claims.json`);
    }

    process.stdout.write(`  Running claim ${claimId} (${claim.claimType} tier=${claim.tier})…\n`);

    const [sdkResults, plugboardResult] = await Promise.all([
      runSdkAgents(claim),
      runPlugboard(claim),
    ]);

    claimResults[claimId] = {
      claimId,
      reflector: sdkResults.reflector,
      rotor: sdkResults.rotor,
      stator: sdkResults.stator,
      plugboard: plugboardResult,
    };
  }

  // Print the outcome matrix
  printMatrix(claimResults);

  // Assert the §6.7 matrix
  const assertions = assertMatrix(claimResults, EXPECTED_MATRIX);

  process.stdout.write("\n  Assertions:\n");
  let matrixAllPass = true;
  for (const a of assertions) {
    const icon = a.pass ? "✓" : "✗";
    process.stdout.write(`    ${icon} ${a.message}\n`);
    if (!a.pass) matrixAllPass = false;
  }

  // Check hash stability (Reflector/B determinism)
  process.stdout.write("\n  Hash stability (Reflector claim B × 2):\n");
  const hashResult = await checkHashStability(claims.B as Claim);
  const icon = hashResult.pass ? "✓" : "✗";
  process.stdout.write(`    ${icon} ${hashResult.message}\n`);

  // Timing check
  const elapsedMs = Date.now() - startMs;
  const elapsedS = (elapsedMs / 1000).toFixed(2);
  const timingPass = elapsedMs < 30_000;

  process.stdout.write(`\n  Elapsed: ${elapsedS}s ${timingPass ? "< 30s ✓" : ">= 30s ✗"}\n`);

  const allPass = matrixAllPass && hashResult.pass && timingPass;

  process.stdout.write(
    `\n${allPass ? "ALL PASS ✓ — golden path validated" : "FAILED ✗ — see failures above"}\n`,
  );

  // Build TestReport failures list
  const failures: TestReport["failures"] = [];

  for (const a of assertions) {
    if (!a.pass) {
      failures.push({
        testName: `claim-${a.claimId}-${a.agentKey}`,
        filePath: "scripts/test-demo.ts",
        error: a.message,
        stackTrace: "",
        category: "demo_sequence",
      });
    }
  }

  if (!hashResult.pass) {
    failures.push({
      testName: "reflector-B-hash-stability",
      filePath: "scripts/test-demo.ts",
      error: hashResult.message,
      stackTrace: "",
      category: "determinism_failure",
    });
  }

  if (!timingPass) {
    failures.push({
      testName: "elapsed-under-30s",
      filePath: "scripts/test-demo.ts",
      error: `Elapsed ${elapsedS}s >= 30s limit`,
      stackTrace: "",
      category: "demo_sequence",
    });
  }

  const totalTests = assertions.length + 1 + 1; // assertions + hash + timing
  const passedTests =
    assertions.filter((a) => a.pass).length + (hashResult.pass ? 1 : 0) + (timingPass ? 1 : 0);

  const report: TestReport = {
    suite: "demo",
    timestamp,
    commit,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failures.length,
      skipped: 0,
      durationMs: elapsedMs,
    },
    failures,
  };

  const reportPath = resolve(REPORTS_DIR, "demo.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(
    `\nReport: .test-reports/demo.json (${totalTests} checks, ${failures.length} failures)\n`,
  );

  process.exit(allPass ? 0 : 1);
}

// Only run when executed directly (not imported by tests).
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  (process.argv[1].endsWith("test-demo.ts") ||
    process.argv[1].endsWith("test-demo.js") ||
    process.argv[1].endsWith("test-demo.mjs"));

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`[test-demo] Fatal: ${String(err)}\n`);
    if (err instanceof Error && err.stack !== undefined) {
      process.stderr.write(`${err.stack}\n`);
    }
    process.exit(1);
  });
}
