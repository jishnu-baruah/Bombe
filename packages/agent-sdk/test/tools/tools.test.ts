/**
 * tools.test.ts — Snapshot + behavioral tests for all six SDK tools.
 * (PRD §6.3, T-210/T-211/T-212)
 *
 * Strategy: every tool is run against its fixture(s) with a SEEDED clock
 * (fetchedAt is deterministic) and `expect(result).toMatchSnapshot()`.
 * Snapshot diffs are the agent's change log (PRD §6.3).
 *
 * Beyond snapshots, explicit behavioral assertions cover:
 *   - fetch_meth_yield stale → low confidence (2000 bps) + stale flag
 *   - compute_expected ±2 bps boundary (in-tolerance and out-of-tolerance)
 *   - read_document servicer(50000) vs statement(45000) mismatch
 *   - cross_check_history returns injected mock history
 *   - ToolResultSchema validates every output
 *
 * Determinism guarantees:
 *   - clock is a fixed constant (never Date.now)
 *   - fixtures are loaded from the real fixture root via deps.fixturesRoot
 *   - no Math.random() anywhere in the tool chain
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockHistorySource, TOOLS, ToolResultSchema, getTool } from "../../src/tools/index.js";
import type { ToolDeps } from "../../src/tools/index.js";

// ---------------------------------------------------------------------------
// Shared test infrastructure
// ---------------------------------------------------------------------------

/**
 * Repo root derived from this test file's location.
 * packages/agent-sdk/test/tools/tools.test.ts → ../../../../.. → repo root
 * (tools.test.ts → tools → test → agent-sdk → packages → repo root)
 */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const FIXTURES_ROOT = join(REPO_ROOT, "fixtures");

/**
 * Seeded clock: always returns 1748822400000 (2025-06-02T00:00:00.000Z).
 * This ensures fetchedAt is deterministic across runs and machines.
 */
const SEEDED_CLOCK = { now: () => 1748822400000 };

/**
 * Standard empty MockHistorySource for tests that don't need prior attestations.
 */
const EMPTY_HISTORY = new MockHistorySource({});

/**
 * Standard ToolDeps used in most tests.
 */
