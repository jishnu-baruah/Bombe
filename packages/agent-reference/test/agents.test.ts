/**
 * agents.test.ts — Reference agent × claim A–D outcome matrix tests. (PRD §6.7, T-304)
 *
 * For each agent (Reflector / Rotor / Stator) × each claim (A / B / C / D):
 *   Runs the agent with a ScriptedModelSeam + real tools + seeded clock + MockHistorySource.
 *   Asserts the §6.7 decision outcome.
 *
 * Expected outcome matrix (PRD §6.7):
 *   | Claim | Reflector                    | Rotor   | Stator  |
 *   |-------|------------------------------|---------|---------|
 *   | A     | VALID                        | VALID   | VALID   |
 *   | B     | ABSTAIN(STALE_SINGLE_SOURCE) | VALID   | ABSTAIN |
 *   | C     | REJECTED                     | REJECTED| REJECTED|
 *   | D     | ABSTAIN(TIER3_OVERRIDE)      | ABSTAIN | ABSTAIN |
 *
 * M2 checkpoint:
 *   Reflector on claim B → ABSTAIN with reason STALE_SINGLE_SOURCE AND stable hash
 *   (two runs produce identical hashCanonical(trace) values).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashCanonical } from "@bombe/shared";
import type { Claim } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import {
  REFLECTOR_CONFIG,
  ROTOR_CONFIG,
  STATOR_CONFIG,
  ScriptedModelSeam,
  runReferenceAgent,
} from "../src/index.js";
import type { ModelScript, ReferenceAgentConfig } from "../src/index.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Repo root: packages/agent-reference/test/agents.test.ts
 * Navigate: test → agent-reference → packages → repo root
 */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const FIXTURES_ROOT = resolve(REPO_ROOT, "fixtures");

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Load a single claim from fixtures/claims.json. */
function loadClaimSync(claimId: "A" | "B" | "C" | "D"): Claim {
  const raw = readFileSync(join(FIXTURES_ROOT, "claims.json"), "utf-8");
  const all = JSON.parse(raw) as Record<string, unknown>;
  const claim = all[claimId];
  if (claim === undefined) {
    throw new Error(`Claim "${claimId}" not found in fixtures/claims.json`);
  }
  return claim as Claim;
}

/** Load a model-script fixture for an agent + claim. */
function loadScript(agentId: string, claimId: string): ModelScript {
  const filePath = join(FIXTURES_ROOT, "model-scripts", agentId, `${claimId}.json`);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ModelScript;
}

/** Build a fresh ScriptedModelSeam for an agent + claim combination. */
function makeSeam(config: ReferenceAgentConfig, claimId: string): ScriptedModelSeam {
  const script = loadScript(config.agentId, claimId);
  return new ScriptedModelSeam(script, config.model);
}

// ---------------------------------------------------------------------------
// Shared runner
// ---------------------------------------------------------------------------

/** Run a reference agent on a claim and return the Trace. */
async function runAgent(config: ReferenceAgentConfig, claim: Claim, clockSeed = 0) {
  const seam = makeSeam(config, claim.id);
  return runReferenceAgent({
    model: seam,
    claim,
    config,
    fixturesRoot: FIXTURES_ROOT,
    clockSeed,
  });
}

// ---------------------------------------------------------------------------
// Claim A — mETH YIELD_BPS 34 bps, fresh oracle — all agents → VALID
// ---------------------------------------------------------------------------

describe("Claim A — mETH YIELD_BPS fresh (§6.7: all VALID)", () => {
  it("Reflector → VALID", async () => {
    const trace = await runAgent(REFLECTOR_CONFIG, loadClaimSync("A"));
    expect(trace.final.decision).toBe("VALID");
    expect(trace.final.confidenceBps).toBeGreaterThanOrEqual(
      REFLECTOR_CONFIG.temperament.thresholdBps,
    );
  });

  it("Rotor → VALID", async () => {
    const trace = await runAgent(ROTOR_CONFIG, loadClaimSync("A"));
    expect(trace.final.decision).toBe("VALID");
  });

  it("Stator → VALID", async () => {
    const trace = await runAgent(STATOR_CONFIG, loadClaimSync("A"));
    expect(trace.final.decision).toBe("VALID");
  });
});

// ---------------------------------------------------------------------------
// Claim B — mETH YIELD_BPS, stale feed, no secondary
// ---------------------------------------------------------------------------

