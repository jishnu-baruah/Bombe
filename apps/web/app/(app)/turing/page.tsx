/**
 * /turing, blind human-vs-AI mode (T-903, stretch).
 *
 * The Turing-test surface: you see attestor behaviour with the identity hidden
 * and guess human or AI, then reveal. Uses live leaderboard rows when available,
 * otherwise a representative demo set so the mode always works.
 */

import { getLeaderboard } from "@/lib/data-source";
import TuringClient from "./TuringClient";

export const revalidate = 30;

export default async function TuringPage() {
  let rows: Awaited<ReturnType<typeof getLeaderboard>> = [];
  try {
    rows = await getLeaderboard();
  } catch {
    rows = [];
  }
  return <TuringClient rows={rows} />;
}
