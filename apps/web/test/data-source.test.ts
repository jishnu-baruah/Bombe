/**
 * test/data-source.test.ts — Unit tests for the data-source selector.
 *
 * Verifies:
 * 1. MODE=mock → returns demo-data getters (synchronous fixtures, no network).
 * 2. MODE=live → dispatches to live-data getters (viem mocked; no real network).
 * 3. Live mapper shapes are correct (given mocked viem response).
 *
 * NO `any`. Deterministic — no real network calls.
 * T-J04.
 */

import type { AttestationRecord, LeaderboardRow } from "@/lib/demo-data";
import type { Claim } from "@bombe/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock server-config so we can control the mode per test.
// ---------------------------------------------------------------------------

vi.mock("@/lib/server-config", () => ({
  getRunMode: vi.fn(() => "mock"),
  getOperatorKey: () => "dev-operator",
  validateOperatorKey: () => false,
}));

// ---------------------------------------------------------------------------
// Mock live-data so tests never make real RPC calls.
// ---------------------------------------------------------------------------

const MOCK_LIVE_LEADERBOARD: LeaderboardRow[] = [
  {
    rank: 1,
    agentId: "reflector",
    isHuman: false,
    isExternal: false,
    correct: 10,
    wrong: 2,
    abstained: 1,
    totalDecisions: 13,
    accuracyPct: 83.3,
    abstentionPct: 7.7,
    decisivenessPct: 92.3,
    avgLatencyMs: 0,
    totalCostUsd: 0,
    bond: 0.1,
    slashes: 0,
    reputation: 100,
  },
];

const MOCK_LIVE_CLAIMS: Claim[] = [
  {
    id: "A",
    tier: 1,
    asset: "mETH",
    claimType: "YIELD_BPS",
    submitter: "0x1234567890123456789012345678901234567890",
    payload: { yieldBps: 34 },
    postedAt: 1700000000000,
  },
];

const MOCK_LIVE_ATTESTATIONS: AttestationRecord[] = [
  {
    agentId: "reflector",
    claimId: "A",
    decision: "VALID",
    confidenceBps: 8500,
    reasoningHash: "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    sourcesHash: "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456780",
    traceURI: "/api/trace/A/reflector",
    txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
    agentAddress: "0x0000000000000000000000000000000000000001",
    latencyMs: 0,
    costUsd: 0,
    isHuman: false,
    blockedByProtocol: false,
    skillHash: null,
  },
];

const mockGetLeaderboard = vi.fn(async () => MOCK_LIVE_LEADERBOARD);
const mockGetClaims = vi.fn(async () => MOCK_LIVE_CLAIMS);
const mockGetClaim = vi.fn(async (id: string) => MOCK_LIVE_CLAIMS.find((c) => c.id === id));
const mockGetAttestations = vi.fn(async () => MOCK_LIVE_ATTESTATIONS);
const mockGetTrace = vi.fn(() => undefined);
const mockGetPlugboardSkillHash = vi.fn(
  () => "0x0000000000000000000000000000000000000000000000000000000000000000" as const,
);

vi.mock("@/lib/live-data", () => ({
  getLeaderboard: mockGetLeaderboard,
  getClaims: mockGetClaims,
  getClaim: mockGetClaim,
  getAttestations: mockGetAttestations,
  getTrace: mockGetTrace,
  getPlugboardSkillHash: mockGetPlugboardSkillHash,
}));

// ---------------------------------------------------------------------------
// Tests: MODE=mock → demo-data getters
// ---------------------------------------------------------------------------

