/**
 * app.ts — Hono application for @bombe/tool-gateway. (PRD §6.8, §9, T-405)
 *
 * Wires:
 *   - Bearer auth middleware  (401 on missing / wrong key)
 *   - Rate-limit middleware   (in-memory sliding window, 60 req/min per key → 429)
 *   - POST /tools/:name       thin wrapper over TOOLS from @bombe/agent-sdk
 *   - CORS                    * in mock mode, disabled in live
 *
 * The gateway never exposes wallet or operator functions.
 * TOOL_GATEWAY_KEY is read from config (never from process.env here).
 */

import { MockHistorySource, TOOLS, getTool } from "@bombe/agent-sdk";
import type { ToolName } from "@bombe/agent-sdk";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { GatewayConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Rate-limiter — in-memory sliding window, 60 req/min per bearer key
// ---------------------------------------------------------------------------

interface RateLimiterOptions {
  /** Maximum requests allowed in the window. Default: 60. */
  maxRequests: number;
  /** Window size in milliseconds. Default: 60_000 (1 min). */
  windowMs: number;
  /** Clock source — injected for deterministic tests. */
  clock?: { now(): number };
}

/**
 * RateLimiter — tracks request timestamps per bearer key in a sliding window.
 *
 * Design: for each key, we keep a list of timestamps of recent requests.
 * On each call we prune entries older than windowMs, then check if the
 * count is ≥ maxRequests. If so, the request is rejected (429).
 *
 * No Redis, no external state — deterministic, in-process only (PRD §6.8).
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly clock: { now(): number };
  /** Map: key → sorted list of timestamps (ascending) within the window. */
  private readonly windows: Map<string, number[]> = new Map();

  constructor(opts: RateLimiterOptions) {
    this.maxRequests = opts.maxRequests;
    this.windowMs = opts.windowMs;
    this.clock = opts.clock ?? { now: () => Date.now() };
  }

  /**
   * check — returns true if the request is allowed; records the timestamp.
   * Returns false if the key has exhausted the rate limit for this window.
   */
  check(key: string): boolean {
    const now = this.clock.now();
    const cutoff = now - this.windowMs;

    // Get or create the timestamp list for this key.
    const existing = this.windows.get(key) ?? [];
    // Prune stale entries (older than windowMs).
    const recent = existing.filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      // Persist the pruned list (don't record this rejected request).
      this.windows.set(key, recent);
      return false;
    }

    // Record this request's timestamp.
    recent.push(now);
    this.windows.set(key, recent);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Type guard: is a string a known ToolName?
// ---------------------------------------------------------------------------

/** All valid tool names (derived from the TOOLS registry at runtime). */
const TOOL_NAMES = new Set<string>(Object.keys(TOOLS));

function isToolName(name: string): name is ToolName {
  return TOOL_NAMES.has(name);
}

// ---------------------------------------------------------------------------
// createApp factory
// ---------------------------------------------------------------------------

export interface AppOptions {
  config: GatewayConfig;
  /**
   * Optional rate-limiter override — used in tests to inject a deterministic
   * clock or a lower maxRequests ceiling.
   */
  rateLimiter?: RateLimiter;
}

/**
 * createApp — builds and returns the configured Hono application.
 *
 * Separated from server.ts so tests can call `app.request(...)` directly
 * without binding to a real port (Hono's built-in test client pattern).
 */
export function createApp(opts: AppOptions): Hono {
  const { config } = opts;
  const limiter = opts.rateLimiter ?? new RateLimiter({ maxRequests: 60, windowMs: 60_000 });

  const app = new Hono();

  // ── CORS ──────────────────────────────────────────────────────────────────
  // PRD §6.8: * in mock, disabled in live.
  if (config.mode === "mock") {
    app.use("*", cors({ origin: "*" }));
  }

  // ── Bearer auth middleware ─────────────────────────────────────────────────
  // Rejects (401) any request without the exact TOOL_GATEWAY_KEY in the
  // Authorization header. Never exposes wallet or operator functions.
  app.use("/tools/*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (authHeader === undefined || authHeader === "") {
      return c.json({ success: false, error: "Missing Authorization header" }, 401);
    }
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (match === null) {
      return c.json({ success: false, error: "Invalid Authorization header format" }, 401);
    }
    const token = match[1];
    if (token !== config.gatewayKey) {
      return c.json({ success: false, error: "Invalid bearer token" }, 401);
    }
    await next();
  });

  // ── Rate-limit middleware ──────────────────────────────────────────────────
  // 60 req/min per bearer key, in-memory sliding window. 429 on breach.
  app.use("/tools/*", async (c, next) => {
    const authHeader = c.req.header("Authorization") ?? "";
    // Key is the bearer token value (already validated by auth middleware above).
    const tokenMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
    const key = tokenMatch !== null && tokenMatch[1] !== undefined ? tokenMatch[1] : authHeader;
    if (!limiter.check(key)) {
      return c.json({ success: false, error: "Rate limit exceeded" }, 429);
    }
    await next();
  });

  // ── POST /tools/:name ─────────────────────────────────────────────────────
  app.post("/tools/:name", async (c) => {
    const name = c.req.param("name");

    // Validate the tool name.
    if (!isToolName(name)) {
      return c.json(
        {
          success: false,
          error: `Unknown tool: "${name}". Valid tools: ${[...TOOL_NAMES].join(", ")}`,
        },
        404,
      );
    }

    // Parse the request body.
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Request body must be valid JSON" }, 400);
    }

    // Retrieve and run the tool (zod validation is the tool's own responsibility).
    const tool = getTool(name);
    const deps = {
      clock: { now: () => Date.now() },
      historySource: new MockHistorySource({}),
    };

    try {
      const result = await tool.run(body, deps);
      return c.json({ success: true, result });
    } catch (err: unknown) {
      // ZodError or any tool runtime error → 400 with the message.
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  return app;
}
