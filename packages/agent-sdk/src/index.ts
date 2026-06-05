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

// Live skeletons (compile-only; real behavior in T-801/T-802)
export {
  LiveModelSeam,
  LiveBlobSeam,
  LiveWalletSeam,
  LiveClockSeam,
  LiveHumanQueueSeam,
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
