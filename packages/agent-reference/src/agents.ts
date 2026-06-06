/**
 * agents.ts — Reference agent configurations and runner helpers. (PRD §6.4, T-301/T-302/T-303)
 *
 * Defines the three SDK reference agents:
 *   Reflector — conservative (thresholdBps 8500, maxSteps 8, requiresTwoSources, abstainOnStale)
 *   Rotor     — aggressive  (thresholdBps 6500, maxSteps 8, no staleness abstain)
 *   Stator    — cost-opt    (thresholdBps 7000, maxSteps 6, shortest path)
 *
 * Each agent is an exported config object.
 * A shared runReferenceAgent() helper wires config → runLoop.
 *
 * TEMPERAMENT DUAL IMPLEMENTATION (PRD §6.4):
 *   Each agent's personality is captured in TWO layers:
 *     1. System prompt — STYLE: prose describing how the agent should reason.
 *        The loop builds its own system prompt internally, but we store a
 *        supplementary description here for documentation / tooling.
 *     2. SDK hard rules — GUARANTEES: thresholdBps/requiresTwoSources/abstainOnStale.
 *        These are enforced unconditionally by loop.ts regardless of model output.
 *   The system prompt influences the scripted model's self-narrated reasoning; the
 *   hard rules enforce the safety properties regardless of what the model says.
 */

import {
  CostBreaker,
  type LoopDeps,
  MockHistorySource,
  StubClockSeam,
  type Temperament,
  type Trace,
  runLoop,
} from "@bombe/agent-sdk";
import type { Claim } from "@bombe/shared";
import { loadModelCosts } from "@bombe/shared";
import type { ScriptedModelSeam } from "./scripted-model.js";

// ---------------------------------------------------------------------------
// ReferenceAgentConfig — exported shape for each agent
// ---------------------------------------------------------------------------

/**
 * ReferenceAgentConfig — everything needed to identify and instantiate a
 * reference agent run. Callers supply the model seam separately via LoopDeps.
 */
export interface ReferenceAgentConfig {
  /** Stable identifier used in traces and fixture paths. */
  agentId: string;
  /** Live model label (informational — used as ScriptedModelSeam's modelLabel). */
  model: string;
  /** Per-agent tuning knobs enforced by the SDK hard rules. */
  temperament: Temperament;
  /**
   * Short system-prompt style description.
   * This is the STYLE layer (PRD §6.4): a prose description for operators and
   * tooling. The SDK hard rules (temperament) are the GUARANTEE layer.
   */
  systemPrompt: string;
}

// ---------------------------------------------------------------------------
// Reflector — conservative (T-301)
// ---------------------------------------------------------------------------

/**
 * Reflector — conservative attestor. (PRD §6.4)
 *
 * Style: Requires two independent data sources before committing. Never
 * attests on a single stale feed alone. Prefers abstaining over a potentially
 * wrong VALID. Most appropriate for high-stakes, freshness-sensitive claims.
 *
 * Hard rules: thresholdBps=8500, maxSteps=8, requiresTwoSources=true,
 * abstainOnStale=true. SDK enforces STALE_SINGLE_SOURCE unconditionally.
 */
export const REFLECTOR_CONFIG: ReferenceAgentConfig = {
  agentId: "reflector",
  model: "anthropic/claude-sonnet-4.6",
  temperament: {
    thresholdBps: 8500,
    maxSteps: 8,
    requiresTwoSources: true,
    abstainOnStale: true,
  },
  systemPrompt:
    "You are Reflector, a conservative attestor. You require two independent data sources " +
    "before issuing VALID or REJECTED. Never commit on a single stale feed. If you have only " +
    "one source and it is stale, output a finalize with high confidence and let the SDK decide " +
    "whether to honour it — the hard rules will abstain if needed. " +
    "Use all available steps to gather corroborating evidence. Precision over speed.",
};

// ---------------------------------------------------------------------------
// Rotor — aggressive (T-302)
// ---------------------------------------------------------------------------

/**
 * Rotor — aggressive attestor. (PRD §6.4)
 *
 * Style: Commits whenever confidence exceeds the threshold. Does not require a
 * second source. Staleness alone is not enough to stop Rotor — it will attest
 * on a single stale feed if confidence is above 6500 bps. Fast and decisive.
 *
 * Hard rules: thresholdBps=6500, maxSteps=8, requiresTwoSources=false,
 * abstainOnStale=false. SDK never fires STALE_SINGLE_SOURCE for Rotor.
 *
 * STEP BUDGET NOTE (T-015): maxSteps raised 5→8. Real LLMs need headroom for
 * fetch → compute → finalize plus the occasional self-correction turn after a
 * tool-input fix; the old budget of 5 caused STEP_BUDGET ABSTAINs on claim A.
 */
