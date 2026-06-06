/**
 * gen-demo-data.mjs — Seed script for /apps/web/fixtures/demo-data.json
 *
 * Runs the THREE reference agents (Reflector/Rotor/Stator) against claims A–D
 * using ScriptedModelSeam + StubClockSeam (fully deterministic, no model API).
 * Computes all hashes via hashCanonical (NEVER hand-typed).
 * Adds representative Plugboard + Human attestations.
 * Writes apps/web/fixtures/demo-data.json.
 *
 * Run from repo root:
 *   node --experimental-vm-modules apps/web/scripts/gen-demo-data.mjs
 * Or via pnpm:
 *   pnpm --filter @bombe/web run gen-demo-data
 *
 * GUARDRAIL: All hashes in the output come from hashCanonical(trace) — never
 * typed by hand. (PRD §15.4)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const FIXTURES_ROOT = resolve(REPO_ROOT, "fixtures");
const OUTPUT_FILE = resolve(__dirname, "../fixtures/demo-data.json");

// ---------------------------------------------------------------------------
// Dynamic imports (ESM workspace packages)
// ---------------------------------------------------------------------------

const { hashCanonical, canonicalJson } = await import("@bombe/shared");
const { REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG, runReferenceAgent, ScriptedModelSeam } =
  await import("@bombe/agent-reference");

// ---------------------------------------------------------------------------
// Load raw fixtures
// ---------------------------------------------------------------------------

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const claimsMap = readJson(resolve(FIXTURES_ROOT, "claims.json"));
const humanDecisions = readJson(resolve(FIXTURES_ROOT, "human-decisions.json"));

// ---------------------------------------------------------------------------
// Agent configs in order
// ---------------------------------------------------------------------------

const AGENT_CONFIGS = [REFLECTOR_CONFIG, ROTOR_CONFIG, STATOR_CONFIG];

// ---------------------------------------------------------------------------
// Run all 3 agents × 4 claims
// ---------------------------------------------------------------------------

console.log("Generating demo data — running reference agents on claims A–D...");

/** @type {Map<string, Map<string, import("@bombe/agent-sdk").Trace>>} */
const traceMap = new Map(); // claimId → agentId → Trace

for (const claimId of ["A", "B", "C", "D"]) {
  const claim = claimsMap[claimId];
  traceMap.set(claimId, new Map());

  for (const config of AGENT_CONFIGS) {
    const scriptPath = resolve(FIXTURES_ROOT, "model-scripts", config.agentId, `${claimId}.json`);
    const script = readJson(scriptPath);
    const seam = new ScriptedModelSeam(script, config.model);

    const trace = await runReferenceAgent({
      model: seam,
      claim,
      config,
      fixturesRoot: FIXTURES_ROOT,
      clockSeed: claimId.charCodeAt(0) + config.agentId.charCodeAt(0),
    });

    traceMap.get(claimId).set(config.agentId, trace);

    const rHash = hashCanonical(trace);
    console.log(
      `  [${claimId}] ${config.agentId}: ${trace.final.decision} (${trace.final.confidenceBps} bps) hash=${rHash.slice(0, 18)}...`,
    );
  }
}

// ---------------------------------------------------------------------------
// Build Plugboard records (claim-D → BLOCKED BY PROTOCOL then ABSTAIN)
// ---------------------------------------------------------------------------

// Plugboard uses a scripted trace too — but for the web demo we synthesise
// its record directly (no plugboard package yet — T-501/T-505 pending).
// The trace IS synthetic for Plugboard (it's the external runtime), but all
// hashes are still computed via hashCanonical, never hand-typed.

/** Build a minimal Plugboard trace for a given claim */
function buildPlugboardTrace(claimId, decision, confidenceBps, steps, rationaleSummary) {
  return {
    traceVersion: "1.0",
    agentId: "plugboard",
    claimId,
    steps,
    final: {
      decision,
      confidenceBps,
      rationaleSummary,
      reasons: decision === "ABSTAIN" ? ["TIER3_OVERRIDE"] : [],
    },
  };
}

