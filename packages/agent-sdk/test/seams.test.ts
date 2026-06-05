/**
 * seams.test.ts — Unit tests for agent-sdk seams. (T-205 acceptance criteria)
 *
 * Tests:
 *  1. createSeams() in mock mode returns mock impls
 *  2. Mock seams are DETERMINISTIC (same seed → same sequence)
 *  3. Stub seams: StubModelSeam returns injected response
 *  4. Stub seams: StubWalletSeam can force a throw
 *  5. Config: getMode() defaults to "mock" when env unset
 *  6. Config: getMode() reads "live" when set
 *  7. Live-mode missing-var fail-fast: MissingEnvVarError thrown
 *
 * All env mutations are restored after each test.
 */

import type { Claim } from "@bombe/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissingEnvVarError, getConfig, getMode, getTestMode } from "../src/config.js";
import { createSeams } from "../src/seams/index.js";
import {
  MockBlobSeam,
  MockClockSeam,
  MockHumanQueueSeam,
  MockModelSeam,
  MockWalletSeam,
} from "../src/seams/mock.js";
import { StubModelSeam, StubWalletSeam } from "../src/seams/stub.js";
import type { ModelRequest, TxRequest } from "../src/seams/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_CLAIM: Claim = {
  id: "claim-test-001",
  tier: 1,
  asset: "mETH",
  claimType: "YIELD_BPS",
  payload: { expectedBps: 450 },
  submitter: "0xsubmitter",
  postedAt: 1735689600,
};

const SAMPLE_TX: TxRequest = {
  to: "0x1234567890123456789012345678901234567890",
  data: "0xdeadbeef",
  value: 0n,
};

const SAMPLE_MODEL_REQ: ModelRequest = {
  model: "meta/llama-3.3-70b",
  messages: [{ role: "user", content: "What is the yield?" }],
  maxTokens: 128,
};

// ---------------------------------------------------------------------------
// 1. createSeams() in mock mode
// ---------------------------------------------------------------------------

describe("createSeams() in mock mode", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "mock");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a complete Seams bag", () => {
    const seams = createSeams();
    expect(seams.model).toBeDefined();
    expect(seams.blob).toBeDefined();
    expect(seams.wallet).toBeDefined();
    expect(seams.clock).toBeDefined();
    expect(seams.humanQueue).toBeDefined();
  });

  it("returns MockModelSeam", () => {
    const seams = createSeams();
    expect(seams.model).toBeInstanceOf(MockModelSeam);
  });

  it("returns MockBlobSeam", () => {
    const seams = createSeams();
    expect(seams.blob).toBeInstanceOf(MockBlobSeam);
  });

  it("returns MockWalletSeam", () => {
    const seams = createSeams();
    expect(seams.wallet).toBeInstanceOf(MockWalletSeam);
  });

  it("returns MockClockSeam", () => {
    const seams = createSeams();
    expect(seams.clock).toBeInstanceOf(MockClockSeam);
  });

  it("returns MockHumanQueueSeam", () => {
    const seams = createSeams();
    expect(seams.humanQueue).toBeInstanceOf(MockHumanQueueSeam);
  });

  it("overrides replace the default mock seam", () => {
    const stubModel = new StubModelSeam({
      text: "stub",
      tokensIn: 1,
      tokensOut: 1,
      modelUsed: "stub-model",
    });
    const seams = createSeams({ model: stubModel });
    expect(seams.model).toBe(stubModel);
    // Other seams remain mock
    expect(seams.blob).toBeInstanceOf(MockBlobSeam);
  });
});

// ---------------------------------------------------------------------------
// 2. Determinism: mock seams with same seed produce same results
// ---------------------------------------------------------------------------

describe("MockClockSeam determinism", () => {
  it("same seed → same sequence (two instances)", () => {
    const a = new MockClockSeam(0);
    const b = new MockClockSeam(0);
    const seqA = [a.now(), a.now(), a.now()];
    const seqB = [b.now(), b.now(), b.now()];
    expect(seqA).toEqual(seqB);
  });

  it("advances monotonically", () => {
    const c = new MockClockSeam(0);
    const t1 = c.now();
    const t2 = c.now();
    const t3 = c.now();
    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);
  });

  it("different seeds → different start times", () => {
    const a = new MockClockSeam(0);
    const b = new MockClockSeam(5);
    expect(a.now()).not.toBe(b.now());
  });

  it("fixed epoch base is 2025-01-01T00:00:00Z", () => {
    const c = new MockClockSeam(0);
    expect(c.now()).toBe(MockClockSeam.EPOCH_MS);
  });
});

