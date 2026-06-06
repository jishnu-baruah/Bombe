/**
 * normalize.ts — converts raw forge/vitest JSON outputs into TestReport
 * conforming to packages/shared/src/test-report.ts (TestReportSchema).
 *
 * Heuristic category mapping per PRD §15.3:
 *   contract_logic     — custom-error / revert / assertion in a .sol test
 *   contract_gas       — gas-limit or out-of-gas
 *   typescript_type    — TS type error
 *   runtime_error      — uncaught throw / cannot read property / ReferenceError
 *   assertion_mismatch — expect().toEqual / AssertionError
 *   network_timeout    — ETIMEDOUT / socket hang up / timeout
 *   determinism_failure— traceHash mismatch / canonicalJson mismatch
 *   demo_sequence      — demo_sequence / A→D / claim sequence
 *   unknown            — fallback
 */

import { execSync } from "node:child_process";
import type { FailureCategory, TestReport } from "@bombe/shared";

// ─── Forge raw JSON types ────────────────────────────────────────────────────

type ForgeTestStatus = "Success" | "Failure" | "Skipped";

interface ForgeTestResult {
  status: ForgeTestStatus;
  reason: string | null;
  counterexample: unknown;
  kind: Record<string, unknown>;
  duration: string; // e.g. "1ms 234µs 500ns"
  decoded_logs?: string[];
  logs?: unknown[];
}

interface ForgeContractResult {
  duration: string;
  test_results: Record<string, ForgeTestResult>;
  warnings?: string[];
}

type ForgeRaw = Record<string, ForgeContractResult>;

// ─── Vitest JSON reporter types ───────────────────────────────────────────────

interface VitestAssertionResult {
  title: string;
  fullName: string;
  status: "passed" | "failed" | "pending" | "todo" | "skipped";
  duration: number;
  failureMessages: string[];
  ancestorTitles: string[];
  location?: { line: number; column: number };
}

interface VitestTestFileResult {
  name: string;
  status: "passed" | "failed";
  startTime: number;
  endTime: number;
  message?: string;
  assertionResults: VitestAssertionResult[];
}

