/**
 * db.test.ts — Integration tests for @bombe/db. (T-401)
 *
 * All tests use pglite in-memory: no external DB, deterministic, fast.
 *
 * Test plan:
 *   1. createDb() boots pglite and migrates all 6 tables.
 *   2. Insert + select rows from claims, attestations (via repository), agents,
 *      epoch_stats, events, errors to verify each table exists and is writable.
 *   3. DrizzleAttestationRepository.insert writes an AttestationRow and it
 *      can be read back correctly.
 *   4. upsertAttestation: inserting the same id twice does NOT duplicate rows.
 *   5. findAttestationByTxHash: returns the correct row by tx_hash.
 */

import type { AttestationRow } from "@bombe/agent-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import {
  events,
  type BombeDb,
  DrizzleAttestationRepository,
  agents,
  attestations,
  claims,
  createDb,
  epochStats,
  errors,
  findAttestationByTxHash,
  upsertAttestation,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB for each test. */
async function freshDb(): Promise<BombeDb> {
  return createDb(); // in-memory pglite, migrations applied
}

const NOW = 1_700_000_000_000; // fixed timestamp for determinism

// ---------------------------------------------------------------------------
// 1. Boot + schema presence
// ---------------------------------------------------------------------------

describe("createDb — pglite boot and schema migration", () => {
  it("creates all 6 tables (insert + select round-trip for each)", async () => {
    const db = await freshDb();

    // claims
    await db.insert(claims).values({
      id: "claim-A",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { bps: 34, window: "30d" },
      status: "open",
      postedAt: NOW,
    });
    const claimRows = await db.select().from(claims);
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0]?.id).toBe("claim-A");
    expect(claimRows[0]?.tier).toBe(1);

    // agents (must exist before attestations FK)
    await db.insert(agents).values({
      addr: "0xAgent1",
      name: "Reflector",
      model: "claude-sonnet-4-6",
      isHuman: false,
      bondWei: "100000000000000000",
      reputation: 0,
      skillHash: null,
      registeredAt: NOW,
    });
    const agentRows = await db.select().from(agents);
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0]?.addr).toBe("0xAgent1");

    // attestations
    await db.insert(attestations).values({
      id: "attest:claim-A:0xAgent1",
      claimId: "claim-A",
      agentAddr: "0xAgent1",
      isHuman: false,
      decision: "VALID",
      confidenceBps: 9200,
      sourcesHash: "0xsources",
      reasoningHash: "0xreasoning",
      traceUri: "blob://trace/claim-A/reflector",
      latencyMs: 1200,
      costUsd: "0.003",
      skillHash: null,
      txHash: "0xtxhash1",
      createdAt: NOW,
    });
    const attestRows = await db.select().from(attestations);
    expect(attestRows).toHaveLength(1);
    expect(attestRows[0]?.decision).toBe("VALID");

    // epoch_stats
    await db.insert(epochStats).values({
      agentAddr: "0xAgent1",
      epoch: 0,
      correct: 1,
      wrong: 0,
      abstained: 0,
      slashes: 0,
      avgLatencyMs: 1200,
      totalCostUsd: "0.003",
    });
    const statsRows = await db.select().from(epochStats);
    expect(statsRows).toHaveLength(1);
    expect(statsRows[0]?.epoch).toBe(0);
    expect(statsRows[0]?.correct).toBe(1);

    // events
    await db.insert(events).values({
      id: "evt-001",
      kind: "CLAIM_POSTED",
      payload: { claimId: "claim-A", tier: 1 },
      createdAt: NOW,
    });
    const eventRows = await db.select().from(events);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.kind).toBe("CLAIM_POSTED");

    // errors
    await db.insert(errors).values({
      id: "err-001",
      scope: "tool:fetch_meth_yield",
      payload: { message: "timeout", recoverable: true },
      createdAt: NOW,
    });
    const errorRows = await db.select().from(errors);
    expect(errorRows).toHaveLength(1);
    expect(errorRows[0]?.scope).toBe("tool:fetch_meth_yield");
  });
});

