/**
 * tool-recovery.ts — Tool error recovery wrapper. (PRD §6.3.1, T-208)
 *
 * Wraps arbitrary async tool functions with:
 *   1. Structured error classification (recoverable vs non-recoverable).
 *   2. One automatic retry for recoverable errors.
 *   3. Structured `ToolErrorRow` emission for every failure (no silent failures).
 *   4. A guaranteed non-throwing call surface — `runToolWithRecovery` never
 *      propagates an exception to the caller. The loop uses the return shape
 *      `{ok:false, toolFailure:true}` to finalise ABSTAIN(TOOL_FAILURE).
 *
 * DESIGN CONTRACT:
 *   - This module only classifies errors and emits rows.
 *   - The loop (T-213) maps `{ok:false, toolFailure:true}` → ABSTAIN(TOOL_FAILURE).
 *   - `runToolWithRecovery` NEVER throws. Any unexpected re-throw is a bug here.
 *
 * RECOVERABILITY HEURISTIC (default):
 *   An error is considered recoverable unless the thrown value has a property
 *   `recoverable` that is strictly `false`. This matches the `ToolError` shape
 *   below and also handles plain `Error` instances (no `recoverable` property →
 *   treated as recoverable). Callers may supply a custom `isRecoverable` predicate.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * ToolError — the structured throw shape tools should use to express
 * recoverability. Plain `Error` instances are also accepted (treated as
 * recoverable by the default heuristic).
 */
export interface ToolError {
  error: string;
  recoverable: boolean;
}

/**
 * ToolErrorRow — a structured event row emitted for every tool failure.
 *
 * The runner / DB layer (T-401+) persists these rows in the `errors` table.
 * This module only *produces* the row; persistence is the caller's concern.
 *
 * Fields:
 *   scope      — always "tool" (discriminates from other error row kinds).
 *   toolName   — the name of the tool that failed.
 *   error      — stringified error message.
 *   recoverable — whether the error was classified as recoverable.
 *   retried    — true if this row describes a first failure that was retried.
 */
export interface ToolErrorRow {
  scope: "tool";
  toolName: string;
  error: string;
  recoverable: boolean;
  retried: boolean;
}

// ---------------------------------------------------------------------------
// Default recoverability heuristic
// ---------------------------------------------------------------------------

/**
 * defaultIsRecoverable — returns false only when the thrown value has a
 * `recoverable` property that is strictly `false`.
 *
 * All other thrown values (plain `Error`, unknown objects, strings) are
 * treated as recoverable — the safer default for most transient tool failures.
 */
function defaultIsRecoverable(e: unknown): boolean {
  if (e !== null && typeof e === "object" && "recoverable" in e) {
    return (e as { recoverable: unknown }).recoverable !== false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// ---------------------------------------------------------------------------
// runToolWithRecovery
// ---------------------------------------------------------------------------

/**
 * runToolWithRecovery — wraps a tool function with error recovery logic.
 *
 * @param toolName - Human-readable tool name (for error rows and logging).
 * @param fn       - The async tool function to execute.
 * @param opts     - Optional configuration:
 *   - `onErrorRow`      — called synchronously for each `ToolErrorRow` emitted.
 *   - `isRecoverable`   — override the default recoverability heuristic.
 *
 * Returns:
 *   `{ ok: true; value: T }`              — tool succeeded (possibly after retry).
 *   `{ ok: false; toolFailure: true }`    — tool failed; loop should ABSTAIN(TOOL_FAILURE).
 *
 * NEVER throws. All errors are caught and surfaced via the return value.
 */
export async function runToolWithRecovery<T>(
  toolName: string,
  fn: () => Promise<T>,
  opts?: {
    onErrorRow?: (row: ToolErrorRow) => void;
    isRecoverable?: (e: unknown) => boolean;
  },
): Promise<{ ok: true; value: T } | { ok: false; toolFailure: true }> {
  const classify = opts?.isRecoverable ?? defaultIsRecoverable;
  const emit = opts?.onErrorRow;

  // --- First attempt ---
  let firstError: unknown;
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (e) {
    firstError = e;
  }

  const firstRecoverable = classify(firstError);

  if (!firstRecoverable) {
    // Non-recoverable: emit one row, no retry.
    emit?.({
      scope: "tool",
      toolName,
      error: errorMessage(firstError),
      recoverable: false,
      retried: false,
    });
    return { ok: false, toolFailure: true };
  }

  // Recoverable: emit a row for the first failure (retried: true) and retry once.
  emit?.({
    scope: "tool",
    toolName,
    error: errorMessage(firstError),
    recoverable: true,
    retried: true,
  });

  // --- Retry attempt ---
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (retryError) {
    // Retry also failed: emit a row for the retry failure (retried: false).
    emit?.({
      scope: "tool",
      toolName,
      error: errorMessage(retryError),
      recoverable: classify(retryError),
      retried: false,
    });
    return { ok: false, toolFailure: true };
  }
}
