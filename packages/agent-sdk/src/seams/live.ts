/**
 * seams/live.ts — Live seam skeleton implementations. (PRD §6.3)
 *
 * These compile and typecheck but throw "not implemented" for live network methods.
 * Real network behavior is implemented in T-801 (ModelSeam), T-802 (Blob + Wallet).
 *
 * IMPORTANT: No process.env reads here — all config comes via getConfig() from
 * packages/agent-sdk/src/config.ts (the single env-reading module, PRD §15.4).
 */

import type { Claim } from "@bombe/shared";
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
// LiveModelSeam
// live: implemented in T-801
// ---------------------------------------------------------------------------

/**
 * LiveModelSeam — skeleton for live AI-gateway model calls.
 *
 * In T-801: will POST to AI_GATEWAY_KEY endpoint with model/messages/maxTokens,
 * parse response, and return ModelResponse.
 */
export class LiveModelSeam implements ModelSeam {
  async complete(_req: ModelRequest): Promise<ModelResponse> {
    // live: implemented in T-801
    throw new Error("live ModelSeam not implemented (T-801)");
  }
}

// ---------------------------------------------------------------------------
// LiveBlobSeam
// live: implemented in T-802
// ---------------------------------------------------------------------------

/**
 * LiveBlobSeam — skeleton for live blob storage (PUT to object store).
 *
 * In T-802: will use BLOB_RW_TOKEN to upload body to a blob store and
 * return the resulting public URL.
 */
export class LiveBlobSeam implements BlobSeam {
  async put(_key: string, _body: string): Promise<{ url: string }> {
    // live: implemented in T-802
    throw new Error("live BlobSeam not implemented (T-802)");
  }
}

// ---------------------------------------------------------------------------
// LiveWalletSeam
// live: implemented in T-802
// ---------------------------------------------------------------------------

/**
 * LiveWalletSeam — skeleton for live viem WalletClient.
 *
 * In T-802: will create a viem WalletClient from DEPLOYER_KEY (or AGENT_KEYS),
 * connected to RPC_URL on chainId 5003 (Mantle Sepolia).
 */
export class LiveWalletSeam implements WalletSeam {
  private readonly _address: `0x${string}`;

  // live: implemented in T-802
  constructor(_config: Pick<Config, "rpcUrl" | "chainId" | "deployerKey">) {
    // Placeholder: real address derived from deployerKey in T-802.
    this._address = "0x0000000000000000000000000000000000000001";
  }

  address(): string {
    // live: implemented in T-802 (derive from DEPLOYER_KEY)
    return this._address;
  }

  async signAndSend(_tx: TxRequest): Promise<TxReceipt> {
    // live: implemented in T-802
    throw new Error("live WalletSeam not implemented (T-802)");
  }
}

// ---------------------------------------------------------------------------
// LiveClockSeam
// live: wall clock — no external deps, fully implemented now
// ---------------------------------------------------------------------------

/**
 * LiveClockSeam — wraps Date.now().
 * No network calls; this is the only live seam that is complete in T-205.
 */
export class LiveClockSeam implements ClockSeam {
  now(): number {
    return Date.now();
  }
}

// ---------------------------------------------------------------------------
// LiveHumanQueueSeam
// live: implemented in T-404
// ---------------------------------------------------------------------------

/**
 * LiveHumanQueueSeam — skeleton for the live human attestor queue.
 *
 * In T-404: will simulate human-queue latency (random ms in configured range)
 * and submit human-decisions.json via the standard attest() path.
 */
export class LiveHumanQueueSeam implements HumanQueueSeam {
  onClaim(_claim: Claim): void {
    // live: implemented in T-404
    throw new Error("live HumanQueueSeam not implemented (T-404)");
  }
}
