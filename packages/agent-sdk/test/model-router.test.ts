/**
 * model-router.test.ts — Unit tests for ModelRouter. (PRD §14.14, T-206)
 *
 * Tests:
 *  1. Happy path: primary succeeds → response returned, no switch recorded.
 *  2. §14.14 — 429 failover: primary throws ModelError(status 429) → falls back →
 *     ModelSwitchRecord {modelSwitched:true, from, to: fallbackModel, reason: "rate_limit"}.
 *  3. 5xx failover: primary throws ModelError(status 500) → falls back.
 *  4. Timeout failover: primary throws ModelError(kind "timeout") → falls back.
 *  5. Non-failover (400): primary throws ModelError(status 400) → error propagates, no switch.
 *  6. Double failure → mock fallback: primary 429 + fallback 5xx + mockFallback succeeds →
 *     run completes with mock response and TWO switch records.
 *  7. onSwitch callback is invoked with the correct record.
 *  8. No fallback configured: primary error propagates.
 *  9. Legacy plain Error message "429" triggers rate_limit failover.
 * 10. Legacy plain Error message "timeout" triggers timeout failover.
 */

import { describe, expect, it } from "vitest";
import {
  ModelError,
  ModelRouter,
  type ModelSwitchRecord,
  createModelRouter,
} from "../src/model-router.js";
import { MockModelSeam } from "../src/seams/mock.js";
import { StubModelSeam } from "../src/seams/stub.js";
import type { ModelRequest, ModelResponse } from "../src/seams/types.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_REQ: ModelRequest = {
  model: "primary-model",
  messages: [{ role: "user", content: "test question" }],
  maxTokens: 128,
};

const FALLBACK_MODEL = "meta/llama-3.3-70b";

function makeSuccessResp(modelUsed = "primary-model"): ModelResponse {
  return { text: `response from ${modelUsed}`, tokensIn: 10, tokensOut: 5, modelUsed };
}

/** Throws a ModelError with the given status. */
function throwStatus(status: number): () => never {
  return () => {
    throw new ModelError(`HTTP ${status.toString()}`, status);
  };
}

/** Throws a ModelError with kind "timeout". */
function throwTimeout(): never {
  throw new ModelError("request timed out", undefined, "timeout");
}

/** Throws a plain Error with a message containing "timeout". */
function throwLegacyTimeout(): never {
  throw new Error("Connection timeout after 5000ms");
}

/** Throws a plain Error with a message containing "429". */
function throwLegacy429(): never {
  throw new Error("HTTP 429 Too Many Requests");
}

/** Throws a plain Error with a message containing "503". */
function throwLegacy503(): never {
  throw new Error("Upstream error: 503 Service Unavailable");
}

// ---------------------------------------------------------------------------
// Test 1: Happy path — primary succeeds, no switch recorded
// ---------------------------------------------------------------------------

describe("ModelRouter — happy path", () => {
  it("returns primary response when primary succeeds", async () => {
    const primaryResp = makeSuccessResp("primary-model");
    const primary = new StubModelSeam(primaryResp);
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    const resp = await router.complete(BASE_REQ);

    expect(resp).toEqual(primaryResp);
  });

  it("records NO switches when primary succeeds", async () => {
    const primary = new StubModelSeam(makeSuccessResp());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(0);
  });

  it("does NOT invoke onSwitch callback when primary succeeds", async () => {
    const primary = new StubModelSeam(makeSuccessResp());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));
    const switchRecords: ModelSwitchRecord[] = [];

    const router = new ModelRouter({
      primary,
      fallback,
      fallbackModel: FALLBACK_MODEL,
      onSwitch: (rec) => switchRecords.push(rec),
    });
    await router.complete(BASE_REQ);

    expect(switchRecords).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: §14.14 — 429 failover (acceptance test)
// ---------------------------------------------------------------------------

describe("ModelRouter — §14.14 acceptance: stubbed 429 → fallback → modelSwitched:true", () => {
  it("falls back when primary throws ModelError(status 429)", async () => {
    const fallbackResp = makeSuccessResp(FALLBACK_MODEL);
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(fallbackResp);

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    const resp = await router.complete(BASE_REQ);

    expect(resp).toEqual(fallbackResp);
  });

  it("records ModelSwitchRecord with modelSwitched:true on 429", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(1);
    expect(router.switches[0]).toBeDefined();
    expect(router.switches[0]?.modelSwitched).toBe(true);
  });

  it("switch record has correct from, to, and reason on 429", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    const rec = router.switches[0];
    expect(rec?.from).toBe("primary-model");
    expect(rec?.to).toBe(FALLBACK_MODEL);
    expect(rec?.reason).toBe("rate_limit");
  });

  it("fallback receives request with model set to fallbackModel", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    let seenModel = "";
    const fallback = new StubModelSeam((req) => {
      seenModel = req.model;
      return makeSuccessResp(req.model);
    });

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(seenModel).toBe(FALLBACK_MODEL);
  });
});

