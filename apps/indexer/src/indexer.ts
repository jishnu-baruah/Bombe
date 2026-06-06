/**
 * indexer.ts — Event indexer for Bombe. (PRD §6.5, T-402)
 *
 * Subscribes to the event bus (mock: shared in-process EventEmitter). For each
 * CONTRACT_ATTESTED event, idempotently upserts an attestation row using the
 * composite key (txHash, logIndex). For each CONTRACT_CLAIM_POSTED event,
 * upserts a claim row. All events are also appended to the events table
 * (append-only SSE feed). Errors are written to the errors table — no silent
 * failures (PRD §13).
 *
 * Live viem watcher path: documented skeleton below; real wiring in T-402-live/T-803.
 * The live path should emit the same ContractAttestedEvent shape onto the bus
 * so startIndexer stays unchanged.
 */

import { events, type BombeDb, attestations, claims, errors, upsertAttestation } from "@bombe/db";
import type { BusEvent, EventBus } from "@bombe/shared";

// ---------------------------------------------------------------------------
// Idempotency key helpers
// ---------------------------------------------------------------------------

/**
 * attestationIdFromEvent — derives the idempotency PK for an attestation row
 * from its on-chain (txHash, logIndex) pair. Two events with the same pair
 * always resolve to the same ID → the upsert is a no-op on the second call.
 */
function attestationIdFromEvent(txHash: string, logIndex: number): string {
  return `idx:${txHash}:${logIndex}`;
}

/**
 * eventRowId — derives a unique ID for an events table row.
 * Uses (kind, txHash or claimId, logIndex) to ensure determinism.
 */
function eventRowId(kind: string, discriminator: string, logIndex: number): string {
  return `evt:${kind}:${discriminator}:${logIndex}`;
}

/**
 * errorRowId — unique ID for an errors table row.
 */
function errorRowId(scope: string, discriminator: string): string {
  return `err:${scope}:${discriminator}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// IndexerDeps — injected dependencies
// ---------------------------------------------------------------------------

export interface IndexerDeps {
  bus: EventBus;
  db: BombeDb;
}

// ---------------------------------------------------------------------------
// startIndexer
// ---------------------------------------------------------------------------

/**
 * startIndexer — wires the event bus subscriptions.
 *
 * Returns an unsubscribe function for clean teardown in tests.
 *
 * Subscribes to:
 *   CONTRACT_CLAIM_POSTED — upserts a claim row; appends to events table.
 *   CONTRACT_ATTESTED     — idempotent upsert on (txHash, logIndex) in
 *                           attestations; appends to events table.
 *
 * Any persistence error is caught, logged to the errors table (best-effort),
 * and the process continues — no silent failures, no crashes (PRD §13).
 */
export function startIndexer(deps: IndexerDeps): () => void {
  const { bus, db } = deps;

  // -------------------------------------------------------------------------
  // Handle CONTRACT_CLAIM_POSTED
  // -------------------------------------------------------------------------

  const onClaimPosted = async (
    event: Extract<BusEvent, { kind: "CONTRACT_CLAIM_POSTED" }>,
  ): Promise<void> => {
    try {
      const { claim, txHash, logIndex, timestamp } = event;

      // Idempotent claim upsert — if a row with the same id already exists, do nothing.
      await db
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
        .onConflictDoNothing({ target: claims.id });

      // Append to events feed.
      const evtId = eventRowId("CONTRACT_CLAIM_POSTED", `${txHash}:${claim.id}`, logIndex);
      await db
        .insert(events)
        .values({
          id: evtId,
          kind: "CONTRACT_CLAIM_POSTED",
          payload: {
            txHash,
            logIndex,
            claimId: claim.id,
            tier: claim.tier,
            asset: claim.asset,
            claimType: claim.claimType,
            timestamp,
          },
          createdAt: timestamp,
        })
        .onConflictDoNothing({ target: events.id });
    } catch (err) {
      await writeError(db, "indexer:CONTRACT_CLAIM_POSTED", event, err);
    }
  };

  // -------------------------------------------------------------------------
  // Handle CONTRACT_ATTESTED
  // -------------------------------------------------------------------------

  const onAttested = async (
    event: Extract<BusEvent, { kind: "CONTRACT_ATTESTED" }>,
  ): Promise<void> => {
    try {
      const {
        txHash,
        logIndex,
        claimId,
        agentAddr,
        isHuman,
        decision,
        confidenceBps,
        sourcesHash,
        reasoningHash,
        traceUri,
        latencyMs,
        costUsd,
        timestamp,
      } = event;

      // Derive idempotency key from (txHash, logIndex).
      const id = attestationIdFromEvent(txHash, logIndex);

      // Idempotent upsert — same (txHash, logIndex) → same id → DO NOTHING.
      await upsertAttestation(db, {
        id,
        claimId,
        agentAddr,
        isHuman,
        decision,
        confidenceBps,
        sourcesHash,
        reasoningHash,
        traceUri,
        latencyMs,
        costUsd: String(costUsd),
        skillHash: null,
        txHash,
        createdAt: timestamp,
      });

      // Append to events feed (idempotent via id).
      const evtId = eventRowId("CONTRACT_ATTESTED", txHash, logIndex);
      await db
        .insert(events)
        .values({
          id: evtId,
          kind: "CONTRACT_ATTESTED",
          payload: {
            txHash,
            logIndex,
            claimId,
            agentAddr,
            decision,
            confidenceBps,
            timestamp,
          },
          createdAt: timestamp,
        })
        .onConflictDoNothing({ target: events.id });
    } catch (err) {
      await writeError(db, "indexer:CONTRACT_ATTESTED", event, err);
    }
  };

  // -------------------------------------------------------------------------
  // Wire subscriptions
  // -------------------------------------------------------------------------

  // EventBus.on() accepts synchronous handlers. We wrap the async handlers in
  // a fire-and-forget wrapper so we don't need to change the EventBus interface.
  const handleClaimPosted = (event: Extract<BusEvent, { kind: "CONTRACT_CLAIM_POSTED" }>): void => {
    void onClaimPosted(event);
  };

  const handleAttested = (event: Extract<BusEvent, { kind: "CONTRACT_ATTESTED" }>): void => {
    void onAttested(event);
  };

  bus.on("CONTRACT_CLAIM_POSTED", handleClaimPosted);
  bus.on("CONTRACT_ATTESTED", handleAttested);

  // Return teardown function.
  return () => {
    bus.off("CONTRACT_CLAIM_POSTED", handleClaimPosted);
    bus.off("CONTRACT_ATTESTED", handleAttested);
  };
}

// ---------------------------------------------------------------------------
// writeError — best-effort error row writer
// ---------------------------------------------------------------------------

/**
 * writeError — appends a row to the errors table.
 *
 * Never throws. If the errors table write itself fails, the error is swallowed
 * (last-resort: we cannot infinitely recurse on errors-table errors).
 */
async function writeError(
  db: BombeDb,
  scope: string,
  context: unknown,
  err: unknown,
): Promise<void> {
  const id = errorRowId(scope, String(Date.now()));
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  try {
    await db.insert(errors).values({
      id,
      scope,
      payload: {
        message,
        stack,
        context,
      },
      createdAt: Date.now(),
    });
  } catch {
    // Truly last-resort: cannot write to errors table.
    // No silent failures in the indexer itself is still upheld — we attempted.
  }
}
