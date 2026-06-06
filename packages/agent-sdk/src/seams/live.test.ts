/**
 * packages/agent-sdk/src/seams/live.test.ts — Unit tests for live seams. (T-406, T-801)
 *
 * LiveWalletSeam tests (T-406):
 *   - Derives the correct address from a known private key.
 *   - Constructor throws on missing key or rpcUrl.
 *   (No network calls — viem client constructed but not used.)
 *
 * LiveModelSeam tests (T-801):
 *   - Success path: maps OpenAI-compatible response → ModelResponse.
 *   - 429 → ModelError with kind "rate_limit".
 *   - Abort/timeout → ModelError with kind "timeout".
 *   (All network calls are mocked via globalThis.fetch — no real HTTP.)
 */

import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelError } from "../model-router.js";
import { LiveModelSeam, LiveWalletSeam } from "./live.js";

/** Anvil dev key #0 — well-known deterministic test key. */
const DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

/** Expected checksummed address for DEPLOYER_KEY (viem-derived). */
const EXPECTED_ADDRESS = privateKeyToAccount(DEPLOYER_KEY).address;

describe("LiveWalletSeam (T-406)", () => {
  it("derives the correct checksummed address from a private key", () => {
    const seam = new LiveWalletSeam({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      deployerKey: DEPLOYER_KEY,
    });
    expect(seam.address()).toBe(EXPECTED_ADDRESS);
  });

  it("accepts a 0x-prefixed private key", () => {
    const seam = new LiveWalletSeam({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      deployerKey: DEPLOYER_KEY, // already 0x-prefixed
    });
    expect(seam.address()).toBe(EXPECTED_ADDRESS);
  });

  it("accepts a private key override via the privateKey field", () => {
    const seam = new LiveWalletSeam({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      deployerKey: undefined,
      privateKey: DEPLOYER_KEY,
    });
    expect(seam.address()).toBe(EXPECTED_ADDRESS);
  });

  it("throws if no private key is provided", () => {
    expect(
      () =>
        new LiveWalletSeam({
          rpcUrl: "http://127.0.0.1:8545",
          chainId: 31337,
          deployerKey: undefined,
        }),
    ).toThrow(/private key/i);
  });

  it("throws if rpcUrl is not provided", () => {
    expect(
      () =>
        new LiveWalletSeam({
          rpcUrl: undefined,
          chainId: 31337,
          deployerKey: DEPLOYER_KEY,
        }),
    ).toThrow(/rpcUrl/i);
  });

  it("works with Mantle Sepolia chain id (5003)", () => {
    const seam = new LiveWalletSeam({
      rpcUrl: "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      deployerKey: DEPLOYER_KEY,
    });
    expect(seam.address()).toBe(EXPECTED_ADDRESS);
  });

  it("works with Mantle mainnet chain id (5000)", () => {
    const seam = new LiveWalletSeam({
      rpcUrl: "https://rpc.mantle.xyz",
      chainId: 5000,
      deployerKey: DEPLOYER_KEY,
    });
    expect(seam.address()).toBe(EXPECTED_ADDRESS);
  });

  it("works with arbitrary chain id (anvil local 31337)", () => {
    const seam = new LiveWalletSeam({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      deployerKey: DEPLOYER_KEY,
    });
    expect(seam.address()).toBe(EXPECTED_ADDRESS);
  });
});

// ---------------------------------------------------------------------------
// LiveModelSeam unit tests (T-801) — fetch is mocked; no real network calls
// ---------------------------------------------------------------------------

/** Build a minimal LiveModelSeam for testing. */
function makeSeam(): LiveModelSeam {
  return new LiveModelSeam({
    baseUrl: "https://test.example.com/v1",
    apiKey: "test-key",
    modelName: "test-model",
    timeoutMs: 5_000,
  });
}

/** Build a minimal ModelRequest for testing. */
const TEST_REQUEST = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "hello" }],
  maxTokens: 256,
};

/** Build an OpenAI-compatible response body. */
function okResponseBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    model: "test-model",
  });
}

describe("LiveModelSeam (T-801)", () => {
  // Capture and restore globalThis.fetch around each test.
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("success path: maps OpenAI response → ModelResponse", async () => {
    const responseText =
      '{"thought":"ok","action":{"finalize":{"decision":"VALID","confidenceBps":9000,"rationaleSummary":"fine"}}}';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(okResponseBody(responseText)),
    } as Response);

    const seam = makeSeam();
    const resp = await seam.complete(TEST_REQUEST);

    expect(resp.text).toBe(responseText);
    expect(resp.tokensIn).toBe(10);
    expect(resp.tokensOut).toBe(5);
    expect(resp.modelUsed).toBe("test-model");
  });

  it("429 → ModelError with kind rate_limit", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Too Many Requests",
    } as Response);

    const seam = makeSeam();
    await expect(seam.complete(TEST_REQUEST)).rejects.toSatisfy(
      (err: unknown) => err instanceof ModelError && err.kind === "rate_limit",
    );
  });

  it("500 → ModelError with kind server", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const seam = makeSeam();
    await expect(seam.complete(TEST_REQUEST)).rejects.toSatisfy(
      (err: unknown) => err instanceof ModelError && err.kind === "server",
    );
  });

  it("AbortError (timeout) → ModelError with kind timeout", async () => {
    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    const seam = makeSeam();
    await expect(seam.complete(TEST_REQUEST)).rejects.toSatisfy(
      (err: unknown) => err instanceof ModelError && err.kind === "timeout",
    );
  });

  it("400 → ModelError with kind other (non-retryable)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    } as Response);

    const seam = makeSeam();
    await expect(seam.complete(TEST_REQUEST)).rejects.toSatisfy(
      (err: unknown) => err instanceof ModelError && err.kind === "other",
    );
  });

  it("sends Authorization header and correct body", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi
      .fn()
      .mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          json: async () => JSON.parse(okResponseBody("test")),
        } as Response);
      });

    const seam = makeSeam();
    await seam.complete(TEST_REQUEST);

    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(capturedInit?.body as string) as {
      model: string;
      max_tokens: number;
    };
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(256);
  });
});
