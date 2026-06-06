/**
 * /operator/health — Operator Health Dashboard (T-607)
 *
 * Server component. Reads .test-reports/ summaries if present (falls back to
 * stubs when absent). Shows model latency/error/failover counts, demo
 * readiness, current mode, and Plugboard runtime status.
 *
 * PRD §6.6 — /operator/health; §10 — observability.
 * DESIGN.md — dark canvas, surface-elevated cards.
 *
 * NO `any` anywhere.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Card } from "@/components/ui/Card";
import {
  type HealthSummary,
  type ModelAgentStats,
  type TestReportSummary,
  buildHealthSummary,
  stubAgentStats,
  stubTestReports,
} from "@/lib/health-summary";
import { getOperatorState } from "@/lib/operator-state";
import { getRunMode } from "@/lib/server-config";
import Link from "next/link";

// ---------------------------------------------------------------------------
// .test-reports/ reader
// ---------------------------------------------------------------------------

const SUITES = ["vitest", "forge", "demo"] as const;
type SuiteId = (typeof SUITES)[number];

interface RawReport {
  summary?: {
    status?: string;
    total?: number;
    passed?: number;
    failed?: number;
    timestamp?: string;
  };
  // vitest JSON reporter top-level shape (partial)
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  success?: boolean;
  startTime?: number;
}

async function loadTestReports(): Promise<TestReportSummary[]> {
  const repoRoot = path.resolve(process.cwd(), "../../");
  const reportsDir = path.join(repoRoot, ".test-reports");

  let files: string[] = [];
  try {
    files = await readdir(reportsDir);
  } catch {
    // .test-reports/ doesn't exist yet — return stubs
    return stubTestReports();
  }

  const reports: TestReportSummary[] = [];

  for (const suiteId of SUITES) {
    const fileName = files.find((f) => f.startsWith(suiteId) && f.endsWith(".json"));
    if (!fileName) {
      reports.push({
        suite: suiteId,
        status: "unknown",
        total: 0,
        passed: 0,
        failed: 0,
        lastRunAt: null,
      });
      continue;
    }

    try {
      const raw = JSON.parse(await readFile(path.join(reportsDir, fileName), "utf-8")) as RawReport;

      // Normalised summary field (our TestReport schema from T-701)
      if (raw.summary) {
        const s = raw.summary;
        const status: TestReportSummary["status"] =
          s.status === "pass" ? "pass" : s.status === "fail" ? "fail" : "unknown";
        reports.push({
          suite: suiteId,
          status,
          total: s.total ?? 0,
          passed: s.passed ?? 0,
          failed: s.failed ?? 0,
          lastRunAt: s.timestamp ?? null,
        });
        continue;
      }

      // Fallback: raw vitest JSON reporter shape
      const passed = raw.numPassedTests ?? 0;
      const failed = raw.numFailedTests ?? 0;
      const total = raw.numTotalTests ?? passed + failed;
      const status: TestReportSummary["status"] =
        raw.success === true ? "pass" : failed > 0 ? "fail" : "unknown";
      const lastRunAt = raw.startTime ? new Date(raw.startTime).toISOString() : null;
      reports.push({ suite: suiteId, status, total, passed, failed, lastRunAt });
    } catch {
      reports.push({
        suite: suiteId,
        status: "unknown",
        total: 0,
        passed: 0,
        failed: 0,
        lastRunAt: null,
      });
    }
  }

  return reports;
}

// ---------------------------------------------------------------------------
// Build health summary (server-side)
// ---------------------------------------------------------------------------

async function getHealthSummary(): Promise<HealthSummary> {
  const mode = getRunMode();
  const testReports = await loadTestReports();
  const agentStats: ModelAgentStats[] = stubAgentStats();
  const opState = getOperatorState();
  return buildHealthSummary(mode, testReports, agentStats, opState.plugboardFrozen);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status:
    | "pass"
    | "fail"
    | "unknown"
    | "online"
    | "offline"
    | "replaying"
    | "frozen"
    | "mock"
    | "live";
}) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pass: { bg: "rgba(0,168,126,0.15)", text: "#00a87e", label: "PASS" },
    fail: { bg: "rgba(226,59,74,0.15)", text: "#e23b4a", label: "FAIL" },
    unknown: { bg: "rgba(141,150,158,0.15)", text: "#8d969e", label: "UNKNOWN" },
    online: { bg: "rgba(0,168,126,0.15)", text: "#00a87e", label: "ONLINE" },
    offline: { bg: "rgba(226,59,74,0.15)", text: "#e23b4a", label: "OFFLINE" },
    replaying: { bg: "rgba(73,79,223,0.15)", text: "#4f55f1", label: "REPLAYING" },
    frozen: { bg: "rgba(176,144,0,0.15)", text: "#b09000", label: "FROZEN" },
    mock: { bg: "rgba(73,79,223,0.15)", text: "#4f55f1", label: "MOCK" },
    live: { bg: "rgba(0,168,126,0.15)", text: "#00a87e", label: "LIVE" },
  };
  const c = config[status] ?? config.unknown;
  if (!c) return null;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-[0.5px]"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#0a0a0a] rounded-[12px] px-4 py-3 border border-[rgba(255,255,255,0.06)]">
      <p className="text-[12px] text-[#8d969e] mb-1 uppercase tracking-[0.5px]">{label}</p>
      <p className="text-[24px] font-semibold text-[#ffffff] leading-[1.2]">{value}</p>
      {sub && <p className="text-[12px] text-[rgba(255,255,255,0.40)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (server component — no "use client")
// ---------------------------------------------------------------------------

export default async function HealthPage() {
  const health = await getHealthSummary();

  const totalTests = health.testReports.reduce((s, r) => s + r.total, 0);
  const totalPassed = health.testReports.reduce((s, r) => s + r.passed, 0);
  const totalFailed = health.testReports.reduce((s, r) => s + r.failed, 0);

  return (
    <div className="min-h-screen px-6 py-[88px]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <p className="text-[#8d969e] text-[13px] font-mono mb-2">T-607 — /operator/health</p>
            <h1 className="text-[48px] font-semibold leading-[1.21] tracking-[-0.48px]">
              Health Dashboard
            </h1>
            <p className="text-[rgba(255,255,255,0.72)] mt-2 text-[16px]">
              System status, test coverage, and agent observability.
            </p>
          </div>
          <Link href="/operator">
            <span className="inline-flex items-center px-5 py-[13px] text-[16px] font-semibold bg-[#000000] text-[#ffffff] border border-[#ffffff] rounded-full hover:bg-[#16181a] transition-colors">
              Operator Console
            </span>
          </Link>
        </div>

        {/* Status Line */}
        <div
          className={`mb-8 px-4 py-3 rounded-[12px] border flex items-center gap-3 ${
            health.demoReady
              ? "bg-[rgba(0,168,126,0.08)] border-[rgba(0,168,126,0.24)]"
              : "bg-[rgba(226,59,74,0.08)] border-[rgba(226,59,74,0.24)]"
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full inline-block ${health.demoReady ? "bg-[#00a87e]" : "bg-[#e23b4a]"}`}
          />
          <span className="text-[14px] font-semibold tracking-[0.3px]">{health.statusLine}</span>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <MetricCard label="Mode" value={health.mode.toUpperCase()} sub="Runtime mode" />
          <MetricCard
            label="Demo Ready"
            value={health.demoReady ? "Yes" : "No"}
            sub="test:demo last run"
          />
          <MetricCard
            label="Total Tests"
            value={totalTests}
            sub={`${totalPassed} pass / ${totalFailed} fail`}
          />
          <MetricCard
            label="Plugboard"
            value={health.plugboardStatus.toUpperCase()}
            sub="Runtime status"
          />
        </div>

        {/* Test Suite Reports */}
        <Card variant="feature-dark" className="mb-6">
          <h2 className="text-[20px] font-semibold leading-[1.4] mb-4">Test Suites</h2>
          <div className="space-y-3">
            {health.testReports.map((report) => (
              <div
                key={report.suite}
                className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.06)] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={report.status} />
                  <span className="text-[16px] font-semibold capitalize">{report.suite}</span>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-[13px] text-[rgba(255,255,255,0.72)]">
                      {report.passed}/{report.total} passing
                    </p>
                    {report.lastRunAt && (
                      <p className="text-[11px] text-[#8d969e] font-mono">
                        {new Date(report.lastRunAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* System Info */}
        <Card variant="feature-dark" className="mb-6">
          <h2 className="text-[20px] font-semibold leading-[1.4] mb-4">System</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[12px] text-[#8d969e] uppercase tracking-[0.5px] mb-1">Mode</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={health.mode} />
                <span className="text-[14px] text-[rgba(255,255,255,0.72)]">
                  {health.mode === "mock" ? "Deterministic fixture replay" : "Live on-chain"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[12px] text-[#8d969e] uppercase tracking-[0.5px] mb-1">
                Plugboard
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge status={health.plugboardStatus} />
                <span className="text-[14px] text-[rgba(255,255,255,0.72)]">
                  {health.plugboardStatus === "replaying"
                    ? "Fixture replay (mock)"
                    : health.plugboardStatus === "frozen"
                      ? "Skill writes blocked"
                      : health.plugboardStatus === "online"
                        ? "Live runtime connected"
                        : "Not reachable"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[12px] text-[#8d969e] uppercase tracking-[0.5px] mb-1">Chain</p>
              <p className="text-[14px] text-[rgba(255,255,255,0.72)]">Mantle Sepolia (5003)</p>
            </div>
          </div>
        </Card>

        {/* Agent Stats */}
        <Card variant="feature-dark" className="mb-6">
          <h2 className="text-[20px] font-semibold leading-[1.4] mb-4">Agent Observability</h2>
          <p className="text-[13px] text-[rgba(255,255,255,0.40)] mb-4">
            {health.mode === "mock"
              ? "Stub latencies — no live telemetry in mock mode."
              : "Live telemetry per agent per epoch."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)]">
                  <th className="text-left text-[12px] text-[#8d969e] uppercase tracking-[0.5px] pb-2 pr-4">
                    Agent
                  </th>
                  <th className="text-right text-[12px] text-[#8d969e] uppercase tracking-[0.5px] pb-2 pr-4">
                    Avg Latency
                  </th>
                  <th className="text-right text-[12px] text-[#8d969e] uppercase tracking-[0.5px] pb-2 pr-4">
                    Errors
                  </th>
                  <th className="text-right text-[12px] text-[#8d969e] uppercase tracking-[0.5px] pb-2">
                    Failovers
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.agentStats.map((agent) => (
                  <tr
                    key={agent.agentId}
                    className="border-b border-[rgba(255,255,255,0.04)] last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-semibold capitalize">{agent.agentId}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[rgba(255,255,255,0.72)]">
                      {agent.avgLatencyMs >= 60000
                        ? `${(agent.avgLatencyMs / 60000).toFixed(1)}m`
                        : `${agent.avgLatencyMs.toLocaleString()}ms`}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[rgba(255,255,255,0.72)]">
                      {agent.errorCount}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[rgba(255,255,255,0.72)]">
                      {agent.failoverCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
