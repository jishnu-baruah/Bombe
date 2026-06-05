/**
 * attest.test.ts — Attestation builder tests. (PRD §6.3, T-214)
 *
 * Test scenarios:
 *  1. Payload shape: correct claimId, tier (from tierOf), decision+confidence
 *     from trace.final, traceURI from blob, both hashes 0x-32-byte.
 *  2. sourcesHash determinism: same sources in different order → same hash.
 *     Different sources → different hash.
 *  3. Decision enum mapping: VALID→0, REJECTED→1, ABSTAIN→2 encoded in calldata.
 *  4. Row written: repo received a row with correct latencyMs, costUsd, txHash.
 *  5. Latency determinism: seeded clock → deterministic latencyMs.
 *  6. ABSTAIN attestation: builds valid payload with confidenceBps 0 and submits.
 *
 * All seams are stubs — no network, no filesystem, no randomness.
 */

import type { Claim } from "@bombe/shared";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  InMemoryAttestationRepository,
  PLACEHOLDER_ATTESTATION_ADDRESS,
  buildAndSubmitAttestation,
} from "../src/attest.js";
import type { Source } from "../src/attest.js";
import type { Trace } from "../src/loop.js";
import { StubBlobSeam, StubClockSeam, StubWalletSeam } from "../src/seams/stub.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal valid Claim for testing. */
function makeClaim(opts: Partial<Claim> & { claimType?: Claim["claimType"] } = {}): Claim {
  const claimType = opts.claimType ?? "YIELD_BPS";
  const tierMap: Record<Claim["claimType"], 1 | 2 | 3> = {
    YIELD_BPS: 1,
    DISTRIBUTION_PAID: 1,
    CASHFLOW_MATCH: 2,
    ENCUMBRANCE_ABSENT: 2,
    FAIR_VALUE: 3,
  };
  return {
    id: opts.id ?? "claim-attest-001",
    tier: opts.tier ?? tierMap[claimType],
    asset: opts.asset ?? "mETH",
    claimType,
    payload: opts.payload ?? { period: "30d-fresh" },
    submitter: opts.submitter ?? "0xsubmitter",
    postedAt: opts.postedAt ?? 1000,
  };
}

/** Build a minimal valid Trace for a given decision. */
function makeTrace(opts: {
  agentId?: string;
  claimId?: string;
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  confidenceBps?: number;
}): Trace {
  return {
    traceVersion: "1.0",
    agentId: opts.agentId ?? "test-agent",
    claimId: opts.claimId ?? "claim-attest-001",
    steps: [],
    final: {
      decision: opts.decision,
      confidenceBps: opts.confidenceBps ?? (opts.decision === "ABSTAIN" ? 0 : 9000),
      rationaleSummary: `Test trace with decision ${opts.decision}`,
      reasons: opts.decision === "ABSTAIN" ? ["MODEL_ABSTAIN"] : [],
    },
  };
}

/** Sample sources for hash tests. */
const SOURCE_A: Source = {
  name: "mETH 30d yield",
  value: { yieldBps: 450, stale: false },
  source: "fixtures/oracle/mETH.json",
  fetchedAt: 1000,
  confidence: 9000,
};

const SOURCE_B: Source = {
  name: "chainlink price",
  value: { price: 1.001 },
  source: "fixtures/oracle/chainlink.json",
  fetchedAt: 1001,
  confidence: 8500,
};

const SOURCE_C: Source = {
  name: "USDY yield",
  value: { yieldBps: 520 },
  source: "fixtures/oracle/USDY.json",
  fetchedAt: 1002,
  confidence: 7000,
};

