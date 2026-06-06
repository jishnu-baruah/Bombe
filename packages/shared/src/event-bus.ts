/**
 * event-bus.ts — Typed in-process event bus for mock mode. (PRD §4, §6.5, T-402)
 *
 * Wraps Node's EventEmitter with typed emit/on for:
 *   1. SSE event union (SseEvent from events.ts) — streams to UI consumers.
 *   2. Contract-ish events the indexer consumes (ClaimPosted, Attested) — carry
 *      (txHash, logIndex) for idempotent upsert.
 *
 * In mock mode the event bus is the "shared in-process EventEmitter" that replaces
 * the live viem contract watcher (PRD §6.5: "mock: shared in-process EventEmitter").
 *
 * Live viem watcher path is a documented skeleton; real wiring in T-402-live/T-803.
 */

import { EventEmitter } from "node:events";
import type { SseEvent } from "./events.js";
import type { Claim } from "./taxonomy.js";

// ---------------------------------------------------------------------------
// Contract-ish event types (mock equivalents of on-chain events)
// ---------------------------------------------------------------------------

/**
 * ContractClaimPostedEvent — mock equivalent of the AgentAttestation.ClaimPosted
 * on-chain event. Emitted by the runner when a claim is "posted" in mock mode.
 */
export interface ContractClaimPostedEvent {
  kind: "CONTRACT_CLAIM_POSTED";
  txHash: string;
  logIndex: number;
  claim: Claim;
  blockNumber: number;
  timestamp: number;
}

/**
 * ContractAttestedEvent — mock equivalent of the on-chain Attested event.
 * Emitted by the runner after each agent successfully submits an attestation.
 * The indexer consumes these to upsert rows idempotently on (txHash, logIndex).
 */
export interface ContractAttestedEvent {
  kind: "CONTRACT_ATTESTED";
  txHash: string;
  logIndex: number;
  claimId: string;
  agentAddr: string;
  isHuman: boolean;
  decision: string;
  confidenceBps: number;
  sourcesHash: string;
  reasoningHash: string;
  traceUri: string;
  latencyMs: number;
  costUsd: number;
  blockNumber: number;
  timestamp: number;
}

/**
 * ContractEvent — discriminated union of all contract-ish events.
 */
export type ContractEvent = ContractClaimPostedEvent | ContractAttestedEvent;

// ---------------------------------------------------------------------------
// BusEvent — union of all typed events the bus carries
// ---------------------------------------------------------------------------

/**
 * BusEvent — the union of SSE events and contract-ish events.
 *
 * The bus is a single channel for all internal events; consumers subscribe
 * by kind and filter as needed.
 */
export type BusEvent = SseEvent | ContractEvent;

// ---------------------------------------------------------------------------
// EventBus interface
// ---------------------------------------------------------------------------

/**
 * EventBus — typed event bus interface.
 *
 * emit(event) — fires an event to all subscribers for that kind.
 * on(kind, handler) — subscribes to events of a specific kind.
 * off(kind, handler) — unsubscribes.
 * onAny(handler) — subscribes to ALL events (useful for the indexer).
 * offAny(handler) — unsubscribes from ALL events.
 */
export interface EventBus {
  emit(event: BusEvent): void;
  on<K extends BusEvent["kind"]>(
    kind: K,
    handler: (event: Extract<BusEvent, { kind: K }>) => void,
  ): void;
  off<K extends BusEvent["kind"]>(
    kind: K,
    handler: (event: Extract<BusEvent, { kind: K }>) => void,
  ): void;
  onAny(handler: (event: BusEvent) => void): void;
  offAny(handler: (event: BusEvent) => void): void;
}

// ---------------------------------------------------------------------------
// InProcessEventBus — implementation backed by Node's EventEmitter
// ---------------------------------------------------------------------------

/**
 * InProcessEventBus — typed wrapper around Node's EventEmitter.
 *
 * Uses the event's `kind` field as the EventEmitter channel name.
 * A special "__any__" channel is used for onAny/offAny subscribers.
 *
 * Deterministic in tests: the bus itself has no async behavior — all
 * handlers fire synchronously on emit() in the order they were registered.
 */
class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Raise the default max-listeners limit — tests register many listeners.
    this.emitter.setMaxListeners(100);
  }

  emit(event: BusEvent): void {
    // Fire kind-specific subscribers first, then any-subscribers.
    this.emitter.emit(event.kind, event);
    this.emitter.emit("__any__", event);
  }

  on<K extends BusEvent["kind"]>(
    kind: K,
    handler: (event: Extract<BusEvent, { kind: K }>) => void,
  ): void {
    // The cast is safe: we only emit Extract<BusEvent, {kind:K}> on channel K.
    this.emitter.on(kind, handler as (event: BusEvent) => void);
  }

  off<K extends BusEvent["kind"]>(
    kind: K,
    handler: (event: Extract<BusEvent, { kind: K }>) => void,
  ): void {
    this.emitter.off(kind, handler as (event: BusEvent) => void);
  }

  onAny(handler: (event: BusEvent) => void): void {
    this.emitter.on("__any__", handler);
  }

  offAny(handler: (event: BusEvent) => void): void {
    this.emitter.off("__any__", handler);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * createEventBus — create a new in-process typed event bus.
 *
 * In mock mode: call once at app startup and thread the bus through the
 * indexer and runner (dependency injection, no globals).
 *
 * Live path: replace the bus with a viem watcher adapter (T-402-live/T-803).
 * The adapter should implement EventBus so all consumers stay unchanged.
 */
export function createEventBus(): EventBus {
  return new InProcessEventBus();
}
