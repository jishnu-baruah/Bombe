/**
 * packages/agent-sdk/src/index.ts — Public barrel for @bombe/agent-sdk.
 *
 * Exports:
 *   - Config module (types + functions) — the ONLY process.env reader
 *   - Seam interfaces + I/O shapes
 *   - Seam factory (createSeams)
 *   - Mock implementations
 *   - Stub implementations
 *   - Live skeletons (compile-only until T-801/T-802)
 */

// Config module
export {
  getMode,
  getTestMode,
  getConfig,
  MissingEnvVarError,
} from "./config.js";
export type { Mode, TestMode, Config } from "./config.js";

// Seam interfaces and I/O shapes
export type {
  ModelMessage,
  ModelRequest,
  ModelResponse,
  TxRequest,
  TxReceipt,
  ModelSeam,
  BlobSeam,
  WalletSeam,
  ClockSeam,
  HumanQueueSeam,
  Seams,
} from "./seams/types.js";

// Seam factory
export { createSeams } from "./seams/index.js";

// Mock implementations (deterministic; used in MODE=mock)
export {
  MockModelSeam,
  MockBlobSeam,
  MockWalletSeam,
  MockClockSeam,
  MockHumanQueueSeam,
} from "./seams/mock.js";

// Stub implementations (programmable; used in tests / TEST_MODE=stub)
export {
  StubModelSeam,
  StubBlobSeam,
  StubWalletSeam,
  StubClockSeam,
  StubHumanQueueSeam,
} from "./seams/stub.js";
export type { ModelHandler, BlobPutHandler, WalletSendHandler } from "./seams/stub.js";

// Live seams (T-801/T-802)
export {
  LiveModelSeam,
  LiveBlobSeam,
  LiveWalletSeam,
  LiveClockSeam,
  LiveHumanQueueSeam,
  createLiveModelSeam,
} from "./seams/live.js";

// ModelRouter — resilience layer (PRD §6.3.1, T-206)
export { ModelError, ModelRouter, createModelRouter } from "./model-router.js";
export type { ModelSwitchRecord, ModelRouterOptions } from "./model-router.js";

// AbstainReason — shared union for all ABSTAIN paths (T-207/T-208/T-209)
export type { AbstainReason } from "./reasons.js";

// CostBreaker — cost circuit breaker (PRD §6.3.1, T-207)
export { CostBreaker } from "./cost-breaker.js";
export type { CostBreakerOptions } from "./cost-breaker.js";

// Tool error recovery (PRD §6.3.1, T-208)
export { runToolWithRecovery } from "./tool-recovery.js";
export type { ToolError, ToolErrorRow } from "./tool-recovery.js";

// Deterministic task router (PRD §6.3.2, T-209)
export { TOOL_MAP, allowedTools, isToolAllowed, refusalObservation } from "./router.js";
export type { ToolName } from "./router.js";

// Tool implementations (PRD §6.3, T-210/T-211/T-212)
export { TOOLS, getTool, ToolResultSchema, MockHistorySource } from "./tools/index.js";
export type {
  Tool,
  ToolResult,
  ToolDeps,
  HistorySource,
  PriorAttestation,
} from "./tools/index.js";

// ReAct loop with hard rules (PRD §6.3, T-213)
export { runLoop, TraceSchema } from "./loop.js";
export type {
  Trace,
  Temperament,
  LoopDeps,
  Action,
  StepProposal,
} from "./loop.js";

// Attestation builder (PRD §6.3, T-214)
export {
  buildAndSubmitAttestation,
  InMemoryAttestationRepository,
  PLACEHOLDER_ATTESTATION_ADDRESS,
} from "./attest.js";
export type {
  Source,
  AttestationPayload,
  AttestationRow,
  AttestationRepository,
} from "./attest.js";

// DataSource seam + deterministic reconciler (BOMBE-V2-PRD WS1, D11)
export {
  reconcileLegs,
  deterministicVerdict,
  decideTier1,
} from "./data/reconciler.js";
export type {
  Verdict,
  ReconcileResult,
  DecisionInputs,
  DecisionResult,
} from "./data/reconciler.js";
export { MockDataSource, StubDataSource } from "./data/mock-source.js";
export type {
  DataSource,
  DataAsset,
  SourceLeg,
  YieldObservation,
  YieldQuery,
  ClockLike,
  SourceDescriptor,
  AssetSpec,
  SourceScheme,
  SourceKind,
} from "./data/types.js";
export { LiveDataSource, POOL_IDS } from "./data/live-source.js";
export {
  FEATURED,
  FEATURED_BY_SYMBOL,
  FEATURED_SYMBOLS,
  SCHEME_FETCHERS,
  resolveSpec,
} from "./data/source-registry.js";
export { discoverAssets, categoryOf, RWA_CATEGORIES } from "./data/discover.js";
export type { DiscoverFilter, DiscoveredAsset, RwaCategory } from "./data/discover.js";
export {
  pipelineFor,
  runGates,
  freshnessGate,
  boundsGate,
  CATEGORY_GATES,
} from "./data/pipeline.js";
export type { Pipeline, GateResult, GateConfig, StepKind } from "./data/pipeline.js";
export {
  computeDocumentAttestation,
  fetchDocumentEvidence,
  crossCheckDocument,
  defaultFetchText,
} from "./data/document.js";
export type {
  DocumentRef,
  DocumentEvidence,
  DocumentExtraction,
  DocumentVerdict,
  DocumentClaimInput,
  DocumentResult,
  DocumentDeps,
} from "./data/document.js";
export {
  schemaDocument,
  CAPABILITY_REGISTRY,
  CLASS_TOLERANCES,
  GRADES,
  ABSTAIN_REASONS,
} from "./data/schema.js";
export type { ClaimTypeCapability, CapabilityStatus } from "./data/schema.js";
export {
  computeNavAttestation,
  crossCheckNav,
  defaultReadErc4626,
  SUPPORTED_NAV_CHAINS,
} from "./data/nav.js";
export type { NavRef, NavRead, NavDeps, NavClaimInput, NavVerdict, NavResult } from "./data/nav.js";
export { createDataSource } from "./data/factory.js";
export { computeDecisiveAttestation } from "./data/decisive-path.js";
export type { DecisiveClaimInput, DecisiveResult } from "./data/decisive-path.js";
export {
  decideRun,
  isSelfTestRun,
  streakTableHeader,
  streakRowMarkdown,
  streakJsonEntry,
} from "./data/scheduler.js";
export type { RunDecision, DedupeInputs, StreakRecord } from "./data/scheduler.js";
export { consensusEvidence, runConsensusDecisive } from "./data/consensus.js";
export type { ConsensusResult, ConsensusDecisiveResult } from "./data/consensus.js";
export {
  HttpDefiLlamaClient,
  DefiLlamaError,
  windowedAnnualizedYieldBps,
  DefiLlamaChartPointSchema,
} from "./data/defillama.js";
export type {
  DefiLlamaClient,
  DefiLlamaChartPoint,
  FetchLike,
  WindowedYield,
} from "./data/defillama.js";
