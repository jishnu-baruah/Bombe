"use client";

import { Button } from "@/components/ui/Button";
import type { LeaderboardRow } from "@/lib/demo-data";
import Link from "next/link";
import { useState } from "react";

// A blind profile: the stats are shown, the identity (isHuman) is the answer.
interface Profile {
  id: string;
  isHuman: boolean;
  accuracyPct: number | null;
  abstentionPct: number;
  decisivenessPct: number;
  avgLatencyMs: number;
  note: string;
}

// Representative demo set, used when there is no live leaderboard data. The
// human's giveaway is latency: people take hours, agents take seconds.
const DEMO_PROFILES: Profile[] = [
  {
    id: "d1",
    isHuman: false,
    accuracyPct: 92,
    abstentionPct: 18,
    decisivenessPct: 82,
    avgLatencyMs: 1400,
    note: "Requires two sources; abstains on stale data.",
  },
  {
    id: "d2",
    isHuman: false,
    accuracyPct: 88,
    abstentionPct: 6,
    decisivenessPct: 94,
    avgLatencyMs: 900,
    note: "Commits above threshold; rarely abstains.",
  },
  {
    id: "d3",
    isHuman: false,
    accuracyPct: 90,
    abstentionPct: 12,
    decisivenessPct: 88,
    avgLatencyMs: 700,
    note: "Shortest path; abstains when tools disagree.",
  },
  {
    id: "d4",
    isHuman: true,
    accuracyPct: 95,
    abstentionPct: 30,
    decisivenessPct: 70,
    avgLatencyMs: 5_400_000,
    note: "Cautious; abstains often; very accurate when decisive.",
  },
];

function rowsToProfiles(rows: LeaderboardRow[]): Profile[] {
  const usable = rows.filter((r) => r.totalDecisions > 0);
  if (usable.length < 2) return DEMO_PROFILES;
  return usable.map((r, i) => ({
    id: `r${i}`,
    isHuman: r.isHuman,
    accuracyPct: r.accuracyPct,
    abstentionPct: r.abstentionPct,
    decisivenessPct: r.decisivenessPct,
    avgLatencyMs: r.avgLatencyMs,
    note: r.isExternal ? "Runs on a third-party runtime." : "On-chain attestor.",
  }));
}

function fmtLatency(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)} h`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

export default function TuringClient({ rows }: { rows: LeaderboardRow[] }) {
  const profiles = rowsToProfiles(rows);
  const usingDemo = profiles === DEMO_PROFILES;
  const [guesses, setGuesses] = useState<Record<string, "human" | "ai">>({});
  const [revealed, setRevealed] = useState(false);

  const allGuessed = profiles.every((p) => guesses[p.id]);
  const score = profiles.filter((p) => guesses[p.id] === (p.isHuman ? "human" : "ai")).length;

  return (
    <div className="bg-[#000000] text-[#ffffff] min-h-screen">
      <section className="px-6 pt-[120px] pb-[88px]">
        <div className="max-w-3xl mx-auto">
          <p className="eyebrow mb-4">Turing mode</p>
          <h1 className="text-[clamp(30px,5vw,46px)] font-semibold leading-[1.1] tracking-[-0.6px] mb-4 balance">
            Human or AI? You decide.
          </h1>
          <p className="text-[17px] text-[rgba(255,255,255,0.6)] leading-[1.55] mb-8 max-w-[34rem] pretty">
            Each card shows how an attestor behaves, its accuracy, how often it abstains, how fast
            it answers, with the identity hidden. Guess human or AI for each, then reveal.
            {usingDemo ? " (Representative profiles while live data warms up.)" : ""}
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {profiles.map((p, i) => {
              const guess = guesses[p.id];
              const correct = guess === (p.isHuman ? "human" : "ai");
              return (
                <div
                  key={p.id}
                  className={`rounded-[18px] border p-5 transition-colors ${
                    revealed
                      ? correct
                        ? "border-[rgba(63,185,80,0.4)] bg-[rgba(63,185,80,0.06)]"
                        : "border-[rgba(226,59,74,0.4)] bg-[rgba(226,59,74,0.06)]"
                      : "border-[rgba(255,255,255,0.08)] bg-[#16181a]"
                  }`}
                >
                  <p className="text-[12px] text-[#505a63] font-semibold tracking-[0.8px] uppercase mb-3">
                    Attestor {String.fromCharCode(65 + i)}
                  </p>
                  <dl className="grid grid-cols-2 gap-y-2 text-[13px] mb-3">
                    <dt className="text-[#505a63]">accuracy</dt>
                    <dd className="font-mono tabular text-right">
                      {p.accuracyPct === null ? "-" : `${p.accuracyPct}%`}
                    </dd>
                    <dt className="text-[#505a63]">abstains</dt>
                    <dd className="font-mono tabular text-right">{p.abstentionPct}%</dd>
                    <dt className="text-[#505a63]">decisive</dt>
                    <dd className="font-mono tabular text-right">{p.decisivenessPct}%</dd>
                    <dt className="text-[#505a63]">latency</dt>
                    <dd className="font-mono tabular text-right">{fmtLatency(p.avgLatencyMs)}</dd>
                  </dl>
                  <p className="text-[12px] text-[rgba(255,255,255,0.5)] leading-[1.5] mb-4">
                    {p.note}
                  </p>

                  {revealed ? (
                    <p
                      className={`text-[14px] font-semibold ${
                        correct ? "text-[#7ee08a]" : "text-[#f0a0a8]"
                      }`}
                    >
                      {p.isHuman ? "Human" : "AI"}
                      {guess ? (correct ? " — you got it" : " — you missed") : " — no guess"}
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      {(["human", "ai"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setGuesses((g) => ({ ...g, [p.id]: opt }))}
                          className={`flex-1 px-3 py-2 text-[13px] font-semibold rounded-full border transition-colors ${
                            guess === opt
                              ? "border-[#494fdf] bg-[rgba(73,79,223,0.15)] text-[#ffffff]"
                              : "border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.6)] hover:text-[#ffffff]"
                          }`}
                        >
                          {opt === "human" ? "Human" : "AI"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {!revealed ? (
              <Button variant="primary" onClick={() => setRevealed(true)} disabled={!allGuessed}>
                {allGuessed ? "Reveal" : "Guess every attestor first"}
              </Button>
            ) : (
              <>
                <p className="text-[18px] font-semibold">
                  You scored {score} / {profiles.length}.
                </p>
                <Button
                  variant="outline-dark"
                  onClick={() => {
                    setRevealed(false);
                    setGuesses({});
                  }}
                >
                  Play again
                </Button>
              </>
            )}
            <Link href="/leaderboard" className="text-[14px] text-[#494fdf] hover:text-[#6b70e8]">
              See the real leaderboard →
            </Link>
          </div>

          <p className="text-[13px] text-[#505a63] mt-8 leading-[1.6]">
            The point is not to fool you. Bombe attestors are AI, and their verdicts are checkable
            on-chain regardless of who you think made them. The tell is usually speed and how
            readily something abstains.
          </p>
        </div>
      </section>
    </div>
  );
}
