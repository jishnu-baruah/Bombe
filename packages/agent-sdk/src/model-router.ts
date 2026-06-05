/**
 * model-router.ts — ModelRouter resilience layer. (PRD §6.3.1)
 *
 * ModelRouter wraps ModelSeam: primary → FALLBACK_MODEL → mock script.
 * Any failover is recorded as {modelSwitched: true, from, to, reason}.
 * A 429/5xx/timeout on primary triggers fallback within the same step;
 * the run completes as long as a working fallback exists.
 *
 * Error classification:
 *   - status 429 → "rate_limit"
 *   - status 500-599 → "server"
 *   - kind "timeout" or message contains "timeout" → "timeout"
 *   - status 400 or other non-retryable → NOT a failover condition; rethrows
 *
 * Switch record exposure:
 *   ModelRouter.complete() returns a ModelResponse (satisfies ModelSeam).
 *   Switch records are accumulated in router.switches (per-router lifetime list)
 *   and also delivered synchronously to the optional onSwitch callback.
 *   The loop (T-213) reads router.switches after each complete() call to embed
 *   {modelSwitched, from, to, reason} entries into the trace.
 */

import type { Config } from "./config.js";
import { MockModelSeam } from "./seams/mock.js";
import type { ModelRequest, ModelResponse, ModelSeam } from "./seams/types.js";

// ---------------------------------------------------------------------------
// ModelError — structured error shape for seam throws (PRD §6.3.1)
// ---------------------------------------------------------------------------

/**
 * ModelError — thrown by ModelSeam implementations to signal a classified failure.
 *
 * Classification guide:
 *   status 429               → kind "rate_limit"  → failover-worthy
 *   status 500–599           → kind "server"       → failover-worthy
 *   kind "timeout" or
 *     message contains "timeout" (case-insensitive) → failover-worthy
 *   status 400 or undefined  → kind "other"        → NOT failover-worthy
 *
 * Seams that do not yet use ModelError (legacy plain Error) are classified
 * by inspecting the message string for HTTP status codes and "timeout".
 */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly kind?: "rate_limit" | "server" | "timeout" | "other",
  ) {
    super(message);
    this.name = "ModelError";
  }
}

// ---------------------------------------------------------------------------
// ModelSwitchRecord — embedded in trace when a failover occurs (PRD §6.3.1)
// ---------------------------------------------------------------------------

/**
 * ModelSwitchRecord — a single failover event.
 *
 * Embedded in the agent trace as-is:
 *   { modelSwitched: true, from: <original model>, to: <new model>, reason: <classified reason> }
 */
export interface ModelSwitchRecord {
  modelSwitched: true;
  from: string;
  to: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

/**
 * classifyError — determines whether a thrown error should trigger failover
 * and returns the reason string, or null if the error must NOT trigger failover.
 *
 * Returns:
 *   "rate_limit" — HTTP 429
 *   "server"     — HTTP 500–599
 *   "timeout"    — kind "timeout" or message includes "timeout"
 *   null         — non-retryable (do not failover; rethrow to caller)
 */
function classifyError(err: unknown): string | null {
  if (err instanceof ModelError) {
    // Explicit kind takes precedence.
    if (err.kind === "rate_limit") return "rate_limit";
    if (err.kind === "server") return "server";
    if (err.kind === "timeout") return "timeout";
    // Explicit status is second priority.
    if (err.status === 429) return "rate_limit";
    if (err.status !== undefined && err.status >= 500 && err.status <= 599) return "server";
    // Kind "other" (or undefined kind with non-retryable status) → do not failover.
    if (err.kind === "other") return null;
    // Fall through to message inspection if no status or kind set.
  }

  // For any Error (including legacy plain Error from seams), inspect message.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    // Match "429" or "5xx" status patterns in message strings.
    if (msg.includes("429")) return "rate_limit";
    // Match patterns like "500", "502", "503" … "599".
    const statusMatch = /\b(5\d{2})\b/.exec(err.message);
    if (statusMatch !== null) return "server";
  }

  // Unknown error type — do not failover.
  return null;
}

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

/** Construction options for ModelRouter. */
export interface ModelRouterOptions {
  /** Primary ModelSeam — tried first. */
  primary: ModelSeam;
  /**
   * Fallback ModelSeam — used when primary throws a failover-worthy error.
   * Requests are forwarded with req.model replaced by fallbackModel.
   */
  fallback?: ModelSeam;
  /**
   * Final-fallback ModelSeam (typically MockModelSeam) — used when fallback
   * also throws a failover-worthy error. Requests forwarded with model "mock".
   */
  mockFallback?: ModelSeam;
  /** Model identifier to use when calling fallback. (PRD §6.3.1: FALLBACK_MODEL) */
  fallbackModel: string;
  /**
   * Optional callback invoked synchronously each time a switch occurs.
   * Receives the ModelSwitchRecord; useful for logging and trace injection.
   */
  onSwitch?: (rec: ModelSwitchRecord) => void;
}

/**
 * ModelRouter — resilience wrapper around ModelSeam. (PRD §6.3.1)
 *
 * Implements ModelSeam so it can be dropped into any seam slot transparently.
 *
 * Switch record access for the loop (T-213):
 *   After each `complete()` call the loop reads `router.switches` to find any
 *   ModelSwitchRecord entries produced during that call, and embeds them in
 *   the step trace. The `switches` array accumulates across the router's lifetime.
 *
 * Example:
 *   const router = new ModelRouter({ primary, fallback, fallbackModel: "meta/llama-3.3-70b" });
 *   const resp = await router.complete(req);
 *   // router.switches contains any ModelSwitchRecord entries from this and prior calls.
 */