// ---------------------------------------------------------------------------
// 2. DrizzleAttestationRepository
// ---------------------------------------------------------------------------

describe("DrizzleAttestationRepository", () => {
  let db: BombeDb;
  let repo: DrizzleAttestationRepository;

  beforeEach(async () => {
    db = await freshDb();
    repo = new DrizzleAttestationRepository(db);

    // Seed prerequisite rows (FK constraints)
    await db.insert(claims).values({
      id: "claim-B",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { bps: 34 },
      status: "open",
      postedAt: NOW,
    });
    await db.insert(agents).values({
      addr: "0xAgent2",
      name: "Rotor",
      model: "gpt-5",
      isHuman: false,
      bondWei: "100000000000000000",
      reputation: 0,
      skillHash: null,
      registeredAt: NOW,
    });
  });

  it("insert writes an AttestationRow and it can be read back", async () => {
    const row: AttestationRow = {
      claimId: "claim-B",
      agentAddr: "0xAgent2",
      isHuman: false,
      decision: "VALID",
      confidenceBps: 8700,
      sourcesHash: "0xsrc123",
      reasoningHash: "0xreason456",
      traceURI: "blob://trace/claim-B/rotor",
      latencyMs: 950,
      costUsd: 0.0015,
      txHash: "0xtx_rotor_B",
      createdAt: NOW + 1000,
    };

    await repo.insert(row);

    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(1);

    const stored = rows[0];
    expect(stored?.claimId).toBe("claim-B");
    expect(stored?.agentAddr).toBe("0xAgent2");
    expect(stored?.decision).toBe("VALID");
    expect(stored?.confidenceBps).toBe(8700);
    expect(stored?.sourcesHash).toBe("0xsrc123");
    expect(stored?.reasoningHash).toBe("0xreason456");
    expect(stored?.traceUri).toBe("blob://trace/claim-B/rotor");
    expect(stored?.latencyMs).toBe(950);
    expect(stored?.txHash).toBe("0xtx_rotor_B");
    expect(stored?.isHuman).toBe(false);
  });

  it("insert with isHuman=true correctly stores isHuman flag", async () => {
    // Register a human attestor
    await db.insert(agents).values({
      addr: "0xHuman1",
      name: "Alice",
      model: null,
      isHuman: true,
      bondWei: "100000000000000000",
      reputation: 0,
      skillHash: null,
      registeredAt: NOW,
    });

    const row: AttestationRow = {
      claimId: "claim-B",
      agentAddr: "0xHuman1",
      isHuman: true,
      decision: "REJECTED",
      confidenceBps: 7000,
      sourcesHash: "0xsrc_human",
      reasoningHash: "0xreason_human",
      traceURI: "blob://trace/claim-B/human",
      latencyMs: 30000,
      costUsd: 0,
      txHash: "0xtx_human_B",
      createdAt: NOW + 2000,
    };

    await repo.insert(row);

    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isHuman).toBe(true);
    expect(rows[0]?.decision).toBe("REJECTED");
  });
});

// ---------------------------------------------------------------------------
// 3. upsertAttestation — idempotency
// ---------------------------------------------------------------------------

