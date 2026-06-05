/**
 * seams/stub.ts — Programmable stub seam implementations for unit tests.
 *
 * Stubs take injected behavior via constructor so tests can:
 *   - Return specific responses
 *   - Queue multiple responses to be consumed in order
 *   - Force throws to simulate errors (429s, timeouts, reverts, etc.)
 *
 * Used when TEST_MODE=stub or when tests directly instantiate stubs.
 * Used heavily in T-206 (ModelRouter failover), T-207 (cost circuit breaker),
 * T-208 (tool error recovery).
 */

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
// StubModelSeam
// ---------------------------------------------------------------------------

/** Handler function type for StubModelSeam. */
export type ModelHandler = (req: ModelRequest) => ModelResponse | Promise<ModelResponse>;

/**
 * StubModelSeam — programmable model seam for unit tests.
 *
 * Accepts one of:
 *   - A single handler function: called for every request.
 *   - A queue of responses/handlers: consumed in order (last is repeated when exhausted).
 *   - A fixed ModelResponse: returned for every request.
 *
 * To simulate a 429: pass a handler that throws `new Error("HTTP 429")`.
 */
export class StubModelSeam implements ModelSeam {
  private readonly queue: ModelHandler[];

  constructor(behaviorOrQueue: ModelHandler | ModelResponse | Array<ModelHandler | ModelResponse>) {
    const toHandler = (b: ModelHandler | ModelResponse): ModelHandler =>
      typeof b === "function" ? b : () => b;

    if (Array.isArray(behaviorOrQueue)) {
      this.queue = behaviorOrQueue.map(toHandler);
    } else {
      this.queue = [toHandler(behaviorOrQueue)];
    }
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    // Consume first handler; if queue runs out, keep using the last one.
    const handler =
      this.queue.length > 1
        ? (this.queue.shift() as ModelHandler)
        : (this.queue[0] as ModelHandler);
    return handler(req);
  }
}

// ---------------------------------------------------------------------------
// StubBlobSeam
// ---------------------------------------------------------------------------

export type BlobPutHandler = (
  key: string,
  body: string,
) => { url: string } | Promise<{ url: string }>;

/**
 * StubBlobSeam — programmable blob seam for unit tests.
 *
 * Default behavior mirrors MockBlobSeam (in-memory map + mock:// url).
 * Pass a custom handler to simulate errors, custom urls, etc.
 */
export class StubBlobSeam implements BlobSeam {
  private readonly handler: BlobPutHandler;
  private readonly store = new Map<string, string>();

  constructor(handler?: BlobPutHandler) {
    this.handler =
      handler ??
      ((key, body) => {
        this.store.set(key, body);
        return { url: `stub://${key}` };
      });
  }

  async put(key: string, body: string): Promise<{ url: string }> {
    return this.handler(key, body);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }
}

// ---------------------------------------------------------------------------
// StubWalletSeam
// ---------------------------------------------------------------------------

export type WalletSendHandler = (tx: TxRequest) => TxReceipt | Promise<TxReceipt>;

/**
 * StubWalletSeam — programmable wallet seam for unit tests.
 *
 * Set a fixed address and either:
 *   - A fixed TxReceipt returned for every signAndSend call.
 *   - A queue of receipts consumed in order.
 *   - A handler function that can throw to simulate reverts / failures.
 */
export class StubWalletSeam implements WalletSeam {
  private readonly _address: string;
  private readonly handlers: WalletSendHandler[];

  constructor(
    opts: {
      address?: string;
      send?: WalletSendHandler | TxReceipt | Array<WalletSendHandler | TxReceipt>;
    } = {},
  ) {
    this._address = opts.address ?? "0xstub0000000000000000000000000000000000001";
    const toHandler = (b: WalletSendHandler | TxReceipt): WalletSendHandler =>
      typeof b === "function" ? b : () => b;

    if (opts.send === undefined) {
      this.handlers = [
        () => ({
          txHash:
            "0xstub0000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
          status: "success" as const,
        }),
      ];
    } else if (Array.isArray(opts.send)) {
      this.handlers = opts.send.map(toHandler);
    } else {
      this.handlers = [toHandler(opts.send)];
    }
  }

  address(): string {
    return this._address;
  }

  async signAndSend(tx: TxRequest): Promise<TxReceipt> {
    const handler =
      this.handlers.length > 1
        ? (this.handlers.shift() as WalletSendHandler)
        : (this.handlers[0] as WalletSendHandler);
    return handler(tx);
  }
}

// ---------------------------------------------------------------------------
// StubClockSeam
// ---------------------------------------------------------------------------

/**
 * StubClockSeam — programmable clock for unit tests.
 *
 * Returns a fixed or incrementing timestamp.
 * Set `times` to a queue of values; when exhausted, the last value repeats.
 */
export class StubClockSeam implements ClockSeam {
  private times: number[];

  constructor(times: number | number[] = 0) {
    this.times = Array.isArray(times) ? [...times] : [times];
  }

  now(): number {
    if (this.times.length > 1) {
      return this.times.shift() as number;
    }
    return this.times[0] as number;
  }

  /** Advance the current time by delta ms (mutates last entry). */
  advance(deltaMs: number): void {
    const last = this.times[this.times.length - 1] as number;
    this.times[this.times.length - 1] = last + deltaMs;
  }
}

// ---------------------------------------------------------------------------
// StubHumanQueueSeam
// ---------------------------------------------------------------------------

/**
 * StubHumanQueueSeam — programmable human-queue seam for unit tests.
 *
 * Records onClaim calls; optionally calls a provided handler.
 */
export class StubHumanQueueSeam implements HumanQueueSeam {
  private readonly _received: Claim[] = [];
  private readonly handler: ((claim: Claim) => void) | undefined;

  constructor(handler?: (claim: Claim) => void) {
    this.handler = handler;
  }

  onClaim(claim: Claim): void {
    this._received.push(claim);
    this.handler?.(claim);
  }

  get received(): readonly Claim[] {
    return this._received;
  }

  clear(): void {
    this._received.length = 0;
  }
}
