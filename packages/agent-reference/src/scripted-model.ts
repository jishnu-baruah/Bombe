/**
 * scripted-model.ts — Deterministic scripted model seam for demo replay.
 * (PRD §13, T-304)
 *
 * ScriptedModelSeam implements ModelSeam by replaying a pre-written script of
 * step proposals. Each proposal is { thought, action } where action is either a
 * tool call or a finalize block. The seam serialises each step as a JSON
 * ModelResponse that the ReAct loop parses with its standard StepProposalSchema.
 *
 * DESIGN:
 *   - Constructed with a ModelScript (loaded from fixtures/model-scripts/).
 *   - Each call to complete() consumes the NEXT scripted step.
 *   - Token counts are fixed and deterministic (no model API needed).
 *   - When the script is exhausted a final ABSTAIN is returned rather than
 *     crashing, so the loop always terminates cleanly.
 *
 * DETERMINISM CONTRACT:
 *   Two calls to runLoop with the same ScriptedModelSeam, same seeded clock,
 *   and same MockHistorySource produce byte-identical traces and therefore
 *   identical hashCanonical(trace) values. This is the M2 checkpoint.
 */

import type { ModelRequest, ModelResponse, ModelSeam } from "@bombe/agent-sdk";

// ---------------------------------------------------------------------------
// Script types (the JSON shape in fixtures/model-scripts/<agent>/<claim>.json)
// ---------------------------------------------------------------------------

/**
 * A finalize action inside a model script step.
 * Mirrors FinalizeActionSchema in loop.ts.
 */
export interface ScriptFinalizeAction {
  finalize: {
    decision: "VALID" | "REJECTED" | "ABSTAIN";
    confidenceBps: number;
    rationaleSummary: string;
  };
}

/**
 * A tool-call action inside a model script step.
 * Mirrors ToolCallActionSchema in loop.ts.
 */
export interface ScriptToolAction {
  tool: string;
  input: Record<string, unknown>;
}

/** A single scripted step. */
export interface ScriptStep {
  thought: string;
  action: ScriptFinalizeAction | ScriptToolAction;
}

/**
 * ModelScript — the full schema for a model-script fixture file.
 *
 * agentId  — matches the agent that uses this script (informational).
 * claimId  — the claim this script drives (informational).
 * steps    — ordered list of proposals the seam will replay.
 */
export interface ModelScript {
  agentId: string;
  claimId: string;
  steps: ScriptStep[];
}

// ---------------------------------------------------------------------------
// ScriptedModelSeam
// ---------------------------------------------------------------------------

/**
 * Deterministic token counts used for every scripted step.
 * Fixed values ensure cost accounting is reproducible across runs.
 */
const SCRIPTED_TOKENS_IN = 120;
const SCRIPTED_TOKENS_OUT = 40;

/**
 * ScriptedModelSeam — implements ModelSeam by replaying a scripted sequence.
 *
 * Usage:
 *   const script = loadModelScript("reflector", "B") as ModelScript;
 *   const seam = new ScriptedModelSeam(script, "anthropic/claude-sonnet-4.6");
 *   const trace = await runLoop({ agentId, claim, temperament, deps: { model: seam, ... } });
 */
export class ScriptedModelSeam implements ModelSeam {
  private readonly steps: ScriptStep[];
  private readonly modelLabel: string;
  private cursor = 0;

  /**
   * @param script      — the parsed ModelScript fixture.
   * @param modelLabel  — the model identifier reported in ModelResponse.modelUsed.
   *                      Matches the live model label for the agent (e.g. "anthropic/claude-sonnet-4.6").
   */
  constructor(script: ModelScript, modelLabel: string) {
    // Defensive copy so external mutation of the script doesn't affect the seam.
    this.steps = script.steps.map((s) => ({ ...s }));
    this.modelLabel = modelLabel;
  }

  /**
   * complete() — returns the next scripted step as a ModelResponse.
   *
   * The loop calls this on every ReAct iteration. The response text is a
   * JSON-serialised StepProposal that loop.ts's parseProposal() will accept.
   *
   * When the script is exhausted (cursor >= steps.length), a safe ABSTAIN
   * finalize is returned so the loop can terminate cleanly rather than
   * entering an infinite spin or crashing.
   */
  async complete(_req: ModelRequest): Promise<ModelResponse> {
    if (this.cursor < this.steps.length) {
      const step = this.steps[this.cursor] as ScriptStep;
      this.cursor += 1;

      return {
        text: JSON.stringify({
          thought: step.thought,
          action: step.action,
        }),
        tokensIn: SCRIPTED_TOKENS_IN,
        tokensOut: SCRIPTED_TOKENS_OUT,
        modelUsed: this.modelLabel,
      };
    }

    // Script exhausted — return a safe ABSTAIN so the loop terminates.
    return {
      text: JSON.stringify({
        thought: "Script exhausted — no more steps.",
        action: {
          finalize: {
            decision: "ABSTAIN",
            confidenceBps: 0,
            rationaleSummary: "Script exhausted without a finalize step.",
          },
        },
      }),
      tokensIn: SCRIPTED_TOKENS_IN,
      tokensOut: SCRIPTED_TOKENS_OUT,
      modelUsed: this.modelLabel,
    };
  }

  /** How many steps remain in the script (for diagnostics). */
  get remaining(): number {
    return Math.max(0, this.steps.length - this.cursor);
  }

  /** Current cursor position (steps consumed so far). */
  get position(): number {
    return this.cursor;
  }
}
