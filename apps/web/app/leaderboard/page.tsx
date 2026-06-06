/**
 * /leaderboard — Server component wrapper.
 *
 * Fetches leaderboard rows server-side via data-source.ts (which selects
 * demo-data or live-data based on MODE env). Passes pre-fetched rows to
 * the client rendering component (LeaderboardClient.tsx).
 *
 * MODE=mock → demo-data fixtures (no network).
 * MODE=live → viem reads from deployed Mantle Sepolia contracts (T-J04).
 *
 * On RPC error the live getter returns [] and an empty table is shown
 * (graceful degradation, never crashes the page).
 *
 * T-J04 — live on-chain data layer.
 */

import { getLeaderboard } from "@/lib/data-source";
import LeaderboardPage from "./LeaderboardClient";

export const revalidate = 30; // Next.js ISR: re-fetch every 30s in live mode

export default async function LeaderboardServerPage() {
  const rows = await getLeaderboard();
  return <LeaderboardPage initialRows={rows} />;
}