describe("MockBlobSeam determinism", () => {
  it("same key always returns same stable url", async () => {
    const b = new MockBlobSeam();
    const r1 = await b.put("trace/a/001", "content");
    const r2 = await b.put("trace/a/001", "content2"); // overwrite
    // url is deterministic on key, not content
    expect(r1.url).toBe("mock://trace/a/001");
    expect(r2.url).toBe("mock://trace/a/001");
  });

  it("different keys → different urls", async () => {
    const b = new MockBlobSeam();
    const r1 = await b.put("key-a", "x");
    const r2 = await b.put("key-b", "x");
    expect(r1.url).not.toBe(r2.url);
  });

  it("stores and retrieves body", async () => {
    const b = new MockBlobSeam();
    await b.put("test-key", "hello world");
    expect(b.get("test-key")).toBe("hello world");
  });
});

describe("MockWalletSeam determinism", () => {
  it("address() is stable across calls", () => {
    const w = new MockWalletSeam("seed-a");
    expect(w.address()).toBe(w.address());
  });

  it("same seed → same address", () => {
    const w1 = new MockWalletSeam("seed-x");
    const w2 = new MockWalletSeam("seed-x");
    expect(w1.address()).toBe(w2.address());
  });

  it("different seeds → different addresses", () => {
    const w1 = new MockWalletSeam("seed-1");
    const w2 = new MockWalletSeam("seed-2");
    expect(w1.address()).not.toBe(w2.address());
  });

  it("same tx → same receipt hash (deterministic)", async () => {
    const w1 = new MockWalletSeam();
    const w2 = new MockWalletSeam();
    const r1 = await w1.signAndSend(SAMPLE_TX);
    const r2 = await w2.signAndSend(SAMPLE_TX);
    expect(r1.txHash).toBe(r2.txHash);
    expect(r1.status).toBe("success");
  });

  it("different txs → different receipt hashes", async () => {
    const w = new MockWalletSeam();
    const r1 = await w.signAndSend(SAMPLE_TX);
    const r2 = await w.signAndSend({ ...SAMPLE_TX, data: "0xcafebabe" });
    expect(r1.txHash).not.toBe(r2.txHash);
  });

  it("address() starts with 0x", () => {
    const w = new MockWalletSeam();
    expect(w.address()).toMatch(/^0x[0-9a-f]{40}$/i);
  });
});

describe("MockModelSeam determinism", () => {
  it("returns a ModelResponse for any request", async () => {
    const m = new MockModelSeam();
    const resp = await m.complete(SAMPLE_MODEL_REQ);
    expect(resp.text).toBeDefined();
    expect(typeof resp.tokensIn).toBe("number");
    expect(typeof resp.tokensOut).toBe("number");
    expect(resp.modelUsed).toBe(SAMPLE_MODEL_REQ.model);
  });

  it("tokensIn is derived from message length (deterministic)", async () => {
    const m1 = new MockModelSeam();
    const m2 = new MockModelSeam();
    const r1 = await m1.complete(SAMPLE_MODEL_REQ);
    const r2 = await m2.complete(SAMPLE_MODEL_REQ);
    expect(r1.tokensIn).toBe(r2.tokensIn);
    expect(r1.tokensOut).toBe(r2.tokensOut);
  });
});

