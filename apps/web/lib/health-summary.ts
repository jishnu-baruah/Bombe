/**
 * health-summary.ts — pure derivation logic for /operator/health.
 *
 * All functions are pure (no I/O, no side effects) so they are testable in
 * vitest without mocking filesystem calls. The health page calls these with
 * already-fetched data.
 *
 * PRD §6.6 — /operator/health; §10 — observability.
 * NO `any` anywhere.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SuiteStatus = "pass" | "fail" | "unknown";

export interface TestReportSummary {
  /** Which suite (forge / vitest / demo). */
  suite: string;
  /** Overall pass/fail status. */
  status: SuiteStatus;
  /** Total tests in the suite. */
  total: number;
  /** Number of passing tests. */
  passed: number;
  /** Number of failing tests. */
  failed: number;
  /** ISO timestamp of the last run, or null if never run. */
  lastRunAt: string | null;
}

export interface ModelAgentStats {
  agentId: string;
  avgLatencyMs: number;
  errorCount: number;
  failoverCount: number;
  lastSeen: string | null;
}

export interface HealthSummary {
  /** Current run mode. */
  mode: "mock" | "live";
  /** Overall demo readiness — true when the last test:demo run passed. */
  demoReady: boolean;
  /** Plugboard runtime status. */
  plugboardStatus: "online" | "offline" | "replaying" | "frozen";
  /** Latest test-report summaries (one per suite). */
  testReports: TestReportSummary[];
  /** Per-agent model latency / error / failover stats. */
  agentStats: ModelAgentStats[];
  /** Summary line for display. */
  statusLine: string;
}

// ---------------------------------------------------------------------------
// Pure derivation functions
// ---------------------------------------------------------------------------

/**
 * derivePlugboardStatus — resolves the Plugboard runtime status from the
 * frozen flag and optional online/offline signal.
 *
 * In mock mode we always treat Plugboard as "replaying" (the deterministic
 * fixture replay). In live mode we need an actual heartbeat; absent that we
 * return "offline".
 */
export function derivePlugboardStatus(
  isFrozen: boolean,
  mode: "mock" | "live",
  isOnline?: boolean,
): "online" | "offline" | "replaying" | "frozen" {
  if (isFrozen) return "frozen";
  if (mode === "mock") return "replaying";
  if (isOnline === true) return "online";
  return "offline";
}

/**
 * deriveDemoReady — true when all suite statuses are "pass".
 * If no suites are provided, returns false (we can't assert readiness without data).
 */
export function deriveDemoReady(reports: TestReportSummary[]): boolean {
  if (reports.length === 0) return false;
  return reports.every((r) => r.status === "pass");
}

/**
 * deriveStatusLine — produces a one-line human-readable summary.
 */
export function deriveStatusLine(
  demoReady: boolean,
  mode: "mock" | "live",
  plugboardStatus: string,
  failedSuites: number,
): string {
  if (!demoReady) {
    if (failedSuites > 0) {
      return `NOT READY: ${failedSuites} suite${failedSuites > 1 ? "s" : ""} failing`;
    }
    return "NOT READY: no test reports found";
  }
  return `READY: ${mode.toUpperCase()} mode, Plugboard ${plugboardStatus.toUpperCase()}`;
}

/**
 * buildHealthSummary — composes a full HealthSummary from all available inputs.
 * Pure function — all I/O happens in the caller (health page or test).
 */
export function buildHealthSummary(
  mode: "mock" | "live",
  testReports: TestReportSummary[],
  agentStats: ModelAgentStats[],
  plugboardFrozen: boolean,
  plugboardOnline?: boolean,
): HealthSummary {
  const demoReady = deriveDemoReady(testReports);
  const plugboardStatus = derivePlugboardStatus(plugboardFrozen, mode, plugboardOnline);
  const failedSuites = testReports.filter((r) => r.status === "fail").length;
  const statusLine = deriveStatusLine(demoReady, mode, plugboardStatus, failedSuites);

  return {
    mode,
    demoReady,
    plugboardStatus,
    testReports,
    agentStats,
    statusLine,
  };
}

// ---------------------------------------------------------------------------
// Stub data helpers (used when .test-reports/ is absent — mock/dev mode)
// ---------------------------------------------------------------------------

/** The canonical agent IDs. */
const AGENT_IDS = ["reflector", "rotor", "stator", "plugboard", "human"] as const;

/**
 * stubAgentStats — returns deterministic stub stats for all agents.
 * Used when no live telemetry is available (mock mode, no DB).
 */
export function stubAgentStats(): ModelAgentStats[] {
  const latencies: Record<string, number> = {
    reflector: 1240,
    rotor: 980,
    stator: 1560,
    plugboard: 2100,
    human: 720000,
  };

  return AGENT_IDS.map((id) => ({
    agentId: id,
    avgLatencyMs: latencies[id] ?? 1000,
    errorCount: 0,
    failoverCount: 0,
    lastSeen: null,
  }));
}

/**
 * stubTestReports — returns a single "unknown" stub when no reports are present.
 * Honest about the missing state rather than fabricating a pass.
 */
export function stubTestReports(): TestReportSummary[] {
  return [
    {
      suite: "vitest",
      status: "unknown",
      total: 0,
      passed: 0,
      failed: 0,
      lastRunAt: null,
    },
    {
      suite: "forge",
      status: "unknown",
      total: 0,
      passed: 0,
      failed: 0,
      lastRunAt: null,
    },
  ];
}
