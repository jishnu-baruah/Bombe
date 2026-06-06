/**
 * T-701: unit tests for scripts/lib/normalize.ts
 * Uses committed fixture blobs (scripts/test/fixtures/) to verify:
 *   - normalizeForge → valid TestReport with correct totals + categorized failure
 *   - normalizeVitest → valid TestReport with correct totals + categorized failure
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestReportSchema } from "@bombe/shared";
import { normalizeForge, normalizeVitest, categorizeError } from "../lib/normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
}

// ─── Forge normalizer tests ───────────────────────────────────────────────────

describe("normalizeForge", () => {
  it("produces a valid TestReport from the forge fixture blob", () => {
    const raw = readFixture("forge.raw.json");
    const report = normalizeForge(raw as Parameters<typeof normalizeForge>[0], "test1234");

    // Must parse against the shared schema
    const parsed = TestReportSchema.parse(report);

    expect(parsed.suite).toBe("forge");
    expect(parsed.commit).toBe("test1234");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("counts totals correctly (2 pass, 1 fail, 0 skip)", () => {
    const raw = readFixture("forge.raw.json");
    const report = normalizeForge(raw as Parameters<typeof normalizeForge>[0], "test1234");

    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.skipped).toBe(0);
    expect(report.summary.durationMs).toBeGreaterThan(0);
  });

  it("includes the failure with a non-unknown category", () => {
    const raw = readFixture("forge.raw.json");
    const report = normalizeForge(raw as Parameters<typeof normalizeForge>[0], "test1234");

    expect(report.failures).toHaveLength(1);
    const failure = report.failures[0];
    expect(failure).toBeDefined();
    if (failure == null) return;

    expect(failure.testName).toBe("test_SlashConservation_Fails()");
    expect(failure.filePath).toContain(".sol");
    // Should be categorized as contract_logic due to custom error revert
    expect(failure.category).toBe("contract_logic");
    expect(failure.error.length).toBeGreaterThan(0);
  });
});

// ─── Vitest normalizer tests ──────────────────────────────────────────────────

describe("normalizeVitest", () => {
  it("produces a valid TestReport from the vitest fixture blob", () => {
    const raw = readFixture("vitest.raw.json");
    const report = normalizeVitest(raw as Parameters<typeof normalizeVitest>[0], "test5678");

    const parsed = TestReportSchema.parse(report);

    expect(parsed.suite).toBe("vitest");
    expect(parsed.commit).toBe("test5678");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("counts totals correctly (4 pass, 1 fail, 0 skip)", () => {
    const raw = readFixture("vitest.raw.json");
    const report = normalizeVitest(raw as Parameters<typeof normalizeVitest>[0], "test5678");

    expect(report.summary.total).toBe(5);
    expect(report.summary.passed).toBe(4);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.skipped).toBe(0);
    expect(report.summary.durationMs).toBeGreaterThan(0);
  });

  it("includes the failure with assertion_mismatch category", () => {
    const raw = readFixture("vitest.raw.json");
    const report = normalizeVitest(raw as Parameters<typeof normalizeVitest>[0], "test5678");

    expect(report.failures).toHaveLength(1);
    const failure = report.failures[0];
    expect(failure).toBeDefined();
    if (failure == null) return;

    expect(failure.testName).toBe("ModelRouter falls back on 429");
    expect(failure.line).toBe(52);
    expect(failure.category).toBe("assertion_mismatch");
  });
});

// ─── categorizeError heuristics ──────────────────────────────────────────────

describe("categorizeError", () => {
  it("identifies contract_logic from custom error revert", () => {
    expect(categorizeError("VM revert with custom error JudgmentTierRequiresAbstain")).toBe(
      "contract_logic",
    );
  });

  it("identifies contract_gas from out of gas", () => {
    expect(categorizeError("transaction ran out of gas")).toBe("contract_gas");
  });

  it("identifies assertion_mismatch from expect()", () => {
    expect(categorizeError("AssertionError: expected true to equal false\n  + expected")).toBe(
      "assertion_mismatch",
    );
  });

  it("identifies typescript_type from TS4", () => {
    expect(categorizeError("TS2345: Argument of type 'string' is not assignable")).toBe(
      "typescript_type",
    );
  });

  it("identifies network_timeout from ETIMEDOUT", () => {
    expect(categorizeError("Error: ETIMEDOUT socket hang up")).toBe("network_timeout");
  });

  it("identifies determinism_failure from traceHash mismatch", () => {
    expect(categorizeError("traceHash mismatch: expected 0xabc got 0xdef")).toBe(
      "determinism_failure",
    );
  });

  it("identifies runtime_error from cannot read", () => {
    expect(categorizeError("TypeError: Cannot read property 'x' of undefined")).toBe(
      "runtime_error",
    );
  });

  it("returns unknown for unrecognized error", () => {
    expect(categorizeError("something completely unexpected")).toBe("unknown");
  });
});
