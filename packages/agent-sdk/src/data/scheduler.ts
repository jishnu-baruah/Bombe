/**
 * data/scheduler.ts — Dedupe + streak-record logic for the daily run. (BOMBE-V2-PRD WS3, D13)
 *
 * Pure functions, no I/O. The caller injects what it observed (whether the chain
 * already has a run for today, the committed marker date, and whether each source
 * was reachable). decideRun never risks a double-post: if BOTH sources are
 * unreachable it skips (fail-closed). The streak formatters produce a stable
 * markdown row and JSON entry for the public track record, including failures,
 * abstains, and self-tests.
 */

export type RunDecision = "run" | "skip-already-ran" | "skip-fail-closed";

export interface DedupeInputs {
  /** Today's date, YYYY-MM-DD. */
  today: string;
  /** Was the on-chain history readable this run? */
  chainReachable: boolean;
  /** Was the committed marker readable this run? */
  markerReachable: boolean;
  /** Does the chain already show a run for `today`? (meaningful only if chainReachable) */
  chainHasRunToday: boolean;
  /** The date in the committed marker, or null. (meaningful only if markerReachable) */
  committedMarkerDate: string | null;
}

/**
 * decideRun — fail-closed daily dedupe (D13).
 *
 *   both sources unreachable        -> skip-fail-closed (never risk a double-post)
 *   any reachable source shows today -> skip-already-ran
 *   otherwise (>=1 reachable, none show today) -> run
 */
export function decideRun(i: DedupeInputs): RunDecision {
  if (!i.chainReachable && !i.markerReachable) {
    return "skip-fail-closed";
  }
  if (i.chainReachable && i.chainHasRunToday) {
    return "skip-already-ran";
  }
  if (i.markerReachable && i.committedMarkerDate === i.today) {
    return "skip-already-ran";
  }
  return "run";
}

/**
 * isSelfTestRun — every 7th run is a self-test (Q8) that asserts a deliberately
 * wrong value, so the public record visibly contains a REJECTED (a discriminator,
 * not a rubber stamp). `priorRunCount` is the number of runs already recorded;
 * this run is number priorRunCount + 1.
 */
export function isSelfTestRun(priorRunCount: number): boolean {
  return priorRunCount >= 0 && (priorRunCount + 1) % 7 === 0;
}

export interface StreakRecord {
  date: string;
  asset: string;
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  txHash: string;
  reasoningHash: string;
  windowDays: number;
  /** Honest run configuration, e.g. "single-model, pre-consensus". */
  configLabel: string;
  selfTest?: boolean;
}

const EXPLORER_TX = "https://sepolia.mantlescan.xyz/tx";

function short(hashOrTx: string): string {
  return hashOrTx.length > 12 ? `${hashOrTx.slice(0, 10)}…` : hashOrTx;
}

/** The header for the streak markdown table (kept next to the row formatter so they cannot drift). */
export function streakTableHeader(): string {
  return [
    "| Date | Asset | Decision | Window | Tx | Reasoning hash | Config |",
    "|------|-------|----------|--------|----|----------------|--------|",
  ].join("\n");
}

/** One markdown row for the public streak surface. Self-tests are visibly flagged. */
export function streakRowMarkdown(r: StreakRecord): string {
  const decision = r.selfTest ? `${r.decision} (self-test)` : r.decision;
  const tx = `[${short(r.txHash)}](${EXPLORER_TX}/${r.txHash})`;
  return `| ${r.date} | ${r.asset} | ${decision} | ${r.windowDays}d | ${tx} | ${short(r.reasoningHash)} | ${r.configLabel} |`;
}

/** A stable JSON entry for the machine-readable streak record. */
export function streakJsonEntry(r: StreakRecord): {
  date: string;
  asset: string;
  decision: string;
  txHash: string;
  reasoningHash: string;
  windowDays: number;
  configLabel: string;
  selfTest: boolean;
} {
  return {
    date: r.date,
    asset: r.asset,
    decision: r.decision,
    txHash: r.txHash,
    reasoningHash: r.reasoningHash,
    windowDays: r.windowDays,
    configLabel: r.configLabel,
    selfTest: r.selfTest === true,
  };
}
