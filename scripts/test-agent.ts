#!/usr/bin/env node
/**
 * T-702: scripts/test-agent.ts — autonomous testing harness aggregator
 *
 * Runs all suites (forge + vitest), normalizes raw outputs into TestReport
 * (packages/shared/src/test-report.ts), then prints ONE machine-readable
 * summary (JSON to stdout) with:
 *   - total/passed/failed/skipped across all suites
 *   - per-suite breakdown
 *   - categorized failures (heuristic; unknown is acceptable)
 *
 * Exit codes:
 *   0 — all suites passed (zero failures)
 *   1 — one or more failures present
 *
 * Usage:
 *   node --import tsx/esm scripts/test-agent.ts
 *   tsx scripts/test-agent.ts
 *
 * PRD §15.1, §14.16, §14.17
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TestReport } from "@bombe/shared";
import { TestReportSchema } from "@bombe/shared";
import { normalizeForge, normalizeVitest } from "./lib/normalize.js";

const ROOT = resolve(import.meta.dirname, "..");
const REPORTS_DIR = resolve(ROOT, ".test-reports");

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSummary {
  timestamp: string;
  commit: string;
  total: { total: number; passed: number; failed: number; skipped: number; durationMs: number };
  suites: Array<{
    suite: string;
    summary: TestReport["summary"];
    failureCount: number;
  }>;
  failures: TestReport["failures"];
  allGreen: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

// ─── Suite runners ────────────────────────────────────────────────────────────

function runForge(): TestReport {
  log("[test-agent] Running forge suite…");
  const rawPath = resolve(REPORTS_DIR, "forge.raw.json");
  const outPath = resolve(REPORTS_DIR, "forge.json");

  const result = spawnSync("forge", ["test", "--json", "--root", "contracts"], {
    encoding: "utf8",
    cwd: ROOT,
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });

  // forge test exits non-zero when there are failures — that's OK, we still capture stdout
  const rawJson = result.stdout ?? "";

  if (!rawJson.trim()) {
    log(`[test-agent] forge produced no output (stderr: ${result.stderr?.slice(0, 200) ?? ""})`);
    // Return a minimal error report so we don't crash the aggregator
    return {
      suite: "forge",
      timestamp: new Date().toISOString(),
      commit: getCurrentCommit(),
      summary: { total: 0, passed: 0, failed: 1, skipped: 0, durationMs: 0 },
      failures: [
        {
          testName: "forge-runner",
          filePath: "contracts",
          error: result.stderr?.slice(0, 500) ?? "forge produced no output",
          stackTrace: "",
          category: "unknown",
        },
      ],
    };
  }

  // Write raw for debugging
  writeFileSync(rawPath, rawJson);

  const raw = JSON.parse(rawJson) as Parameters<typeof normalizeForge>[0];
  const report = normalizeForge(raw, getCurrentCommit());

  // Write normalized report
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(
    `[test-agent] forge: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed`,
  );

  return report;
}

function runVitest(): TestReport {
  log("[test-agent] Running vitest suite…");
  const rawPath = resolve(REPORTS_DIR, "vitest.raw.json");
  const outPath = resolve(REPORTS_DIR, "vitest.json");

  // Use the vitest binary from root node_modules/.bin (installed as devDep)
  const vitestBin = resolve(ROOT, "node_modules", ".bin", "vitest");
  const result = spawnSync(
    vitestBin,
    ["run", "--reporter=json", `--outputFile=${rawPath}`],
    {
      encoding: "utf8",
      cwd: ROOT,
      shell: true,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );

  // vitest exits 1 on failure too, that's expected
  if (!existsSync(rawPath)) {
    log(
      `[test-agent] vitest produced no output file (stderr: ${result.stderr?.slice(0, 200) ?? ""})`,
    );
    return {
      suite: "vitest",
      timestamp: new Date().toISOString(),
      commit: getCurrentCommit(),
      summary: { total: 0, passed: 0, failed: 1, skipped: 0, durationMs: 0 },
      failures: [
        {
          testName: "vitest-runner",
          filePath: "packages",
          error: result.stderr?.slice(0, 500) ?? "vitest produced no output",
          stackTrace: "",
          category: "unknown",
        },
      ],
    };
  }

  const rawJson = readFileSync(rawPath, "utf8");
  const raw = JSON.parse(rawJson) as Parameters<typeof normalizeVitest>[0];
  const report = normalizeVitest(raw, getCurrentCommit());

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(
    `[test-agent] vitest: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed`,
  );

  return report;
}

// ─── Aggregation (pure function — testable without running suites) ────────────

export function aggregateReports(reports: TestReport[]): AgentSummary {
  const timestamp = new Date().toISOString();
  const commit = reports[0]?.commit ?? "unknown";

  let totalTotal = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDurationMs = 0;

  const allFailures: TestReport["failures"] = [];

  const suites = reports.map((r) => {
    totalTotal += r.summary.total;
    totalPassed += r.summary.passed;
    totalFailed += r.summary.failed;
    totalSkipped += r.summary.skipped;
    totalDurationMs += r.summary.durationMs;
    allFailures.push(...r.failures);

    return {
      suite: r.suite,
      summary: r.summary,
      failureCount: r.failures.length,
    };
  });

  return {
    timestamp,
    commit,
    total: {
      total: totalTotal,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      durationMs: totalDurationMs,
    },
    suites,
    failures: allFailures,
    allGreen: totalFailed === 0,
  };
}

// ─── Load already-written reports (alternative to re-running) ─────────────────

function loadExistingReports(): TestReport[] {
  const reports: TestReport[] = [];
  const names = ["forge.json", "vitest.json", "demo.json"];
  for (const name of names) {
    const p = resolve(REPORTS_DIR, name);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as unknown;
        const parsed = TestReportSchema.parse(raw);
        reports.push(parsed);
      } catch (e) {
        log(`[test-agent] Warning: could not parse ${name}: ${String(e)}`);
      }
    }
  }
  return reports;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useExisting = args.includes("--use-existing");

  ensureReportsDir();

  let reports: TestReport[];

  if (useExisting) {
    log("[test-agent] Loading existing reports from .test-reports/…");
    reports = loadExistingReports();
    if (reports.length === 0) {
      log("[test-agent] No existing reports found. Run without --use-existing to generate them.");
      process.exit(1);
    }
  } else {
    // Run both suites and capture results
    const forgeReport = runForge();
    const vitestReport = runVitest();
    reports = [forgeReport, vitestReport];
  }

  const summary = aggregateReports(reports);

  // Print the machine-readable summary to stdout
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  // Also print a human-readable summary to stderr
  log("\n[test-agent] ─── SUMMARY ────────────────────────────────────────");
  log(`[test-agent]   Total:   ${summary.total.total}`);
  log(`[test-agent]   Passed:  ${summary.total.passed}`);
  log(`[test-agent]   Failed:  ${summary.total.failed}`);
  log(`[test-agent]   Skipped: ${summary.total.skipped}`);
  log(`[test-agent]   Duration: ${summary.total.durationMs}ms`);
  log("[test-agent] ─── PER-SUITE ──────────────────────────────────────");
  for (const s of summary.suites) {
    const icon = s.failureCount === 0 ? "✓" : "✗";
    log(
      `[test-agent]   ${icon} ${s.suite.padEnd(10)} ${s.summary.passed}/${s.summary.total} passed`,
    );
  }

  if (summary.failures.length > 0) {
    log("[test-agent] ─── FAILURES ────────────────────────────────────────");
    for (const f of summary.failures) {
      log(`[test-agent]   [${f.category}] ${f.testName}`);
      log(`[test-agent]     ${f.filePath}${f.line != null ? `:${f.line}` : ""}`);
      log(`[test-agent]     ${f.error.split("\n")[0]?.slice(0, 120) ?? ""}`);
    }
  }

  log(
    `[test-agent] ─────────────────────────────────────────────────────`,
  );
  log(
    `[test-agent] ${summary.allGreen ? "ALL GREEN ✓" : `FAILED — ${summary.total.failed} failure(s) ✗`}`,
  );

  process.exit(summary.allGreen ? 0 : 1);
}

// Only execute when run directly (not imported by tests)
// ESM equivalent of CommonJS `if (require.main === module)`
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  (process.argv[1].endsWith("test-agent.ts") ||
    process.argv[1].endsWith("test-agent.js") ||
    process.argv[1].endsWith("test-agent.mjs"));

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`[test-agent] Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
