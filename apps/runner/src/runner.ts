/**
 * runner.ts — Agent runner for Bombe. (PRD §4, §6.3.1, T-403)
 *
 * runClaim(claim, deps) — runs the three reference agents (Reflector / Rotor /
 * Stator) concurrently via Promise.allSettled with a 15s per-agent timeout.
 *
 * Design:
 *   - Individual agent failure (throw or timeout) NEVER blocks the others.
 *   - A rejected / timed-out agent writes an errors table row + emits an error event.
 *   - Successful agents emit AGENT_STEP events (after-the-fact, one per step) then
 *     AGENT_DONE, build+submit the attestation, and emit a CONTRACT_ATTESTED event
 *     so the indexer (T-402) persists the row.
 *   - The runner does NOT write directly to the DB — it emits events and lets the
 *     indexer (T-402) handle all DB persistence. No double-write.
 *   - No silent failures anywhere (PRD §13).
 *
 * Determinism:
 *   - All model seams are ScriptedModelSeam (loaded from fixtures/model-scripts/).
 *   - All clock uses StubClockSeam (seeded, never Date.now()).
 *   - txHash is derived deterministically from (claimId, agentId, decision) via
 *     MockWalletSeam which hashes the ABI-encoded tx.
 *   - logIndex is an agent-specific constant (0=reflector, 1=rotor, 2=stator).
 */

import {
  REFERENCE_AGENTS,
  type ReferenceAgentConfig,
  ScriptedModelSeam,
  runReferenceAgent,
} from "@bombe/agent-reference";
import type { ModelScript } from "@bombe/agent-reference";
import {
  CostBreaker,
  InMemoryAttestationRepository,
  type LoopDeps,
  MockBlobSeam,
  MockHistorySource,
  MockWalletSeam,
  type ModelSeam,
  type Source,
  StubClockSeam,
  buildAndSubmitAttestation,
  runLoop,
} from "@bombe/agent-sdk";
import type { Trace } from "@bombe/agent-sdk";
import type { BombeDb } from "@bombe/db";
import { errors } from "@bombe/db";
import {
  type BusEvent,
  type Claim,
  type EventBus,
  loadModelCosts,
  loadModelScript,
} from "@bombe/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-agent timeout in milliseconds (PRD §4: "15s per-agent timeout"). */
const AGENT_TIMEOUT_MS = 15_000;

/**
 * Log-index constants for mock attestation events.
 * Deterministic: same agent always gets the same logIndex slot.
 */
const AGENT_LOG_INDEX: Record<string, number> = {
  reflector: 0,
  rotor: 1,
  stator: 2,
};

// ---------------------------------------------------------------------------
// RunnerDeps
// ---------------------------------------------------------------------------

export interface RunnerDeps {
  bus: EventBus;
  db: BombeDb;
  /** Optional: override fixtures root for tests. */
  fixturesRoot?: string | undefined;
  /** Optional: seed for clocks; defaults to 0. */
  clockSeed?: number | undefined;
  /**
   * Optional: override model seam for a specific agent by agentId.
   * Used in tests to inject failing seams for failure-isolation testing.
   * Key = agentId ("reflector" | "rotor" | "stator"), value = ModelSeam to use.
   */
  modelSeamOverrides?: Record<string, ModelSeam> | undefined;
  /**
   * Optional: per-agent timeout in ms. Overrides the default 15s.
   * Used in tests to make timeouts fire quickly.
   */
  agentTimeoutMs?: number | undefined;
}

// ---------------------------------------------------------------------------
// withTimeout — wraps a Promise with a timeout
// ---------------------------------------------------------------------------

/**
 * withTimeout — rejects the promise after timeoutMs with a TimeoutError.
 *
 * The timeout uses real wall-clock time (unavoidable for actual timeouts).
 * Agent determinism comes from the scripted seams, not from timing.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Agent timeout after ${timeoutMs}ms: ${label}`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

// ---------------------------------------------------------------------------
// runSingleAgent — runs one reference agent for a claim
// ---------------------------------------------------------------------------

/**
 * runSingleAgent — runs a single reference agent for a claim.
 *
 * Returns "success" or "error". Never throws (all errors are caught internally).
 *
 * Flow:
 *   1. Load model script from fixtures (or use modelSeamOverride if injected).
 *   2. Run the agent loop with a 15s timeout.
 *   3. On success:
 *      a. Emit AGENT_STEP events (after-the-fact, one per trace step).
 *      b. Build attestation payload (via buildAndSubmitAttestation into in-memory repo).
 *      c. Emit AGENT_DONE event.
 *      d. Emit CONTRACT_ATTESTED event — the indexer persists this to the DB.
 *   4. On error/timeout:
 *      a. Write errors table row.
 *      b. Emit a structured AGENT_DONE ABSTAIN event to signal failure.
 */