/** Minimal ABI fragment (mirrors the one in attest.ts) for decoding calldata. */
const ATTEST_ABI = [
  {
    name: "attest",
    type: "function",
    inputs: [
      { name: "claimId", type: "bytes32" },
      { name: "decision", type: "uint8" },
      { name: "confidenceBps", type: "uint16" },
      { name: "sourcesHash", type: "bytes32" },
      { name: "reasoningHash", type: "bytes32" },
      { name: "traceURI", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ---------------------------------------------------------------------------
// Helper: build standard test deps
// ---------------------------------------------------------------------------

function makeDeps(
  opts: {
    clockTimes?: number | number[];
    txHash?: `0x${string}`;
  } = {},
) {
  const wallet = new StubWalletSeam({
    address: "0xagent000000000000000000000000000000000001",
    send: {
      txHash: opts.txHash ?? "0xdeadbeef00000000000000000000000000000000000000000000000000000001",
      status: "success",
    },
  });
  const blob = new StubBlobSeam();
  const clock = new StubClockSeam(opts.clockTimes ?? [2000, 3000]);
  const repo = new InMemoryAttestationRepository();
  return { wallet, blob, clock, repo };
}

// ---------------------------------------------------------------------------
// Test 1 — Payload shape
// ---------------------------------------------------------------------------

describe("buildAndSubmitAttestation", () => {
  it("1. assembles correct payload shape from trace and claim", async () => {
    const claim = makeClaim({ claimType: "YIELD_BPS" });
    const trace = makeTrace({ decision: "VALID", confidenceBps: 9000, claimId: claim.id });
    const sources = [SOURCE_A, SOURCE_B];
    const deps = makeDeps({ clockTimes: [2000, 3000] });

    const { payload } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources,
      costUsd: 0.002,
      postedAtMs: 1000,
      deps,
    });

    // claimId matches
    expect(payload.claimId).toBe(claim.id);

    // tier is derived from claimType (YIELD_BPS = Tier 1), never from submitter
    expect(payload.tier).toBe(1);

    // decision and confidence from trace.final
    expect(payload.decision).toBe("VALID");
    expect(payload.confidenceBps).toBe(9000);

    // traceURI is a blob URL (stub returns stub://<key>)
    expect(payload.traceURI).toMatch(/^stub:\/\/trace\//);

    // Both hashes are 0x-prefixed 32-byte hex (66 chars)
    expect(payload.sourcesHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(payload.reasoningHash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("1b. tier 2 claim gets tier=2 in payload", async () => {
    const claim = makeClaim({ claimType: "CASHFLOW_MATCH" });
    const trace = makeTrace({ decision: "REJECTED", confidenceBps: 8000, claimId: claim.id });
    const deps = makeDeps();

    const { payload } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps,
    });

    expect(payload.tier).toBe(2);
    expect(payload.decision).toBe("REJECTED");
  });

  // ---------------------------------------------------------------------------
  // Test 2 — sourcesHash determinism
  // ---------------------------------------------------------------------------

  it("2a. same sources in different order → same sourcesHash", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", claimId: claim.id });

    // Order 1: A, B, C
    const deps1 = makeDeps();
    const { payload: p1 } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A, SOURCE_B, SOURCE_C],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: deps1,
    });

    // Order 2: C, A, B (different insertion order)
    const deps2 = makeDeps();
    const { payload: p2 } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_C, SOURCE_A, SOURCE_B],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: deps2,
    });

    // Order 3: B, C, A
    const deps3 = makeDeps();
    const { payload: p3 } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_B, SOURCE_C, SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: deps3,
    });

    expect(p1.sourcesHash).toBe(p2.sourcesHash);
    expect(p1.sourcesHash).toBe(p3.sourcesHash);
  });

  it("2b. different sources → different sourcesHash", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", claimId: claim.id });

    const depsA = makeDeps();
    const { payload: pA } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: depsA,
    });

    const depsB = makeDeps();
    const { payload: pB } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_B],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: depsB,
    });

    expect(pA.sourcesHash).not.toBe(pB.sourcesHash);
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Decision enum mapping in calldata
  // ---------------------------------------------------------------------------

  it("3a. VALID decision encodes as uint8=0 in calldata", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", confidenceBps: 9000, claimId: claim.id });
    const { wallet, blob, clock, repo } = makeDeps();

    // Capture the tx sent to the wallet
    let capturedData: `0x${string}` | undefined;
    const capturingWallet = {
      address: () => "0xagent000000000000000000000000000000000001",
      signAndSend: async (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => {
        capturedData = tx.data;
        return {
          txHash:
            "0xabc0000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
          status: "success" as const,
        };
      },
    };

    await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: { wallet: capturingWallet, blob, clock, repo },
    });

    if (capturedData === undefined) throw new Error("capturedData must be defined");
    const decoded = decodeFunctionData({ abi: ATTEST_ABI, data: capturedData });
    // decision is the second arg (index 1)
    expect(decoded.args[1]).toBe(0); // VALID = 0
  });

  it("3b. REJECTED decision encodes as uint8=1 in calldata", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "REJECTED", confidenceBps: 8000, claimId: claim.id });
    const { blob, clock, repo } = makeDeps();

    let capturedData: `0x${string}` | undefined;
    const capturingWallet = {
      address: () => "0xagent000000000000000000000000000000000001",
      signAndSend: async (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => {
        capturedData = tx.data;
        return {
          txHash:
            "0xabc0000000000000000000000000000000000000000000000000000000000002" as `0x${string}`,
          status: "success" as const,
        };
      },
    };

    await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: { wallet: capturingWallet, blob, clock, repo },
    });

    if (capturedData === undefined) throw new Error("capturedData must be defined");
    const decoded = decodeFunctionData({ abi: ATTEST_ABI, data: capturedData });
    expect(decoded.args[1]).toBe(1); // REJECTED = 1
  });

  it("3c. ABSTAIN decision encodes as uint8=2 in calldata", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "ABSTAIN", confidenceBps: 0, claimId: claim.id });
    const { blob, clock, repo } = makeDeps();

    let capturedData: `0x${string}` | undefined;
    const capturingWallet = {
      address: () => "0xagent000000000000000000000000000000000001",
      signAndSend: async (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => {
        capturedData = tx.data;
        return {
          txHash:
            "0xabc0000000000000000000000000000000000000000000000000000000000003" as `0x${string}`,
          status: "success" as const,
        };
      },
    };

    await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [],
      costUsd: 0.0,
      postedAtMs: 1000,
      deps: { wallet: capturingWallet, blob, clock, repo },
    });

    if (capturedData === undefined) throw new Error("capturedData must be defined");
    const decoded = decodeFunctionData({ abi: ATTEST_ABI, data: capturedData });
    expect(decoded.args[1]).toBe(2); // ABSTAIN = 2
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Row written correctly
  // ---------------------------------------------------------------------------

  it("4. repo receives a row with correct latencyMs, costUsd, and txHash", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", confidenceBps: 9000, claimId: claim.id });
    const txHash =
      "0xdeadbeef00000000000000000000000000000000000000000000000000000002" as `0x${string}`;
    const postedAtMs = 1000;
    // Clock returns: first call in blob.put triggers nothing (blob doesn't call clock),
    // wallet.signAndSend doesn't call clock either.
    // clock.now() is called once: after receipt, for latencyMs and createdAt.
    const clockNow = 5000;
    const deps = makeDeps({ clockTimes: [clockNow], txHash });

    await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.0042,
      postedAtMs,
      deps,
    });

    expect(deps.repo.rows).toHaveLength(1);
    const row = deps.repo.rows[0];
    if (row === undefined) throw new Error("row must be defined");
    expect(row.claimId).toBe(claim.id);
    expect(row.agentAddr).toBe("0xagent000000000000000000000000000000000001");
    expect(row.isHuman).toBe(false);
    expect(row.decision).toBe("VALID");
    expect(row.confidenceBps).toBe(9000);
    expect(row.costUsd).toBeCloseTo(0.0042);
    expect(row.txHash).toBe(txHash);
    expect(row.latencyMs).toBe(clockNow - postedAtMs); // 5000 - 1000 = 4000
    expect(row.createdAt).toBe(clockNow);
  });

  // ---------------------------------------------------------------------------
  // Test 5 — Latency determinism with seeded clock
  // ---------------------------------------------------------------------------

  it("5. latencyMs is deterministic with seeded clock", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", confidenceBps: 9000, claimId: claim.id });
    const postedAtMs = 100;
    const nowMs = 1500;

    // Run 1
    const deps1 = makeDeps({ clockTimes: [nowMs] });
    const { row: row1 } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs,
      deps: deps1,
    });

    // Run 2 (same clock seed)
    const deps2 = makeDeps({ clockTimes: [nowMs] });
    const { row: row2 } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs,
      deps: deps2,
    });

    expect(row1.latencyMs).toBe(row2.latencyMs);
    expect(row1.latencyMs).toBe(nowMs - postedAtMs); // 1400
  });

  // ---------------------------------------------------------------------------
  // Test 6 — ABSTAIN attestation is valid
  // ---------------------------------------------------------------------------

  it("6. ABSTAIN trace produces a valid payload with confidenceBps=0 and submits", async () => {
    const claim = makeClaim({ claimType: "FAIR_VALUE" });
    const trace = makeTrace({
      decision: "ABSTAIN",
      confidenceBps: 0,
      claimId: claim.id,
    });
    const deps = makeDeps();

    const { payload, receipt, row } = await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [], // no sources on abstain
      costUsd: 0.0,
      postedAtMs: 1000,
      deps,
    });

    // Payload is valid
    expect(payload.decision).toBe("ABSTAIN");
    expect(payload.confidenceBps).toBe(0);
    expect(payload.tier).toBe(3); // FAIR_VALUE is Tier 3
    expect(payload.sourcesHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(payload.reasoningHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(payload.traceURI).toBeTruthy();

    // Receipt is returned (tx was submitted)
    expect(receipt.status).toBe("success");
    expect(receipt.txHash).toMatch(/^0x/);

    // Row was written
    expect(deps.repo.rows).toHaveLength(1);
    expect(row.decision).toBe("ABSTAIN");
    expect(row.confidenceBps).toBe(0);
    expect(row.costUsd).toBe(0.0);
  });

  // ---------------------------------------------------------------------------
  // Test 6b — ABSTAIN uses default PLACEHOLDER_ATTESTATION_ADDRESS when no addr given
  // ---------------------------------------------------------------------------

  it("6b. default attestationAddress is the zero placeholder", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", claimId: claim.id });
    const { blob, clock, repo } = makeDeps();

    let capturedTo: `0x${string}` | undefined;
    const capturingWallet = {
      address: () => "0xagent000000000000000000000000000000000001",
      signAndSend: async (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => {
        capturedTo = tx.to;
        return {
          txHash:
            "0xabc0000000000000000000000000000000000000000000000000000000000010" as `0x${string}`,
          status: "success" as const,
        };
      },
    };

    await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      deps: { wallet: capturingWallet, blob, clock, repo },
    });

    expect(capturedTo).toBe(PLACEHOLDER_ATTESTATION_ADDRESS);
  });

  // ---------------------------------------------------------------------------
  // Test 7 — Custom attestationAddress is forwarded to wallet
  // ---------------------------------------------------------------------------

  it("7. custom attestationAddress is used in tx.to", async () => {
    const claim = makeClaim();
    const trace = makeTrace({ decision: "VALID", claimId: claim.id });
    const { blob, clock, repo } = makeDeps();
    const customAddr = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

    let capturedTo: `0x${string}` | undefined;
    const capturingWallet = {
      address: () => "0xagent000000000000000000000000000000000001",
      signAndSend: async (tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => {
        capturedTo = tx.to;
        return {
          txHash:
            "0xabc0000000000000000000000000000000000000000000000000000000000011" as `0x${string}`,
          status: "success" as const,
        };
      },
    };

    await buildAndSubmitAttestation({
      agentId: "test-agent",
      agentAddr: "0xagent000000000000000000000000000000000001",
      isHuman: false,
      claim,
      trace,
      sources: [SOURCE_A],
      costUsd: 0.001,
      postedAtMs: 1000,
      attestationAddress: customAddr,
      deps: { wallet: capturingWallet, blob, clock, repo },
    });

    expect(capturedTo).toBe(customAddr);
  });
});

