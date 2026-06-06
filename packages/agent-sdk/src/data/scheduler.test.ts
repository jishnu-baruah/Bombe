import { describe, expect, it } from "vitest";
import {
  type StreakRecord,
  decideRun,
  isSelfTestRun,
  streakJsonEntry,
  streakRowMarkdown,
  streakTableHeader,
} from "./scheduler.js";

describe("isSelfTestRun (Q8 cadence)", () => {
  it("is true on every 7th run and false otherwise", () => {
    const flags = Array.from({ length: 14 }, (_, i) => isSelfTestRun(i));
    expect(flags).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true, // runs 1..7
      false,
      false,
      false,
      false,
      false,
      false,
      true, // runs 8..14
    ]);
  });
  it("is false for a negative prior count", () => {
    expect(isSelfTestRun(-1)).toBe(false);
  });
});

const base = {
  today: "2026-06-09",
  chainReachable: true,
  markerReachable: true,
  chainHasRunToday: false,
  committedMarkerDate: "2026-06-08",
};

describe("decideRun (fail-closed dedupe, D13)", () => {
  it("runs when reachable and neither source shows today", () => {
    expect(decideRun(base)).toBe("run");
  });

  it("skips when the chain already shows today", () => {
    expect(decideRun({ ...base, chainHasRunToday: true })).toBe("skip-already-ran");
  });

  it("skips when the committed marker is today", () => {
    expect(decideRun({ ...base, committedMarkerDate: "2026-06-09" })).toBe("skip-already-ran");
  });

  it("fail-closed skips when BOTH sources are unreachable", () => {
    expect(decideRun({ ...base, chainReachable: false, markerReachable: false })).toBe(
      "skip-fail-closed",
    );
  });

  it("still runs when only one source is reachable and clear", () => {
    expect(
      decideRun({
        ...base,
        chainReachable: false,
        markerReachable: true,
        committedMarkerDate: "2026-06-08",
      }),
    ).toBe("run");
    expect(
      decideRun({ ...base, markerReachable: false, chainReachable: true, chainHasRunToday: false }),
    ).toBe("run");
  });

  it("ignores an unreachable source's stale value", () => {
    // chain unreachable but its (ignored) flag says today; marker reachable and clear -> run
    expect(
      decideRun({
        today: "2026-06-09",
        chainReachable: false,
        chainHasRunToday: true,
        markerReachable: true,
        committedMarkerDate: "2026-06-08",
      }),
    ).toBe("run");
  });
});

describe("streak record formatters", () => {
  const rec: StreakRecord = {
    date: "2026-06-09",
    asset: "mETH",
    decision: "VALID",
    txHash: "0xabcdef0123456789aaaa",
    reasoningHash: "0x4cdc5c401f5434097a9a",
    windowDays: 7,
    configLabel: "single-model, pre-consensus",
  };

  it("renders a markdown row with an explorer link and short hashes", () => {
    const row = streakRowMarkdown(rec);
    expect(row).toContain("| 2026-06-09 | mETH | VALID | 7d |");
    expect(row).toContain("https://sepolia.mantlescan.xyz/tx/0xabcdef0123456789aaaa");
    expect(row).toContain("0x4cdc5c40…");
  });

  it("flags self-tests visibly", () => {
    const row = streakRowMarkdown({ ...rec, decision: "REJECTED", selfTest: true });
    expect(row).toContain("REJECTED (self-test)");
  });

  it("the header columns match the row columns", () => {
    const header = streakTableHeader();
    expect(header.split("\n")[0]?.split("|").length).toBe(streakRowMarkdown(rec).split("|").length);
  });

  it("produces a stable JSON entry with selfTest defaulted to false", () => {
    expect(streakJsonEntry(rec)).toEqual({
      date: "2026-06-09",
      asset: "mETH",
      decision: "VALID",
      txHash: "0xabcdef0123456789aaaa",
      reasoningHash: "0x4cdc5c401f5434097a9a",
      windowDays: 7,
      configLabel: "single-model, pre-consensus",
      selfTest: false,
    });
  });
});