export class ModelRouter implements ModelSeam {
  private readonly primary: ModelSeam;
  private readonly fallback: ModelSeam | undefined;
  private readonly mockFallback: ModelSeam | undefined;
  private readonly fallbackModel: string;
  private readonly onSwitch: ((rec: ModelSwitchRecord) => void) | undefined;

  /** Accumulates ALL switch records across all complete() calls on this router. */
  readonly switches: ModelSwitchRecord[] = [];

  constructor(opts: ModelRouterOptions) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
    this.mockFallback = opts.mockFallback;
    this.fallbackModel = opts.fallbackModel;
    this.onSwitch = opts.onSwitch;
  }

  /**
   * complete — attempt primary, fall back on failover-worthy errors.
   *
   * Step 1: Try primary.complete(req). On success, return response (no switch).
   * Step 2: On failover-worthy error: call fallback with req.model = fallbackModel.
   *         Record a ModelSwitchRecord {from: original model, to: fallbackModel}.
   * Step 3: If fallback also fails with a failover-worthy error AND mockFallback
   *         exists: call mockFallback, record another switch to "mock".
   * Step 4: Non-failover errors (e.g. 400) are rethrown without any fallback.
   *
   * The run completes (does not throw) as long as a working fallback exists.
   */
  async complete(req: ModelRequest): Promise<ModelResponse> {
    const originalModel = req.model;

    // --- Step 1: try primary ---
    let primaryError: unknown;
    try {
      return await this.primary.complete(req);
    } catch (err) {
      primaryError = err;
    }

    // Classify primary error.
    const primaryReason = classifyError(primaryError);
    if (primaryReason === null) {
      // Non-failover error — rethrow.
      throw primaryError;
    }

    // --- Step 2: try fallback ---
    const fallbackReq: ModelRequest = { ...req, model: this.fallbackModel };

    if (this.fallback !== undefined) {
      let fallbackError: unknown;
      try {
        const resp = await this.fallback.complete(fallbackReq);
        // Fallback succeeded — record switch and return.
        this._recordSwitch(originalModel, this.fallbackModel, primaryReason);
        return resp;
      } catch (err) {
        fallbackError = err;
      }

      // Fallback also failed. Record the primary→fallback switch first.
      this._recordSwitch(originalModel, this.fallbackModel, primaryReason);

      // Classify fallback error.
      const fallbackReason = classifyError(fallbackError);
      if (fallbackReason === null) {
        // Non-failover error from fallback — rethrow.
        throw fallbackError;
      }

      // --- Step 3: try mockFallback ---
      if (this.mockFallback !== undefined) {
        const mockReq: ModelRequest = { ...req, model: "mock" };
        const mockResp = await this.mockFallback.complete(mockReq);
        // mockFallback succeeded — record fallback→mock switch and return.
        this._recordSwitch(this.fallbackModel, "mock", fallbackReason);
        return mockResp;
      }

      // No mockFallback — rethrow fallback error.
      throw fallbackError;
    }

    // No fallback configured — check mockFallback directly.
    if (this.mockFallback !== undefined) {
      const mockReq: ModelRequest = { ...req, model: "mock" };
      const mockResp = await this.mockFallback.complete(mockReq);
      this._recordSwitch(originalModel, "mock", primaryReason);
      return mockResp;
    }

    // No fallback at all — rethrow primary error.
    throw primaryError;
  }

  /** Record a switch event: push to switches array and call onSwitch callback. */
  private _recordSwitch(from: string, to: string, reason: string): void {
    const rec: ModelSwitchRecord = { modelSwitched: true, from, to, reason };
    this.switches.push(rec);
    this.onSwitch?.(rec);
  }
}

// ---------------------------------------------------------------------------
// Factory: createModelRouter
// ---------------------------------------------------------------------------

/**
 * createModelRouter — build a ModelRouter from the primary seam + config.
 *
 * Wires:
 *   - primary:      the provided primary ModelSeam (live or mock, per mode)
 *   - fallback:     a second instance of the primary seam constructor class
 *                   (same type but with fallbackModel set on each request)
 *   - mockFallback: MockModelSeam as the final safety net
 *   - fallbackModel: config.fallbackModel (from FALLBACK_MODEL env, default "meta/llama-3.3-70b")
 *
 * The `onSwitch` callback is optional; pass it to capture switch records in
 * real-time (e.g. for per-step trace embedding in T-213).
 *
 * NOTE: `primary` and `fallback` are separate seam instances. In mock/stub mode
 * the caller typically passes a StubModelSeam or MockModelSeam for both.
 */
export function createModelRouter(
  primary: ModelSeam,
  fallback: ModelSeam,
  config: Pick<Config, "fallbackModel">,
  opts?: { onSwitch?: (rec: ModelSwitchRecord) => void },
): ModelRouter {
  return new ModelRouter({
    primary,
    fallback,
    mockFallback: new MockModelSeam(),
    fallbackModel: config.fallbackModel,
    onSwitch: opts?.onSwitch,
  });
}