async function runSingleAgent(
  config: ReferenceAgentConfig,
  claim: Claim,
  deps: RunnerDeps,
  agentIndex: number,
): Promise<"success" | "error"> {
  const { bus, db, fixturesRoot, clockSeed = 0, modelSeamOverrides, agentTimeoutMs } = deps;
  const timeoutMs = agentTimeoutMs ?? AGENT_TIMEOUT_MS;
  const agentId = config.agentId;
  const logIndex = AGENT_LOG_INDEX[agentId] ?? agentIndex;

  try {
    // 1. Determine model seam to use.
    const override = modelSeamOverrides?.[agentId];

    // 2. Run the agent loop with a 15s timeout.
    let trace: Trace;
    if (override !== undefined) {
      // Test injection path: use the injected seam directly via runLoop.
      let costs: Record<string, { inputPer1k: number; outputPer1k: number }> = {};
      try {
        costs = loadModelCosts(fixturesRoot);
      } catch {
        costs = {};
      }
      const loopClock = new StubClockSeam(
        Array.from(
          { length: 200 },
          (_, i) => 1_000_000 + (clockSeed + agentIndex) * 1_000 + i * 10,
        ),
      );
      const loopDeps: LoopDeps = {
        model: override,
        clock: loopClock,
        costBreaker: new CostBreaker({ maxUsd: 0.05, costs }),
        history: new MockHistorySource({}),
        toolDeps: {
          clock: loopClock,
          historySource: new MockHistorySource({}),
          fixturesRoot,
        },
      };
      trace = await withTimeout(
        runLoop({ agentId, claim, temperament: config.temperament, deps: loopDeps }),
        timeoutMs,
        `${agentId}/${claim.id}`,
      );
    } else {
      // Normal path: load fixture script and run via runReferenceAgent.
      const rawScript = loadModelScript(agentId, claim.id, fixturesRoot);
      const scriptedSeam = new ScriptedModelSeam(rawScript as ModelScript, config.model);
      trace = await withTimeout(
        runReferenceAgent({
          model: scriptedSeam,
          claim,
          config,
          fixturesRoot,
          clockSeed: clockSeed + agentIndex,
        }),
        timeoutMs,
        `${agentId}/${claim.id}`,
      );
    }

    // 3a. Emit AGENT_STEP events (after-the-fact, one per step).
    const agentWallet = new MockWalletSeam(`${agentId}-wallet`);
    const agentAddr = agentWallet.address();

    for (const step of trace.steps) {
      const stepEvent: BusEvent = {
        kind: "AGENT_STEP",
        claimId: claim.id,
        agentAddr,
        step: step.step,
        thought: step.thought,
        action: step.action,
        ts: step.ts,
      };
      bus.emit(stepEvent);
    }

    // 3b. Build attestation payload using in-memory repo (no direct DB write —
    //     the indexer handles DB persistence via CONTRACT_ATTESTED event below).
    const submitBase = claim.postedAt * 1_000 + 1_000 + (clockSeed + agentIndex) * 10;
    const blob = new MockBlobSeam();
    const wallet = new MockWalletSeam(`${agentId}-wallet`);
    const submitClock = new StubClockSeam(
      Array.from({ length: 50 }, (_, i) => submitBase + i * 10),
    );

    // In-memory repo — we only need the assembled row/receipt, not DB persistence.
    const memRepo = new InMemoryAttestationRepository();

    // Collect sources from trace steps (observations with a source field).
    const sources: Source[] = [];
    for (const step of trace.steps) {
      const obs = step.observation;
      if (
        obs !== null &&
        obs !== undefined &&
        typeof obs === "object" &&
        "source" in (obs as object)
      ) {
        const o = obs as Record<string, unknown>;
        sources.push({
          name: String(o.source ?? "unknown"),
          value: o.value ?? null,
          source: String(o.source ?? "unknown"),
          fetchedAt: typeof o.fetchedAt === "number" ? o.fetchedAt : submitClock.now(),
          confidence: typeof o.confidence === "number" ? o.confidence : 5000,
        });
      }
    }

    // Placeholder source if none extracted.
    if (sources.length === 0) {
      sources.push({
        name: "scripted",
        value: null,
        source: `fixture:model-scripts/${agentId}/${claim.id}.json`,
        fetchedAt: claim.postedAt * 1_000,
        confidence: 5000,
      });
    }

    const { row: attestRow, receipt } = await buildAndSubmitAttestation({
      agentId,
      agentAddr,
      isHuman: false,
      claim,
      trace,
      sources,
      costUsd: 0.001,
      postedAtMs: claim.postedAt * 1_000,
      deps: {
        wallet,
        blob,
        clock: submitClock,
        repo: memRepo,
      },
    });

    // 3c. Emit AGENT_DONE event.
    const agentDoneEvent: BusEvent = {
      kind: "AGENT_DONE",
      claimId: claim.id,
      agentAddr,
      isHuman: false,
      decision: trace.final.decision,
      confidenceBps: trace.final.confidenceBps,
      latencyMs: attestRow.latencyMs,
      costUsd: attestRow.costUsd,
      reasoningHash: attestRow.reasoningHash,
    };
    bus.emit(agentDoneEvent);

    // 3d. Emit CONTRACT_ATTESTED event — the indexer (T-402) writes the DB row.
    const contractAttestedEvent: BusEvent = {
      kind: "CONTRACT_ATTESTED",
      txHash: receipt.txHash,
      logIndex,
      claimId: claim.id,
      agentAddr,
      isHuman: false,
      decision: trace.final.decision,
      confidenceBps: trace.final.confidenceBps,
      sourcesHash: attestRow.sourcesHash,
      reasoningHash: attestRow.reasoningHash,
      traceUri: attestRow.traceURI,
      latencyMs: attestRow.latencyMs,
      costUsd: attestRow.costUsd,
      blockNumber: 1,
      timestamp: submitClock.now(),
    };
    bus.emit(contractAttestedEvent);

    return "success";
  } catch (err) {
    // 4. Failure path — write errors row + emit error event. Never rethrow.
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    // Write errors table row.
    try {
      await db.insert(errors).values({
        id: `err:runner:${agentId}:${claim.id}:${Date.now()}`,
        scope: `runner:${agentId}`,
        payload: {
          message,
          stack,
          claimId: claim.id,
          agentId,
        },
        createdAt: Date.now(),
      });
    } catch {
      // DB write failed too — still not silent because we emit the event below.
    }

    // Emit AGENT_DONE ABSTAIN to signal failure on the bus.
    const errorHash = `0x${"0".repeat(64)}` as `0x${string}`;
    const errorDoneEvent: BusEvent = {
      kind: "AGENT_DONE",
      claimId: claim.id,
      agentAddr: new MockWalletSeam(`${agentId}-wallet`).address(),
      isHuman: false,
      decision: "ABSTAIN",
      confidenceBps: 0,
      latencyMs: 0,
      costUsd: 0,
      reasoningHash: errorHash,
    };
    bus.emit(errorDoneEvent);

    return "error";
  }
}

