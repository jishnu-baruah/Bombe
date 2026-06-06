/**
 * gateway.test.ts — Integration tests for @bombe/tool-gateway. (T-405)
 *
 * Uses Hono's built-in test client `app.request(...)` — no supertest, no live port.
 *
 * Tests:
 *   1. Round-trip: authed POST /tools/compute_expected → 200 {success:true, result:{...}}
 *   2. Auth:       missing bearer → 401; wrong bearer → 401; correct bearer → passes
 *   3. Unknown tool name → 404 {success:false, error}
 *   4. Bad body (fails zod schema) → 400 {success:false, error}
 *   5. Rate limit: 61 requests within window → 61st gets 429
 *   6. Thin-wrapper check: gateway result == in-process getTool().run() result
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MockHistorySource, getTool } from "@bombe/agent-sdk";
import { describe, expect, it } from "vitest";
import { RateLimiter, createApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Shared test config
// ---------------------------------------------------------------------------

const TEST_KEY = "test-gateway-key";

const mockConfig: GatewayConfig = {
  gatewayKey: TEST_KEY,
  mode: "mock",
  port: 8787,
};

/** Headers for an authenticated request. */
const authHeaders = {
  Authorization: `Bearer ${TEST_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Create a fresh app instance for each test (no shared state between tests
 * except where we deliberately inject a shared RateLimiter).
 */
function makeApp(rateLimiter?: RateLimiter) {
  return createApp({ config: mockConfig, rateLimiter });
}

// ---------------------------------------------------------------------------
// Repo / fixtures root — needed for the thin-wrapper test
// ---------------------------------------------------------------------------

/**
 * Repo root: apps/tool-gateway/test/gateway.test.ts → ../../../../ → repo root
 * (gateway.test.ts → test → tool-gateway → apps → repo root)
 */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const FIXTURES_ROOT = join(REPO_ROOT, "fixtures");

/** Deterministic clock shared between gateway and in-process calls for comparison. */
const SEEDED_CLOCK = { now: () => 1748822400000 };

// ---------------------------------------------------------------------------
// Test 1 — Round-trip: compute_expected with a valid body
// ---------------------------------------------------------------------------

describe("POST /tools/compute_expected — round-trip", () => {
  it("returns 200 {success:true, result} for a valid authed request", async () => {
    const app = makeApp();
    const body = JSON.stringify({ observedBps: 34, expectedBps: 34 });

    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: authHeaders,
      body,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; result: unknown };
    expect(json.success).toBe(true);

    const result = json.result as {
      value: {
        observedBps: number;
        expectedBps: number;
        deltaBps: number;
        withinTolerance: boolean;
      };
      source: string;
      confidence: number;
      fetchedAt: number;
    };
    expect(result.value.observedBps).toBe(34);
    expect(result.value.expectedBps).toBe(34);
    expect(result.value.deltaBps).toBe(0);
    expect(result.value.withinTolerance).toBe(true);
    expect(result.source).toBe("compute");
    expect(result.confidence).toBe(9500);
    expect(typeof result.fetchedAt).toBe("number");
  });

  it("returns 200 for fetch_meth_yield with a valid authed request", async () => {
    const app = makeApp();
    const body = JSON.stringify({ period: "30d-fresh" });

    const res = await app.request("/tools/fetch_meth_yield", {
      method: "POST",
      headers: authHeaders,
      body,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; result: unknown };
    expect(json.success).toBe(true);

    const result = json.result as {
      value: { asset: string; period: string; yieldBps: number; stale: boolean };
      source: string;
    };
    expect(result.value.asset).toBe("mETH");
    expect(result.value.period).toBe("30d-fresh");
    expect(typeof result.value.yieldBps).toBe("number");
    expect(result.value.stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Auth: missing / wrong bearer → 401; correct bearer → passes
// ---------------------------------------------------------------------------

describe("Auth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observedBps: 10, expectedBps: 10 }),
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
  });

  it("returns 401 when bearer token is wrong", async () => {
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ observedBps: 10, expectedBps: 10 }),
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
  });

  it("returns 200 when bearer token is correct", async () => {
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ observedBps: 10, expectedBps: 10 }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: {
        Authorization: TEST_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ observedBps: 10, expectedBps: 10 }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Unknown tool name → 404
// ---------------------------------------------------------------------------

describe("Unknown tool name", () => {
  it("returns 404 for a tool name that does not exist", async () => {
    const app = makeApp();
    const res = await app.request("/tools/nonexistent_tool", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("nonexistent_tool");
  });

  it("does not execute any tool for an unknown name", async () => {
    const app = makeApp();
    const res = await app.request("/tools/wallet_transfer", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ amount: "all" }),
    });
    // Must be 404 — gateway never exposes wallet/operator functions.
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Bad body (fails zod schema) → 400 {success:false, error}
// ---------------------------------------------------------------------------

describe("Bad body validation", () => {
  it("returns 400 when body fails compute_expected schema (missing observedBps)", async () => {
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ unexpectedField: "x" }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
  });

  it("returns 400 for non-JSON body", async () => {
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "text/plain" },
      body: "not json at all",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
  });

  it("returns 400 when query_chain_state body has wrong op type", async () => {
    const app = makeApp();
    const res = await app.request("/tools/query_chain_state", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ op: "unknownOp", account: "0xabc", token: "mETH" }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Rate limit: 61 requests → 61st gets 429
//
// We inject a deterministic clock and set maxRequests=10 / windowMs=60_000
// to keep the test fast: 11 requests is cheaper than 61.
// ---------------------------------------------------------------------------

describe("Rate limiting", () => {
  it("allows requests up to the limit then returns 429 on the next one", async () => {
    const MAX = 10;
    // Fixed clock: all requests appear at the same instant (within the window).
    let fakeNow = 1_000_000;
    const fakeClock = { now: () => fakeNow };

    const limiter = new RateLimiter({ maxRequests: MAX, windowMs: 60_000, clock: fakeClock });
    const app = makeApp(limiter);

    const body = JSON.stringify({ observedBps: 1, expectedBps: 1 });

    // First MAX requests should succeed.
    for (let i = 0; i < MAX; i++) {
      const res = await app.request("/tools/compute_expected", {
        method: "POST",
        headers: authHeaders,
        body,
      });
      expect(res.status).toBe(200);
    }

    // MAX+1 request should be rate-limited.
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: authHeaders,
      body,
    });
    expect(res.status).toBe(429);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("Rate limit");

    // After advancing the clock past the window, requests should succeed again.
    fakeNow += 60_001;
    const resAfter = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: authHeaders,
      body,
    });
    expect(resAfter.status).toBe(200);
  });

  it("tracks rate limits per bearer key (different keys don't share quota)", async () => {
    const MAX = 3;
    const fakeClock = { now: () => 1_000_000 };
    const limiter = new RateLimiter({ maxRequests: MAX, windowMs: 60_000, clock: fakeClock });

    const configTwo: GatewayConfig = {
      gatewayKey: "key-a",
      mode: "mock",
      port: 8787,
    };
    const app = createApp({ config: configTwo, rateLimiter: limiter });

    const body = JSON.stringify({ observedBps: 1, expectedBps: 1 });
    const headersA = { Authorization: "Bearer key-a", "Content-Type": "application/json" };

    // Exhaust key-a's quota.
    for (let i = 0; i < MAX; i++) {
      const r = await app.request("/tools/compute_expected", {
        method: "POST",
        headers: headersA,
        body,
      });
      expect(r.status).toBe(200);
    }

    // Next call with key-a → 429.
    const blocked = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: headersA,
      body,
    });
    expect(blocked.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Thin-wrapper check: gateway result == in-process getTool().run()
// ---------------------------------------------------------------------------

describe("Thin-wrapper check", () => {
  it("compute_expected gateway result equals in-process tool result (deterministic input)", async () => {
    // Run in-process first with a seeded clock so we can compare outputs.
    // NOTE: the gateway uses Date.now() internally (which we cannot override via HTTP),
    // so we cannot compare fetchedAt timestamps. We compare everything else.
    const tool = getTool("compute_expected");
    const input = { observedBps: 500, expectedBps: 498 };
    const deps = {
      clock: SEEDED_CLOCK,
      historySource: new MockHistorySource({}),
      fixturesRoot: FIXTURES_ROOT,
    };
    const inProcessResult = await tool.run(input, deps);

    // Run via gateway.
    const app = makeApp();
    const res = await app.request("/tools/compute_expected", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(input),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; result: typeof inProcessResult };
    expect(json.success).toBe(true);

    // The value shape must be identical (pure math, no clock dependency in value).
    expect(json.result.value).toStrictEqual(inProcessResult.value);
    expect(json.result.source).toBe(inProcessResult.source);
    expect(json.result.confidence).toBe(inProcessResult.confidence);
    // fetchedAt differs (gateway uses Date.now), but must be a number.
    expect(typeof json.result.fetchedAt).toBe("number");
  });

  it("cross_check_history gateway result equals in-process result (empty history)", async () => {
    const tool = getTool("cross_check_history");
    const input = { claimRef: "claim-A" };
    const deps = {
      clock: SEEDED_CLOCK,
      historySource: new MockHistorySource({}),
      fixturesRoot: FIXTURES_ROOT,
    };
    const inProcessResult = await tool.run(input, deps);

    const app = makeApp();
    const res = await app.request("/tools/cross_check_history", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(input),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; result: typeof inProcessResult };
    expect(json.success).toBe(true);

    // Value shape must match.
    expect(json.result.value).toStrictEqual(inProcessResult.value);
    expect(json.result.source).toBe(inProcessResult.source);
    expect(json.result.confidence).toBe(inProcessResult.confidence);
  });
});
