export { ClaimSchema, tierOf } from "./taxonomy.js";
export type { Claim, ClaimTier, ClaimType } from "./taxonomy.js";

export { canonicalJson, hashCanonical, reasoningHash, sourcesHash } from "./canonical.js";

export {
  FailureCategorySchema,
  TestReportSchema,
} from "./test-report.js";
export type { FailureCategory, TestReport } from "./test-report.js";

export {
  ClaimPostedEventSchema,
  AgentStepEventSchema,
  AgentDoneEventSchema,
  HumanQueueUpdateEventSchema,
  EpochSettledEventSchema,
  DisputeResolvedEventSchema,
  SseEventSchema,
} from "./events.js";
export type {
  ClaimPostedEvent,
  AgentStepEvent,
  AgentDoneEvent,
  HumanQueueUpdateEvent,
  EpochSettledEvent,
  DisputeResolvedEvent,
  SseEvent,
} from "./events.js";
