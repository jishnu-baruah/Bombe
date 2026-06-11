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
 * LiveModelSeam is fully implemented (T-801): OpenAI-compatible chat-completions.
 * LiveBlobSeam is a skeleton stub (T-802).
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
import { ModelError } from "../model-router.js";
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
// LiveModelSeam — OpenAI-compatible chat-completions (T-801)
// ---------------------------------------------------------------------------

/** Default timeout for live model calls (30 seconds). */
const LIVE_MODEL_TIMEOUT_MS = 30_000;

/**
 * Raw shape of an OpenAI-compatible chat-completions response.
 * Only the fields we actually consume are typed.
 */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content?: string | null;
      // Reasoning models (e.g. gpt-oss via Ollama) put their output in a reasoning
      // channel; if `content` is empty we must read this or we silently drop the reply.
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  model: string;
}

/**
 * LiveModelSeam — live AI-gateway model calls via OpenAI-compatible
 * chat-completions endpoint. (PRD §6.3, T-801)
 *
 * Config (baseUrl, key, model) comes from the SDK config module — no direct
 * process.env reads here (PRD §15.4 guardrail).
 *
 * Error mapping:
 *   429         → ModelError("rate_limit")    — failover-worthy
 *   500–599     → ModelError("server")        — failover-worthy
 *   fetch abort → ModelError("timeout")       — failover-worthy
 *   400/other   → ModelError("other")         — not failover-worthy
 */
export class LiveModelSeam implements ModelSeam {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  /**
   * Default temperature for all requests made by this seam instance.
   * Can be overridden per-request via ModelRequest.temperature.
   * Lower values (0.1–0.2) produce more deterministic JSON tool-calling output.
   */
  private readonly defaultTemperature: number | undefined;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    modelName: string;
    timeoutMs?: number;
    /** Default temperature for all requests. Set 0.1–0.2 for steady structured output. */
    temperature?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.modelName = config.modelName;
    this.timeoutMs = config.timeoutMs ?? LIVE_MODEL_TIMEOUT_MS;
    this.defaultTemperature = config.temperature;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // Resolve temperature: per-request overrides instance default.
    const temperature = req.temperature ?? this.defaultTemperature;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: req.messages,
          max_tokens: req.maxTokens,
          ...(temperature !== undefined ? { temperature } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // AbortController fires a DOMException with name "AbortError".
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
      if (isAbort) {
        throw new ModelError(
          `Live model call timed out after ${this.timeoutMs.toString()}ms`,
          undefined,
          "timeout",
        );
      }
      throw new ModelError(
        `Live model fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        "other",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new ModelError(`Rate limited (429): ${body}`, 429, "rate_limit");
      }
      if (res.status >= 500 && res.status <= 599) {
        throw new ModelError(
          `Server error (${res.status.toString()}): ${body}`,
          res.status,
          "server",
        );
      }
      // Non-retryable (400, etc.)
      throw new ModelError(
        `Live model request failed (${res.status.toString()}): ${body}`,
        res.status,
        "other",
      );
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data.choices[0];
    if (choice === undefined) {
      throw new ModelError("Live model returned no choices", undefined, "other");
    }

    // Prefer the final answer (content); fall back to the reasoning channel so a
    // reasoning model's output is never silently dropped (gpt-oss returns empty content).
    const msg = choice.message;
    const text = msg.content || msg.reasoning || msg.reasoning_content || "";
    return {
      text,
      tokensIn: data.usage.prompt_tokens,
      tokensOut: data.usage.completion_tokens,
      modelUsed: data.model ?? this.modelName,
    };
  }
}

/**
 * createLiveModelSeam — build a LiveModelSeam from the SDK Config.
 *
 * Reads AI_GATEWAY_BASE_URL, AI_GATEWAY_KEY, AI_GATEWAY_MODELS from config.
 * Called by createSeams() when MODE=live.
 */
export function createLiveModelSeam(
  config: Pick<Config, "aiGatewayKey"> & {
    aiGatewayBaseUrl?: string;
    aiGatewayModels?: string;
  },
): LiveModelSeam {
  const baseUrl = config.aiGatewayBaseUrl ?? "https://ollama.com/v1";
  const apiKey = config.aiGatewayKey ?? "";
  // First model in the comma-separated list, or the default.
  const rawModels = config.aiGatewayModels ?? "";
  const modelName = rawModels.split(",")[0]?.trim() || "gpt-oss:20b";
  return new LiveModelSeam({ baseUrl, apiKey, modelName });
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
