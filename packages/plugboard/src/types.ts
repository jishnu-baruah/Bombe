/**
 * types.ts — Plugboard mock-path types. (PRD §6.8, T-501)
 *
 * Defines the transcript format used by fixtures/model-scripts/plugboard/{claimId}.json,
 * the replay outcome shapes, and the skill-hash/epoch-snapshot types.
 *
 * No `any` — TypeScript strict throughout.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Transcript step schema (PRD §6.8 mock transcript format)
// ---------------------------------------------------------------------------

/**
 * A tool-call action within a plugboard step.
 */
const PlugboardToolActionSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()),
});

/**
 * A finalize action within a plugboard step — terminal decision.
 */
const PlugboardFinalizeActionSchema = z.object({
  finalize: z.object({
    decision: z.enum(["VALID", "REJECTED", "ABSTAIN"]),
    confidenceBps: z.number(),
    rationaleSummary: z.string(),
  }),
});

const PlugboardActionSchema = z.union([PlugboardToolActionSchema, PlugboardFinalizeActionSchema]);

/**
 * A single step in a Plugboard transcript.
 *
 * `contractRevert` — if present, the replay engine sends the tx for this
 * finalize step, EXPECTS the named revert, surfaces `blockedByProtocol:true`,
 * and continues to the next step. (PRD §6.8)
 */
export const PlugboardStepSchema = z.object({
  step: z.number().int().positive(),
  thought: z.string(),
  action: PlugboardActionSchema,
  observation: z.record(z.unknown()).optional(),
  contractRevert: z.string().optional(),
});

export type PlugboardStep = z.infer<typeof PlugboardStepSchema>;

// ---------------------------------------------------------------------------
// Transcript schema
// ---------------------------------------------------------------------------

/**
 * PlugboardTranscript — the JSON shape persisted in
 * `fixtures/model-scripts/plugboard/{claimId}.json`. (PRD §6.8)
 *
 * `traceHash` = hashCanonical(steps)
 * `expectedOnChainDecision` — the final on-chain outcome after revert handling.
 */
export const PlugboardTranscriptSchema = z.object({
  claimId: z.string(),
  agentId: z.literal("plugboard"),
  steps: z.array(PlugboardStepSchema),
  traceHash: z.string().regex(/^0x[0-9a-f]{64}$/, "must be a 0x-prefixed 32-byte hex hash"),
  expectedOnChainDecision: z.enum(["VALID", "REJECTED", "ABSTAIN"]),
});

export type PlugboardTranscript = z.infer<typeof PlugboardTranscriptSchema>;

// ---------------------------------------------------------------------------
// Replay outcome types
// ---------------------------------------------------------------------------

/**
 * StepOutcome — the result of replaying a single transcript step.
 *
 * `blockedByProtocol` — true when this step triggered a contract revert and
 *   the replay engine successfully handled it (PRD §6.8, §14.11).
 * `decision` — present for finalize steps; the attempted/accepted decision.
 * `observation` — raw gateway observation for tool steps.
 */
export interface StepOutcome {
  /** 1-based step index matching the transcript. */
  step: number;
  /** Whether this step triggered and survived a contract revert. */
  blockedByProtocol: boolean;
  /** Revert error name, if any (e.g. "JudgmentTierRequiresAbstain"). */
  revertReason?: string | undefined;
  /** Decision for finalize steps. */
  decision?: "VALID" | "REJECTED" | "ABSTAIN" | undefined;
  /** Tool observation (tool steps only). */
  observation?: Record<string, unknown> | undefined;
}

/**
 * ReplayResult — the full result of replaying a transcript.
 *
 * `finalDecision` — the last accepted (non-reverted) finalize decision.
 * `blockedByProtocol` — true if ANY step triggered a contract revert.
 * `skillHash` — keccak256 of the active skill file pinned for this run.
 * `stepOutcomes` — ordered outcomes, one per transcript step.
 */
export interface ReplayResult {
  claimId: string;
  agentId: "plugboard";
  finalDecision: "VALID" | "REJECTED" | "ABSTAIN";
  blockedByProtocol: boolean;
  skillHash: `0x${string}`;
  stepOutcomes: StepOutcome[];
}

// ---------------------------------------------------------------------------
// Skill snapshot types (T-503)
// ---------------------------------------------------------------------------

/**
 * SkillSnapshot — represents a frozen epoch snapshot of the skill file.
 *
 * `epoch` — 0-based epoch index.
 * `skillHash` — keccak256(UTF-8 bytes of skill file content).
 * `content` — raw text of the skill file at this epoch.
 */
export interface SkillSnapshot {
  epoch: number;
  skillHash: `0x${string}`;
  content: string;
}

// ---------------------------------------------------------------------------
// ReplayDeps — injected dependencies for the replay engine (T-501, T-502)
// ---------------------------------------------------------------------------

/**
 * GatewayClient — thin interface over the tool-gateway HTTP calls.
 *
 * Mock implementations may return fixture data directly.
 * The real implementation calls `POST /tools/:name` with bearer auth.
 */
export interface GatewayClient {
  callTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * RevertingWalletSeam — wallet interface used by the replay engine.
 *
 * Extends the standard WalletSeam contract with an optional expected-revert
 * path. When `expectedRevert` is set, the seam must throw (or return a
 * reverted receipt) to allow the replay engine to detect it.
 */
export interface RevertingWalletSeam {
  address(): string;
  /** Send a finalize tx.
   *  `expectedRevert` — if provided, the implementation should simulate/expect
   *  this revert name. Throws `ContractRevertError` on expected revert.
   */
  sendFinalizeTx(
    decision: "VALID" | "REJECTED" | "ABSTAIN",
    confidenceBps: number,
    rationaleSummary: string,
    expectedRevert?: string | undefined,
  ): Promise<{ txHash: `0x${string}` }>;
}

/**
 * ContractRevertError — thrown by RevertingWalletSeam when the expected revert fires.
 */
export class ContractRevertError extends Error {
  readonly revertName: string;

  constructor(revertName: string) {
    super(`Contract reverted: ${revertName}`);
    this.name = "ContractRevertError";
    this.revertName = revertName;
  }
}

/**
 * ReplayDeps — all external dependencies injected into `replayTranscript`.
 */
export interface ReplayDeps {
  /** Gateway client for tool steps. */
  gateway: GatewayClient;
  /** Wallet for finalize steps. */
  wallet: RevertingWalletSeam;
  /** Active skill snapshot (pinned to epoch-0 in mock). */
  skillSnapshot: SkillSnapshot;
  /** Whether the Hermes runtime is available (T-504). */
  hermesAvailable?: boolean | undefined;
}
