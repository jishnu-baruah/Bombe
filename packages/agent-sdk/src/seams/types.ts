/**
 * seams/types.ts — Seam interfaces and their concrete I/O shapes. (PRD §6.3)
 *
 * Every external dependency is hidden behind one of these interfaces.
 * Implementations are selected by MODE / TEST_MODE from config.ts.
 * No `any` anywhere in this file (TypeScript strict enforced by tsconfig).
 */

import type { Claim } from "@bombe/shared";

// ---------------------------------------------------------------------------
// Shared I/O shapes
// ---------------------------------------------------------------------------

/** A single message in a model conversation (OpenAI-compatible). */
export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Request to a language model. */
export interface ModelRequest {
  /** Model identifier string (e.g. "meta/llama-3.3-70b"). */
  model: string;
  /** Conversation messages for chat-completion style requests. */
  messages: ModelMessage[];
  /** Max tokens to generate. */
  maxTokens: number;
}

/** Response from a language model. */
export interface ModelResponse {
  /** The generated text content. */
  text: string;
  /** Prompt tokens consumed. */
  tokensIn: number;
  /** Completion tokens generated. */
  tokensOut: number;
  /** The model that actually produced the response (may differ after fallover). */
  modelUsed: string;
}

/** A raw transaction request (pre-signing). */
export interface TxRequest {
  /** Destination address (0x-prefixed). */
  to: `0x${string}`;
  /** ABI-encoded calldata (0x-prefixed). */
  data: `0x${string}`;
  /** Native value in wei (bigint). Default 0n if omitted. */
  value?: bigint;
}

/** Receipt returned after a transaction is mined. */
export interface TxReceipt {
  /** Transaction hash (0x-prefixed 32-byte hex). */
  txHash: `0x${string}`;
  /** "success" | "reverted" */
  status: "success" | "reverted";
}

// ---------------------------------------------------------------------------
// Seam interfaces (PRD §6.3)
// ---------------------------------------------------------------------------

/**
 * ModelSeam — wraps a language-model API.
 * Live: HTTP call to AI gateway.
 * Mock: deterministic scripted response.
 * Stub: programmable response for per-test injection.
 */
export interface ModelSeam {
  complete(req: ModelRequest): Promise<ModelResponse>;
}

/**
 * BlobSeam — wraps object/blob storage.
 * Live: HTTP PUT to a blob store using BLOB_RW_TOKEN.
 * Mock: in-memory Map, returns mock://<key> url.
 * Stub: programmable per-test.
 */
export interface BlobSeam {
  put(key: string, body: string): Promise<{ url: string }>;
}

/**
 * WalletSeam — wraps a signing wallet and tx submission.
 * Live: viem WalletClient connected to RPC_URL.
 * Mock: deterministic fake address + receipt hash (no network).
 * Stub: programmable per-test.
 */
export interface WalletSeam {
  address(): string;
  signAndSend(tx: TxRequest): Promise<TxReceipt>;
}

/**
 * ClockSeam — wraps wall-clock time.
 * Live: Date.now().
 * Mock: seeded counter, advances deterministically.
 * Stub: programmable per-test.
 */
export interface ClockSeam {
  /** Returns current time as a Unix timestamp in milliseconds. */
  now(): number;
}

/**
 * HumanQueueSeam — wraps the human attestor queue. (PRD §6.9)
 * Live/Mock: simulates human-queue latency and eventually calls attest().
 * Stub: records calls for assertion in tests.
 * Full behavior implemented in T-404.
 */
export interface HumanQueueSeam {
  onClaim(claim: Claim): void;
}

// ---------------------------------------------------------------------------
// Aggregate Seams bag
// ---------------------------------------------------------------------------

/** All seams bundled together, injected into agent runs. */
export interface Seams {
  model: ModelSeam;
  blob: BlobSeam;
  wallet: WalletSeam;
  clock: ClockSeam;
  humanQueue: HumanQueueSeam;
}
