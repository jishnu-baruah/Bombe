/**
 * seams/live.ts — Live seam implementations. (PRD §6.3, T-406)
 *
 * LiveWalletSeam is fully implemented here using viem:
 *   - address()      derives the checksummed address from the private key account
 *   - signAndSend()  sends a real transaction via viem WalletClient + returns the
 *                    real on-chain { txHash, status } from the mined receipt.
 *
 * Config comes exclusively from the SDK config module (PRD §15.4 guardrail —
 * no direct process.env reads in this file).
 *
 * LiveModelSeam and LiveBlobSeam are skeleton stubs (T-801 / T-802).
 * LiveClockSeam is fully implemented (Date.now()).
 * LiveHumanQueueSeam is a skeleton stub (T-404).
 */

import type { Claim } from "@bombe/shared";
import {
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle, mantleSepoliaTestnet } from "viem/chains";
import type { Config } from "../config.js";
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
// LiveModelSeam — skeleton (T-801)
// ---------------------------------------------------------------------------

/**
 * LiveModelSeam — skeleton for live AI-gateway model calls.
 * Implemented in T-801.
 */
export class LiveModelSeam implements ModelSeam {
  async complete(_req: ModelRequest): Promise<ModelResponse> {
    // live: implemented in T-801
    throw new Error("live ModelSeam not implemented (T-801)");
  }
}

// ---------------------------------------------------------------------------
// LiveBlobSeam — skeleton (T-802)
// ---------------------------------------------------------------------------

/**
 * LiveBlobSeam — skeleton for live blob storage.
 * Implemented in T-802.
 */
export class LiveBlobSeam implements BlobSeam {
  async put(_key: string, _body: string): Promise<{ url: string }> {
    // live: implemented in T-802
    throw new Error("live BlobSeam not implemented (T-802)");
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * chainFromId — map a chainId to a viem Chain object.
 *
 * Supports Mantle Sepolia (5003) and Mantle mainnet (5000).
 * For any other chainId (e.g. local anvil 31337) we fabricate a minimal Chain
 * descriptor so viem operates without requiring a chain registry entry.
 */
function chainFromId(chainId: number): Chain {
  if (chainId === 5003) return mantleSepoliaTestnet;
  if (chainId === 5000) return mantle;
  // Anvil / custom: minimal descriptor accepted by all viem operations.
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [] },
    },
  } satisfies Chain;
}

// ---------------------------------------------------------------------------
// LiveWalletSeam — fully implemented (T-406)
// ---------------------------------------------------------------------------

/**
 * LiveWalletSeam — live viem WalletClient.
 *
 * Derives a viem account from a 32-byte hex private key, creates a
 * WalletClient + PublicClient connected to rpcUrl, and submits real
 * transactions.  Used for BOTH local anvil and live Mantle Sepolia —
 * callers swap rpcUrl + deployerKey to change the target network.
 *
 * No direct process.env reads — all config injected via constructor
 * (PRD §15.4 guardrail).
 */
export class LiveWalletSeam implements WalletSeam {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly account: ReturnType<typeof privateKeyToAccount>;

  constructor(
    config: Pick<Config, "rpcUrl" | "chainId" | "deployerKey"> & {
      /** Override the private key (used by demo to supply per-agent keys). */
      privateKey?: string;
    },
  ) {
    const { rpcUrl, chainId, deployerKey } = config;
    // Allow an explicit privateKey override (for demo per-agent keys).
    const rawKey = config.privateKey ?? deployerKey;

    if (!rawKey) {
      throw new Error("LiveWalletSeam requires a private key (deployerKey or privateKey)");
    }
    if (!rpcUrl) {
      throw new Error("LiveWalletSeam requires rpcUrl (RPC_URL)");
    }

    // Ensure key is 0x-prefixed.
    const normalizedKey: `0x${string}` = rawKey.startsWith("0x")
      ? (rawKey as `0x${string}`)
      : (`0x${rawKey}` as `0x${string}`);

    const chain = chainFromId(chainId);
    const transport = http(rpcUrl);

    this.account = privateKeyToAccount(normalizedKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport,
    });
    this.publicClient = createPublicClient({
      chain,
      transport,
    });
  }

  address(): string {
    return this.account.address;
  }

  async signAndSend(tx: TxRequest): Promise<TxReceipt> {
    // Send the transaction and obtain the hash.
    const txHash = await this.walletClient.sendTransaction({
      account: this.account,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
      chain: this.walletClient.chain,
    });

    // Wait for the transaction to be mined.
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      txHash,
      status: receipt.status === "success" ? "success" : "reverted",
    };
  }
}

// ---------------------------------------------------------------------------
// LiveClockSeam — fully implemented
// ---------------------------------------------------------------------------

/**
 * LiveClockSeam — wraps Date.now(). No network calls.
 */
export class LiveClockSeam implements ClockSeam {
  now(): number {
    return Date.now();
  }
}

// ---------------------------------------------------------------------------
// LiveHumanQueueSeam — skeleton (T-404)
// ---------------------------------------------------------------------------

/**
 * LiveHumanQueueSeam — skeleton.
 * Implemented in T-404.
 */
export class LiveHumanQueueSeam implements HumanQueueSeam {
  onClaim(_claim: Claim): void {
    // live: implemented in T-404
    throw new Error("live HumanQueueSeam not implemented (T-404)");
  }
}
