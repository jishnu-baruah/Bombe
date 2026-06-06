/**
 * runner.test.ts — End-to-end tests for @bombe/runner. (T-403)
 *
 * Tests:
 *   1. Seed claim A → all three agents run concurrently → 3 AGENT_DONE events
 *      with correct decisions (claim A: all VALID) → 3 attestation rows in DB
 *      (via the indexer wired to the same bus).
 *
 *   2. Failure isolation: force stator to throw (inject a failing model seam
 *      via modelSeamOverrides) → stator yields an errors row + error event;
 *      reflector and rotor still complete with attestation rows.
 *      Assert 2 successes + 1 error, not a crash.
 *
 * Uses:
 *   - Real pglite DB (createDb) — proves end-to-end persistence.
 *   - Real event bus (createEventBus) — proves wiring.
 *   - Real indexer (startIndexer) — proves indexer ↔ runner integration.
 *   - Scripted model seams from fixtures — deterministic, no network.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelRequest, ModelResponse, ModelSeam } from "@bombe/agent-sdk";
import { attestations, createDb, errors as errorsTable } from "@bombe/db";
import { startIndexer } from "@bombe/indexer";
import { createEventBus } from "@bombe/shared";
import type { BusEvent, Claim } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import { runClaim } from "../src/runner.js";

// ---------------------------------------------------------------------------
// Fixtures root (repo root / fixtures)
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// apps/runner/test → ../../.. = repo root
const FIXTURES_ROOT = resolve(__dirname, "../../../fixtures");

// ---------------------------------------------------------------------------
// Claim A fixture
// ---------------------------------------------------------------------------

const CLAIM_A: Claim = {
  id: "A",
  tier: 1,
  asset: "mETH",
  claimType: "YIELD_BPS",
  payload: { period: "30d-fresh", expectedBps: 34 },
  submitter: "0x000000000000000000000000000000000000dEaD",
  postedAt: 1748736000,
};

// ---------------------------------------------------------------------------
// HangingModelSeam — never resolves (triggers timeout)
// ---------------------------------------------------------------------------

/**
 * HangingModelSeam — a ModelSeam that never resolves its promise.
 * Combined with a very short agentTimeoutMs, this triggers the timeout path
 * for testing failure isolation without waiting 15s.
 */
class HangingModelSeam implements ModelSeam {
  complete(_req: ModelRequest): Promise<ModelResponse> {
    // Never resolves — the timeout wrapper will reject this.
    return new Promise<ModelResponse>(() => {
      // Intentionally empty: never resolves.
    });
  }
}

// ---------------------------------------------------------------------------
// Flush helper — wait for async indexer writes to complete
// ---------------------------------------------------------------------------

async function flush(ms = 500): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runner — concurrent agents, claim A (all VALID)", () => {
  it("runs all three agents and produces 3 attestation rows", async () => {
    const db = await createDb();
    const bus = createEventBus();
    const stopIndexer = startIndexer({ bus, db });

    // Collect AGENT_DONE events.
    const doneEvents: BusEvent[] = [];
    bus.on("AGENT_DONE", (evt) => {
      doneEvents.push(evt);
    });

    const result = await runClaim(CLAIM_A, { bus, db, fixturesRoot: FIXTURES_ROOT });

    // Wait for async indexer writes.
    await flush();

    stopIndexer();

    // All three agents should succeed for claim A.
    expect(result.successes).toBe(3);
    expect(result.errors).toBe(0);

    // Three AGENT_DONE events (one per agent).
    expect(doneEvents).toHaveLength(3);

    // All decisions should be VALID for claim A (per fixtures/model-scripts).
    for (const evt of doneEvents) {
      if (evt.kind === "AGENT_DONE") {
        expect(evt.decision).toBe("VALID");
        expect(evt.isHuman).toBe(false);
      }
    }

    // Three attestation rows in DB (written via indexer consuming CONTRACT_ATTESTED events).
    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(3);

    // All rows should reference claim A.
    for (const row of rows) {
      expect(row.claimId).toBe("A");
      expect(row.isHuman).toBe(false);
    }
  });
});

describe("runner — failure isolation", () => {
  it("stator throws → errors row + error event, reflector and rotor still complete", async () => {
    const db = await createDb();
    const bus = createEventBus();
    const stopIndexer = startIndexer({ bus, db });

    const doneEvents: BusEvent[] = [];
    bus.on("AGENT_DONE", (evt) => {
      doneEvents.push(evt);
    });

    // Inject a hanging seam for stator only + a very short timeout (50ms).
    // The timeout fires quickly, making stator fail while reflector/rotor succeed.
    const result = await runClaim(CLAIM_A, {
      bus,
      db,
      fixturesRoot: FIXTURES_ROOT,
      modelSeamOverrides: {
        stator: new HangingModelSeam(),
      },
      agentTimeoutMs: 50,
    });

    await flush();
    stopIndexer();

    // Exactly 1 error (stator), 2 successes (reflector + rotor).
    expect(result.errors).toBe(1);
    expect(result.successes).toBe(2);

    // 3 AGENT_DONE events (2 VALID + 1 ABSTAIN error).
    expect(doneEvents).toHaveLength(3);

    // Exactly 2 attestation rows in DB (reflector + rotor only).
    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(2);

    // All successful rows should reference claim A and be non-human.
    for (const row of rows) {
      expect(row.claimId).toBe("A");
      expect(row.isHuman).toBe(false);
    }

    // Exactly 1 error row in errors table (for stator).
    const errRows = await db.select().from(errorsTable);
    expect(errRows.length).toBeGreaterThanOrEqual(1);
    const statorErr = errRows.find((r) => r.scope === "runner:stator");
    expect(statorErr).toBeDefined();
  });
});