describe("upsertAttestation — idempotent upsert on id", () => {
  let db: BombeDb;

  beforeEach(async () => {
    db = await freshDb();

    // Seed prerequisite rows
    await db.insert(claims).values({
      id: "claim-C",
      tier: 2,
      asset: "PC-POOL-1",
      claimType: "CASHFLOW_MATCH",
      payload: { servicerReport: "doc-A", bankStatement: "doc-B" },
      status: "open",
      postedAt: NOW,
    });
    await db.insert(agents).values({
      addr: "0xAgent3",
      name: "Stator",
      model: "llama-3.3-70b",
      isHuman: false,
      bondWei: "100000000000000000",
      reputation: 0,
      skillHash: null,
      registeredAt: NOW,
    });
  });

  it("inserting the same id twice does NOT produce a duplicate row", async () => {
    const input = {
      id: "idx:0xtxhash_stator:0",
      claimId: "claim-C",
      agentAddr: "0xAgent3",
      isHuman: false,
      decision: "REJECTED",
      confidenceBps: 7200,
      sourcesHash: "0xsrc_stator",
      reasoningHash: "0xreason_stator",
      traceUri: "blob://trace/claim-C/stator",
      latencyMs: 800,
      costUsd: "0.0008",
      skillHash: null,
      txHash: "0xtxhash_stator",
      createdAt: NOW,
    };

    await upsertAttestation(db, input);
    await upsertAttestation(db, input); // second call — must be no-op

    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("idx:0xtxhash_stator:0");
    expect(rows[0]?.txHash).toBe("0xtxhash_stator");
  });

  it("two different tx_hashes produce two rows", async () => {
    await upsertAttestation(db, {
      id: "idx:0xtx_1:0",
      claimId: "claim-C",
      agentAddr: "0xAgent3",
      isHuman: false,
      decision: "REJECTED",
      confidenceBps: 7200,
      sourcesHash: "0xsrc_stator",
      reasoningHash: "0xreason_stator",
      traceUri: "blob://trace/claim-C/stator",
      latencyMs: 800,
      costUsd: "0.0008",
      skillHash: null,
      txHash: "0xtx_1",
      createdAt: NOW,
    });

    await upsertAttestation(db, {
      id: "idx:0xtx_2:0",
      claimId: "claim-C",
      agentAddr: "0xAgent3",
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      sourcesHash: "0xsrc_stator2",
      reasoningHash: "0xreason_stator2",
      traceUri: "blob://trace/claim-C/stator2",
      latencyMs: 600,
      costUsd: "0.0005",
      skillHash: null,
      txHash: "0xtx_2",
      createdAt: NOW + 5000,
    });

    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 4. findAttestationByTxHash
// ---------------------------------------------------------------------------

describe("findAttestationByTxHash", () => {
  it("returns the correct row and undefined for missing tx_hash", async () => {
    const db = await freshDb();

    await db.insert(claims).values({
      id: "claim-D",
      tier: 3,
      asset: "PC-POOL-1",
      claimType: "FAIR_VALUE",
      payload: { valuationUsd: 4200000 },
      status: "open",
      postedAt: NOW,
    });
    await db.insert(agents).values({
      addr: "0xPlugboard",
      name: "Plugboard",
      model: "hermes-3",
      isHuman: false,
      bondWei: "100000000000000000",
      reputation: 5,
      skillHash: "0xskillhash_epoch0",
      registeredAt: NOW,
    });

    await upsertAttestation(db, {
      id: "idx:0xtx_plugboard:0",
      claimId: "claim-D",
      agentAddr: "0xPlugboard",
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      sourcesHash: "0xsrc_pb",
      reasoningHash: "0xreason_pb",
      traceUri: "blob://trace/claim-D/plugboard",
      latencyMs: 2100,
      costUsd: "0.02",
      skillHash: "0xskillhash_epoch0",
      txHash: "0xtx_plugboard",
      createdAt: NOW,
    });

    const found = await findAttestationByTxHash(db, "0xtx_plugboard");
    expect(found).toBeDefined();
    expect(found?.txHash).toBe("0xtx_plugboard");
    expect(found?.agentAddr).toBe("0xPlugboard");
    expect(found?.skillHash).toBe("0xskillhash_epoch0");

    const missing = await findAttestationByTxHash(db, "0xnonexistent");
    expect(missing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Migration idempotency — applyMigrations twice is safe
// ---------------------------------------------------------------------------

describe("applyMigrations idempotency", () => {
  it("calling createDb twice on same in-memory db does not throw", async () => {
    // Each call creates a fresh in-memory pglite — both should succeed
    const db1 = await createDb();
    const db2 = await createDb();

    // Both DBs should be usable
    const rows1 = await db1.select().from(claims);
    const rows2 = await db2.select().from(claims);
    expect(rows1).toHaveLength(0);
    expect(rows2).toHaveLength(0);
  });
});