// ---------------------------------------------------------------------------
// Test 3: 5xx failover
// ---------------------------------------------------------------------------

describe("ModelRouter — 5xx failover", () => {
  it("falls back when primary throws ModelError(status 500)", async () => {
    const fallbackResp = makeSuccessResp(FALLBACK_MODEL);
    const primary = new StubModelSeam(throwStatus(500));
    const fallback = new StubModelSeam(fallbackResp);

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    const resp = await router.complete(BASE_REQ);

    expect(resp).toEqual(fallbackResp);
    expect(router.switches[0]?.reason).toBe("server");
  });

  it("falls back when primary throws ModelError(status 503)", async () => {
    const primary = new StubModelSeam(throwStatus(503));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(1);
    expect(router.switches[0]?.reason).toBe("server");
  });

  it("falls back when primary throws ModelError(status 599)", async () => {
    const primary = new StubModelSeam(throwStatus(599));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches[0]?.reason).toBe("server");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Timeout failover
// ---------------------------------------------------------------------------

describe("ModelRouter — timeout failover", () => {
  it("falls back when primary throws ModelError(kind 'timeout')", async () => {
    const primary = new StubModelSeam(() => throwTimeout());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(1);
    expect(router.switches[0]?.reason).toBe("timeout");
  });

  it("records correct switch record for timeout", async () => {
    const primary = new StubModelSeam(() => throwTimeout());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    const rec = router.switches[0];
    expect(rec?.from).toBe("primary-model");
    expect(rec?.to).toBe(FALLBACK_MODEL);
    expect(rec?.reason).toBe("timeout");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Non-failover (400) — error propagates, no switch
// ---------------------------------------------------------------------------

describe("ModelRouter — non-failover error (400)", () => {
  it("rethrows ModelError(status 400) without falling back", async () => {
    const err400 = new ModelError("Bad Request", 400);
    const primary = new StubModelSeam(() => {
      throw err400;
    });
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });

    await expect(router.complete(BASE_REQ)).rejects.toThrow("Bad Request");
  });

  it("records NO switches when a 400 error is thrown", async () => {
    const primary = new StubModelSeam(() => {
      throw new ModelError("Bad Request", 400);
    });
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });

    try {
      await router.complete(BASE_REQ);
    } catch {
      // expected
    }

    expect(router.switches).toHaveLength(0);
  });

  it("rethrows ModelError(kind 'other') without falling back", async () => {
    const primary = new StubModelSeam(() => {
      throw new ModelError("validation failed", undefined, "other");
    });
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });

    await expect(router.complete(BASE_REQ)).rejects.toThrow("validation failed");
    expect(router.switches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Double failure → mock fallback → TWO switch records
// ---------------------------------------------------------------------------

describe("ModelRouter — double failure with mock fallback", () => {
  it("run completes via mockFallback when primary 429 + fallback 5xx", async () => {
    const mockFallback = new MockModelSeam();
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(throwStatus(503));

    const router = new ModelRouter({
      primary,
      fallback,
      mockFallback,
      fallbackModel: FALLBACK_MODEL,
    });

    // Should NOT throw — must complete.
    const resp = await router.complete(BASE_REQ);
    expect(resp).toBeDefined();
    expect(typeof resp.text).toBe("string");
  });

  it("records exactly TWO switch records on double failure", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(throwStatus(503));
    const mockFallback = new MockModelSeam();

    const router = new ModelRouter({
      primary,
      fallback,
      mockFallback,
      fallbackModel: FALLBACK_MODEL,
    });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(2);
  });

  it("first switch is primary→fallback, second is fallback→mock", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(throwStatus(503));
    const mockFallback = new MockModelSeam();

    const router = new ModelRouter({
      primary,
      fallback,
      mockFallback,
      fallbackModel: FALLBACK_MODEL,
    });
    await router.complete(BASE_REQ);

    const [first, second] = router.switches;
    expect(first?.from).toBe("primary-model");
    expect(first?.to).toBe(FALLBACK_MODEL);
    expect(first?.reason).toBe("rate_limit");

    expect(second?.from).toBe(FALLBACK_MODEL);
    expect(second?.to).toBe("mock");
    expect(second?.reason).toBe("server");
  });

  it("both switch records have modelSwitched:true", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(throwStatus(500));
    const mockFallback = new MockModelSeam();

    const router = new ModelRouter({
      primary,
      fallback,
      mockFallback,
      fallbackModel: FALLBACK_MODEL,
    });
    await router.complete(BASE_REQ);

    for (const rec of router.switches) {
      expect(rec.modelSwitched).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7: onSwitch callback
// ---------------------------------------------------------------------------

describe("ModelRouter — onSwitch callback", () => {
  it("invokes onSwitch with the switch record on failover", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));
    const received: ModelSwitchRecord[] = [];

    const router = new ModelRouter({
      primary,
      fallback,
      fallbackModel: FALLBACK_MODEL,
      onSwitch: (rec) => received.push(rec),
    });
    await router.complete(BASE_REQ);

    expect(received).toHaveLength(1);
    expect(received[0]?.modelSwitched).toBe(true);
    expect(received[0]?.reason).toBe("rate_limit");
  });

  it("invokes onSwitch twice on double failure", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(throwStatus(500));
    const mockFallback = new MockModelSeam();
    const received: ModelSwitchRecord[] = [];

    const router = new ModelRouter({
      primary,
      fallback,
      mockFallback,
      fallbackModel: FALLBACK_MODEL,
      onSwitch: (rec) => received.push(rec),
    });
    await router.complete(BASE_REQ);

    expect(received).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test 8: No fallback configured — primary error propagates
// ---------------------------------------------------------------------------

describe("ModelRouter — no fallback configured", () => {
  it("rethrows primary failover-worthy error when no fallback exists", async () => {
    const primary = new StubModelSeam(throwStatus(429));

    const router = new ModelRouter({
      primary,
      fallbackModel: FALLBACK_MODEL,
      // no fallback, no mockFallback
    });

    await expect(router.complete(BASE_REQ)).rejects.toBeInstanceOf(ModelError);
  });
});

// ---------------------------------------------------------------------------
// Test 9: Legacy plain Error — message "429" triggers rate_limit failover
// ---------------------------------------------------------------------------

describe("ModelRouter — legacy plain Error classification", () => {
  it("classifies plain Error message '429' as rate_limit → failover", async () => {
    const primary = new StubModelSeam(() => throwLegacy429());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(1);
    expect(router.switches[0]?.reason).toBe("rate_limit");
  });

  it("classifies plain Error message '503' as server → failover", async () => {
    const primary = new StubModelSeam(() => throwLegacy503());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(1);
    expect(router.switches[0]?.reason).toBe("server");
  });
});

// ---------------------------------------------------------------------------
// Test 10: Legacy plain Error — "timeout" triggers timeout failover
// ---------------------------------------------------------------------------

describe("ModelRouter — legacy timeout via message", () => {
  it("classifies plain Error with 'timeout' in message → timeout failover", async () => {
    const primary = new StubModelSeam(() => throwLegacyTimeout());
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(1);
    expect(router.switches[0]?.reason).toBe("timeout");
  });
});

// ---------------------------------------------------------------------------
// Test 11: createModelRouter factory
// ---------------------------------------------------------------------------

describe("createModelRouter factory", () => {
  it("creates a ModelRouter with a mock fallback as final safety net", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));

    const router = createModelRouter(primary, fallback, { fallbackModel: FALLBACK_MODEL });

    const resp = await router.complete(BASE_REQ);
    expect(resp).toBeDefined();
    expect(router.switches).toHaveLength(1);
  });

  it("factory passes onSwitch callback through correctly", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(makeSuccessResp(FALLBACK_MODEL));
    const received: ModelSwitchRecord[] = [];

    const router = createModelRouter(
      primary,
      fallback,
      { fallbackModel: FALLBACK_MODEL },
      { onSwitch: (rec) => received.push(rec) },
    );
    await router.complete(BASE_REQ);

    expect(received).toHaveLength(1);
    expect(received[0]?.modelSwitched).toBe(true);
  });

  it("factory wires triple fallback: primary 429 + fallback 500 → mock completes", async () => {
    const primary = new StubModelSeam(throwStatus(429));
    const fallback = new StubModelSeam(throwStatus(500));

    const router = createModelRouter(primary, fallback, { fallbackModel: FALLBACK_MODEL });
    const resp = await router.complete(BASE_REQ);

    expect(resp).toBeDefined();
    expect(router.switches).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test 12: switches accumulate across multiple complete() calls
// ---------------------------------------------------------------------------

describe("ModelRouter — switches accumulate across calls", () => {
  it("switch records from multiple calls accumulate in router.switches", async () => {
    // First call: primary 429 → fallback succeeds.
    // Second call: primary 429 → fallback succeeds.
    const primary = new StubModelSeam([throwStatus(429), throwStatus(429)]);
    const fallback = new StubModelSeam([
      makeSuccessResp(FALLBACK_MODEL),
      makeSuccessResp(FALLBACK_MODEL),
    ]);

    const router = new ModelRouter({ primary, fallback, fallbackModel: FALLBACK_MODEL });
    await router.complete(BASE_REQ);
    await router.complete(BASE_REQ);

    expect(router.switches).toHaveLength(2);
  });
});