describe("Claim B — mETH YIELD_BPS stale (§6.7: Reflector ABSTAIN, Rotor VALID, Stator ABSTAIN)", () => {
  it("Reflector → ABSTAIN(STALE_SINGLE_SOURCE) [SDK hard rule overrides model VALID]", async () => {
    const trace = await runAgent(REFLECTOR_CONFIG, loadClaimSync("B"));
    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons).toContain("STALE_SINGLE_SOURCE");
  });

  it("Rotor → VALID [abstainOnStale=false — staleness never blocks Rotor]", async () => {
    const trace = await runAgent(ROTOR_CONFIG, loadClaimSync("B"));
    expect(trace.final.decision).toBe("VALID");
  });

  it("Stator → ABSTAIN [model voluntarily abstains on single stale evidence]", async () => {
    const trace = await runAgent(STATOR_CONFIG, loadClaimSync("B"));
    expect(trace.final.decision).toBe("ABSTAIN");
  });

  // M2 checkpoint — PRD §11 M2: "scripted Reflector run on claim B → ABSTAIN(STALE_SINGLE_SOURCE)
  // with stable hash". Two runs must produce identical hashCanonical(trace) values.
  it("M2 checkpoint: Reflector/B → stable hash across two identical runs", async () => {
    const claim = loadClaimSync("B");

    const trace1 = await runAgent(REFLECTOR_CONFIG, claim, 0);
    const trace2 = await runAgent(REFLECTOR_CONFIG, claim, 0);

    // Both must be ABSTAIN(STALE_SINGLE_SOURCE).
    expect(trace1.final.decision).toBe("ABSTAIN");
    expect(trace1.final.reasons).toContain("STALE_SINGLE_SOURCE");
    expect(trace2.final.decision).toBe("ABSTAIN");
    expect(trace2.final.reasons).toContain("STALE_SINGLE_SOURCE");

    // Hash stability — the core determinism guarantee.
    const hash1 = hashCanonical(trace1);
    const hash2 = hashCanonical(trace2);

    console.log("[M2 checkpoint] Reflector/B stable hash:", hash1);
    expect(hash1).toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// Claim C — PC-POOL-1 CASHFLOW_MATCH, 50 000 vs 45 000 mismatch — all REJECTED
// ---------------------------------------------------------------------------

describe("Claim C — PC-POOL-1 CASHFLOW_MATCH mismatch (§6.7: all REJECTED)", () => {
  it("Reflector → REJECTED", async () => {
    const trace = await runAgent(REFLECTOR_CONFIG, loadClaimSync("C"));
    expect(trace.final.decision).toBe("REJECTED");
  });

  it("Rotor → REJECTED", async () => {
    const trace = await runAgent(ROTOR_CONFIG, loadClaimSync("C"));
    expect(trace.final.decision).toBe("REJECTED");
  });

  it("Stator → REJECTED", async () => {
    const trace = await runAgent(STATOR_CONFIG, loadClaimSync("C"));
    expect(trace.final.decision).toBe("REJECTED");
  });
});

// ---------------------------------------------------------------------------
// Claim D — PC-POOL-1 FAIR_VALUE tier 3 — all ABSTAIN(TIER3_OVERRIDE)
// ---------------------------------------------------------------------------

describe("Claim D — PC-POOL-1 FAIR_VALUE tier 3 (§6.7: all ABSTAIN, no model call)", () => {
  it("Reflector → ABSTAIN(TIER3_OVERRIDE), 0 steps", async () => {
    const trace = await runAgent(REFLECTOR_CONFIG, loadClaimSync("D"));
    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons.some((r) => r.includes("TIER3_OVERRIDE"))).toBe(true);
    // Hard rule fires before ANY model call — trace has no steps.
    expect(trace.steps.length).toBe(0);
  });

  it("Rotor → ABSTAIN(TIER3_OVERRIDE), 0 steps", async () => {
    const trace = await runAgent(ROTOR_CONFIG, loadClaimSync("D"));
    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons.some((r) => r.includes("TIER3_OVERRIDE"))).toBe(true);
    expect(trace.steps.length).toBe(0);
  });

  it("Stator → ABSTAIN(TIER3_OVERRIDE), 0 steps", async () => {
    const trace = await runAgent(STATOR_CONFIG, loadClaimSync("D"));
    expect(trace.final.decision).toBe("ABSTAIN");
    expect(trace.final.reasons.some((r) => r.includes("TIER3_OVERRIDE"))).toBe(true);
    expect(trace.steps.length).toBe(0);
  });
});
