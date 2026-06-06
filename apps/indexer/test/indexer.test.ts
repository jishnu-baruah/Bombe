/**
 * indexer.test.ts — Tests for @bombe/indexer. (T-402)
 *
 * Tests:
 *   1. Two CONTRACT_ATTESTED events with the SAME (txHash, logIndex) → only ONE
 *      attestation row (idempotent upsert).
 *   2. Two CONTRACT_ATTESTED events with DIFFERENT (txHash, logIndex) → TWO rows.
 *   3. A CONTRACT_ATTESTED event → a corresponding events table row is appended.
 *   4. A CONTRACT_CLAIM_POSTED event → a claims table row is written.
 *   5. Duplicate CONTRACT_CLAIM_POSTED → still only one claims row.
 *
 * All tests use:
 *   - Real pglite DB (createDb) — proves end-to-end persistence.
 *   - Real event bus (createEventBus) — proves the wiring.
 *   - Deterministic inputs — no Date.now, no Math.random in assertions.
 */

import { events, agents, attestations, claims, createDb } from "@bombe/db";
import { createEventBus } from "@bombe/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { startIndexer } from "../src/indexer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ContractAttestedEvent payload. */
function makeAttestedEvent(txHash: string, logIndex: number, claimId = "A") {
  return {
    kind: "CONTRACT_ATTESTED" as const,
    txHash,
    logIndex,
    claimId,
    agentAddr: "0xaaaa000000000000000000000000000000000001",
    isHuman: false,
    decision: "VALID",
    confidenceBps: 9000,
    sourcesHash: `0x${"a".repeat(64)}`,
    reasoningHash: `0x${"b".repeat(64)}`,
    traceUri: "mock://trace/A/reflector",
    latencyMs: 1200,
    costUsd: 0.001,
    blockNumber: 1,
    timestamp: 1_735_689_601_000,
  };
}

/** Build a minimal ContractClaimPostedEvent payload. */
function makeClaimPostedEvent(claimId: string, txHash: string, logIndex = 0) {
  return {
    kind: "CONTRACT_CLAIM_POSTED" as const,
    txHash,
    logIndex,
    claim: {
      id: claimId,
      tier: 1 as const,
      asset: "mETH" as const,
      claimType: "YIELD_BPS" as const,
      payload: { period: "30d-fresh", expectedBps: 34 },
      submitter: "0x000000000000000000000000000000000000dEaD",
      postedAt: 1748736000,
    },
    blockNumber: 1,
    timestamp: 1_735_689_601_000,
  };
}

/**
 * Wait for async event handlers to flush.
 * The bus fires synchronous wrapper → void async fn; pglite I/O is async so
 * we use a real timer alongside microtask ticks.
 */
async function flush(ms = 200): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("indexer idempotency", () => {
  it("same (txHash, logIndex) → only ONE attestation row", async () => {
    const db = await createDb();

    // Insert agent row for FK constraint.
    await db.insert(agents).values({
      addr: "0xaaaa000000000000000000000000000000000001",
      name: "test-agent",
      isHuman: false,
      bondWei: "0",
      reputation: 0,
      registeredAt: 1_735_689_600_000,
    });

    // Insert claim row for FK constraint.
    await db.insert(claims).values({
      id: "A",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { period: "30d-fresh" },
      status: "open",
      postedAt: 1748736000,
    });

    const bus = createEventBus();
    const teardown = startIndexer({ bus, db });

    const evt = makeAttestedEvent(`0x${"c".repeat(64)}`, 0);
    bus.emit(evt);
    bus.emit(evt); // duplicate — same txHash + logIndex

    await flush();
    teardown();

    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(1);
  });

  it("different (txHash, logIndex) → TWO rows", async () => {
    const db = await createDb();

    await db.insert(agents).values({
      addr: "0xaaaa000000000000000000000000000000000001",
      name: "test-agent",
      isHuman: false,
      bondWei: "0",
      reputation: 0,
      registeredAt: 1_735_689_600_000,
    });

    await db.insert(claims).values({
      id: "A",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { period: "30d-fresh" },
      status: "open",
      postedAt: 1748736000,
    });

    const bus = createEventBus();
    const teardown = startIndexer({ bus, db });

    bus.emit(makeAttestedEvent(`0x${"d".repeat(64)}`, 0));
    bus.emit(makeAttestedEvent(`0x${"e".repeat(64)}`, 1));

    await flush();
    teardown();

    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(2);
  });

  it("CONTRACT_ATTESTED → appends a row to the events table", async () => {
    const db = await createDb();

    await db.insert(agents).values({
      addr: "0xaaaa000000000000000000000000000000000001",
      name: "test-agent",
      isHuman: false,
      bondWei: "0",
      reputation: 0,
      registeredAt: 1_735_689_600_000,
    });

    await db.insert(claims).values({
      id: "A",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { period: "30d-fresh" },
      status: "open",
      postedAt: 1748736000,
    });

    const bus = createEventBus();
    const teardown = startIndexer({ bus, db });

    bus.emit(makeAttestedEvent(`0x${"f".repeat(64)}`, 0));

    await flush();
    teardown();

    const evtRows = await db.select().from(events);
    expect(evtRows.length).toBeGreaterThanOrEqual(1);
    const attestEvts = evtRows.filter((r) => r.kind === "CONTRACT_ATTESTED");
    expect(attestEvts).toHaveLength(1);
  });

  it("CONTRACT_CLAIM_POSTED → writes a claims row", async () => {
    const db = await createDb();
    const bus = createEventBus();
    const teardown = startIndexer({ bus, db });

    bus.emit(makeClaimPostedEvent("CLAIM-X", `0x${"9".repeat(64)}`));

    await flush();
    teardown();

    const claimRows = await db.select().from(claims);
    expect(claimRows.some((r) => r.id === "CLAIM-X")).toBe(true);
  });

  it("duplicate CONTRACT_CLAIM_POSTED → still only ONE claims row", async () => {
    const db = await createDb();
    const bus = createEventBus();
    const teardown = startIndexer({ bus, db });

    const evt = makeClaimPostedEvent("CLAIM-Y", `0x${"8".repeat(64)}`);
    bus.emit(evt);
    bus.emit(evt);

    await flush();
    teardown();

    const claimRows = await db.select().from(claims);
    const matchingRows = claimRows.filter((r) => r.id === "CLAIM-Y");
    expect(matchingRows).toHaveLength(1);
  });
});
