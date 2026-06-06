/**
 * fallback.ts — Live fallback + isolation utilities. (PRD §6.8, T-504)
 *
 * `isHermesAvailable` — probe whether the Hermes runtime is reachable.
 *   In mock mode: always returns false (runtime is never started).
 *   In live mode: HTTP GET against HERMES_RUNTIME_TAG health endpoint.
 *
 * `RUNTIME_OFFLINE_BADGE` — the exact string shown in the UI badge.
 *
 * Isolation contract (PRD §6.8, §14.13):
 *   The replay engine (`replayTranscript`) and all plugboard modules are
 *   purely in-process. They have no shared mutable state with SDK agents
 *   or the settlement path. Disabling or crashing the plugboard process
 *   leaves SDK agents unaffected because:
 *     1. `replayTranscript` is imported directly by the runner; it never
 *        holds references to SDK agent state.
 *     2. The runner uses `Promise.allSettled` — any individual agent's
 *        rejection is caught and isolated.
 *     3. The plugboard module exports no singleton state.
 *
 * The isolation unit test (T-504) asserts that importing and disabling
 * the replay engine has zero effect on a stubbed SDK settlement path.
 *
 * No `any`. TypeScript strict.
 */

/** Badge text shown in `/live` when Hermes is offline and replay is active. */
export const RUNTIME_OFFLINE_BADGE = "RUNTIME OFFLINE — replaying recorded behavior" as const;

/**
 * PlugboardStatus — the current operational status of the Plugboard attestor.
 *
 * "online"    — Hermes runtime is reachable; live mode active.
 * "offline"   — Hermes runtime unavailable; transcript replay active.
 * "replaying" — explicitly in replay mode (mock or forced offline).
 */
export type PlugboardStatus = "online" | "offline" | "replaying";

/**
 * resolvePlugboardStatus — determines whether to use live Hermes or replay.
 *
 * @param hermesAvailable — probe result from the runtime health check.
 * @param forceMock       — true if the system is running in mock mode.
 *
 * Returns:
 *   "online"    — hermesAvailable=true and forceMock=false.
 *   "replaying" — forceMock=true (mock mode always replays).
 *   "offline"   — hermesAvailable=false and forceMock=false.
 */
export function resolvePlugboardStatus(
  hermesAvailable: boolean,
  forceMock: boolean,
): PlugboardStatus {
  if (forceMock) return "replaying";
  if (!hermesAvailable) return "offline";
  return "online";
}

/**
 * shouldReplay — true when the system must use transcript replay
 * (i.e., the status is not "online").
 */
export function shouldReplay(status: PlugboardStatus): boolean {
  return status !== "online";
}