// ---------------------------------------------------------------------------
// InMemoryAttestationRepository — unit tests
// ---------------------------------------------------------------------------

describe("InMemoryAttestationRepository", () => {
  it("insert stores a row and rows returns it", async () => {
    const repo = new InMemoryAttestationRepository();
    const row: import("../src/attest.js").AttestationRow = {
      claimId: "c-1",
      agentAddr: "0xaddr",
      isHuman: false,
      decision: "VALID",
      confidenceBps: 9000,
      sourcesHash: `0x${"aa".repeat(32)}`,
      reasoningHash: `0x${"bb".repeat(32)}`,
      traceURI: "stub://trace/c-1/agent",
      latencyMs: 500,
      costUsd: 0.001,
      txHash: `0x${"cc".repeat(32)}`,
      createdAt: 9999,
    };
    await repo.insert(row);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toEqual(row);
  });

  it("clear empties the rows", async () => {
    const repo = new InMemoryAttestationRepository();
    await repo.insert({
      claimId: "c-2",
      agentAddr: "0x",
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      sourcesHash: `0x${"00".repeat(32)}`,
      reasoningHash: `0x${"00".repeat(32)}`,
      traceURI: "stub://x",
      latencyMs: 0,
      costUsd: 0,
      txHash: `0x${"00".repeat(32)}`,
      createdAt: 0,
    });
    repo.clear();
    expect(repo.rows).toHaveLength(0);
  });
});