export const ROTOR_CONFIG: ReferenceAgentConfig = {
  agentId: "rotor",
  model: "openai/gpt-5",
  temperament: {
    thresholdBps: 6500,
    maxSteps: 8,
    requiresTwoSources: false,
    abstainOnStale: false,
  },
  systemPrompt:
    "You are Rotor, an aggressive attestor. Commit once your confidence exceeds the threshold — " +
    "do not stall waiting for a second source. Staleness is a factor in confidence weighting " +
    "but never a reason to abstain on its own. Speed and decisiveness are rewarded. " +
    "Use the minimum steps necessary.",
};

// ---------------------------------------------------------------------------
// Stator — cost-optimised (T-303)
// ---------------------------------------------------------------------------

/**
 * Stator — cost-optimised attestor. (PRD §6.4)
 *
 * Style: Takes the shortest path to a decision. Abstains when tools disagree
 * or return conflicting evidence. Minimises tool calls. If the documents do not
 * match, produce REJECTED immediately. Does not re-check or seek corroboration.
 *
 * Hard rules: thresholdBps=7000, maxSteps=6, requiresTwoSources=false,
 * abstainOnStale=false. Short step budget enforces the cost-optimal constraint.
 *
 * STEP BUDGET NOTE (T-017): maxSteps raised 4→6. Stator stays the tightest
 * budget (cost-optimal identity preserved) but 4 was too tight for legitimate
 * multi-step claims (e.g. claim C reads two documents + compute + finalize),
 * causing STEP_BUDGET ABSTAINs; 6 leaves room to finalize the real work.
 */
export const STATOR_CONFIG: ReferenceAgentConfig = {
  agentId: "stator",
  model: "meta/llama-3.3-70b",
  temperament: {
    thresholdBps: 7000,
    maxSteps: 6,
    requiresTwoSources: false,
    abstainOnStale: false,
  },
  systemPrompt:
    "You are Stator, a cost-optimised attestor. Take the fewest steps possible. If a single " +
    "tool call gives sufficient evidence, finalise immediately. If tools return conflicting or " +
    "ambiguous results, abstain rather than spending more steps resolving the conflict. " +
    "Minimise token usage. Six steps maximum.",
};

// ---------------------------------------------------------------------------
// All three agents as an array (for iteration in tests / runner)
// ---------------------------------------------------------------------------

export const REFERENCE_AGENTS: ReferenceAgentConfig[] = [
  REFLECTOR_CONFIG,
  ROTOR_CONFIG,
  STATOR_CONFIG,
];

// ---------------------------------------------------------------------------
// runReferenceAgent — thin helper that wires config → runLoop
// ---------------------------------------------------------------------------

/**
 * Options for runReferenceAgent.
 *
 * model       — the ModelSeam to use (typically a ScriptedModelSeam in tests).
 * claim       — the claim to attest on.
 * config      — the agent's ReferenceAgentConfig.
 * fixturesRoot — optional override for fixture root path.
 * clockSeed   — optional seed for the StubClockSeam (default 0 = deterministic).
 */
export interface RunReferenceAgentOptions {
  model: ScriptedModelSeam;
  claim: Claim;
  config: ReferenceAgentConfig;
  fixturesRoot?: string;
  clockSeed?: number;
}

/**
 * runReferenceAgent — execute a reference agent loop with a scripted model.
 *
 * Wires the standard LoopDeps (StubClockSeam, CostBreaker, MockHistorySource)
 * and calls runLoop with the agent's temperament.
 *
 * Returns the full Trace (PRD §6.3). Always resolves — never throws.
 */
export async function runReferenceAgent(opts: RunReferenceAgentOptions): Promise<Trace> {
  const { model, claim, config, fixturesRoot, clockSeed = 0 } = opts;

  // Load model costs for cost-breaker (uses the fixtures/model-costs.json table).
  // Provide an empty fallback so tests can run without the fixture.
  let costs: Record<string, { inputPer1k: number; outputPer1k: number }> = {};
  try {
    costs = loadModelCosts(fixturesRoot);
  } catch {
    // Fixture not found or not yet loaded in test environment — use empty map.
    // CostBreaker treats unknown model cost as 0 (no crash, no cap).
    costs = {};
  }

  const clock = new StubClockSeam(
    // Build a long sequence of incrementing times so the clock never repeats.
    Array.from({ length: 200 }, (_, i) => 1_000_000 + clockSeed * 1000 + i * 10),
  );

  const deps: LoopDeps = {
    model,
    clock,
    costBreaker: new CostBreaker({ maxUsd: 0.05, costs }),
    history: new MockHistorySource({}),
    toolDeps: {
      clock,
      historySource: new MockHistorySource({}),
      fixturesRoot,
    },
  };

  return runLoop({
    agentId: config.agentId,
    claim,
    temperament: config.temperament,
    deps,
  });
}
