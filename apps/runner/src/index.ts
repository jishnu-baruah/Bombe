/**
 * index.ts — Public barrel for @bombe/runner. (T-403, T-404)
 */

export { runClaim } from "./runner.js";
export type { RunnerDeps } from "./runner.js";

export {
  HumanQueue,
  DEMO_HUMAN_LATENCY_MIN_MS,
  DEMO_HUMAN_LATENCY_MAX_MS,
} from "./human-queue.js";
export type { HumanQueueDeps } from "./human-queue.js";