interface VitestRaw {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  startTime: number;
  success: boolean;
  testResults: VitestTestFileResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get current commit SHA (7 chars), fallback to "unknown". */
function currentCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Parse a forge duration string like "1ms 234µs 500ns" into milliseconds.
 * Returns 0 on parse failure.
 */
function parseForgeDurationMs(s: string): number {
  let ms = 0;
  const msMatch = s.match(/(\d+(?:\.\d+)?)ms/);
  if (msMatch?.[1] != null) ms += parseFloat(msMatch[1]);
  const usMatch = s.match(/(\d+(?:\.\d+)?)µs/);
  if (usMatch?.[1] != null) ms += parseFloat(usMatch[1]) / 1000;
  const nsMatch = s.match(/(\d+(?:\.\d+)?)ns/);
  if (nsMatch?.[1] != null) ms += parseFloat(nsMatch[1]) / 1_000_000;
  const sMatch = s.match(/(\d+(?:\.\d+)?)s(?!e)/);
  if (sMatch?.[1] != null) ms += parseFloat(sMatch[1]) * 1000;
  return ms;
}

/**
 * Heuristic: map an error string to a FailureCategory.
 * Checks in order; first match wins.
 */
export function categorizeError(error: string): FailureCategory {
  const e = error.toLowerCase();

  // Gas-related
  if (/out.of.gas|gas.limit|gaslimit|exceeded gas/.test(e)) {
    return "contract_gas";
  }

  // Network / timeout
  if (/etimedout|econnrefused|socket hang up|network timeout|timed? ?out/.test(e)) {
    return "network_timeout";
  }

  // Determinism
  if (/tracehash|canonicaljson|mismatch.*hash|hash.*mismatch|determinism/.test(e)) {
    return "determinism_failure";
  }

  // Demo sequence
  if (/demo.?sequence|claim [a-d]|a→d|guided.?demo/.test(e)) {
    return "demo_sequence";
  }

  // General runtime error (JS) — checked before typescript_type to avoid
  // "TypeError:" (a JS runtime class) being mistaken for a TS type error
  if (
    /cannot read|is not a function|referenceerror|rangeerror|uncaught exception|throw new/.test(e)
  ) {
    return "runtime_error";
  }

  // TypeScript compile-time type errors (TS error codes, compiler messages)
  if (
    /typescript|ts\d{4}|type error|property '.*' does not exist|argument of type|is not assignable/.test(
      e,
    )
  ) {
    return "typescript_type";
  }

  // Assertion mismatch (vitest/jest expect style)
  if (
    /assertionerror|expected .* to equal|expect\(|received:|expected:|\+ expected|- received/.test(
      e,
    )
  ) {
    return "assertion_mismatch";
  }

  // Solidity custom error / revert (contract logic)
  if (
    /revert|custom error|panic\(0x|assertion failed|vm\.expect|forge.*test|\.t\.sol/.test(e)
  ) {
    return "contract_logic";
  }

  return "unknown";
}

// ─── Forge normalizer ─────────────────────────────────────────────────────────

/**
 * Normalize raw `forge test --json` output into a TestReport.
 * @param raw    Parsed JSON from forge test --json
 * @param commit Optional commit SHA override (defaults to git HEAD)
 */
export function normalizeForge(raw: ForgeRaw, commit?: string): TestReport {
  const timestamp = new Date().toISOString();
  const commitSha = commit ?? currentCommit();

  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let totalDurationMs = 0;

  const failures: TestReport["failures"] = [];

  for (const [contractPath, contractResult] of Object.entries(raw)) {
    // contractPath like "test/AgentAttestation.t.sol:AgentAttestationTest"
    const filePath = contractPath.split(":")[0] ?? contractPath;

    totalDurationMs += parseForgeDurationMs(contractResult.duration);

    for (const [testName, testResult] of Object.entries(contractResult.test_results)) {
      total++;

      if (testResult.status === "Success") {
        passed++;
      } else if (testResult.status === "Skipped") {
        skipped++;
      } else {
        // Failure
        failed++;

        const reasonStr = testResult.reason ?? "Test failed";
        const decodedLogs = testResult.decoded_logs ?? [];
        const logsStr = decodedLogs.length > 0 ? decodedLogs.join("\n") : "";
        const errorStr = logsStr ? `${reasonStr}\n${logsStr}` : reasonStr;

        failures.push({
          testName,
          filePath,
          error: errorStr,
          stackTrace: logsStr || reasonStr,
          category: categorizeError(errorStr),
        });
      }
    }
  }

  return {
    suite: "forge",
    timestamp,
    commit: commitSha,
    summary: {
      total,
      passed,
      failed,
      skipped,
      durationMs: Math.round(totalDurationMs),
    },
    failures,
  };
}

// ─── Vitest normalizer ────────────────────────────────────────────────────────

/**
 * Normalize raw vitest `--reporter=json` output into a TestReport.
 * @param raw    Parsed JSON from vitest --reporter=json
 * @param commit Optional commit SHA override (defaults to git HEAD)
 */
export function normalizeVitest(raw: VitestRaw, commit?: string): TestReport {
  const timestamp = new Date().toISOString();
  const commitSha = commit ?? currentCommit();

  const total = raw.numTotalTests;
  const passed = raw.numPassedTests;
  const failed = raw.numFailedTests;
  // vitest uses numPendingTests for skip; numTodoTests adds todo items
  const skipped = (raw.numPendingTests ?? 0) + (raw.numTodoTests ?? 0);

  let totalDurationMs = 0;
  const failures: TestReport["failures"] = [];

  for (const suite of raw.testResults) {
    const suiteMs = suite.endTime - suite.startTime;
    totalDurationMs += suiteMs;

    for (const assertion of suite.assertionResults) {
      if (assertion.status === "failed") {
        const allMessages = assertion.failureMessages.join("\n");
        failures.push({
          testName: assertion.fullName || assertion.title,
          filePath: suite.name,
          line: assertion.location?.line,
          error: allMessages || "Test failed",
          stackTrace: allMessages || "",
          category: categorizeError(allMessages),
        });
      }
    }
  }

  return {
    suite: "vitest",
    timestamp,
    commit: commitSha,
    summary: {
      total,
      passed,
      failed,
      skipped,
      durationMs: Math.round(totalDurationMs),
    },
    failures,
  };
}
