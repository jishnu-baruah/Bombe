import { describe, expect, it } from "vitest";
import { TestReportSchema } from "../src/test-report.js";

const baseReport = {
  suite: "vitest" as const,
  timestamp: "2026-06-06T00:00:00.000Z",
  commit: "abc1234",
  summary: {
    total: 10,
    passed: 9,
    failed: 1,
    skipped: 0,
    durationMs: 1234,
  },
  failures: [],
};

describe("TestReportSchema — suite variants", () => {
  it("parses a vitest report", () => {
    expect(TestReportSchema.safeParse(baseReport).success).toBe(true);
  });

  it("parses a forge report", () => {
    const result = TestReportSchema.safeParse({ ...baseReport, suite: "forge" });
    expect(result.success).toBe(true);
  });

  it("parses a demo report", () => {
    const result = TestReportSchema.safeParse({ ...baseReport, suite: "demo" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown suite value", () => {
    const result = TestReportSchema.safeParse({ ...baseReport, suite: "jest" });
    expect(result.success).toBe(false);
  });
});

describe("TestReportSchema — failures array", () => {
  it("parses a failure with all fields including optional line", () => {
    const withFailure = {
      ...baseReport,
      failures: [
        {
          testName: "should resolve dispute",
          filePath: "packages/contracts/test/Plugboard.test.ts",
          line: 42,
          error: "Expected 1 but received 0",
          stackTrace: "at Object.<anonymous> (:42:5)",
          category: "assertion_mismatch",
        },
      ],
    };
    expect(TestReportSchema.safeParse(withFailure).success).toBe(true);
  });

  it("line is optional — parses without it", () => {
    const withFailure = {
      ...baseReport,
      failures: [
        {
          testName: "missing line test",
          filePath: "some/file.ts",
          error: "oops",
          stackTrace: "stack",
          category: "runtime_error",
        },
      ],
    };
    expect(TestReportSchema.safeParse(withFailure).success).toBe(true);
  });

  it("accepts every valid category", () => {
    const categories = [
      "contract_logic",
      "contract_gas",
      "typescript_type",
      "runtime_error",
      "assertion_mismatch",
      "network_timeout",
      "determinism_failure",
      "demo_sequence",
      "unknown",
    ] as const;

    for (const category of categories) {
      const result = TestReportSchema.safeParse({
        ...baseReport,
        failures: [
          {
            testName: "t",
            filePath: "f",
            error: "e",
            stackTrace: "s",
            category,
          },
        ],
      });
      expect(result.success, `category ${category} should be valid`).toBe(true);
    }
  });

  it("rejects an invalid category value", () => {
    const result = TestReportSchema.safeParse({
      ...baseReport,
      failures: [
        {
          testName: "t",
          filePath: "f",
          error: "e",
          stackTrace: "s",
          category: "bad_category",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a failure missing required field (testName)", () => {
    const result = TestReportSchema.safeParse({
      ...baseReport,
      failures: [
        {
          filePath: "f",
          error: "e",
          stackTrace: "s",
          category: "unknown",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("TestReportSchema — summary field validation", () => {
  it("rejects a missing summary field", () => {
    const { summary: _s, ...withoutSummary } = baseReport;
    expect(TestReportSchema.safeParse(withoutSummary).success).toBe(false);
  });

  it("rejects a non-numeric durationMs", () => {
    const result = TestReportSchema.safeParse({
      ...baseReport,
      summary: { ...baseReport.summary, durationMs: "fast" },
    });
    expect(result.success).toBe(false);
  });
});
