/**
 * test/leaderboard.test.ts — Tests for the leaderboard sort logic.
 *
 * Tests the pure sortLeaderboard function (no React rendering required).
 * NO `any`. Deterministic.
 */

import { type LeaderboardRow, getLeaderboard } from "@/lib/demo-data";
import { type SortDir, type SortKey, sortLeaderboard } from "@/lib/leaderboard-sort";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// sortLeaderboard — pure sort logic
// ---------------------------------------------------------------------------

describe("sortLeaderboard", () => {
  const rows = getLeaderboard();

  it("sort by rank asc returns rows with rank in ascending order", () => {
    const sorted = sortLeaderboard(rows, "rank", "asc");
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur && next) expect(cur.rank).toBeLessThanOrEqual(next.rank);
    }
  });

  it("sort by rank desc returns rows with rank in descending order", () => {
    const sorted = sortLeaderboard(rows, "rank", "desc");
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur && next) expect(cur.rank).toBeGreaterThanOrEqual(next.rank);
    }
  });

  it("sort by agentId asc produces alphabetical order", () => {
    const sorted = sortLeaderboard(rows, "agentId", "asc");
    const ids = sorted.map((r) => r.agentId);
    const sorted2 = [...ids].sort();
    expect(ids).toEqual(sorted2);
  });

  it("sort by agentId desc produces reverse alphabetical order", () => {
    const sorted = sortLeaderboard(rows, "agentId", "desc");
    const ids = sorted.map((r) => r.agentId);
    const sorted2 = [...ids].sort().reverse();
    expect(ids).toEqual(sorted2);
  });

  it("sort by slashes asc puts agents with fewer slashes first", () => {
    const sorted = sortLeaderboard(rows, "slashes", "asc");
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur && next) expect(cur.slashes).toBeLessThanOrEqual(next.slashes);
    }
  });

  it("sort by reputation desc puts highest reputation first", () => {
    const sorted = sortLeaderboard(rows, "reputation", "desc");
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur && next) expect(cur.reputation).toBeGreaterThanOrEqual(next.reputation);
    }
  });

  it("sort by avgLatencyMs asc puts fastest agents first", () => {
    const sorted = sortLeaderboard(rows, "avgLatencyMs", "asc");
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur && next) expect(cur.avgLatencyMs).toBeLessThanOrEqual(next.avgLatencyMs);
    }
  });

  it("sort by totalCostUsd asc puts cheapest agents first", () => {
    const sorted = sortLeaderboard(rows, "totalCostUsd", "asc");
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur && next) expect(cur.totalCostUsd).toBeLessThanOrEqual(next.totalCostUsd);
    }
  });

  it("sort does not mutate the original rows array", () => {
    const original = getLeaderboard();
    const originalIds = original.map((r) => r.agentId);
    sortLeaderboard(original, "agentId", "asc");
    expect(original.map((r) => r.agentId)).toEqual(originalIds);
  });

  it("sort returns all rows (no rows lost)", () => {
    for (const key of ["rank", "agentId", "accuracyPct", "slashes"] as SortKey[]) {
      for (const dir of ["asc", "desc"] as SortDir[]) {
        const sorted = sortLeaderboard(rows, key, dir);
        expect(sorted).toHaveLength(rows.length);
      }
    }
  });

  it("sort changes order when sorting by a discriminating column", () => {
    // Sort by latency asc vs desc — should produce different orders
    const asc = sortLeaderboard(rows, "avgLatencyMs", "asc");
    const desc = sortLeaderboard(rows, "avgLatencyMs", "desc");
    // If all latencies are distinct, orders will differ
    const hasDistinct = new Set(rows.map((r) => r.avgLatencyMs)).size > 1;
    if (hasDistinct) {
      expect(asc.map((r) => r.agentId)).not.toEqual(desc.map((r) => r.agentId));
    }
  });
});

// ---------------------------------------------------------------------------
// Leaderboard data: all rows rendered (smoke check — pure logic only)
// ---------------------------------------------------------------------------

describe("leaderboard rows", () => {
  it("each row has a non-empty agentId", () => {
    const rows = getLeaderboard();
    for (const row of rows) {
      expect(row.agentId.length).toBeGreaterThan(0);
    }
  });

  it("each row has decisivenessPct = 1 - abstentionPct (within floating point)", () => {
    const rows = getLeaderboard();
    for (const row of rows) {
      const expected = Math.round((100 - row.abstentionPct) * 10) / 10;
      expect(row.decisivenessPct).toBeCloseTo(expected, 1);
    }
  });

  it("correct + wrong + abstained = totalDecisions", () => {
    const rows = getLeaderboard();
    for (const row of rows) {
      expect(row.correct + row.wrong + row.abstained).toBe(row.totalDecisions);
    }
  });
});
