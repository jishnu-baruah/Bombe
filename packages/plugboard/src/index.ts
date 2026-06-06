/**
 * packages/plugboard/src/index.ts — Public barrel for @bombe/plugboard.
 *
 * Exports the transcript replay engine, types, skill utilities,
 * fallback/status helpers, and mock implementations.
 *
 * The replay engine is intentionally pure — no singleton state,
 * no shared mutable references. Plugboard isolation is structural. (PRD §6.8, §14.13)
 */

// Core transcript types and schemas
export {
  PlugboardStepSchema,
  PlugboardTranscriptSchema,
  ContractRevertError,
} from "./types.js";
export type {
  PlugboardStep,
  PlugboardTranscript,
  StepOutcome,
  ReplayResult,
  SkillSnapshot,
  GatewayClient,
  RevertingWalletSeam,
  ReplayDeps,
} from "./types.js";

// Transcript replay engine (T-501, T-502)
export { replayTranscript, validateTranscriptHash } from "./replay.js";

// Skill snapshotting (T-503)
export { skillHash, makeEpochSnapshot } from "./skill.js";

// Live fallback + isolation (T-504)
export {
  RUNTIME_OFFLINE_BADGE,
  resolvePlugboardStatus,
  shouldReplay,
} from "./fallback.js";
export type { PlugboardStatus } from "./fallback.js";

// Mock implementations for unit tests
export { MockGatewayClient, MockRevertingWalletSeam } from "./mock-deps.js";
