/**
 * packages/agent-reference/src/index.ts — Public barrel for @bombe/agent-reference.
 *
 * Exports the three reference agent configs, the shared runner helper,
 * and the ScriptedModelSeam for demo/test use.
 */

// Reference agent configurations (T-301 / T-302 / T-303)
export {
  REFLECTOR_CONFIG,
  ROTOR_CONFIG,
  STATOR_CONFIG,
  REFERENCE_AGENTS,
  runReferenceAgent,
} from "./agents.js";
export type { ReferenceAgentConfig, RunReferenceAgentOptions } from "./agents.js";

// ScriptedModelSeam — deterministic mock model replay (T-304)
export { ScriptedModelSeam } from "./scripted-model.js";
export type {
  ModelScript,
  ScriptStep,
  ScriptFinalizeAction,
  ScriptToolAction,
} from "./scripted-model.js";
