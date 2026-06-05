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
