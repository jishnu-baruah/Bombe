export { ClaimSchema, tierOf } from "./taxonomy.js";
export type { Claim, ClaimTier, ClaimType } from "./taxonomy.js";

export {
  FixtureNotFound,
  OracleSnapshotSchema,
  DocumentFixtureSchema,
  HumanDecisionSchema,
  loadOracleSnapshot,
  loadDocument,
  loadModelScript,
  loadHumanDecision,
  loadModelCosts,
} from "./fixtures.js";
export type {
  OracleSnapshot,
  DocumentFixture,
  HumanDecision,
} from "./fixtures.js";

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

export { createEventBus } from "./event-bus.js";
export type {
  EventBus,
  BusEvent,
  ContractEvent,
  ContractClaimPostedEvent,
  ContractAttestedEvent,
} from "./event-bus.js";
