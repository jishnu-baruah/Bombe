import { z } from "zod";

export const FailureCategorySchema = z.enum([
  "contract_logic",
  "contract_gas",
  "typescript_type",
  "runtime_error",
  "assertion_mismatch",
  "network_timeout",
  "determinism_failure",
  "demo_sequence",
  "unknown",
]);

export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export const TestReportSchema = z.object({
  suite: z.enum(["forge", "vitest", "demo"]),
  timestamp: z.string(),
  commit: z.string(),
  summary: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
    durationMs: z.number(),
  }),
  failures: z.array(
    z.object({
      testName: z.string(),
      filePath: z.string(),
      line: z.number().optional(),
      error: z.string(),
      stackTrace: z.string(),
      category: FailureCategorySchema,
    }),
  ),
});

export type TestReport = z.infer<typeof TestReportSchema>;
