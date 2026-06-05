/**
 * cost-breaker.test.ts — Unit tests for CostBreaker. (PRD §14.15, T-207)
 *
 * Covers:
 *  1. Accumulation math: known tokens × known rates produces correct spend.
 *  2. isCapped() is false below the threshold and true when spend > maxUsd.
 *  3. addResponse() folds a ModelResponse correctly.
 *  4. remainingUsd() returns the correct remaining budget.
 *  5. Unknown model: cost treated as 0, model added to unknownModels set.
 *  6. Multiple calls accumulate correctly.
 */

import { describe, expect, it } from "vitest";
import { CostBreaker } from "../src/cost-breaker.js";
import type { ModelResponse } from "../src/seams/types.js";

// ---------------------------------------------------------------------------
// Test cost table (matches fixtures/model-costs.json)
// ---------------------------------------------------------------------------

const TEST_COSTS = {
  "anthropic/claude-sonnet-4.6": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "openai/gpt-5": { inputPer1k: 0.005, outputPer1k: 0.02 },
  "meta/llama-3.3-70b": { inputPer1k: 0.001, outputPer1k: 0.004 },
};

function makeBreaker(maxUsd = 0.05): CostBreaker {
  return new CostBreaker({ maxUsd, costs: TEST_COSTS });
}

// ---------------------------------------------------------------------------
// 1. Accumulation math
// ---------------------------------------------------------------------------

describe("CostBreaker — accumulation math", () => {
  it("adds correct cost for a single call with claude-sonnet-4.6", () => {
    // 1000 input tokens × $0.003/1k  = $0.003
    // 500  output tokens × $0.015/1k = $0.0075
    // total = $0.0105
    const breaker = makeBreaker();
    breaker.add("anthropic/claude-sonnet-4.6", 1000, 500);
    expect(breaker.spentUsd).toBeCloseTo(0.0105, 10);
  });

  it("adds correct cost for meta/llama-3.3-70b", () => {
    // 2000 input × $0.001/1k = $0.002
    // 1000 output × $0.004/1k = $0.004
    // total = $0.006
    const breaker = makeBreaker();
    breaker.add("meta/llama-3.3-70b", 2000, 1000);
    expect(breaker.spentUsd).toBeCloseTo(0.006, 10);
  });

  it("accumulates across multiple add() calls", () => {
    const breaker = makeBreaker();
    // Call 1: meta/llama — 1000/1000 → $0.001 + $0.004 = $0.005
    breaker.add("meta/llama-3.3-70b", 1000, 1000);
    // Call 2: openai/gpt-5 — 1000/1000 → $0.005 + $0.02 = $0.025
    breaker.add("openai/gpt-5", 1000, 1000);
    expect(breaker.spentUsd).toBeCloseTo(0.03, 10);
  });
});

// ---------------------------------------------------------------------------
// 2. isCapped() behaviour
// ---------------------------------------------------------------------------