function makeDeps(overrides?: Partial<ToolDeps>): ToolDeps {
  return {
    clock: SEEDED_CLOCK,
    historySource: EMPTY_HISTORY,
    fixturesRoot: FIXTURES_ROOT,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: run a tool and assert the result validates against ToolResultSchema
// ---------------------------------------------------------------------------

async function runTool(name: Parameters<typeof getTool>[0], input: unknown, deps?: ToolDeps) {
  const tool = getTool(name);
  const result = await tool.run(input, deps ?? makeDeps());
  // Every tool output must pass the common schema
  expect(() => ToolResultSchema.parse(result)).not.toThrow();
  return result;
}

// ---------------------------------------------------------------------------
// T-210: fetch_chainlink_price
// ---------------------------------------------------------------------------

describe("fetch_chainlink_price", () => {
  it("returns mETH 30d-fresh snapshot — snapshot", async () => {
    const result = await runTool("fetch_chainlink_price", {
      asset: "mETH",
      period: "30d-fresh",
    });
    expect(result).toMatchSnapshot();
  });

  it("source is 'chainlink'", async () => {
    const result = await runTool("fetch_chainlink_price", { asset: "mETH", period: "30d-fresh" });
    expect(result.source).toBe("chainlink");
  });

  it("fetchedAt equals seeded clock value", async () => {
    const result = await runTool("fetch_chainlink_price", { asset: "mETH", period: "30d-fresh" });
    expect(result.fetchedAt).toBe(SEEDED_CLOCK.now());
  });

  it("fresh snapshot → high confidence (9500)", async () => {
    const result = await runTool("fetch_chainlink_price", { asset: "mETH", period: "30d-fresh" });
    expect(result.confidence).toBe(9500);
  });

  it("stale snapshot → low confidence (2000)", async () => {
    const result = await runTool("fetch_chainlink_price", { asset: "mETH", period: "30d-stale" });
    expect(result.confidence).toBe(2000);
  });

  it("returns USDY snapshot — snapshot", async () => {
    const result = await runTool("fetch_chainlink_price", { asset: "USDY", period: "30d" });
    expect(result).toMatchSnapshot();
  });

  it("throws on missing asset fixture", async () => {
    await expect(
      runTool("fetch_chainlink_price", { asset: "NONEXISTENT", period: "30d" }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-210: fetch_meth_yield
// ---------------------------------------------------------------------------

describe("fetch_meth_yield", () => {
  it("fresh period → full snapshot", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-fresh" });
    expect(result).toMatchSnapshot();
  });

  it("stale period → full snapshot", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-stale" });
    expect(result).toMatchSnapshot();
  });

  it("fresh snapshot → confidence HIGH (9500)", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-fresh" });
    expect(result.confidence).toBe(9500);
  });

  it("stale snapshot → confidence LOW (2000) [claim B STALE_SINGLE_SOURCE trigger]", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-stale" });
    expect(result.confidence).toBe(2000);
  });

  it("stale snapshot → value.stale is true", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-stale" });
    const val = result.value as { stale: boolean };
    expect(val.stale).toBe(true);
  });

  it("fresh snapshot → value.stale is false", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-fresh" });
    const val = result.value as { stale: boolean };
    expect(val.stale).toBe(false);
  });

  it("default period is 30d-fresh (no period arg)", async () => {
    const result = await runTool("fetch_meth_yield", {});
    // Should succeed and return high confidence (fresh is default)
    expect(result.confidence).toBe(9500);
  });

  it("value.yieldBps is 34 for 30d-fresh fixture", async () => {
    const result = await runTool("fetch_meth_yield", { period: "30d-fresh" });
    const val = result.value as { yieldBps: number };
    expect(val.yieldBps).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// T-210: fetch_usdy_yield
// ---------------------------------------------------------------------------

describe("fetch_usdy_yield", () => {
  it("returns USDY 30d snapshot — snapshot", async () => {
    const result = await runTool("fetch_usdy_yield", { period: "30d" });
    expect(result).toMatchSnapshot();
  });

  it("source is 'chainlink'", async () => {
    const result = await runTool("fetch_usdy_yield", { period: "30d" });
    expect(result.source).toBe("chainlink");
  });

  it("fresh snapshot → confidence HIGH (9500)", async () => {
    const result = await runTool("fetch_usdy_yield", { period: "30d" });
    expect(result.confidence).toBe(9500);
  });

  it("value.yieldBps is 525 for 30d fixture", async () => {
    const result = await runTool("fetch_usdy_yield", { period: "30d" });
    const val = result.value as { yieldBps: number };
    expect(val.yieldBps).toBe(525);
  });

  it("default period is 30d (no period arg)", async () => {
    const result = await runTool("fetch_usdy_yield", {});
    expect(result.confidence).toBe(9500);
  });
});

// ---------------------------------------------------------------------------
// T-211: query_chain_state
// ---------------------------------------------------------------------------

describe("query_chain_state — balanceOf", () => {
  it("known account+token → snapshot", async () => {
    const result = await runTool("query_chain_state", {
      op: "balanceOf",
      account: "0xTREASURY_mETH",
      token: "mETH",
    });
    expect(result).toMatchSnapshot();
  });

  it("known account returns found:true", async () => {
    const result = await runTool("query_chain_state", {
      op: "balanceOf",
      account: "0xTREASURY_mETH",
      token: "mETH",
    });
    const val = result.value as { found: boolean };
    expect(val.found).toBe(true);
  });

  it("unknown account+token → found:false, balance:'0'", async () => {
    const result = await runTool("query_chain_state", {
      op: "balanceOf",
      account: "0xUNKNOWN",
      token: "GHOST",
    });
    const val = result.value as { found: boolean; balance: string };
    expect(val.found).toBe(false);
    expect(val.balance).toBe("0");
  });

  it("confidence is always HIGH (9500)", async () => {
    const result = await runTool("query_chain_state", {
      op: "balanceOf",
      account: "0xTREASURY_mETH",
      token: "mETH",
    });
    expect(result.confidence).toBe(9500);
  });
});

describe("query_chain_state — eventOccurred", () => {
  it("known claimRef → snapshot", async () => {
    const result = await runTool("query_chain_state", {
      op: "eventOccurred",
      claimRef: "DIST-2026-05",
    });
    expect(result).toMatchSnapshot();
  });

  it("known event → occurred:true", async () => {
    const result = await runTool("query_chain_state", {
      op: "eventOccurred",
      claimRef: "DIST-2026-05",
    });
    const val = result.value as { occurred: boolean };
    expect(val.occurred).toBe(true);
  });

  it("unknown claimRef → occurred:false, found:false", async () => {
    const result = await runTool("query_chain_state", {
      op: "eventOccurred",
      claimRef: "DIST-NONEXISTENT",
    });
    const val = result.value as { occurred: boolean; found: boolean };
    expect(val.occurred).toBe(false);
    expect(val.found).toBe(false);
  });

  it("rejects invalid op", async () => {
    await expect(
      runTool("query_chain_state", { op: "invalidOp", account: "0x123" }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-211: compute_expected — ±2 bps tolerance (PRD §6.3)
// ---------------------------------------------------------------------------

describe("compute_expected — ±2 bps tolerance", () => {
  it("exact match (0 delta) → withinTolerance:true — snapshot", async () => {
    const result = await runTool("compute_expected", { observedBps: 34, expectedBps: 34 });
    expect(result).toMatchSnapshot();
  });

  it("delta = 1 bps → withinTolerance:true", async () => {
    const result = await runTool("compute_expected", { observedBps: 35, expectedBps: 34 });
    const val = result.value as { withinTolerance: boolean };
    expect(val.withinTolerance).toBe(true);
  });

  it("delta = 2 bps → withinTolerance:true (boundary, inclusive)", async () => {
    const result = await runTool("compute_expected", { observedBps: 36, expectedBps: 34 });
    const val = result.value as { withinTolerance: boolean; deltaBps: number };
    expect(val.deltaBps).toBe(2);
    expect(val.withinTolerance).toBe(true);
  });

  it("delta = 3 bps → withinTolerance:false (just outside boundary)", async () => {
    const result = await runTool("compute_expected", { observedBps: 37, expectedBps: 34 });
    const val = result.value as { withinTolerance: boolean; deltaBps: number };
    expect(val.deltaBps).toBe(3);
    expect(val.withinTolerance).toBe(false);
  });

  it("negative delta (observed < expected) → absolute value used", async () => {
    const result = await runTool("compute_expected", { observedBps: 32, expectedBps: 34 });
    const val = result.value as { deltaBps: number; withinTolerance: boolean };
    expect(val.deltaBps).toBe(2);
    expect(val.withinTolerance).toBe(true);
  });

  it("large delta → withinTolerance:false — snapshot", async () => {
    const result = await runTool("compute_expected", { observedBps: 45000, expectedBps: 50000 });
    expect(result).toMatchSnapshot();
  });

  it("confidence is always HIGH (9500) — pure math", async () => {
    const result = await runTool("compute_expected", { observedBps: 34, expectedBps: 34 });
    expect(result.confidence).toBe(9500);
  });

  it("source is 'compute'", async () => {
    const result = await runTool("compute_expected", { observedBps: 100, expectedBps: 100 });
    expect(result.source).toBe("compute");
  });

  it("rejects non-numeric input", async () => {
    await expect(
      runTool("compute_expected", { observedBps: "notanumber", expectedBps: 34 }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-212: read_document
// ---------------------------------------------------------------------------

describe("read_document — servicer report", () => {
  it("servicer report → snapshot", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-servicer" });
    expect(result).toMatchSnapshot();
  });

  it("fields.cashflowTotal is 50000 (claim C)", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-servicer" });
    const val = result.value as { fields: Record<string, unknown> };
    expect(val.fields.cashflowTotal).toBe(50000);
  });

  it("docType is 'servicer-report'", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-servicer" });
    const val = result.value as { docType: string };
    expect(val.docType).toBe("servicer-report");
  });
});

describe("read_document — bank statement", () => {
  it("bank statement → snapshot", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-statement" });
    expect(result).toMatchSnapshot();
  });

  it("fields.lineItemsTotal is 45000 (claim C mismatch)", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-statement" });
    const val = result.value as { fields: Record<string, unknown> };
    expect(val.fields.lineItemsTotal).toBe(45000);
  });

  it("cashflow mismatch: servicer(50000) !== statement(45000)", async () => {
    const servicer = await runTool("read_document", { docRef: "pc-pool-1-servicer" });
    const statement = await runTool("read_document", { docRef: "pc-pool-1-statement" });
    const servicerFields = (servicer.value as { fields: Record<string, unknown> }).fields;
    const statementFields = (statement.value as { fields: Record<string, unknown> }).fields;
    expect(servicerFields.cashflowTotal).not.toBe(statementFields.lineItemsTotal);
    expect(servicerFields.cashflowTotal).toBe(50000);
    expect(statementFields.lineItemsTotal).toBe(45000);
  });
});

describe("read_document — common properties", () => {
  it("confidence is HIGH (9500)", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-servicer" });
    expect(result.confidence).toBe(9500);
  });

  it("source includes docRef and version", async () => {
    const result = await runTool("read_document", { docRef: "pc-pool-1-servicer" });
    expect(result.source).toContain("pc-pool-1-servicer");
    expect(result.source).toContain("v1");
  });

  it("throws on unknown docRef", async () => {
    await expect(runTool("read_document", { docRef: "nonexistent-doc" })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-212: cross_check_history
// ---------------------------------------------------------------------------

describe("cross_check_history — mock history injected via ToolDeps", () => {
  it("returns injected attestation history — snapshot", async () => {
    const historySource = new MockHistorySource({
      "claim-A": [
        { agent: "reflector", decision: "VALID", confidenceBps: 9000 },
        { agent: "rotor", decision: "VALID", confidenceBps: 8500 },
      ],
    });
    const result = await runTool(
      "cross_check_history",
      { claimRef: "claim-A" },
      makeDeps({ historySource }),
    );
    expect(result).toMatchSnapshot();
  });

  it("returns exact injected priorAttestations array", async () => {
    const mockData = [
      { agent: "rotor", decision: "VALID", confidenceBps: 8500 },
      { agent: "stator", decision: "ABSTAIN", confidenceBps: 0 },
    ];
    const historySource = new MockHistorySource({ "claim-B": mockData });
    const result = await runTool(
      "cross_check_history",
      { claimRef: "claim-B" },
      makeDeps({ historySource }),
    );
    const val = result.value as { priorAttestations: typeof mockData };
    expect(val.priorAttestations).toEqual(mockData);
  });

  it("returns empty array for unknown claimRef", async () => {
    const result = await runTool("cross_check_history", { claimRef: "unknown-claim" });
    const val = result.value as { priorAttestations: unknown[] };
    expect(val.priorAttestations).toEqual([]);
  });

  it("claimRef is echoed in value", async () => {
    const result = await runTool("cross_check_history", { claimRef: "claim-C" });
    const val = result.value as { claimRef: string };
    expect(val.claimRef).toBe("claim-C");
  });

  it("source is 'attestation-history'", async () => {
    const result = await runTool("cross_check_history", { claimRef: "claim-A" });
    expect(result.source).toBe("attestation-history");
  });

  it("confidence is HIGH (9500)", async () => {
    const result = await runTool("cross_check_history", { claimRef: "claim-A" });
    expect(result.confidence).toBe(9500);
  });

  it("empty history → snapshot", async () => {
    const result = await runTool("cross_check_history", { claimRef: "claim-D" });
    expect(result).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TOOLS registry — exhaustiveness check
// ---------------------------------------------------------------------------

describe("TOOLS registry", () => {
  const expectedTools = [
    "fetch_chainlink_price",
    "fetch_meth_yield",
    "fetch_usdy_yield",
    "query_chain_state",
    "compute_expected",
    "read_document",
    "cross_check_history",
  ] as const;

  it("contains exactly 7 tools", () => {
    expect(Object.keys(TOOLS)).toHaveLength(7);
  });

  for (const name of expectedTools) {
    it(`TOOLS contains "${name}"`, () => {
      expect(TOOLS[name]).toBeDefined();
    });

    it(`getTool("${name}") returns the same object`, () => {
      expect(getTool(name)).toBe(TOOLS[name]);
    });

    it(`TOOLS["${name}"].name equals "${name}"`, () => {
      expect(TOOLS[name].name).toBe(name);
    });
  }
});

// ---------------------------------------------------------------------------
// ToolResultSchema validation on every tool output
// ---------------------------------------------------------------------------

describe("ToolResultSchema — validates all tool outputs", () => {
  const cases: Array<{ tool: Parameters<typeof getTool>[0]; input: unknown }> = [
    { tool: "fetch_chainlink_price", input: { asset: "mETH", period: "30d-fresh" } },
    { tool: "fetch_meth_yield", input: { period: "30d-fresh" } },
    { tool: "fetch_meth_yield", input: { period: "30d-stale" } },
    { tool: "fetch_usdy_yield", input: { period: "30d" } },
    {
      tool: "query_chain_state",
      input: { op: "balanceOf", account: "0xTREASURY_mETH", token: "mETH" },
    },
    { tool: "query_chain_state", input: { op: "eventOccurred", claimRef: "DIST-2026-05" } },
    { tool: "compute_expected", input: { observedBps: 34, expectedBps: 34 } },
    { tool: "read_document", input: { docRef: "pc-pool-1-servicer" } },
    { tool: "read_document", input: { docRef: "pc-pool-1-statement" } },
    { tool: "cross_check_history", input: { claimRef: "claim-A" } },
  ];

  for (const { tool, input } of cases) {
    it(`${tool} output passes ToolResultSchema`, async () => {
      const result = await runTool(tool, input);
      expect(() => ToolResultSchema.parse(result)).not.toThrow();
    });
  }
});
