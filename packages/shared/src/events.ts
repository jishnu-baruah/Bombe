import { z } from "zod";

// Reuse tier literals from taxonomy shape (1|2|3 without importing to avoid
// a circular dependency — this file defines SSE wire types independently).
const TierLiteral = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// Open asset space (any non-empty symbol); see taxonomy.ts.
const AssetEnum = z.string().min(1);

const ClaimTypeEnum = z.enum([
  "YIELD_BPS",
  "DISTRIBUTION_PAID",
  "CASHFLOW_MATCH",
  "ENCUMBRANCE_ABSENT",
  "FAIR_VALUE",
]);

const DecisionEnum = z.enum(["VALID", "REJECTED", "ABSTAIN"]);

// ---------------------------------------------------------------------------
// Individual event schemas
// ---------------------------------------------------------------------------

export const ClaimPostedEventSchema = z.object({
  kind: z.literal("CLAIM_POSTED"),
  claimId: z.string(),
  tier: TierLiteral,
  asset: AssetEnum,
  claimType: ClaimTypeEnum,
  payload: z.record(z.unknown()),
  postedAt: z.number(),
});

export const AgentStepEventSchema = z.object({
  kind: z.literal("AGENT_STEP"),
  claimId: z.string(),
  agentAddr: z.string(),
  step: z.number(),
  thought: z.string(),
  // action shape is deliberately loose — firms up in T-213
  action: z.unknown(),
  ts: z.number(),
});

export const AgentDoneEventSchema = z.object({
  kind: z.literal("AGENT_DONE"),
  claimId: z.string(),
  agentAddr: z.string(),
  isHuman: z.boolean(),
  decision: DecisionEnum,
  confidenceBps: z.number(),
  latencyMs: z.number(),
  costUsd: z.number(),
  reasoningHash: z.string(),
  blockedByProtocol: z.literal(true).optional(),
});

export const HumanQueueUpdateEventSchema = z.object({
  kind: z.literal("HUMAN_QUEUE_UPDATE"),
  claimId: z.string(),
  position: z.number(),
  estimatedWaitMin: z.number(),
});

export const EpochSettledEventSchema = z.object({
  kind: z.literal("EPOCH_SETTLED"),
  epoch: z.number(),
  highlights: z.array(z.string()),
});

export const DisputeResolvedEventSchema = z.object({
  kind: z.literal("DISPUTE_RESOLVED"),
  disputeId: z.string(),
  claimId: z.string(),
  accused: z.string(),
  verdict: z.string(),
  slashAmount: z.number(),
});

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export const SseEventSchema = z.discriminatedUnion("kind", [
  ClaimPostedEventSchema,
  AgentStepEventSchema,
  AgentDoneEventSchema,
  HumanQueueUpdateEventSchema,
  EpochSettledEventSchema,
  DisputeResolvedEventSchema,
]);

export type SseEvent = z.infer<typeof SseEventSchema>;

// ---------------------------------------------------------------------------
// Individual inferred types (convenience re-exports)
// ---------------------------------------------------------------------------

export type ClaimPostedEvent = z.infer<typeof ClaimPostedEventSchema>;
export type AgentStepEvent = z.infer<typeof AgentStepEventSchema>;
export type AgentDoneEvent = z.infer<typeof AgentDoneEventSchema>;
export type HumanQueueUpdateEvent = z.infer<typeof HumanQueueUpdateEventSchema>;
export type EpochSettledEvent = z.infer<typeof EpochSettledEventSchema>;
export type DisputeResolvedEvent = z.infer<typeof DisputeResolvedEventSchema>;
