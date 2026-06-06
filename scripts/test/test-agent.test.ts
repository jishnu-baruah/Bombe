/**
 * T-702: unit tests for the aggregateReports() pure function from
 * scripts/test-agent.ts.
 *
 * Does NOT run the real forge/vitest suites — uses the committed fixture
 * TestReport JSON files from scripts/test/fixtures/ to verify:
 *   - combined totals are computed correctly
 *   - per-suite breakdown is present
 *   - allGreen=false when failures exist → caller can exit non-zero
 *   - allGreen=true when all suites pass
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestReport } from "@bombe/shared";
import { TestReportSchema } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import { aggregateReports } from "../test-agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

function readReport(name: string): TestReport {
  const raw = JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8")) as unknown;
  return TestReportSchema.parse(raw);
}

describe("aggregateReports", () => {
  it("combines two reports into correct combined totals", () => {
    const forgeReport = readReport("forge.report.json");
    const vitestReport = readReport("vitest.report.json");

    const summary = aggregateReports([forgeReport, vitestReport]);

    // forge: total=3, passed=2, failed=1, skipped=0
    // vitest: total=5, passed=4, failed=1, skipped=0
    expect(summary.total.total).toBe(8);
    expect(summary.total.passed).toBe(6);
    expect(summary.total.failed).toBe(2);
    expect(summary.total.skipped).toBe(0);
  });

  it("has allGreen=false when failures present", () => {
    const forgeReport = readReport("forge.report.json");
    const vitestReport = readReport("vitest.report.json");

    const summary = aggregateReports([forgeReport, vitestReport]);

    expect(summary.allGreen).toBe(false);
  });

  it("has allGreen=true when all suites pass", () => {
    const forgeReport: TestReport = {
      suite: "forge",
      timestamp: "2026-06-06T00:00:00.000Z",
      commit: "abc1234",
      summary: { total: 10, passed: 10, failed: 0, skipped: 0, durationMs: 100 },
      failures: [],
    };
    const vitestReport: TestReport = {
      suite: "vitest",
      timestamp: "2026-06-06T00:00:01.000Z",
      commit: "abc1234",
      summary: { total: 20, passed: 20, failed: 0, skipped: 0, durationMs: 500 },
      failures: [],
    };

    const summary = aggregateReports([forgeReport, vitestReport]);

    expect(summary.allGreen).toBe(true);
    expect(summary.total.failed).toBe(0);
  });

  it("includes per-suite breakdown with correct names", () => {
    const forgeReport = readReport("forge.report.json");
    const vitestReport = readReport("vitest.report.json");

    const summary = aggregateReports([forgeReport, vitestReport]);

    expect(summary.suites).toHaveLength(2);
    const forgeEntry = summary.suites.find((s) => s.suite === "forge");
    const vitestEntry = summary.suites.find((s) => s.suite === "vitest");

    expect(forgeEntry).toBeDefined();
    expect(vitestEntry).toBeDefined();
    expect(forgeEntry?.summary.total).toBe(3);
    expect(vitestEntry?.summary.total).toBe(5);
  });

  it("collects all failures from both suites", () => {
    const forgeReport = readReport("forge.report.json");
    const vitestReport = readReport("vitest.report.json");

    const summary = aggregateReports([forgeReport, vitestReport]);

    expect(summary.failures).toHaveLength(2);

    // Forge failure is contract_logic
    const forgeFailure = summary.failures.find((f) => f.category === "contract_logic");
    expect(forgeFailure).toBeDefined();

    // Vitest failure is assertion_mismatch
    const vitestFailure = summary.failures.find((f) => f.category === "assertion_mismatch");
    expect(vitestFailure).toBeDefined();
  });

  it("sums durationMs from both suites", () => {
    const forgeReport = readReport("forge.report.json");
    const vitestReport = readReport("vitest.report.json");

    const summary = aggregateReports([forgeReport, vitestReport]);

    // forge: 17ms + vitest: 1300ms
    expect(summary.total.durationMs).toBe(1317);
  });

  it("handles single report without crashing", () => {
    const forgeReport = readReport("forge.report.json");
    const summary = aggregateReports([forgeReport]);

    expect(summary.suites).toHaveLength(1);
    expect(summary.total.total).toBe(3);
  });

  it("handles empty reports array", () => {
    const summary = aggregateReports([]);

    expect(summary.total.total).toBe(0);
    expect(summary.total.failed).toBe(0);
    expect(summary.allGreen).toBe(true);
    expect(summary.suites).toHaveLength(0);
    expect(summary.failures).toHaveLength(0);
  });
});