describe("MockHumanQueueSeam", () => {
  it("records onClaim calls", () => {
    const q = new MockHumanQueueSeam();
    q.onClaim(SAMPLE_CLAIM);
    q.onClaim({ ...SAMPLE_CLAIM, id: "claim-002" });
    expect(q.received).toHaveLength(2);
    expect(q.received[0]?.id).toBe("claim-test-001");
  });

  it("clear() empties the received list", () => {
    const q = new MockHumanQueueSeam();
    q.onClaim(SAMPLE_CLAIM);
    q.clear();
    expect(q.received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Stub seams: StubModelSeam
// ---------------------------------------------------------------------------

describe("StubModelSeam", () => {
  it("returns the injected fixed response", async () => {
    const fixed = {
      text: "injected response",
      tokensIn: 10,
      tokensOut: 5,
      modelUsed: "test-model",
    };
    const stub = new StubModelSeam(fixed);
    const resp = await stub.complete(SAMPLE_MODEL_REQ);
    expect(resp).toEqual(fixed);
  });

  it("calls the injected handler function", async () => {
    const stub = new StubModelSeam((req) => ({
      text: `echo:${req.messages[0]?.content ?? ""}`,
      tokensIn: 1,
      tokensOut: 1,
      modelUsed: req.model,
    }));
    const resp = await stub.complete(SAMPLE_MODEL_REQ);
    expect(resp.text).toBe("echo:What is the yield?");
  });

  it("consumes a queue of responses in order", async () => {
    const resp1 = { text: "first", tokensIn: 1, tokensOut: 1, modelUsed: "m" };
    const resp2 = { text: "second", tokensIn: 2, tokensOut: 2, modelUsed: "m" };
    const stub = new StubModelSeam([resp1, resp2]);
    const a = await stub.complete(SAMPLE_MODEL_REQ);
    const b = await stub.complete(SAMPLE_MODEL_REQ);
    expect(a.text).toBe("first");
    expect(b.text).toBe("second");
  });

  it("repeats last response when queue is exhausted", async () => {
    const resp = { text: "only", tokensIn: 1, tokensOut: 1, modelUsed: "m" };
    const stub = new StubModelSeam([resp]);
    const a = await stub.complete(SAMPLE_MODEL_REQ);
    const b = await stub.complete(SAMPLE_MODEL_REQ);
    expect(a.text).toBe("only");
    expect(b.text).toBe("only");
  });

  it("throws when handler throws (simulates 429)", async () => {
    const stub = new StubModelSeam(() => {
      throw new Error("HTTP 429 Too Many Requests");
    });
    await expect(stub.complete(SAMPLE_MODEL_REQ)).rejects.toThrow("HTTP 429");
  });

  it("queue: first entry throws, second returns response", async () => {
    const throwing: () => never = () => {
      throw new Error("HTTP 429");
    };
    const fallback = { text: "fallback", tokensIn: 1, tokensOut: 1, modelUsed: "fallback-model" };
    const stub = new StubModelSeam([throwing, fallback]);
    await expect(stub.complete(SAMPLE_MODEL_REQ)).rejects.toThrow("HTTP 429");
    const resp = await stub.complete(SAMPLE_MODEL_REQ);
    expect(resp.text).toBe("fallback");
  });
});

// ---------------------------------------------------------------------------
// 4. StubWalletSeam — force throw
// ---------------------------------------------------------------------------

describe("StubWalletSeam", () => {
  it("returns injected fixed receipt", async () => {
    const receipt = {
      txHash: "0xaaaa000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
      status: "success" as const,
    };
    const stub = new StubWalletSeam({ send: receipt });
    const r = await stub.signAndSend(SAMPLE_TX);
    expect(r).toEqual(receipt);
  });

  it("returns custom address", () => {
    const stub = new StubWalletSeam({ address: "0xcustom0000000000000000000000000000000001" });
    expect(stub.address()).toBe("0xcustom0000000000000000000000000000000001");
  });

  it("forces a throw (simulates revert)", async () => {
    const stub = new StubWalletSeam({
      send: () => {
        throw new Error("execution reverted: JudgmentTierRequiresAbstain");
      },
    });
    await expect(stub.signAndSend(SAMPLE_TX)).rejects.toThrow("JudgmentTierRequiresAbstain");
  });

  it("consumes a queue: first reverts, second succeeds", async () => {
    const revert: () => never = () => {
      throw new Error("reverted");
    };
    const success = {
      txHash: "0xbbbb000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
      status: "success" as const,
    };
    const stub = new StubWalletSeam({ send: [revert, success] });
    await expect(stub.signAndSend(SAMPLE_TX)).rejects.toThrow("reverted");
    const r = await stub.signAndSend(SAMPLE_TX);
    expect(r).toEqual(success);
  });
});

// ---------------------------------------------------------------------------
// 5 & 6. Config: getMode() / getTestMode() defaults and env reading
// ---------------------------------------------------------------------------

describe("getMode()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 'mock' when MODE is unset", () => {
    vi.stubEnv("MODE", "");
    expect(getMode()).toBe("mock");
  });

  it("returns 'mock' when MODE=mock", () => {
    vi.stubEnv("MODE", "mock");
    expect(getMode()).toBe("mock");
  });

  it("returns 'live' when MODE=live", () => {
    vi.stubEnv("MODE", "live");
    // Note: in live mode, getConfig() would throw MissingEnvVarError if called.
    // getMode() only reads MODE — it is safe to test without live vars.
    expect(getMode()).toBe("live");
  });

  it("coerces unknown values to 'mock'", () => {
    vi.stubEnv("MODE", "invalid");
    expect(getMode()).toBe("mock");
  });
});

describe("getTestMode()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 'mock' when TEST_MODE is unset", () => {
    vi.stubEnv("TEST_MODE", "");
    expect(getTestMode()).toBe("mock");
  });

  it("returns 'stub' when TEST_MODE=stub", () => {
    vi.stubEnv("TEST_MODE", "stub");
    expect(getTestMode()).toBe("stub");
  });

  it("returns 'mock' when TEST_MODE=mock", () => {
    vi.stubEnv("TEST_MODE", "mock");
    expect(getTestMode()).toBe("mock");
  });
});

// ---------------------------------------------------------------------------
// 7. Live-mode missing-var fail-fast: MissingEnvVarError
// ---------------------------------------------------------------------------

describe("live mode fail-fast via getConfig()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws MissingEnvVarError when MODE=live and RPC_URL is missing", () => {
    vi.stubEnv("MODE", "live");
    vi.stubEnv("RPC_URL", "");
    vi.stubEnv("DEPLOYER_KEY", "");
    vi.stubEnv("AI_GATEWAY_KEY", "");
    vi.stubEnv("BLOB_RW_TOKEN", "");

    expect(() => getConfig()).toThrow(MissingEnvVarError);
  });

  it("MissingEnvVarError carries the missing var name", () => {
    vi.stubEnv("MODE", "live");
    vi.stubEnv("RPC_URL", "");
    vi.stubEnv("DEPLOYER_KEY", "");
    vi.stubEnv("AI_GATEWAY_KEY", "");
    vi.stubEnv("BLOB_RW_TOKEN", "");

    let caught: unknown;
    try {
      getConfig();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MissingEnvVarError);
    // The first required live var checked is RPC_URL
    expect((caught as MissingEnvVarError).varName).toMatch(
      /RPC_URL|DEPLOYER_KEY|AI_GATEWAY_KEY|BLOB_RW_TOKEN/,
    );
  });

  it("MissingEnvVarError.name is 'MissingEnvVarError'", () => {
    vi.stubEnv("MODE", "live");
    vi.stubEnv("RPC_URL", "");
    vi.stubEnv("DEPLOYER_KEY", "");
    vi.stubEnv("AI_GATEWAY_KEY", "");
    vi.stubEnv("BLOB_RW_TOKEN", "");

    let caught: unknown;
    try {
      getConfig();
    } catch (e) {
      caught = e;
    }
    expect((caught as MissingEnvVarError).name).toBe("MissingEnvVarError");
  });

  it("does NOT throw when MODE=mock even if live vars are missing", () => {
    vi.stubEnv("MODE", "mock");
    vi.stubEnv("RPC_URL", "");
    vi.stubEnv("DEPLOYER_KEY", "");
    vi.stubEnv("AI_GATEWAY_KEY", "");
    vi.stubEnv("BLOB_RW_TOKEN", "");

    expect(() => getConfig()).not.toThrow();
    const config = getConfig();
    expect(config.rpcUrl).toBeUndefined();
    expect(config.aiGatewayKey).toBeUndefined();
  });

  it("succeeds in live mode when all required vars are set", () => {
    vi.stubEnv("MODE", "live");
    vi.stubEnv("RPC_URL", "https://rpc.mantle-sepolia.test");
    vi.stubEnv("DEPLOYER_KEY", "0xdeadbeef");
    vi.stubEnv("AI_GATEWAY_KEY", "gw-key-test");
    vi.stubEnv("BLOB_RW_TOKEN", "blob-token-test");

    const config = getConfig();
    expect(config.mode).toBe("live");
    expect(config.rpcUrl).toBe("https://rpc.mantle-sepolia.test");
    expect(config.aiGatewayKey).toBe("gw-key-test");
  });
});

