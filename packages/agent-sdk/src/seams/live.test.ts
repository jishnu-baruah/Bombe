/**
 * packages/agent-sdk/src/seams/live.test.ts — Unit tests for LiveWalletSeam. (T-406)
 *
 * Tests that:
 *   - LiveWalletSeam derives the correct address from a known private key.
 *   - LiveWalletSeam.address() matches the viem-derived checksum address.
 *   - Constructor throws on missing key or rpcUrl.
 *
 * These tests do NOT require a live anvil. The viem client is constructed but
 * no actual network calls are made.
 */

import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { LiveWalletSeam } from "./live.js";

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