describe("CostBreaker — isCapped()", () => {
  it("is false when spentUsd is below maxUsd", () => {
    const breaker = makeBreaker(0.05);
    breaker.add("meta/llama-3.3-70b", 1000, 1000); // $0.005
    expect(breaker.isCapped()).toBe(false);
  });

  it("is false when spentUsd equals maxUsd exactly", () => {
    // Construct a breaker where spend == maxUsd exactly (boundary: not >)
    // maxUsd = 0.005; add meta/llama 1000/1000 = $0.005 exactly
    const breaker = new CostBreaker({ maxUsd: 0.005, costs: TEST_COSTS });
    breaker.add("meta/llama-3.3-70b", 1000, 1000);
    // spentUsd == maxUsd → NOT capped (condition is strictly >)
    expect(breaker.isCapped()).toBe(false);
  });

  it("is true when spentUsd exceeds maxUsd by a tiny margin", () => {
    // maxUsd = 0.005; we spend $0.006 (1000/1500 meta/llama: 0.001 + 0.006 = 0.007)
    const breaker = new CostBreaker({ maxUsd: 0.005, costs: TEST_COSTS });
    breaker.add("meta/llama-3.3-70b", 1000, 1500); // 0.001 + 0.006 = 0.007
    expect(breaker.isCapped()).toBe(true);
  });

  it("flips from false to true as spend crosses the cap", () => {
    const breaker = new CostBreaker({ maxUsd: 0.01, costs: TEST_COSTS });
    breaker.add("meta/llama-3.3-70b", 1000, 1000); // $0.005 — still ok
    expect(breaker.isCapped()).toBe(false);
    breaker.add("meta/llama-3.3-70b", 1000, 1000); // $0.010 — exact boundary, NOT capped
    expect(breaker.isCapped()).toBe(false);
    breaker.add("meta/llama-3.3-70b", 1, 1); // tiny push over → capped
    expect(breaker.isCapped()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. addResponse() folds a ModelResponse
// ---------------------------------------------------------------------------

describe("CostBreaker — addResponse()", () => {
  it("folds a ModelResponse using modelUsed as the key", () => {
    const resp: ModelResponse = {
      text: "hello",
      tokensIn: 1000,
      tokensOut: 500,
      modelUsed: "anthropic/claude-sonnet-4.6",
    };
    const breaker = makeBreaker();
    breaker.addResponse(resp);
    // 1000/1k × 0.003 + 500/1k × 0.015 = 0.003 + 0.0075 = 0.0105
    expect(breaker.spentUsd).toBeCloseTo(0.0105, 10);
  });

  it("addResponse and add produce the same result for identical inputs", () => {
    const breakerAdd = makeBreaker();
    const breakerResp = makeBreaker();

    breakerAdd.add("openai/gpt-5", 2000, 800);

    const resp: ModelResponse = {
      text: "x",
      tokensIn: 2000,
      tokensOut: 800,
      modelUsed: "openai/gpt-5",
    };
    breakerResp.addResponse(resp);

    expect(breakerAdd.spentUsd).toBeCloseTo(breakerResp.spentUsd, 10);
  });

  it("addResponse marks capped correctly when spend exceeds maxUsd", () => {
    // maxUsd = 0.001; spend $0.0105 (claude sonnet 1k/500)
    const breaker = new CostBreaker({ maxUsd: 0.001, costs: TEST_COSTS });
    const resp: ModelResponse = {
      text: "x",
      tokensIn: 1000,
      tokensOut: 500,
      modelUsed: "anthropic/claude-sonnet-4.6",
    };
    breaker.addResponse(resp);
    expect(breaker.isCapped()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. remainingUsd()
// ---------------------------------------------------------------------------

describe("CostBreaker — remainingUsd()", () => {
  it("equals maxUsd before any spend", () => {
    const breaker = makeBreaker(0.05);
    expect(breaker.remainingUsd()).toBeCloseTo(0.05, 10);
  });

  it("decreases as spend accumulates", () => {
    const breaker = makeBreaker(0.05);
    breaker.add("meta/llama-3.3-70b", 1000, 1000); // $0.005
    expect(breaker.remainingUsd()).toBeCloseTo(0.045, 10);
  });

  it("goes negative when over cap", () => {
    const breaker = new CostBreaker({ maxUsd: 0.001, costs: TEST_COSTS });
    breaker.add("anthropic/claude-sonnet-4.6", 1000, 500); // $0.0105
    expect(breaker.remainingUsd()).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Unknown model handling
// ---------------------------------------------------------------------------

describe("CostBreaker — unknown model", () => {
  it("treats unknown model cost as 0 (no crash)", () => {
    const breaker = makeBreaker();
    breaker.add("unknown/model-x", 99999, 99999);
    expect(breaker.spentUsd).toBe(0);
  });

  it("adds the unknown model to the unknownModels set", () => {
    const breaker = makeBreaker();
    breaker.add("unknown/model-x", 1, 1);
    expect(breaker.unknownModels.has("unknown/model-x")).toBe(true);
  });

  it("does not mark isCapped() from unknown model spend", () => {
    const breaker = new CostBreaker({ maxUsd: 0.001, costs: TEST_COSTS });
    breaker.add("ghost-model", 1_000_000, 1_000_000);
    expect(breaker.isCapped()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. §14.15 — cost-cap behaviour acceptance test
// ---------------------------------------------------------------------------

describe("CostBreaker — §14.15 acceptance: breaker reports capped", () => {
  it("cumulative tokens × costs > maxUsd → isCapped() returns true", () => {
    // This is the acceptance criterion for T-207.
    const breaker = new CostBreaker({
      maxUsd: 0.05,
      costs: TEST_COSTS,
    });

    // Simulate several model calls that push past the $0.05 cap.
    // claude-sonnet-4.6: 5000 in + 3000 out = $0.015 + $0.045 = $0.060 total
    breaker.add("anthropic/claude-sonnet-4.6", 5000, 3000);

    expect(breaker.spentUsd).toBeGreaterThan(0.05);
    expect(breaker.isCapped()).toBe(true);
  });
});
