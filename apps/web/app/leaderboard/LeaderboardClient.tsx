"use client";

/**
 * LeaderboardClient.tsx, Client rendering component for /leaderboard.
 *
 * Receives pre-fetched leaderboard rows as props from the server page wrapper
 * (app/leaderboard/page.tsx) and handles client-side sorting + display.
 *
 * Extracted from page.tsx by T-J04 (live data wiring) so the server wrapper
 * can call data-source.ts async getters. Data shapes are unchanged.
 *
 * Original: T-604
 */

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { GLOSSARY, Gloss } from "@/components/ui/Gloss";
import { Mono } from "@/components/ui/Mono";
import type { LeaderboardRow } from "@/lib/demo-data";
import { type SortDir, type SortKey, sortLeaderboard } from "@/lib/leaderboard-sort";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

type ColDef = {
  key: SortKey;
  label: string;
  def?: string;
};

const COLUMNS: ColDef[] = [
  { key: "rank", label: "#" },
  { key: "agentId", label: "Agent" },
  {
    key: "accuracyPct",
    label: "Accuracy",
    def: "Share of decisive verdicts that were correct; abstentions are excluded from the denominator.",
  },
  { key: "abstentionPct", label: "Abstention", def: GLOSSARY.abstain },
  {
    key: "decisivenessPct",
    label: "Decisiveness",
    def: "Share of decisions that were a committed verdict rather than an abstention.",
  },
  { key: "avgLatencyMs", label: "Avg Latency" },
  { key: "totalCostUsd", label: "Cost (USD)" },
  { key: "bond", label: "Bond (ETH)", def: GLOSSARY.bond },
  {
    key: "slashes",
    label: "Slashes",
    def: "Times this attestor's stake was cut for a wrong attestation.",
  },
  {
    key: "reputation",
    label: "Reputation",
    def: "On-chain score: +1 correct, -10 wrong, 0 abstain.",
  },
];

// ---------------------------------------------------------------------------
// Agent display label
// ---------------------------------------------------------------------------

function agentLabel(row: LeaderboardRow): string {
  const labels: Record<string, string> = {
    reflector: "Reflector",
    rotor: "Rotor",
    stator: "Stator",
    plugboard: "Plugboard",
    human: "Human",
  };
  return labels[row.agentId] ?? row.agentId;
}

function AgentTypeBadge({ row }: { row: LeaderboardRow }) {
  if (row.isExternal) {
    return <Badge variant="EXTERNAL_RUNTIME" label="EXTERNAL RUNTIME" className="text-[11px]" />;
  }
  if (row.isHuman) {
    return <Badge variant="HUMAN" className="text-[11px]" />;
  }
  return <Badge variant="AI" className="text-[11px]" />;
}

// ---------------------------------------------------------------------------
// Stat summary cards
// ---------------------------------------------------------------------------

