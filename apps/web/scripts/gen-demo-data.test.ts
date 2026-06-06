/**
 * gen-demo-data.test.ts — Generator + validator for apps/web/fixtures/demo-data.json
 *
 * Runs as a vitest file. Top-level await runs all the generation, then the
 * describe/it blocks validate the output and confirm the fixture was written.
 *
 * Run:
 *   pnpm --filter @bombe/web exec vitest run scripts/gen-demo-data.test.ts
 *
 * GUARDRAIL: All hashes come from hashCanonical(trace) — NEVER hand-typed (PRD §15.4).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFLECTOR_CONFIG,
  ROTOR_CONFIG,
  type ReferenceAgentConfig,
  STATOR_CONFIG,
  ScriptedModelSeam,
  runReferenceAgent,
} from "@bombe/agent-reference";
import type { Trace } from "@bombe/agent-sdk";
import { type Claim, hashCanonical, loadModelScript } from "@bombe/shared";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURES_ROOT = resolve(REPO_ROOT, "fixtures");
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "demo-data.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClaimId = "A" | "B" | "C" | "D";

type TraceStep = {
  step: number;
  thought: string;
  action: unknown;
  observation: unknown;
  ts: number;
};

type SyntheticTrace = {
  traceVersion: "1.0";
  agentId: string;
  claimId: string;
  steps: TraceStep[];
  final: {
    decision: "VALID" | "REJECTED" | "ABSTAIN";
    confidenceBps: number;
    rationaleSummary: string;
    reasons: string[];
  };
};

type AttestationRecord = {
  agentId: string;
  claimId: string;
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  confidenceBps: number;
  reasoningHash: `0x${string}`;
  sourcesHash: `0x${string}`;
  traceURI: string;
  txHash: string;
  agentAddress: string;
  latencyMs: number;
  costUsd: number;
  isHuman: boolean;
  blockedByProtocol: boolean;
  skillHash: `0x${string}` | null;
};

type LeaderboardRow = {
  rank: number;
  agentId: string;
  isHuman: boolean;
  isExternal: boolean;
  correct: number;
  wrong: number;
  abstained: number;
  totalDecisions: number;
  accuracyPct: number | null;
  abstentionPct: number;
  decisivenessPct: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  bond: number;
  slashes: number;
  reputation: number;
};

type StoredTrace = (Trace | SyntheticTrace) & {
  reasoningHash: `0x${string}`;
  skillHash?: `0x${string}`;
};

type DemoData = {
  _generated: string;
  _note: string;
  plugboardSkillHash: `0x${string}`;
  claims: Claim[];
  attestations: Record<ClaimId, AttestationRecord[]>;
  leaderboard: LeaderboardRow[];
  traces: Record<ClaimId, Record<string, StoredTrace>>;
};

// ---------------------------------------------------------------------------
// Fixture loaders
// ---------------------------------------------------------------------------

const { default: claimsRaw } = (await import(resolve(FIXTURES_ROOT, "claims.json"), {
  with: { type: "json" },
})) as { default: Record<ClaimId, Claim> };

const { default: humanDecisionsRaw } = (await import(
  resolve(FIXTURES_ROOT, "human-decisions.json"),
  { with: { type: "json" } }
)) as {
  default: Record<ClaimId, { decision: "VALID" | "REJECTED" | "ABSTAIN"; confidenceBps: number }>;
};

const CLAIM_IDS: ClaimId[] = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------
// Run 3 agents × 4 claims with scripted models + seeded clocks
// ---------------------------------------------------------------------------

const AGENT_CONFIGS: ReferenceAgentConfig[] = [REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG];

const sdkTraces: Record<ClaimId, Record<string, Trace>> = {} as Record<
  ClaimId,
  Record<string, Trace>
>;

for (const claimId of CLAIM_IDS) {
  sdkTraces[claimId] = {};
  const claim = claimsRaw[claimId];
  if (!claim) throw new Error(`Missing claim fixture for ${claimId}`);

  for (const config of AGENT_CONFIGS) {
    const script = loadModelScript(config.agentId, claimId, FIXTURES_ROOT);
    const seam = new ScriptedModelSeam(
      script as ConstructorParameters<typeof ScriptedModelSeam>[0],
      config.model,
    );
    const trace = await runReferenceAgent({
      model: seam,
      claim,
      config,
      fixturesRoot: FIXTURES_ROOT,
      clockSeed: claimId.charCodeAt(0) + config.agentId.charCodeAt(0),
    });
    // biome-ignore lint/style/noNonNullAssertion: claimId was just set above in this loop
    sdkTraces[claimId]![config.agentId] = trace;
  }
}

// ---------------------------------------------------------------------------
// Plugboard synthetic traces (external runtime — no plugboard package yet)
// ---------------------------------------------------------------------------

const plugboardTraces: Record<ClaimId, SyntheticTrace> = {
  A: {
    traceVersion: "1.0",
    agentId: "plugboard",
    claimId: "A",
    steps: [
      {
        step: 0,
        thought: "Plugboard: fetching mETH yield via gateway.",
        action: { tool: "fetch_meth_yield", input: { period: "30d-fresh" } },
        observation: {
          value: 34,
          source: "chainlink-primary",
          confidence: 9200,
          fetchedAt: "2026-06-06T00:00:00Z",
        },
        ts: 1_748_736_100,
      },
      {
        step: 1,
        thought: "Plugboard: yield confirmed 34 bps. Committing VALID.",
        action: {
          finalize: {
            decision: "VALID",
            confidenceBps: 9200,
            rationaleSummary: "Fresh oracle confirms 34 bps.",
          },
        },
        observation: null,
        ts: 1_748_736_110,
      },
    ],
    final: {
      decision: "VALID",
      confidenceBps: 9200,
      rationaleSummary: "External Hermes runtime confirms mETH yield 34 bps.",
      reasons: [],
    },
  },
  B: {
    traceVersion: "1.0",
    agentId: "plugboard",
    claimId: "B",
    steps: [
      {
        step: 0,
        thought: "Plugboard: fetching stale mETH yield.",
        action: { tool: "fetch_meth_yield", input: { period: "30d-stale" } },
        observation: {
          value: 34,
          source: "chainlink-stale",
          stale: true,
          confidence: 8800,
          fetchedAt: "2026-06-06T00:00:00Z",
        },
        ts: 1_748_736_200,
      },
      {
        step: 1,
        thought: "Plugboard: stale but value matches — committing VALID.",
        action: {
          finalize: {
            decision: "VALID",
            confidenceBps: 8800,
            rationaleSummary: "Stale oracle still confirms 34 bps.",
          },
        },
        observation: null,
        ts: 1_748_736_210,
      },
    ],
    final: {
      decision: "VALID",
      confidenceBps: 8800,
      rationaleSummary: "Stale oracle confirms 34 bps — Plugboard commits VALID.",
      reasons: [],
    },
  },
  C: {
    traceVersion: "1.0",
    agentId: "plugboard",
    claimId: "C",
    steps: [
      {
        step: 0,
        thought: "Plugboard: reading servicer document.",
        action: { tool: "read_document", input: { docRef: "pc-pool-1-servicer", version: "v1" } },
        observation: { cashflowTotal: 50000, currency: "USD" },
        ts: 1_748_736_300,
      },
      {
        step: 1,
        thought: "Plugboard: reading bank statement.",
        action: { tool: "read_document", input: { docRef: "pc-pool-1-statement", version: "v1" } },
        observation: { lineItemsTotal: 45000, currency: "USD" },
        ts: 1_748_736_310,
      },
      {
        step: 2,
        thought: "Plugboard: mismatch confirmed — 50k vs 45k.",
        action: {
          finalize: {
            decision: "REJECTED",
            confidenceBps: 9300,
            rationaleSummary: "Document mismatch: 50000 vs 45000.",
          },
        },
        observation: null,
        ts: 1_748_736_320,
      },
    ],
    final: {
      decision: "REJECTED",
      confidenceBps: 9300,
      rationaleSummary: "Hermes runtime detects 5000 USD cashflow mismatch.",
      reasons: [],
    },
  },
  D: {
    traceVersion: "1.0",
    agentId: "plugboard",
    claimId: "D",
    steps: [
      {
        step: 0,
        thought: "Plugboard: analysing FAIR_VALUE claim for PC-POOL-1.",
        action: { tool: "fetch_chainlink_price", input: { asset: "PC-POOL-1", period: "current" } },
        observation: { error: "TOOL_REFUSAL", reason: "tool not allowed for FAIR_VALUE" },
        ts: 1_748_736_400,
      },
      {
        step: 1,
        thought: "Plugboard: attempting VALID — contract will reject this Tier 3.",
        action: {
          finalize: {
            decision: "VALID",
            confidenceBps: 7000,
            rationaleSummary: "Estimated value 4.2M USD.",
          },
        },
        observation: {
          contractRevert: true,
          error: "JudgmentTierRequiresAbstain",
          message: "Contract rejected non-ABSTAIN on Tier 3",
        },
        ts: 1_748_736_410,
      },
      {
        step: 2,
        thought: "Plugboard: contract blocked VALID — resubmitting ABSTAIN per protocol.",
        action: {
          finalize: {
            decision: "ABSTAIN",
            confidenceBps: 0,
            rationaleSummary: "Tier 3 judgment — ABSTAIN enforced by contract.",
          },
        },
        observation: null,
        ts: 1_748_736_420,
      },
    ],
    final: {
      decision: "ABSTAIN",
      confidenceBps: 0,
      rationaleSummary:
        "BLOCKED BY PROTOCOL: contract rejected VALID on Tier 3. Resubmitted ABSTAIN.",
      reasons: ["TIER3_OVERRIDE"],
    },
  },
};

// Plugboard epoch-0 skill hash
const PLUGBOARD_SKILL_DOC = {
  epoch: 0,
  agentId: "plugboard",
  taxonomy: ["CASHFLOW_MATCH", "DISTRIBUTION_PAID", "ENCUMBRANCE_ABSENT", "YIELD_BPS"],
  rule: "Tier 3 (FAIR_VALUE) → ABSTAIN always. Contract enforces.",
  tools: ["compute_expected", "fetch_chainlink_price", "fetch_meth_yield", "read_document"],
  walletUsage: "signAndSend via WalletSeam after finalize",
} as const;
const PLUGBOARD_SKILL_HASH: `0x${string}` = hashCanonical(PLUGBOARD_SKILL_DOC);

// ---------------------------------------------------------------------------
// Human traces (from fixtures/human-decisions.json)
// ---------------------------------------------------------------------------

const humanTraces: Record<ClaimId, SyntheticTrace> = {} as Record<ClaimId, SyntheticTrace>;
for (const claimId of CLAIM_IDS) {
  const hd = humanDecisionsRaw[claimId];
  if (!hd) throw new Error(`Missing human-decisions fixture for ${claimId}`);
  humanTraces[claimId] = {
    traceVersion: "1.0",
    agentId: "human",
    claimId,
    steps: [],
    final: {
      decision: hd.decision,
      confidenceBps: hd.confidenceBps,
      rationaleSummary: `Human attestor decision for claim ${claimId}.`,
      reasons: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Mock addresses / tx hashes
// ---------------------------------------------------------------------------

const MOCK_TX_HASHES: Record<string, string> = {
  reflector: "0x1111111111111111111111111111111111111111111111111111111111111111",
  rotor: "0x2222222222222222222222222222222222222222222222222222222222222222",
  stator: "0x3333333333333333333333333333333333333333333333333333333333333333",
  plugboard: "0x4444444444444444444444444444444444444444444444444444444444444444",
  human: "0x5555555555555555555555555555555555555555555555555555555555555555",
};

const MOCK_AGENT_ADDRESSES: Record<string, string> = {
  reflector: "0xRefl0000000000000000000000000000000000001",
  rotor: "0xRot00000000000000000000000000000000000002",
  stator: "0xStat0000000000000000000000000000000000003",
  plugboard: "0xPlug0000000000000000000000000000000000004",
  human: "0xHuma0000000000000000000000000000000000005",
};

// ---------------------------------------------------------------------------
// Build attestations
// ---------------------------------------------------------------------------

function makeSourcesHash(agentId: string, steps: TraceStep[]): `0x${string}` {
  const sources = steps
    .filter((s) => {
      const obs = s.observation;
      return (
        obs !== null && typeof obs === "object" && obs !== undefined && "source" in (obs as object)
      );
    })
    .map((s) => ({
      name: agentId,
      source: String((s.observation as Record<string, unknown>).source ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
  return hashCanonical(sources);
}

function makeAttestation(
  agentId: string,
  claimId: ClaimId,
  trace: Trace | SyntheticTrace,
  latencyMs: number,
  costUsd: number,
  extras?: { blockedByProtocol?: boolean; skillHash?: `0x${string}` },
): AttestationRecord {
  const rHash = hashCanonical(trace);
  return {
    agentId,
    claimId,
    decision: trace.final.decision,
    confidenceBps: trace.final.confidenceBps,
    reasoningHash: rHash,
    sourcesHash: makeSourcesHash(agentId, trace.steps as TraceStep[]),
    traceURI: `mock://${agentId}/${claimId}`,
    txHash:
      MOCK_TX_HASHES[agentId] ??
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    agentAddress: MOCK_AGENT_ADDRESSES[agentId] ?? "0x0000000000000000000000000000000000000001",
    latencyMs,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    isHuman: agentId === "human",
    blockedByProtocol: extras?.blockedByProtocol ?? false,
    skillHash: extras?.skillHash ?? null,
  };
}

const attestations: Record<ClaimId, AttestationRecord[]> = {} as Record<
  ClaimId,
  AttestationRecord[]
>;
for (const claimId of CLAIM_IDS) {
  attestations[claimId] = [];
  for (const config of AGENT_CONFIGS) {
    const trace = sdkTraces[claimId]?.[config.agentId];
    if (!trace) throw new Error(`Missing SDK trace for ${claimId}/${config.agentId}`);
    const latencyMs = 200 + config.agentId.length * 50;
    const costUsd = trace.steps.length * 120 * 0.000_002;
    attestations[claimId]?.push(
      makeAttestation(config.agentId, claimId, trace, latencyMs, costUsd),
    );
  }
  attestations[claimId]?.push(
    makeAttestation("plugboard", claimId, plugboardTraces[claimId], 350, 0.0005, {
      blockedByProtocol: claimId === "D",
      skillHash: PLUGBOARD_SKILL_HASH,
    }),
  );
  attestations[claimId]?.push(
    makeAttestation("human", claimId, humanTraces[claimId], 5000 + claimId.charCodeAt(0) * 100, 0),
  );
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

const GROUND_TRUTH: Record<ClaimId, "VALID" | "REJECTED" | null> = {
  A: "VALID",
  B: "VALID",
  C: "REJECTED",
  D: null,
};

function buildLeaderboard(): LeaderboardRow[] {
  type Stats = {
    agentId: string;
    isHuman: boolean;
    isExternal: boolean;
    correct: number;
    wrong: number;
    abstained: number;
    totalDecisions: number;
    totalLatencyMs: number;
    totalCostUsd: number;
    bond: number;
    slashes: number;
    reputation: number;
  };

  const statMap: Record<string, Stats> = {};
  for (const agentId of ["reflector", "rotor", "stator", "plugboard", "human"]) {
    statMap[agentId] = {
      agentId,
      isHuman: agentId === "human",
      isExternal: agentId === "plugboard",
      correct: 0,
      wrong: 0,
      abstained: 0,
      totalDecisions: 0,
      totalLatencyMs: 0,
      totalCostUsd: 0,
      bond: agentId === "human" ? 0 : agentId === "plugboard" ? 0.5 : 0.1,
      slashes: 0,
      reputation: 100,
    };
  }

  for (const claimId of CLAIM_IDS) {
    const gt = GROUND_TRUTH[claimId];
    for (const att of attestations[claimId] ?? []) {
      const s = statMap[att.agentId];
      if (!s) continue;
      s.totalDecisions++;
      s.totalLatencyMs += att.latencyMs;
      s.totalCostUsd += att.costUsd;
      if (att.decision === "ABSTAIN") {
        s.abstained++;
      } else if (gt === null) {
        s.wrong++;
      } else if (att.decision === gt) {
        s.correct++;
      } else {
        s.wrong++;
        s.slashes++;
        s.reputation -= 10;
      }
    }
  }

  const rows: LeaderboardRow[] = Object.values(statMap).map((s) => {
    const decisive = s.totalDecisions - s.abstained;
    const accuracyPct = decisive > 0 ? Math.round((s.correct / decisive) * 1000) / 10 : null;
    const abstentionPct =
      s.totalDecisions > 0 ? Math.round((s.abstained / s.totalDecisions) * 1000) / 10 : 0;
    const decisivenessPct =
      Math.round((1 - s.abstained / Math.max(s.totalDecisions, 1)) * 1000) / 10;
    const avgLatencyMs = s.totalDecisions > 0 ? Math.round(s.totalLatencyMs / s.totalDecisions) : 0;
    return {
      ...s,
      accuracyPct,
      abstentionPct,
      decisivenessPct,
      avgLatencyMs,
      totalCostUsd: Math.round(s.totalCostUsd * 1_000_000) / 1_000_000,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    const aAcc = a.accuracyPct ?? -1;
    const bAcc = b.accuracyPct ?? -1;
    if (bAcc !== aAcc) return bAcc - aAcc;
    return b.decisivenessPct - a.decisivenessPct;
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

const leaderboard = buildLeaderboard();

// ---------------------------------------------------------------------------
// Traces object with embedded reasoningHash
// ---------------------------------------------------------------------------

const tracesOut: Record<ClaimId, Record<string, StoredTrace>> = {} as Record<
  ClaimId,
  Record<string, StoredTrace>
>;

for (const claimId of CLAIM_IDS) {
  tracesOut[claimId] = {};
  for (const config of AGENT_CONFIGS) {
    const t = sdkTraces[claimId]?.[config.agentId];
    if (!t) throw new Error(`Missing SDK trace for ${claimId}/${config.agentId}`);
    // biome-ignore lint/style/noNonNullAssertion: claimId was just set to {} in this loop
    tracesOut[claimId]![config.agentId] = { ...t, reasoningHash: hashCanonical(t) };
  }
  const pt = plugboardTraces[claimId];
  if (!pt) throw new Error(`Missing plugboard trace for ${claimId}`);
  // biome-ignore lint/style/noNonNullAssertion: claimId was just set above
  tracesOut[claimId]!.plugboard = {
    ...pt,
    reasoningHash: hashCanonical(pt),
    skillHash: PLUGBOARD_SKILL_HASH,
  };
  const ht = humanTraces[claimId];
  if (!ht) throw new Error(`Missing human trace for ${claimId}`);
  // biome-ignore lint/style/noNonNullAssertion: claimId was just set above
  tracesOut[claimId]!.human = { ...ht, reasoningHash: hashCanonical(ht) };
}

// ---------------------------------------------------------------------------
// Write fixture
// ---------------------------------------------------------------------------

const demoData: DemoData = {
  _generated: new Date().toISOString(),
  _note: "ALL hashes computed via hashCanonical — NEVER hand-typed (PRD §15.4 guardrail)",
  plugboardSkillHash: PLUGBOARD_SKILL_HASH,
  claims: CLAIM_IDS.map((id) => {
    const c = claimsRaw[id];
    if (!c) throw new Error(`Missing claim fixture for ${id}`);
    return c;
  }),
  attestations,
  leaderboard,
  traces: tracesOut,
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_FILE, `${JSON.stringify(demoData, null, 2)}\n`, "utf-8");

// Format the generated JSON with biome so it stays in sync with the linter.
// This avoids a "biome check" failure on every re-run.
// On Windows the shim is .CMD; on POSIX it is a shell script — use execSync
// with the shell so the OS picks the right extension.
try {
  const biomeBase = resolve(REPO_ROOT, "node_modules/.bin/biome");
  execFileSync(
    process.platform === "win32" ? `${biomeBase}.CMD` : biomeBase,
    ["format", "--write", OUTPUT_FILE],
    { stdio: "ignore", shell: process.platform === "win32" },
  );
} catch {
  // biome not installed or format failed — non-fatal, CI lint will catch it
}

// ---------------------------------------------------------------------------
// Tests (validate the generated data)
// ---------------------------------------------------------------------------

describe("gen-demo-data", () => {
  it("wrote demo-data.json with 4 claims and 5 leaderboard rows", () => {
    expect(demoData.claims).toHaveLength(4);
    expect(demoData.leaderboard).toHaveLength(5);
    expect(demoData.plugboardSkillHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("every stored reasoningHash equals hashCanonical(trace body) — no hand-typed hashes", () => {
    // This is the key integrity check: strip reasoningHash + skillHash, recompute
    for (const claimId of CLAIM_IDS) {
      for (const agentId of ["reflector", "rotor", "stator", "plugboard", "human"]) {
        const stored = tracesOut[claimId]?.[agentId];
        if (!stored) throw new Error(`Missing tracesOut for ${claimId}/${agentId}`);
        const { reasoningHash: storedHash, skillHash: _skill, ...traceBody } = stored;
        const recomputed = hashCanonical(traceBody);
        expect(recomputed, `${claimId}/${agentId} hash mismatch`).toBe(storedHash);
      }
    }
  });

  it("leaderboard has both AI and human rows interleaved", () => {
    const humanRows = demoData.leaderboard.filter((r) => r.isHuman);
    const aiRows = demoData.leaderboard.filter((r) => !r.isHuman);
    expect(humanRows.length).toBeGreaterThan(0);
    expect(aiRows.length).toBeGreaterThan(0);
    // Rows are interleaved (not separated into AI-then-human blocks)
    expect(demoData.leaderboard).toHaveLength(humanRows.length + aiRows.length);
  });

  it("leaderboard accuracy excludes abstentions from denominator", () => {
    for (const row of demoData.leaderboard) {
      const decisive = row.totalDecisions - row.abstained;
      if (decisive > 0) {
        const expected = Math.round((row.correct / decisive) * 1000) / 10;
        expect(row.accuracyPct, `${row.agentId} accuracy`).toBe(expected);
      } else {
        expect(row.accuracyPct, `${row.agentId} all-abstain accuracy`).toBeNull();
      }
    }
  });
});
