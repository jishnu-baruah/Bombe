/**
 * human-queue.ts — Simulated human attestor queue. (PRD §6.9, T-404)
 *
 * HumanQueue implements the HumanQueueSeam interface. On ClaimPosted:
 *   1. Emits HUMAN_QUEUE_UPDATE SSE events with a deterministic simulated wait.
 *   2. After the simulated wait elapses, submits the human decision from
 *      loadHumanDecision(claimId) via the standard attest() path.
 *   3. Emits AGENT_DONE (isHuman:true) and CONTRACT_ATTESTED (is_human:true).
 *
 * Determinism:
 *   - Wait duration is sampled from [DEMO_HUMAN_LATENCY_MIN_MS, MAX_MS] using
 *     a seeded linear-congruential generator (deterministic, never Math.random).
 *   - For the demo: the default wait (30s+) does NOT elapse during a claim; tests
 *     call forceElapse(claimId) to immediately trigger the human decision.
 *
 * No silent failures (PRD §13): any error during human-attest writes to the
 * errors table.
 */

import {
  InMemoryAttestationRepository,
  MockBlobSeam,
  MockWalletSeam,
  type Source,
  StubClockSeam,
  buildAndSubmitAttestation,
} from "@bombe/agent-sdk";
import type { HumanQueueSeam } from "@bombe/agent-sdk";
import type { BombeDb } from "@bombe/db";
import { errors } from "@bombe/db";
import { type BusEvent, type Claim, type EventBus, loadHumanDecision } from "@bombe/shared";

// ---------------------------------------------------------------------------
// Constants (PRD §6.9)
// ---------------------------------------------------------------------------

/** Minimum simulated human wait in ms. */
export const DEMO_HUMAN_LATENCY_MIN_MS = 30_000;
/** Maximum simulated human wait in ms. */
export const DEMO_HUMAN_LATENCY_MAX_MS = 90_000;

/** Address seed for the human attestor wallet. */
const HUMAN_WALLET_SEED = "human-attestor";

/** Log index for human attestation events. */
const HUMAN_LOG_INDEX = 99;

// ---------------------------------------------------------------------------
// Seeded LCG for deterministic wait sampling
// ---------------------------------------------------------------------------

/**
 * seededWaitMs — sample a deterministic wait from [min, max] using a
 * linear-congruential generator seeded by a string.
 *
 * LCG params from Numerical Recipes: a=1664525, c=1013904223, m=2^32.
 * Deterministic: same seed → same value every time.
 */
function seededWaitMs(seed: string, minMs: number, maxMs: number): number {
  // Hash the seed string to a 32-bit integer.
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  // One LCG step.
  const a = 1_664_525;
  const c = 1_013_904_223;
  const next = (Math.imul(a, h) + c) | 0;
  // Map to [0, 1).
  const frac = (next >>> 0) / 0x1_0000_0000;
  return Math.floor(minMs + frac * (maxMs - minMs));
}

// ---------------------------------------------------------------------------
// HumanQueueDeps
// ---------------------------------------------------------------------------

export interface HumanQueueDeps {
  bus: EventBus;
  db: BombeDb;
  /** Override fixtures root for tests. */
  fixturesRoot?: string | undefined;
  /** Seeded clock base for determinism. */
  clockSeed?: number | undefined;
}

// ---------------------------------------------------------------------------
// HumanQueue
// ---------------------------------------------------------------------------

/**
 * HumanQueue — implements HumanQueueSeam with full simulated-latency behavior.
 *
 * Register it as the humanQueue seam in the runner; it wires the event bus
 * subscriptions internally.
 *
 * In tests: call forceElapse(claimId) to immediately trigger the human attest
 * without waiting for the real timer.
 */
export class HumanQueue implements HumanQueueSeam {
  private readonly deps: HumanQueueDeps;
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingResolvers = new Map<string, () => void>();

  constructor(deps: HumanQueueDeps) {
    this.deps = deps;
  }

  /**
   * onClaim — called when a new claim is posted. Starts the simulated wait
   * and emits HUMAN_QUEUE_UPDATE events.
   */
  onClaim(claim: Claim): void {
    const { bus, fixturesRoot } = this.deps;

    // Sample a deterministic wait duration.
    const waitMs = seededWaitMs(
      `human:${claim.id}`,
      DEMO_HUMAN_LATENCY_MIN_MS,
      DEMO_HUMAN_LATENCY_MAX_MS,
    );
    const estimatedWaitMin = waitMs / 60_000;

    // Emit initial queue update.
    const queueEvent: BusEvent = {
      kind: "HUMAN_QUEUE_UPDATE",
      claimId: claim.id,
      position: 1,
      estimatedWaitMin,
    };
    bus.emit(queueEvent);

    // Create a promise that resolves either on timer or on forceElapse().
    let resolveElapsed: () => void = () => undefined;
    const elapsedPromise = new Promise<void>((resolve) => {
      resolveElapsed = resolve;
    });
    this.pendingResolvers.set(claim.id, resolveElapsed);

    // Start the real timer (used in production / long tests).
    const timer = setTimeout(() => {
      resolveElapsed();
    }, waitMs);
    this.pendingTimers.set(claim.id, timer);

    // Wait for elapsed, then submit the human attestation.
    void elapsedPromise.then(() => this.submitHumanAttestation(claim));
  }