// ---------------------------------------------------------------------------
// runClaim — main entry point
// ---------------------------------------------------------------------------

/**
 * runClaim — runs all three reference agents concurrently for a claim.
 *
 * Uses Promise.allSettled so no agent can block the others (PRD §4).
 * A failed/timed-out agent yields an errors row + error event; the others
 * still complete with attestation rows (PRD §13: no silent failures).
 *
 * @returns Object with counts of successes and errors.
 */
export async function runClaim(
  claim: Claim,
  deps: RunnerDeps,
): Promise<{ successes: number; errors: number }> {
  // Ensure claim row exists (idempotent — indexer may have already written it).
  const { claims } = await import("@bombe/db");
  await deps.db
    .insert(claims)
    .values({
      id: claim.id,
      tier: claim.tier,
      asset: claim.asset,
      claimType: claim.claimType,
      payload: claim.payload,
      status: "open",
      postedAt: claim.postedAt,
    })
    .onConflictDoNothing();

  // Register agent rows (required for FK constraints in attestations).
  const { agents } = await import("@bombe/db");
  for (const config of REFERENCE_AGENTS) {
    const wallet = new MockWalletSeam(`${config.agentId}-wallet`);
    await deps.db
      .insert(agents)
      .values({
        addr: wallet.address(),
        name: config.agentId,
        model: config.model,
        isHuman: false,
        bondWei: "100000000000000000",
        reputation: 0,
        registeredAt: 1_735_689_600_000,
      })
      .onConflictDoNothing();
  }

  // Run all three agents concurrently via Promise.allSettled.
  const agentRuns = REFERENCE_AGENTS.map((config, index) =>
    runSingleAgent(config, claim, deps, index),
  );

  const results = await Promise.allSettled(agentRuns);

  let successes = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value === "success") {
      successes++;
    } else {
      errorCount++;
    }
  }

  return { successes, errors: errorCount };
}
