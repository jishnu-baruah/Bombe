import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FixtureNotFound,
  loadDocument,
  loadHumanDecision,
  loadModelCosts,
  loadModelScript,
  loadOracleSnapshot,
} from "../src/fixtures.js";

// ---------------------------------------------------------------------------
// Test helpers — a minimal temp fixture root so tests are hermetic and do
// not depend on the real fixtures/ tree being present at a hard-coded path.
// ---------------------------------------------------------------------------

// We also have access to the real fixtures/ tree via the DEFAULT_FIXTURES_ROOT.
// For tests that just want to verify the data, we point directly at a derived
// root computed the same way as DEFAULT_FIXTURES_ROOT.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REAL_FIXTURES_ROOT: string = resolve(
  fileURLToPath(import.meta.url),
  "../../../..", // fixtures.test.ts → test → shared → packages → repo root
  "fixtures",
);

// Temp root for error-path / bad-fixture tests
let tempRoot: string;

beforeAll(() => {
  tempRoot = join(tmpdir(), `bombe-fixtures-test-${Date.now()}`);
  // Build a minimal fixture tree inside tempRoot
  mkdirSync(join(tempRoot, "oracles", "mETH"), { recursive: true });
  mkdirSync(join(tempRoot, "documents", "v1"), { recursive: true });
  mkdirSync(join(tempRoot, "model-scripts", "reflector"), { recursive: true });

  writeFileSync(
    join(tempRoot, "oracles", "mETH", "30d-fresh.json"),
    JSON.stringify({
      asset: "mETH",
      period: "30d-fresh",
      value: 34,
      fetchedAt: "2026-06-01T00:00:00.000Z",
      stale: false,
      source: "chainlink",
    }),
  );

  writeFileSync(
    join(tempRoot, "oracles", "mETH", "30d-stale.json"),
    JSON.stringify({
      asset: "mETH",
      period: "30d-stale",
      value: 34,
      fetchedAt: "2026-04-01T00:00:00.000Z",
      stale: true,
      source: "chainlink",
    }),
  );

  writeFileSync(
    join(tempRoot, "documents", "v1", "servicer.json"),
    JSON.stringify({
      docRef: "servicer",
      docType: "servicer-report",
      version: "v1",
      fields: { cashflowTotal: 50000 },
    }),
  );

  writeFileSync(
    join(tempRoot, "documents", "v1", "statement.json"),
    JSON.stringify({
      docRef: "statement",
      docType: "bank-statement",
      version: "v1",
      fields: { lineItemsTotal: 45000 },
    }),
  );

  writeFileSync(
    join(tempRoot, "human-decisions.json"),
    JSON.stringify({
      A: { decision: "VALID", confidenceBps: 9000 },
      B: { decision: "ABSTAIN", confidenceBps: 0 },
      C: { decision: "REJECTED", confidenceBps: 8500 },
    }),
  );

  writeFileSync(
    join(tempRoot, "model-costs.json"),
    JSON.stringify({
      "anthropic/claude-sonnet-4.6": { inputPer1k: 0.003, outputPer1k: 0.015 },
      "openai/gpt-5": { inputPer1k: 0.005, outputPer1k: 0.02 },
      "meta/llama-3.3-70b": { inputPer1k: 0.001, outputPer1k: 0.004 },
    }),
  );

  writeFileSync(
    join(tempRoot, "model-scripts", "reflector", "_sample.json"),
    JSON.stringify({ agentId: "reflector", claimId: "_sample", steps: [] }),
  );

  // Bad fixture for schema-rejection test
  writeFileSync(join(tempRoot, "oracles", "mETH", "bad.json"), JSON.stringify({ wrong: "shape" }));
});

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// loadOracleSnapshot
// ---------------------------------------------------------------------------

