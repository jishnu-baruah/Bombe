/**
 * test/health-summary.test.ts — T-607 pure-logic tests for health-summary derivation.
 *
 * All functions under test are pure (no I/O). Tests are deterministic.
 * NO `any` anywhere.
 */

import {
  type TestReportSummary,
  buildHealthSummary,
  deriveDemoReady,
  derivePlugboardStatus,
  deriveStatusLine,
  stubAgentStats,
  stubTestReports,
} from "@/lib/health-summary";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PASS_SUITE: TestReportSummary = {
  suite: "vitest",
  status: "pass",
  total: 50,
  passed: 50,
  failed: 0,
  lastRunAt: "2026-06-06T00:00:00.000Z",
};

const FAIL_SUITE: TestReportSummary = {
  suite: "forge",
  status: "fail",
  total: 10,
  passed: 8,
  failed: 2,
  lastRunAt: "2026-06-06T00:00:00.000Z",
};

const UNKNOWN_SUITE: TestReportSummary = {
  suite: "demo",
  status: "unknown",
  total: 0,
  passed: 0,
  failed: 0,
  lastRunAt: null,
};

// ---------------------------------------------------------------------------
// deriveDemoReady
// ---------------------------------------------------------------------------

describe("deriveDemoReady", () => {
  it("empty reports → false", () => {
    expect(deriveDemoReady([])).toBe(false);
  });

  it("all pass → true", () => {
    expect(deriveDemoReady([PASS_SUITE, { ...PASS_SUITE, suite: "forge" }])).toBe(true);
  });

  it("any fail → false", () => {
    expect(deriveDemoReady([PASS_SUITE, FAIL_SUITE])).toBe(false);
  });

  it("any unknown → false", () => {
    expect(deriveDemoReady([PASS_SUITE, UNKNOWN_SUITE])).toBe(false);
  });

  it("single pass → true", () => {
    expect(deriveDemoReady([PASS_SUITE])).toBe(true);
  });

  it("single fail → false", () => {
    expect(deriveDemoReady([FAIL_SUITE])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// derivePlugboardStatus
// ---------------------------------------------------------------------------

describe("derivePlugboardStatus", () => {
  it("frozen=true → frozen regardless of mode", () => {
    expect(derivePlugboardStatus(true, "mock")).toBe("frozen");
    expect(derivePlugboardStatus(true, "live")).toBe("frozen");
  });

  it("mock mode, not frozen → replaying", () => {
    expect(derivePlugboardStatus(false, "mock")).toBe("replaying");
    expect(derivePlugboardStatus(false, "mock", true)).toBe("replaying");
  });

  it("live mode, isOnline=true → online", () => {
    expect(derivePlugboardStatus(false, "live", true)).toBe("online");
  });

  it("live mode, isOnline=false → offline", () => {
    expect(derivePlugboardStatus(false, "live", false)).toBe("offline");
  });

  it("live mode, isOnline absent → offline", () => {
    expect(derivePlugboardStatus(false, "live")).toBe("offline");
  });
});

// ---------------------------------------------------------------------------
// deriveStatusLine
// ---------------------------------------------------------------------------

describe("deriveStatusLine", () => {
  it("demoReady=true → READY line with mode and plugboard status", () => {
    const line = deriveStatusLine(true, "mock", "replaying", 0);
    expect(line).toContain("READY");
    expect(line).toContain("MOCK");
    expect(line).toContain("REPLAYING");
  });

  it("demoReady=false, 1 failed suite → NOT READY with suite count", () => {
    const line = deriveStatusLine(false, "mock", "replaying", 1);
    expect(line).toContain("NOT READY");
    expect(line).toContain("1 suite");
  });

  it("demoReady=false, 2 failed suites → plural 'suites'", () => {
    const line = deriveStatusLine(false, "mock", "replaying", 2);
    expect(line).toContain("2 suites");
  });

  it("demoReady=false, 0 failed suites → no reports message", () => {
    const line = deriveStatusLine(false, "mock", "replaying", 0);
    expect(line).toContain("no test reports");
  });

  it("live mode ready → LIVE in status line", () => {
    const line = deriveStatusLine(true, "live", "online", 0);
    expect(line).toContain("LIVE");
  });
});

// ---------------------------------------------------------------------------
// buildHealthSummary
// ---------------------------------------------------------------------------

describe("buildHealthSummary", () => {
  it("composes all fields correctly when all passing", () => {
    const reports = [PASS_SUITE, { ...PASS_SUITE, suite: "forge" }];
    const stats = stubAgentStats();
    const summary = buildHealthSummary("mock", reports, stats, false);

    expect(summary.mode).toBe("mock");
    expect(summary.demoReady).toBe(true);
    expect(summary.plugboardStatus).toBe("replaying");
    expect(summary.testReports).toHaveLength(2);
    expect(summary.agentStats).toHaveLength(5);
    expect(summary.statusLine).toContain("READY");
  });

  it("frozen plugboard → plugboardStatus=frozen", () => {
    const summary = buildHealthSummary("mock", [PASS_SUITE], stubAgentStats(), true);
    expect(summary.plugboardStatus).toBe("frozen");
    expect(summary.statusLine).toContain("FROZEN");
  });

  it("failing suite → demoReady=false", () => {
    const summary = buildHealthSummary("mock", [FAIL_SUITE], stubAgentStats(), false);
    expect(summary.demoReady).toBe(false);
    expect(summary.statusLine).toContain("NOT READY");
  });

  it("no reports → demoReady=false", () => {
    const summary = buildHealthSummary("mock", [], stubAgentStats(), false);
    expect(summary.demoReady).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stubAgentStats
// ---------------------------------------------------------------------------

describe("stubAgentStats", () => {
  it("returns 5 agents", () => {
    expect(stubAgentStats()).toHaveLength(5);
  });

  it("human has very high latency (simulated queue)", () => {
    const stats = stubAgentStats();
    const human = stats.find((s) => s.agentId === "human");
    expect(human).toBeDefined();
    if (human) {
      expect(human.avgLatencyMs).toBeGreaterThan(60000);
    }
  });

  it("all agents have errorCount=0 and failoverCount=0 (stub values)", () => {
    for (const agent of stubAgentStats()) {
      expect(agent.errorCount).toBe(0);
      expect(agent.failoverCount).toBe(0);
    }
  });

  it("all agents have agentId string", () => {
    for (const agent of stubAgentStats()) {
      expect(typeof agent.agentId).toBe("string");
      expect(agent.agentId.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// stubTestReports
// ---------------------------------------------------------------------------

describe("stubTestReports", () => {
  it("returns 2 reports (vitest + forge)", () => {
    expect(stubTestReports()).toHaveLength(2);
  });

  it("all stub reports have status=unknown", () => {
    for (const r of stubTestReports()) {
      expect(r.status).toBe("unknown");
    }
  });

  it("stub reports have lastRunAt=null", () => {
    for (const r of stubTestReports()) {
      expect(r.lastRunAt).toBeNull();
    }
  });
});