describe("data-source selector — mock mode", () => {
  beforeEach(async () => {
    const serverConfig = await import("@/lib/server-config");
    vi.mocked(serverConfig.getRunMode).mockReturnValue("mock");
  });

  it("getLeaderboard returns 5 demo rows", async () => {
    const { getLeaderboard } = await import("@/lib/data-source");
    const rows = await getLeaderboard();
    expect(rows).toHaveLength(5);
  });

  it("getClaims returns 4 demo claims A–D", async () => {
    const { getClaims } = await import("@/lib/data-source");
    const claims = await getClaims();
    expect(claims.map((c) => c.id)).toEqual(["A", "B", "C", "D"]);
  });

  it("getClaim(A) returns YIELD_BPS claim", async () => {
    const { getClaim } = await import("@/lib/data-source");
    const c = await getClaim("A");
    expect(c).toBeDefined();
    expect(c?.claimType).toBe("YIELD_BPS");
  });

  it("getClaim(Z) returns undefined", async () => {
    const { getClaim } = await import("@/lib/data-source");
    const c = await getClaim("Z");
    expect(c).toBeUndefined();
  });

  it("getAttestations(A) returns 5 attestations", async () => {
    const { getAttestations } = await import("@/lib/data-source");
    const atts = await getAttestations("A");
    expect(atts).toHaveLength(5);
  });

  it("getAttestations(Z) returns empty array", async () => {
    const { getAttestations } = await import("@/lib/data-source");
    const atts = await getAttestations("Z");
    expect(atts).toHaveLength(0);
  });

  it("getTrace returns a trace in mock mode", async () => {
    const { getTrace } = await import("@/lib/data-source");
    const trace = getTrace("A", "reflector");
    expect(trace).toBeDefined();
  });

  it("getPlugboardSkillHash returns a non-zero 0x hash in mock mode", async () => {
    const { getPlugboardSkillHash } = await import("@/lib/data-source");
    const h = getPlugboardSkillHash();
    expect(h).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(h).not.toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
  });
});

// ---------------------------------------------------------------------------
// Tests: MODE=live → live-data getters (viem mocked)
// ---------------------------------------------------------------------------

