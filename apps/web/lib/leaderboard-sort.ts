/**
 * lib/leaderboard-sort.ts — Pure sort logic for the leaderboard page.
 *
 * Extracted from app/leaderboard/page.tsx so that:
 *   1. Tests can import and test it directly (no React dependency).
 *   2. The page file only exports `default` (Next.js page constraint).
 *
 * NO `any`. Pure function — no side effects.
 */

import type { LeaderboardRow } from "@/lib/demo-data";

export type SortKey =
  | "rank"
  | "agentId"
  | "accuracyPct"
  | "abstentionPct"
  | "decisivenessPct"
  | "avgLatencyMs"
  | "totalCostUsd"
  | "bond"
  | "slashes"
  | "reputation";

export type SortDir = "asc" | "desc";

/**
 * sortLeaderboard — pure, immutable sort.
 *
 * Returns a new array — never mutates `rows`.
 * Used by the leaderboard page component and by tests.
 */
export function sortLeaderboard(
  rows: LeaderboardRow[],
  key: SortKey,
  dir: SortDir,
): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const av: number | string | null =
      a[key] ?? (dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const bv: number | string | null =
      b[key] ?? (dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return dir === "asc" ? cmp : -cmp;
  });
}