describe("loadOracleSnapshot", () => {
  it("fresh snapshot: value is 34 and stale is false", () => {
    const snap = loadOracleSnapshot("mETH", "30d-fresh", tempRoot);
    expect(snap.value).toBe(34);
    expect(snap.stale).toBe(false);
  });

  it("stale snapshot: stale is true", () => {
    const snap = loadOracleSnapshot("mETH", "30d-stale", tempRoot);
    expect(snap.stale).toBe(true);
  });

  it("throws FixtureNotFound for a missing asset/period", () => {
    expect(() => loadOracleSnapshot("nonexistent", "30d", tempRoot)).toThrow(FixtureNotFound);
  });

  it("throws (zod) when fixture has wrong shape", () => {
    expect(() => loadOracleSnapshot("mETH", "bad", tempRoot)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadDocument
// ---------------------------------------------------------------------------

describe("loadDocument", () => {
  it("loads servicer-report fixture", () => {
    const doc = loadDocument("servicer", "v1", tempRoot);
    expect(doc.docType).toBe("servicer-report");
    expect(typeof doc.fields.cashflowTotal).toBe("number");
  });

  it("loads bank-statement fixture", () => {
    const doc = loadDocument("statement", "v1", tempRoot);
    expect(doc.docType).toBe("bank-statement");
    expect(typeof doc.fields.lineItemsTotal).toBe("number");
  });

  it("claim-C mismatch: servicer total !== statement total", () => {
    const servicer = loadDocument("pc-pool-1-servicer", "v1", REAL_FIXTURES_ROOT);
    const statement = loadDocument("pc-pool-1-statement", "v1", REAL_FIXTURES_ROOT);
    const servicerTotal = servicer.fields.cashflowTotal as number;
    const statementTotal = statement.fields.lineItemsTotal as number;
    expect(servicerTotal).not.toBe(statementTotal);
    // PRD §6.7 claim C: servicer 50,000 vs statement 45,000
    expect(servicerTotal).toBe(50000);
    expect(statementTotal).toBe(45000);
  });

  it("throws FixtureNotFound for a missing docRef", () => {
    expect(() => loadDocument("no-such-doc", "v1", tempRoot)).toThrow(FixtureNotFound);
  });
});

// ---------------------------------------------------------------------------
// loadModelScript
// ---------------------------------------------------------------------------

describe("loadModelScript", () => {
  it("returns parsed JSON (unknown) for a valid script", () => {
    const script = loadModelScript("reflector", "_sample", tempRoot);
    expect(script).toBeTruthy();
    expect(typeof script).toBe("object");
  });

  it("throws FixtureNotFound for a missing script", () => {
    expect(() => loadModelScript("reflector", "missing", tempRoot)).toThrow(FixtureNotFound);
  });
});

// ---------------------------------------------------------------------------
// loadHumanDecision
// ---------------------------------------------------------------------------

describe("loadHumanDecision", () => {
  it("returns a valid HumanDecision for claim A", () => {
    const dec = loadHumanDecision("A", tempRoot);
    expect(dec.decision).toBe("VALID");
    expect(dec.confidenceBps).toBe(9000);
  });

  it("returns ABSTAIN for claim B", () => {
    const dec = loadHumanDecision("B", tempRoot);
    expect(dec.decision).toBe("ABSTAIN");
    expect(dec.confidenceBps).toBe(0);
  });

  it("returns REJECTED for claim C", () => {
    const dec = loadHumanDecision("C", tempRoot);
    expect(dec.decision).toBe("REJECTED");
  });

  it("throws a clear error for a missing claimId", () => {
    expect(() => loadHumanDecision("NONEXISTENT", tempRoot)).toThrow(
      /loadHumanDecision.*NONEXISTENT/,
    );
  });
});

// ---------------------------------------------------------------------------
// loadModelCosts
// ---------------------------------------------------------------------------

describe("loadModelCosts", () => {
  it("returns costs for the three required models", () => {
    const costs = loadModelCosts(tempRoot);
    expect(costs["anthropic/claude-sonnet-4.6"]).toBeDefined();
    expect(costs["openai/gpt-5"]).toBeDefined();
    expect(costs["meta/llama-3.3-70b"]).toBeDefined();
  });

  it("each entry has inputPer1k and outputPer1k as non-negative numbers", () => {
    const costs = loadModelCosts(tempRoot);
    for (const [_model, rates] of Object.entries(costs)) {
      expect(typeof rates.inputPer1k).toBe("number");
      expect(typeof rates.outputPer1k).toBe("number");
      expect(rates.inputPer1k).toBeGreaterThanOrEqual(0);
      expect(rates.outputPer1k).toBeGreaterThanOrEqual(0);
    }
  });

  it("throws FixtureNotFound when model-costs.json is missing", () => {
    const emptyRoot = join(tmpdir(), `bombe-empty-${Date.now()}`);
    mkdirSync(emptyRoot, { recursive: true });
    try {
      expect(() => loadModelCosts(emptyRoot)).toThrow(FixtureNotFound);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Real fixtures — smoke-test the committed tree via the auto-resolved root
// ---------------------------------------------------------------------------

describe("real fixtures (auto-resolved root)", () => {
  it("loadOracleSnapshot mETH 30d-fresh resolves correctly", () => {
    const snap = loadOracleSnapshot("mETH", "30d-fresh", REAL_FIXTURES_ROOT);
    expect(snap.value).toBe(34);
    expect(snap.stale).toBe(false);
    expect(snap.source).toBe("chainlink");
  });

  it("loadOracleSnapshot mETH 30d-stale is stale", () => {
    const snap = loadOracleSnapshot("mETH", "30d-stale", REAL_FIXTURES_ROOT);
    expect(snap.stale).toBe(true);
  });

  it("loadModelCosts real fixture returns three models", () => {
    const costs = loadModelCosts(REAL_FIXTURES_ROOT);
    expect(Object.keys(costs).length).toBeGreaterThanOrEqual(3);
  });

  it("loadHumanDecision real fixture claim D is ABSTAIN", () => {
    const dec = loadHumanDecision("D", REAL_FIXTURES_ROOT);
    expect(dec.decision).toBe("ABSTAIN");
  });
});