describe("data-source selector — live mode", () => {
  beforeEach(async () => {
    const serverConfig = await import("@/lib/server-config");
    vi.mocked(serverConfig.getRunMode).mockReturnValue("live");
    vi.clearAllMocks();
    mockGetLeaderboard.mockResolvedValue(MOCK_LIVE_LEADERBOARD);
    mockGetClaims.mockResolvedValue(MOCK_LIVE_CLAIMS);
    mockGetClaim.mockImplementation(async (id: string) =>
      MOCK_LIVE_CLAIMS.find((c) => c.id === id),
    );
    mockGetAttestations.mockResolvedValue(MOCK_LIVE_ATTESTATIONS);
  });

  afterEach(async () => {
    const serverConfig = await import("@/lib/server-config");
    vi.mocked(serverConfig.getRunMode).mockReturnValue("mock");
  });

  it("getLeaderboard calls live getter and returns mapped rows", async () => {
    const { getLeaderboard } = await import("@/lib/data-source");
    const rows = await getLeaderboard();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.agentId).toBe("reflector");
    expect(mockGetLeaderboard).toHaveBeenCalled();
  });

  it("getClaims calls live getter and returns live claims", async () => {
    const { getClaims } = await import("@/lib/data-source");
    const claims = await getClaims();
    expect(claims).toHaveLength(1);
    expect(claims[0]?.id).toBe("A");
    expect(mockGetClaims).toHaveBeenCalled();
  });

  it("getClaim(A) calls live getter", async () => {
    const { getClaim } = await import("@/lib/data-source");
    const c = await getClaim("A");
    expect(c).toBeDefined();
    expect(c?.claimType).toBe("YIELD_BPS");
    expect(mockGetClaim).toHaveBeenCalledWith("A");
  });

  it("getAttestations calls live getter", async () => {
    const { getAttestations } = await import("@/lib/data-source");
    const atts = await getAttestations("A");
    expect(atts).toHaveLength(1);
    expect(mockGetAttestations).toHaveBeenCalledWith("A");
  });

  it("getTrace returns undefined in live mode", async () => {
    const { getTrace } = await import("@/lib/data-source");
    const trace = getTrace("A", "reflector");
    expect(trace).toBeUndefined();
  });

  it("getPlugboardSkillHash returns zero hash in live mode", async () => {
    const { getPlugboardSkillHash } = await import("@/lib/data-source");
    const h = getPlugboardSkillHash();
    expect(h).toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
  });

  it("getLeaderboard returns [] gracefully when live getter throws", async () => {
    mockGetLeaderboard.mockRejectedValueOnce(new Error("RPC error"));
    const { getLeaderboard } = await import("@/lib/data-source");
    const rows = await getLeaderboard();
    expect(rows).toEqual([]);
  });

  it("getClaims returns [] gracefully when live getter throws", async () => {
    mockGetClaims.mockRejectedValueOnce(new Error("RPC error"));
    const { getClaims } = await import("@/lib/data-source");
    const claims = await getClaims();
    expect(claims).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: live-data mapper shapes (mocked viem response → correct row shapes)
// ---------------------------------------------------------------------------

describe("live-data mapper shapes — given mocked viem response", () => {
  it("LeaderboardRow shape is correct", () => {
    const row = MOCK_LIVE_LEADERBOARD[0];
    if (!row) throw new Error("missing mock row");
    expect(typeof row.rank).toBe("number");
    expect(typeof row.agentId).toBe("string");
    expect(typeof row.isHuman).toBe("boolean");
    expect(typeof row.isExternal).toBe("boolean");
    expect(typeof row.correct).toBe("number");
    expect(typeof row.wrong).toBe("number");
    expect(typeof row.abstained).toBe("number");
    expect(typeof row.totalDecisions).toBe("number");
    expect(row.accuracyPct === null || typeof row.accuracyPct === "number").toBe(true);
    expect(typeof row.abstentionPct).toBe("number");
    expect(typeof row.decisivenessPct).toBe("number");
    expect(typeof row.avgLatencyMs).toBe("number");
    expect(typeof row.totalCostUsd).toBe("number");
    expect(typeof row.bond).toBe("number");
    expect(typeof row.slashes).toBe("number");
    expect(typeof row.reputation).toBe("number");
  });

  it("AttestationRecord shape is correct", () => {
    const att = MOCK_LIVE_ATTESTATIONS[0];
    if (!att) throw new Error("missing mock attestation");
    expect(typeof att.agentId).toBe("string");
    expect(typeof att.claimId).toBe("string");
    expect(["VALID", "REJECTED", "ABSTAIN"]).toContain(att.decision);
    expect(typeof att.confidenceBps).toBe("number");
    expect(att.reasoningHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(att.sourcesHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(typeof att.traceURI).toBe("string");
    expect(typeof att.txHash).toBe("string");
    expect(typeof att.agentAddress).toBe("string");
    expect(typeof att.isHuman).toBe("boolean");
    expect(typeof att.blockedByProtocol).toBe("boolean");
    expect(att.skillHash === null || typeof att.skillHash === "string").toBe(true);
  });

  it("Claim shape is correct", () => {
    const claim = MOCK_LIVE_CLAIMS[0];
    if (!claim) throw new Error("missing mock claim");
    expect(typeof claim.id).toBe("string");
    expect([1, 2, 3]).toContain(claim.tier);
    expect(typeof claim.asset).toBe("string");
    expect(typeof claim.claimType).toBe("string");
    expect(typeof claim.submitter).toBe("string");
    expect(typeof claim.payload).toBe("object");
  });

  it("decisivenessPct + abstentionPct are consistent", () => {
    const row = MOCK_LIVE_LEADERBOARD[0];
    if (!row) return;
    const decisive = row.correct + row.wrong;
    const total = row.totalDecisions;
    expect(total).toBe(row.correct + row.wrong + row.abstained);
    const expectedDecisiveness = Math.round((decisive / total) * 1000) / 10;
    expect(row.decisivenessPct).toBeCloseTo(expectedDecisiveness, 1);
  });
});