// ---------------------------------------------------------------------------
// getConfig() defaults in mock mode
// ---------------------------------------------------------------------------

describe("getConfig() defaults in mock mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mode defaults to 'mock'", () => {
    vi.stubEnv("MODE", "");
    expect(getConfig().mode).toBe("mock");
  });

  it("maxCostUsdPerRun defaults to 0.05", () => {
    vi.stubEnv("MAX_COST_USD_PER_RUN", "");
    expect(getConfig().maxCostUsdPerRun).toBe(0.05);
  });

  it("fallbackModel defaults to 'meta/llama-3.3-70b'", () => {
    vi.stubEnv("FALLBACK_MODEL", "");
    expect(getConfig().fallbackModel).toBe("meta/llama-3.3-70b");
  });

  it("chainId defaults to 5003", () => {
    vi.stubEnv("CHAIN_ID", "");
    expect(getConfig().chainId).toBe(5003);
  });

  it("operatorKey defaults to 'dev-operator'", () => {
    vi.stubEnv("OPERATOR_KEY", "");
    expect(getConfig().operatorKey).toBe("dev-operator");
  });

  it("toolGatewayKey defaults to 'dev-gateway'", () => {
    vi.stubEnv("TOOL_GATEWAY_KEY", "");
    expect(getConfig().toolGatewayKey).toBe("dev-gateway");
  });

  it("reads custom MAX_COST_USD_PER_RUN", () => {
    vi.stubEnv("MAX_COST_USD_PER_RUN", "0.10");
    expect(getConfig().maxCostUsdPerRun).toBe(0.1);
  });
});
