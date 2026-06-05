/**
 * tool-recovery.test.ts — Unit tests for runToolWithRecovery. (PRD §14.15, T-208)
 *
 * Covers:
 *  1. Success path: returns { ok: true, value }.
 *  2. Recoverable throw → retry once → success: returns value + 1 error row (retried:true).
 *  3. Recoverable throw twice → { ok:false, toolFailure:true } + 2 error rows.
 *  4. Non-recoverable throw → no retry → { ok:false, toolFailure:true } + 1 row.
 *  5. runToolWithRecovery never throws (all errors captured in return value).
 *  6. Custom isRecoverable predicate is respected.
 *  7. Error rows have correct fields (scope, toolName, error, recoverable, retried).
 */

import { describe, expect, it, vi } from "vitest";
import { runToolWithRecovery } from "../src/tool-recovery.js";
import type { ToolErrorRow } from "../src/tool-recovery.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successFn<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

function failFn(msg: string, recoverable?: boolean): () => Promise<never> {
  return () => {
    if (recoverable !== undefined) {
      const err: { message: string; recoverable: boolean } = {
        message: msg,
        recoverable,
      };
      return Promise.reject(err);
    }
    return Promise.reject(new Error(msg));
  };
}

// ---------------------------------------------------------------------------
// 1. Success path
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — success path", () => {
  it("returns { ok: true, value } when fn succeeds immediately", async () => {
    const result = await runToolWithRecovery("test-tool", successFn("hello"));
    expect(result).toEqual({ ok: true, value: "hello" });
  });

  it("does not emit any error rows on success", async () => {
    const rows: ToolErrorRow[] = [];
    await runToolWithRecovery("test-tool", successFn(42), {
      onErrorRow: (r) => rows.push(r),
    });
    expect(rows).toHaveLength(0);
  });

  it("returns correct value type (number)", async () => {
    const result = await runToolWithRecovery("price-tool", successFn(999));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// 2. Recoverable throw → retry once → success
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — recoverable error then success", () => {
  it("returns the value when retry succeeds", async () => {
    let call = 0;
    const fn = () => {
      call++;
      if (call === 1) return Promise.reject(new Error("transient"));
      return Promise.resolve("recovered");
    };
    const result = await runToolWithRecovery("fetch-tool", fn);
    expect(result).toEqual({ ok: true, value: "recovered" });
  });

  it("emits exactly 1 error row for the first failure (retried:true)", async () => {
    const rows: ToolErrorRow[] = [];
    let call = 0;
    const fn = () => {
      call++;
      if (call === 1) return Promise.reject(new Error("blip"));
      return Promise.resolve("ok");
    };
    await runToolWithRecovery("fetch-tool", fn, { onErrorRow: (r) => rows.push(r) });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.retried).toBe(true);
    expect(rows[0]?.recoverable).toBe(true);
    expect(rows[0]?.error).toBe("blip");
  });

  it("does not call fn more than twice (exactly 2 calls total)", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "done";
    });
    await runToolWithRecovery("tool", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Recoverable throw twice → { ok:false, toolFailure:true } + 2 error rows
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — recoverable error twice → toolFailure", () => {
  it("returns { ok:false, toolFailure:true } when both attempts fail", async () => {
    const fn = () => Promise.reject(new Error("always fails"));
    const result = await runToolWithRecovery("flaky-tool", fn);
    expect(result).toEqual({ ok: false, toolFailure: true });
  });

  it("emits exactly 2 error rows when both attempts fail", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = () => Promise.reject(new Error("always fails"));
    await runToolWithRecovery("flaky-tool", fn, { onErrorRow: (r) => rows.push(r) });
    expect(rows).toHaveLength(2);
  });

  it("first row has retried:true, second row has retried:false", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = () => Promise.reject(new Error("always fails"));
    await runToolWithRecovery("flaky-tool", fn, { onErrorRow: (r) => rows.push(r) });
    expect(rows[0]?.retried).toBe(true);
    expect(rows[1]?.retried).toBe(false);
  });

  it("both rows have scope:'tool' and correct toolName", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = () => Promise.reject(new Error("x"));
    await runToolWithRecovery("my-tool", fn, { onErrorRow: (r) => rows.push(r) });
    for (const row of rows) {
      expect(row.scope).toBe("tool");
      expect(row.toolName).toBe("my-tool");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Non-recoverable throw → no retry → toolFailure + 1 row
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — non-recoverable error", () => {
  it("returns { ok:false, toolFailure:true } without retry", async () => {
    const fn = failFn("bad input", false); // recoverable: false
    const result = await runToolWithRecovery("validate-tool", fn);
    expect(result).toEqual({ ok: false, toolFailure: true });
  });

  it("emits exactly 1 error row (no retry attempted)", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = failFn("bad input", false);
    await runToolWithRecovery("validate-tool", fn, { onErrorRow: (r) => rows.push(r) });
    expect(rows).toHaveLength(1);
  });

  it("error row has retried:false and recoverable:false", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = failFn("fatal", false);
    await runToolWithRecovery("validate-tool", fn, { onErrorRow: (r) => rows.push(r) });
    expect(rows[0]?.retried).toBe(false);
    expect(rows[0]?.recoverable).toBe(false);
  });

  it("calls fn exactly once when non-recoverable", async () => {
    const fn = vi.fn(() => failFn("fatal", false)());
    await runToolWithRecovery("tool", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. runToolWithRecovery NEVER throws
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — never throws", () => {
  it("does not throw when fn throws synchronously-ish (via rejected promise)", async () => {
    const fn = () => Promise.reject(new Error("boom"));
    // This must not reject / throw
    await expect(runToolWithRecovery("tool", fn)).resolves.toBeDefined();
  });

  it("does not throw when fn throws on every attempt", async () => {
    const fn = () => Promise.reject(new Error("every time"));
    const result = await runToolWithRecovery("tool", fn);
    expect(result.ok).toBe(false);
  });

  it("does not throw when fn throws a non-Error value", async () => {
    const fn = () => Promise.reject("string error");
    await expect(runToolWithRecovery("tool", fn)).resolves.toBeDefined();
  });

  it("does not throw when fn throws null", async () => {
    const fn = () => Promise.reject(null);
    await expect(runToolWithRecovery("tool", fn)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Custom isRecoverable predicate
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — custom isRecoverable", () => {
  it("uses custom predicate to force non-recoverable on plain Error", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = vi.fn(() => Promise.reject(new Error("plain")));
    // Always treat as non-recoverable
    const result = await runToolWithRecovery("tool", fn, {
      isRecoverable: () => false,
      onErrorRow: (r) => rows.push(r),
    });
    expect(result).toEqual({ ok: false, toolFailure: true });
    expect(fn).toHaveBeenCalledTimes(1); // no retry
    expect(rows).toHaveLength(1);
  });

  it("uses custom predicate to force recoverable on ToolError{recoverable:false}", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) {
        const e: { message: string; recoverable: boolean } = {
          message: "err",
          recoverable: false,
        };
        throw e;
      }
      return "done";
    });
    // Force recoverable = true regardless
    const result = await runToolWithRecovery("tool", fn, {
      isRecoverable: () => true,
    });
    expect(result).toEqual({ ok: true, value: "done" });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Error row fields
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — error row fields", () => {
  it("error row contains the correct error message string", async () => {
    const rows: ToolErrorRow[] = [];
    await runToolWithRecovery("tool", () => Promise.reject(new Error("specific msg")), {
      onErrorRow: (r) => rows.push(r),
    });
    expect(rows.some((r) => r.error === "specific msg")).toBe(true);
  });

  it("serialises non-Error string rejections into error field", async () => {
    const rows: ToolErrorRow[] = [];
    await runToolWithRecovery("tool", () => Promise.reject("raw string"), {
      onErrorRow: (r) => rows.push(r),
    });
    expect(rows[0]?.error).toBe("raw string");
  });
});

// ---------------------------------------------------------------------------
// 8. §14.15 — tool-failure acceptance test
// ---------------------------------------------------------------------------

describe("runToolWithRecovery — §14.15 acceptance: tool failure", () => {
  it("throw → recoverable retry → still failing → {ok:false,toolFailure:true} + rows", async () => {
    const rows: ToolErrorRow[] = [];
    const fn = () => Promise.reject(new Error("always fails"));
    const result = await runToolWithRecovery("chain-tool", fn, {
      onErrorRow: (r) => rows.push(r),
    });

    // The loop maps this to ABSTAIN(TOOL_FAILURE)
    expect(result).toEqual({ ok: false, toolFailure: true });
    // Two structured rows emitted (no silent failures)
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.scope === "tool")).toBe(true);
  });
});