  /**
   * forceElapse — immediately triggers the human attestation for a claim.
   * Used in tests to avoid real timer waits.
   */
  forceElapse(claimId: string): void {
    const resolve = this.pendingResolvers.get(claimId);
    if (resolve !== undefined) {
      // Cancel the real timer.
      const timer = this.pendingTimers.get(claimId);
      if (timer !== undefined) {
        clearTimeout(timer);
        this.pendingTimers.delete(claimId);
      }
      this.pendingResolvers.delete(claimId);
      resolve();
    }
  }

  /**
   * destroy — cancels all pending timers. Call in test teardown.
   */
  destroy(): void {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    this.pendingResolvers.clear();
  }

  // ---------------------------------------------------------------------------
  // submitHumanAttestation — internal
  // ---------------------------------------------------------------------------

  private async submitHumanAttestation(claim: Claim): Promise<void> {
    const { bus, db, fixturesRoot, clockSeed = 0 } = this.deps;

    try {
      // Load the pre-canned human decision for this claim.
      const humanDecision = loadHumanDecision(claim.id, fixturesRoot);

      // Build a mock wallet for the human attestor.
      const wallet = new MockWalletSeam(HUMAN_WALLET_SEED);
      const agentAddr = wallet.address();
      const blob = new MockBlobSeam();
      // Clock must be AFTER claim.postedAt * 1000 so latencyMs is non-negative.
      const humanBase = claim.postedAt * 1_000 + 5_000 + clockSeed * 10;
      const clock = new StubClockSeam(Array.from({ length: 50 }, (_, i) => humanBase + i * 10));

      // Build a minimal trace for the human decision.
      const humanTrace = {
        traceVersion: "1.0" as const,
        agentId: "human",
        claimId: claim.id,
        steps: [],
        final: {
          decision: humanDecision.decision,
          confidenceBps: humanDecision.confidenceBps,
          rationaleSummary: "Human attestor decision.",
          reasons: [],
        },
      };

      // Source for the human attestation.
      const sources: Source[] = [
        {
          name: "human-review",
          value: { decision: humanDecision.decision },
          source: `fixture:human-decisions/${claim.id}`,
          fetchedAt: clock.now(),
          confidence: humanDecision.confidenceBps,
        },
      ];

      // Ensure the human agent is registered.
      const { agents, claims: claimsTable } = await import("@bombe/db");
      await db
        .insert(agents)
        .values({
          addr: agentAddr,
          name: "human-attestor",
          isHuman: true,
          bondWei: "100000000000000000",
          reputation: 0,
          registeredAt: 1_735_689_600_000,
        })
        .onConflictDoNothing();

      // Ensure the claim exists.
      await db
        .insert(claimsTable)
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

      // Use in-memory repo — the indexer handles DB persistence via CONTRACT_ATTESTED event.
      const repo = new InMemoryAttestationRepository();

      const { row, receipt } = await buildAndSubmitAttestation({
        agentId: "human",
        agentAddr,
        isHuman: true,
        claim,
        trace: humanTrace,
        sources,
        costUsd: 0,
        postedAtMs: claim.postedAt * 1000,
        deps: { wallet, blob, clock, repo },
      });

      // Emit AGENT_DONE (isHuman: true).
      const agentDoneEvent: BusEvent = {
        kind: "AGENT_DONE",
        claimId: claim.id,
        agentAddr,
        isHuman: true,
        decision: humanTrace.final.decision,
        confidenceBps: humanTrace.final.confidenceBps,
        latencyMs: row.latencyMs,
        costUsd: row.costUsd,
        reasoningHash: row.reasoningHash,
      };
      bus.emit(agentDoneEvent);

      // Emit CONTRACT_ATTESTED for the indexer.
      const contractAttestedEvent: BusEvent = {
        kind: "CONTRACT_ATTESTED",
        txHash: receipt.txHash,
        logIndex: HUMAN_LOG_INDEX,
        claimId: claim.id,
        agentAddr,
        isHuman: true,
        decision: humanTrace.final.decision,
        confidenceBps: humanTrace.final.confidenceBps,
        sourcesHash: row.sourcesHash,
        reasoningHash: row.reasoningHash,
        traceUri: row.traceURI,
        latencyMs: row.latencyMs,
        costUsd: row.costUsd,
        blockNumber: 1,
        timestamp: clock.now(),
      };
      bus.emit(contractAttestedEvent);
    } catch (err) {
      // Write error row — no silent failures.
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      try {
        await db.insert(errors).values({
          id: `err:human-queue:${claim.id}:${Date.now()}`,
          scope: "runner:human-queue",
          payload: { message, stack, claimId: claim.id },
          createdAt: Date.now(),
        });
      } catch {
        // Last-resort fallback: error already surfaced to caller via event.
      }

      // Emit error AGENT_DONE to signal failure.
      const errorHash = `0x${"0".repeat(64)}` as `0x${string}`;
      const wallet = new MockWalletSeam(HUMAN_WALLET_SEED);
      bus.emit({
        kind: "AGENT_DONE",
        claimId: claim.id,
        agentAddr: wallet.address(),
        isHuman: true,
        decision: "ABSTAIN",
        confidenceBps: 0,
        latencyMs: 0,
        costUsd: 0,
        reasoningHash: errorHash,
      });
    }
  }
}
