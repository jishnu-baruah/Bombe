/**
 * seams/mock.ts — Deterministic mock seam implementations. (PRD §8)
 *
 * All mock seams are deterministic: given the same seed / inputs they always
 * produce the same outputs. No network calls, no randomness, no real I/O.
 * Used when MODE=mock (default).
 */

import { hashCanonical } from "@bombe/shared";
import type { Claim } from "@bombe/shared";
import type {
  BlobSeam,
  ClockSeam,
  HumanQueueSeam,
  ModelRequest,
  ModelResponse,
  ModelSeam,
  TxReceipt,
  TxRequest,
  WalletSeam,
} from "./types.js";

// ---------------------------------------------------------------------------
// MockClockSeam
// ---------------------------------------------------------------------------

/**
 * MockClockSeam — a seeded, deterministic clock.
 *
 * Starts at a fixed epoch (2025-01-01T00:00:00Z = 1735689600000 ms) and
 * advances by a fixed step (1000 ms) each call to now().
 * Two instances created with the same seed produce identical sequences.
 */
export class MockClockSeam implements ClockSeam {
  private tick: number;
  /** Fixed start: 2025-01-01T00:00:00.000Z */
  static readonly EPOCH_MS = 1_735_689_600_000;
  static readonly STEP_MS = 1_000;

  /**
   * @param seed — Numeric seed; determines starting offset.
   *               Same seed → same sequence. Default 0.
   */
  constructor(seed = 0) {
    this.tick = MockClockSeam.EPOCH_MS + seed * MockClockSeam.STEP_MS;
  }

  now(): number {
    const current = this.tick;
    this.tick += MockClockSeam.STEP_MS;
    return current;
  }
}

// ---------------------------------------------------------------------------
// MockBlobSeam
// ---------------------------------------------------------------------------

/**
 * MockBlobSeam — in-memory blob store.
 *
 * put() stores the body in a Map and returns a deterministic "mock://<key>" url.
 * The url is stable: same key always → same url regardless of call order.
 */
export class MockBlobSeam implements BlobSeam {
  private readonly store = new Map<string, string>();

  async put(key: string, body: string): Promise<{ url: string }> {
    this.store.set(key, body);
    return { url: `mock://${key}` };
  }

  /** Inspect stored content (for tests). */
  get(key: string): string | undefined {
    return this.store.get(key);
  }

  /** Clear all stored entries. */
  clear(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// MockWalletSeam
// ---------------------------------------------------------------------------

/**
 * A deterministic fake address seeded by an optional string seed.
 * Address format: 0x + 40 hex chars derived from seed hash.
 */
function deterministicAddress(seed = "mock-wallet"): `0x${string}` {
  // Derive 20 bytes from the hash of the seed string (first 40 hex chars after 0x).
  const hash = hashCanonical({ seed });
  // hash is "0x" + 64 hex chars; slice first 42 chars for an address-shaped string.
  return `0x${hash.slice(2, 42)}` as `0x${string}`;
}

/**
 * MockWalletSeam — deterministic fake wallet.
 *
 * address() returns a stable fake address derived from the seed.
 * signAndSend() returns a deterministic TxReceipt whose txHash is
 * keccak256(canonicalJson(tx)), status always "success".
 * No network calls.
 */
export class MockWalletSeam implements WalletSeam {
  private readonly addr: `0x${string}`;

  constructor(seed = "mock-wallet") {
    this.addr = deterministicAddress(seed);
  }

  address(): string {
    return this.addr;
  }

  async signAndSend(tx: TxRequest): Promise<TxReceipt> {
    // Deterministic hash: keccak256(canonicalJson(serializable tx)) using @bombe/shared.
    // BigInt (value) is serialized as a decimal string for JSON compatibility.
    const serializable = {
      to: tx.to,
      data: tx.data,
      value: tx.value !== undefined ? tx.value.toString() : "0",
    };
    const txHash = hashCanonical(serializable);
    return { txHash, status: "success" };
  }
}

// ---------------------------------------------------------------------------
// MockModelSeam
// ---------------------------------------------------------------------------

/** Canned ModelResponse returned by the mock for any request. */
const MOCK_MODEL_RESPONSE_TEXT =
  '{"thought":"mock thought","action":{"type":"finalize","decision":"ABSTAIN",' +
  '"confidenceBps":0,"rationaleSummary":"mock mode: scripted response"}}';

/**
 * MockModelSeam — deterministic scripted model stub.
 *
 * Returns a fixed canned ModelResponse for any request.
 * The response is deterministic: same request always yields the same response.
 *
 * NOTE: Full model-script replay (per agent / per claim) integrates in T-213.
 * This mock is intentionally minimal: it proves the seam interface works and
 * provides a deterministic baseline for tests that don't need script replay.
 *
 * tokensIn is derived deterministically from request message character count.
 * tokensOut is fixed at 64 (length of the canned response approximation).
 */
export class MockModelSeam implements ModelSeam {
  async complete(req: ModelRequest): Promise<ModelResponse> {
    const totalChars = req.messages.reduce((sum, m) => sum + m.content.length, 0);
    // Approximate token count: 4 chars ≈ 1 token (conservative estimate).
    const tokensIn = Math.ceil(totalChars / 4);
    return {
      text: MOCK_MODEL_RESPONSE_TEXT,
      tokensIn,
      tokensOut: 64,
      modelUsed: req.model,
    };
  }
}

// ---------------------------------------------------------------------------
// MockHumanQueueSeam
// ---------------------------------------------------------------------------

/**
 * MockHumanQueueSeam — records claims for inspection; no real queue logic.
 *
 * Full human-queue behavior (simulated latency, attest() submission) is
 * implemented in T-404. This mock is a no-op queue that records onClaim calls.
 */
export class MockHumanQueueSeam implements HumanQueueSeam {
  private readonly _received: Claim[] = [];

  onClaim(claim: Claim): void {
    this._received.push(claim);
  }

  /** Inspect received claims (for tests). */
  get received(): readonly Claim[] {
    return this._received;
  }

  /** Clear recorded claims. */
  clear(): void {
    this._received.length = 0;
  }
}
