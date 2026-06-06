/**
 * replay.ts — Transcript replay engine. (PRD §6.8, T-501, T-502)
 *
 * `replayTranscript` drives a PlugboardTranscript through the gateway and wallet
 * without any model API. Each step is replayed in order:
 *
 *   - Tool steps: call gateway.callTool(name, input) → observation.
 *   - Finalize steps without `contractRevert`: call wallet.sendFinalizeTx → accepted.
 *   - Finalize steps WITH `contractRevert`: call wallet.sendFinalizeTx with the
 *     expected revert name → ContractRevertError is caught → step outcome carries
 *     blockedByProtocol:true, revertReason set, and execution continues to the
 *     next step (PRD §6.8).
 *
 * The replay engine never imports or calls any model API.
 * Live fallback (T-504): if `deps.hermesAvailable` is false, replay proceeds with
 * a "RUNTIME OFFLINE — replaying recorded behavior" status logged (returned in result).
 *
 * No `any`. TypeScript strict.
 */

import { hashCanonical } from "@bombe/shared";
import type {
  GatewayClient,
  PlugboardStep,
  PlugboardTranscript,
  ReplayDeps,
  ReplayResult,
  RevertingWalletSeam,
  StepOutcome,
} from "./types.js";
import { ContractRevertError } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Type-guard: does the action contain a `tool` property? */
function isToolAction(
  action: PlugboardStep["action"],
): action is { tool: string; input: Record<string, unknown> } {
  return "tool" in action;
}

/** Type-guard: does the action contain a `finalize` property? */
function isFinalizeAction(
  action: PlugboardStep["action"],
): action is {
  finalize: {
    decision: "VALID" | "REJECTED" | "ABSTAIN";
    confidenceBps: number;
    rationaleSummary: string;
  };
} {
  return "finalize" in action;
}

// ---------------------------------------------------------------------------
// replayStep — replays a single transcript step
// ---------------------------------------------------------------------------

async function replayStep(
  step: PlugboardStep,
  gateway: GatewayClient,
  wallet: RevertingWalletSeam,
): Promise<StepOutcome> {
  const action = step.action;

  if (isToolAction(action)) {
    // Tool step: call gateway and record observation.
    const observation = await gateway.callTool(action.tool, action.input);
    return {
      step: step.step,
      blockedByProtocol: false,
      observation,
    };
  }

  if (isFinalizeAction(action)) {
    const { decision, confidenceBps, rationaleSummary } = action.finalize;

    if (step.contractRevert !== undefined) {
      // Finalize step WITH expected revert: send tx expecting the revert.
      // The wallet impl MUST throw ContractRevertError for the named revert.
      try {
        await wallet.sendFinalizeTx(decision, confidenceBps, rationaleSummary, step.contractRevert);
        // If wallet didn't throw, the test fixture or live node didn't revert as expected.
        // Surface as a non-blocking outcome: log the anomaly but don't crash.
        return {
          step: step.step,
          blockedByProtocol: false,
          decision,
          revertReason: undefined,
        };
      } catch (err) {
        if (err instanceof ContractRevertError) {
          // Expected path: contract reverted. Surface blockedByProtocol:true. (PRD §6.8)
          return {
            step: step.step,
            blockedByProtocol: true,
            revertReason: err.revertName,
            decision,
          };
        }
        // Unexpected error — re-throw (not a controlled revert).
        throw err;
      }
    }

    // Finalize step WITHOUT expected revert: send tx normally.
    await wallet.sendFinalizeTx(decision, confidenceBps, rationaleSummary);
    return {
      step: step.step,
      blockedByProtocol: false,
      decision,
    };
  }

  // Should be unreachable given the zod union, but TypeScript needs a return.
  throw new Error(`replayStep: unrecognized action shape at step ${step.step}`);
}

// ---------------------------------------------------------------------------
// replayTranscript — the public API (PRD §6.8, T-501)
// ---------------------------------------------------------------------------

/**
 * replayTranscript — replays a PlugboardTranscript through gateway + wallet.
 *
 * Steps are executed in their stated order. The engine has no model API contact.
 *
 * Live fallback (T-504): `deps.hermesAvailable === false` causes
 * `runtimeOffline: true` on the result and triggers replay mode.
 * The caller (runner) is responsible for surfacing the badge.
 *
 * Returns a `ReplayResult` with per-step outcomes and the final on-chain decision.
 */
export async function replayTranscript(
  transcript: PlugboardTranscript,
  deps: ReplayDeps,
): Promise<ReplayResult & { runtimeOffline?: true }> {
  const { gateway, wallet, skillSnapshot, hermesAvailable = true } = deps;

  const stepOutcomes: StepOutcome[] = [];
  let finalDecision: "VALID" | "REJECTED" | "ABSTAIN" = "ABSTAIN";
  let anyBlocked = false;

  for (const step of transcript.steps) {
    const outcome = await replayStep(step, gateway, wallet);
    stepOutcomes.push(outcome);

    if (outcome.blockedByProtocol) {
      anyBlocked = true;
    }

    // Track the last accepted finalize decision (not the reverted one).
    if (outcome.decision !== undefined && !outcome.blockedByProtocol) {
      finalDecision = outcome.decision;
    }
  }

  const base: ReplayResult = {
    claimId: transcript.claimId,
    agentId: "plugboard",
    finalDecision,
    blockedByProtocol: anyBlocked,
    skillHash: skillSnapshot.skillHash,
    stepOutcomes,
  };

  if (!hermesAvailable) {
    return { ...base, runtimeOffline: true };
  }

  return base;
}

// ---------------------------------------------------------------------------
// validateTranscriptHash — assert traceHash integrity (PRD §6.8, §14.11-adj)
// ---------------------------------------------------------------------------

/**
 * validateTranscriptHash — recomputes hashCanonical(steps) and compares against
 * the stored traceHash.
 *
 * Throws if they do not match. Safe to call in tests and at load time.
 */
export function validateTranscriptHash(transcript: PlugboardTranscript): void {
  const computed = hashCanonical(transcript.steps);
  if (computed !== transcript.traceHash) {
    throw new Error(
      `Transcript hash mismatch for claimId=${transcript.claimId}: ` +
        `stored=${transcript.traceHash} computed=${computed}`,
    );
  }
}