const plugboardTraces = {
  A: buildPlugboardTrace(
    "A",
    "VALID",
    9200,
    [
      {
        step: 0,
        thought: "Plugboard: fetching mETH yield via gateway tool.",
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
    "External Hermes runtime confirms mETH yield 34 bps via gateway.",
  ),
  B: buildPlugboardTrace(
    "B",
    "VALID",
    8800,
    [
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
    "Stale oracle confirms 34 bps — Plugboard commits VALID.",
  ),
  C: buildPlugboardTrace(
    "C",
    "REJECTED",
    9300,
    [
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
    "Hermes runtime detects 5000 USD cashflow mismatch — REJECTED.",
  ),
  // Claim D: Plugboard first attempts VALID on FAIR_VALUE (Tier 3),
  // hits JudgmentTierRequiresAbstain contract revert → BLOCKED BY PROTOCOL.
  // Then resubmits ABSTAIN (the correct path).
  D: buildPlugboardTrace(
    "D",
    "ABSTAIN",
    0,
    [
      {
        step: 0,
        thought: "Plugboard: analysing FAIR_VALUE claim for PC-POOL-1.",
        action: { tool: "fetch_chainlink_price", input: { asset: "PC-POOL-1", period: "current" } },
        observation: {
          error: "TOOL_REFUSAL",
          reason: "tool fetch_chainlink_price not allowed for claim type FAIR_VALUE",
        },
        ts: 1_748_736_400,
      },
      {
        step: 1,
        thought:
          "Plugboard: no tools available for Tier 3. Attempting finalize VALID — contract will reject this.",
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
          message: "Contract rejected non-ABSTAIN attestation on Tier 3 claim",
        },
        ts: 1_748_736_410,
      },
      {
        step: 2,
        thought: "Plugboard: contract blocked VALID — resubmitting as ABSTAIN per protocol.",
        action: {
          finalize: {
            decision: "ABSTAIN",
            confidenceBps: 0,
            rationaleSummary: "Tier 3 judgment claim — ABSTAIN enforced by contract.",
          },
        },
        observation: null,
        ts: 1_748_736_420,
      },
    ],
    "BLOCKED BY PROTOCOL: contract rejected VALID on Tier 3. Resubmitted ABSTAIN.",
  ),
};

// Plugboard epoch-0 skill hash (computed from a representative skill document)
const PLUGBOARD_SKILL_DOC = {
  epoch: 0,
  agentId: "plugboard",
  taxonomy: ["YIELD_BPS", "DISTRIBUTION_PAID", "CASHFLOW_MATCH", "ENCUMBRANCE_ABSENT"],
  rule: "Tier 3 (FAIR_VALUE) → ABSTAIN always. Contract enforces.",
  tools: ["fetch_chainlink_price", "fetch_meth_yield", "read_document", "compute_expected"],
  walletUsage: "signAndSend via WalletSeam after finalize",
};
const PLUGBOARD_SKILL_HASH = hashCanonical(PLUGBOARD_SKILL_DOC);
console.log(`  Plugboard skill_hash: ${PLUGBOARD_SKILL_HASH.slice(0, 18)}...`);

// Compute Plugboard reasoningHashes
const plugboardHashes = {};
for (const [claimId, trace] of Object.entries(plugboardTraces)) {
  plugboardHashes[claimId] = hashCanonical(trace);
}

// ---------------------------------------------------------------------------
// Human attestations (from fixtures/human-decisions.json)
// ---------------------------------------------------------------------------

const humanTraces = {};
for (const [claimId, decision] of Object.entries(humanDecisions)) {
  humanTraces[claimId] = {
    traceVersion: "1.0",
    agentId: "human",
    claimId,
    steps: [],
    final: {
      decision: decision.decision,
      confidenceBps: decision.confidenceBps,
      rationaleSummary: `Human attestor decision for claim ${claimId}.`,
      reasons: [],
    },
  };
}

// Human reasoningHashes
const humanHashes = {};
for (const [claimId, trace] of Object.entries(humanTraces)) {
  humanHashes[claimId] = hashCanonical(trace);
}

// ---------------------------------------------------------------------------
// Build attestation records per claim per agent
// ---------------------------------------------------------------------------

const MOCK_TX_HASHES = {
  reflector: "0x1111111111111111111111111111111111111111111111111111111111111111",
  rotor: "0x2222222222222222222222222222222222222222222222222222222222222222",
  stator: "0x3333333333333333333333333333333333333333333333333333333333333333",
  plugboard: "0x4444444444444444444444444444444444444444444444444444444444444444",
  human: "0x5555555555555555555555555555555555555555555555555555555555555555",
};

const MOCK_AGENT_ADDRESSES = {
  reflector: "0xRefl0000000000000000000000000000000000001",
  rotor: "0xRot00000000000000000000000000000000000002",
  stator: "0xStat0000000000000000000000000000000000003",
  plugboard: "0xPlug0000000000000000000000000000000000004",
  human: "0xHuma0000000000000000000000000000000000005",
};

function makeAttestation(
  agentId,
  claimId,
  trace,
  reasoningHash,
  decision,
  confidenceBps,
  latencyMs,
  costUsd,
  extras,
) {
  return {
    agentId,
    claimId,
    decision,
    confidenceBps,
    reasoningHash,
    sourcesHash: hashCanonical(
      (trace.steps ?? [])
        .filter(
          (s) => s.observation && typeof s.observation === "object" && "source" in s.observation,
        )
        .map((s) => ({ name: agentId, source: s.observation.source ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source)),
    ),
    traceURI: `mock://${agentId}/${claimId}`,
    txHash: MOCK_TX_HASHES[agentId],
    agentAddress: MOCK_AGENT_ADDRESSES[agentId],
    latencyMs,
    costUsd,
    isHuman: agentId === "human",
    blockedByProtocol: extras?.blockedByProtocol ?? false,
    skillHash: extras?.skillHash ?? null,
  };
}

const attestations = {};
for (const claimId of ["A", "B", "C", "D"]) {
  attestations[claimId] = [];

  // Three SDK agents
  for (const config of AGENT_CONFIGS) {
    const trace = traceMap.get(claimId).get(config.agentId);
    const rHash = hashCanonical(trace);
    const latencyMs = 200 + config.agentId.length * 50;
    const costUsd = trace.steps.length * 120 * 0.000_002;
    attestations[claimId].push(
      makeAttestation(
        config.agentId,
        claimId,
        trace,
        rHash,
        trace.final.decision,
        trace.final.confidenceBps,
        latencyMs,
        costUsd,
        null,
      ),
    );
  }

  // Plugboard
  const pbTrace = plugboardTraces[claimId];
  const pbHash = plugboardHashes[claimId];
  const isBlockedD = claimId === "D";
  attestations[claimId].push(
    makeAttestation(
      "plugboard",
      claimId,
      pbTrace,
      pbHash,
      pbTrace.final.decision,
      pbTrace.final.confidenceBps,
      350,
      0.000_5,
      {
        blockedByProtocol: isBlockedD,
        skillHash: PLUGBOARD_SKILL_HASH,
      },
    ),
  );

  // Human
  const hTrace = humanTraces[claimId];
  const hHash = humanHashes[claimId];
  attestations[claimId].push(
    makeAttestation(
      "human",
      claimId,
      hTrace,
      hHash,
      hTrace.final.decision,
      hTrace.final.confidenceBps,
      5000 + claimId.charCodeAt(0) * 100,
      0,
      null,
    ),
  );
}

// ---------------------------------------------------------------------------
// Leaderboard aggregation
// ---------------------------------------------------------------------------
// Ground truth for settlement: A=VALID, B=VALID (Rotor correct; Reflector ABSTAIN is ok),
// C=REJECTED. D has no ground truth (Tier 3 — all ABSTAIN expected).
// Correct answer per claim:
//   A: VALID
//   B: VALID (ground truth: Rotor says VALID; Reflector should ABSTAIN but
//              actually abstained correctly; all agents judged by their own decision)
//   C: REJECTED

const GROUND_TRUTH = { A: "VALID", B: "VALID", C: "REJECTED", D: null };

function buildLeaderboardRows() {
  // Collect per-agent stats
  const stats = {};

  const allAgentIds = ["reflector", "rotor", "stator", "plugboard", "human"];

  for (const agentId of allAgentIds) {
    stats[agentId] = {
      agentId,
      isHuman: agentId === "human",
      isExternal: agentId === "plugboard",
      totalDecisions: 0,
      correct: 0,
      wrong: 0,
      abstained: 0,
      totalLatencyMs: 0,
      totalCostUsd: 0,
      bond: agentId === "human" ? 0 : agentId === "plugboard" ? 0.5 : 0.1,
      slashes: 0,
      reputation: 100,
    };
  }

  for (const claimId of ["A", "B", "C", "D"]) {
    const gt = GROUND_TRUTH[claimId];
    const claimAttestations = attestations[claimId];

    for (const att of claimAttestations) {
      const s = stats[att.agentId];
      if (!s) continue;

      s.totalDecisions += 1;
      s.totalLatencyMs += att.latencyMs;
      s.totalCostUsd += att.costUsd;

      if (att.decision === "ABSTAIN") {
        s.abstained += 1;
      } else if (gt === null) {
        // Tier 3 — should all be ABSTAIN; if they weren't, count as wrong
        if (att.decision !== "ABSTAIN") s.wrong += 1;
      } else if (att.decision === gt) {
        s.correct += 1;
      } else {
        s.wrong += 1;
        s.slashes += 1;
        s.reputation -= 10;
      }
    }
  }

  // Compute derived metrics and rank
  const rows = Object.values(stats).map((s) => {
    const decisive = s.totalDecisions - s.abstained;
    const accuracyPct = decisive > 0 ? Math.round((s.correct / decisive) * 1000) / 10 : null;
    const abstentionPct =
      s.totalDecisions > 0 ? Math.round((s.abstained / s.totalDecisions) * 1000) / 10 : 0;
    const decisivenessPct =
      Math.round((1 - s.abstained / Math.max(s.totalDecisions, 1)) * 1000) / 10;
    const avgLatencyMs = s.totalDecisions > 0 ? Math.round(s.totalLatencyMs / s.totalDecisions) : 0;

    return {
      agentId: s.agentId,
      isHuman: s.isHuman,
      isExternal: s.isExternal,
      correct: s.correct,
      wrong: s.wrong,
      abstained: s.abstained,
      totalDecisions: s.totalDecisions,
      accuracyPct, // null when all abstentions
      abstentionPct,
      decisivenessPct,
      avgLatencyMs,
      totalCostUsd: Math.round(s.totalCostUsd * 1_000_000) / 1_000_000,
      bond: s.bond,
      slashes: s.slashes,
      reputation: s.reputation,
    };
  });

  // Rank: accuracy desc (null last), then decisiveness desc
  rows.sort((a, b) => {
    const aAcc = a.accuracyPct ?? -1;
    const bAcc = b.accuracyPct ?? -1;
    if (bAcc !== aAcc) return bAcc - aAcc;
    return b.decisivenessPct - a.decisivenessPct;
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

const leaderboard = buildLeaderboardRows();

// ---------------------------------------------------------------------------
// Assemble traces object for the JSON
// ---------------------------------------------------------------------------

const traces = {};
for (const claimId of ["A", "B", "C", "D"]) {
  traces[claimId] = {};

  for (const config of AGENT_CONFIGS) {
    const trace = traceMap.get(claimId).get(config.agentId);
    traces[claimId][config.agentId] = {
      ...trace,
      reasoningHash: hashCanonical(trace),
    };
  }

  traces[claimId].plugboard = {
    ...plugboardTraces[claimId],
    reasoningHash: plugboardHashes[claimId],
    skillHash: PLUGBOARD_SKILL_HASH,
  };

  traces[claimId].human = {
    ...humanTraces[claimId],
    reasoningHash: humanHashes[claimId],
  };
}

// ---------------------------------------------------------------------------
// Assemble claims array
// ---------------------------------------------------------------------------

const claims = ["A", "B", "C", "D"].map((id) => claimsMap[id]);

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

mkdirSync(resolve(__dirname, "../fixtures"), { recursive: true });

const output = {
  _generated: new Date().toISOString(),
  _note: "ALL hashes computed via hashCanonical — never hand-typed (PRD §15.4 guardrail)",
  plugboardSkillHash: PLUGBOARD_SKILL_HASH,
  claims,
  attestations,
  leaderboard,
  traces,
};

writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
console.log(`\nWrote ${OUTPUT_FILE}`);
console.log("\nLeaderboard:");
for (const row of leaderboard) {
  const acc = row.accuracyPct !== null ? `${row.accuracyPct}%` : "N/A";
  console.log(
    `  #${row.rank} ${row.agentId.padEnd(12)} acc=${acc.padStart(6)} abstain=${row.abstentionPct}% decisive=${row.decisivenessPct}%`,
  );
}