function SummaryCards({ rows }: { rows: LeaderboardRow[] }) {
  const topAgent = rows[0];
  const totalDecisions = rows.reduce((s, r) => s + r.totalDecisions, 0);
  const totalAbstained = rows.reduce((s, r) => s + r.abstained, 0);
  const overallAbstainPct =
    totalDecisions > 0 ? Math.round((totalAbstained / totalDecisions) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
      <Card variant="feature-dark" className="p-6">
        <p className="text-[12px] text-[#505a63] font-semibold tracking-[0.8px] uppercase mb-2">
          Top Ranked
        </p>
        <p className="text-[22px] font-semibold capitalize tracking-[-0.2px]">
          {topAgent?.agentId ?? "-"}
        </p>
        <p className="text-[#505a63] text-[13px] mt-1 tabular">
          {topAgent?.accuracyPct !== null && topAgent?.accuracyPct !== undefined
            ? `${topAgent.accuracyPct}% accuracy`
            : "all abstain"}
        </p>
      </Card>
      <Card variant="feature-dark" className="p-6">
        <p className="text-[12px] text-[#505a63] font-semibold tracking-[0.8px] uppercase mb-2">
          Total Decisions
        </p>
        <p className="text-[22px] font-semibold font-mono tabular">{totalDecisions}</p>
        <p className="text-[#505a63] text-[13px] mt-1">across 4 claims</p>
      </Card>
      <Card variant="feature-dark" className="p-6 col-span-2 sm:col-span-1">
        <p className="text-[12px] text-[#505a63] font-semibold tracking-[0.8px] uppercase mb-2">
          Overall Abstention
        </p>
        <p className="text-[22px] font-semibold font-mono tabular">{overallAbstainPct}%</p>
        <p className="text-[#505a63] text-[13px] mt-1 tabular">
          {totalAbstained} of {totalDecisions}
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort indicator
// ---------------------------------------------------------------------------

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-[#3a3d40] ml-1 text-[11px]">⇅</span>;
  return <span className="text-[#494fdf] ml-1 text-[11px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function LeaderboardTableRow({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const accColor =
    row.accuracyPct === null
      ? "#8d969e"
      : row.accuracyPct >= 90
        ? "#428619"
        : row.accuracyPct >= 70
          ? "#b09000"
          : "#e23b4a";

  return (
    <tr className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[#16181a] transition-colors">
      {/* Rank */}
      <td className="px-4 py-3 text-[#8d969e] font-mono text-[13px]">{rank}</td>
      {/* Agent */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span className="font-semibold text-[15px] capitalize">{agentLabel(row)}</span>
          <AgentTypeBadge row={row} />
        </div>
      </td>
      {/* Accuracy */}
      <td className="px-4 py-3 font-mono text-[13px]" style={{ color: accColor }}>
        {row.accuracyPct !== null ? `${row.accuracyPct}%` : "-"}
      </td>
      {/* Abstention */}
      <td className="px-4 py-3 font-mono text-[13px] text-[#8d969e]">{row.abstentionPct}%</td>
      {/* Decisiveness */}
      <td className="px-4 py-3 font-mono text-[13px] text-[#c9c9cd]">{row.decisivenessPct}%</td>
      {/* Avg Latency */}
      <td className="px-4 py-3">
        <Mono value={`${row.avgLatencyMs}ms`} showCopy={false} />
      </td>
      {/* Cost */}
      <td className="px-4 py-3">
        <Mono value={`$${row.totalCostUsd.toFixed(4)}`} showCopy={false} />
      </td>
      {/* Bond */}
      <td className="px-4 py-3">
        <Mono value={`${row.bond} ETH`} showCopy={false} />
      </td>
      {/* Slashes */}
      <td className="px-4 py-3 font-mono text-[13px]">
        <span className={row.slashes > 0 ? "text-[#e23b4a]" : "text-[#8d969e]"}>{row.slashes}</span>
      </td>
      {/* Reputation */}
      <td className="px-4 py-3 font-mono text-[13px]">
        <span
          className={
            row.reputation >= 100
              ? "text-[#428619]"
              : row.reputation >= 90
                ? "text-[#b09000]"
                : "text-[#e23b4a]"
          }
        >
          {row.reputation}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LeaderboardPage({ initialRows }: { initialRows: LeaderboardRow[] }) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initialRows);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    const newDir: SortDir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    setSortKey(key);
    setSortDir(newDir);
    setRows(sortLeaderboard(initialRows, key, newDir));
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#ffffff]">
      {/* ── Hero band ── */}
      <section className="px-6 py-[88px] border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-6xl mx-auto">
          <p className="text-[#494fdf] text-[12px] font-semibold tracking-[0.8px] uppercase mb-4">
            Bombe · Agent Rankings
          </p>
          <h1 className="text-[clamp(40px,8vw,80px)] font-semibold leading-[1.0] tracking-[-0.8px] mb-4 balance">
            Leaderboard
          </h1>
          <p className="text-[rgba(255,255,255,0.60)] text-[18px] max-w-2xl leading-[1.56] pretty">
            Lifetime aggregate over claims A–D (demo settlement). Accuracy excludes abstentions from
            the denominator, only decisive attestations are scored.
          </p>
        </div>
      </section>

      {/* ── Main content ── */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <SummaryCards rows={rows} />

          {/* Scrollable table wrapper (responsive ≤380px) */}
          <div className="overflow-x-auto rounded-[20px] border border-[rgba(255,255,255,0.06)]">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-[#16181a] border-b border-[rgba(255,255,255,0.12)]">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className="px-4 py-3 text-left text-[13px] font-semibold text-[#8d969e] cursor-pointer hover:text-[#ffffff] transition-colors select-none whitespace-nowrap"
                      onClick={() => handleSort(col.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSort(col.key);
                        }
                      }}
                      aria-sort={
                        sortKey === col.key
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      {col.def ? <Gloss def={col.def}>{col.label}</Gloss> : col.label}
                      <SortIcon active={sortKey === col.key} dir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <LeaderboardTableRow key={row.agentId} row={row} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap gap-4 text-[13px] text-[#505a63]">
            <span>
              <span className="text-[#428619] font-mono">■</span> Accuracy ≥ 90%
            </span>
            <span>
              <span className="text-[#b09000] font-mono">■</span> 70–89%
            </span>
            <span>
              <span className="text-[#e23b4a] font-mono">■</span> &lt; 70%
            </span>
            <span className="ml-auto text-[#3a3d40]">
              Abstentions excluded from accuracy denominator (PRD §6.6)
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
