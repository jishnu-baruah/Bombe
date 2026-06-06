/**
 * seams/index.ts — Seam factory and Seams aggregate interface. (PRD §6.3)
 *
 * createSeams() selects implementations based on MODE / TEST_MODE from config.ts.
 * Overrides allow per-test injection (stub seams).
 *
 * Selection logic:
 *   MODE=mock (default) → mock seams
 *   MODE=live            → live seams
 *   overrides            → override individual seams regardless of mode
 *   TEST_MODE=stub       → callers are expected to pass overrides; mock is the fallback
 */

import { getConfig } from "../config.js";
import {
  LiveBlobSeam,
  LiveClockSeam,
  LiveHumanQueueSeam,
  LiveWalletSeam,
  createLiveModelSeam,
} from "./live.js";
import {
  MockBlobSeam,
  MockClockSeam,
  MockHumanQueueSeam,
  MockModelSeam,
  MockWalletSeam,
} from "./mock.js";
import type { BlobSeam, ClockSeam, HumanQueueSeam, ModelSeam, Seams, WalletSeam } from "./types.js";

export type { Seams } from "./types.js";

/**
 * createSeams — build the complete seam bag for an agent run.
 *
 * @param overrides — partial set of seams to inject; overrides any mode-selected impl.
 *                    Use in tests: pass StubModelSeam, StubWalletSeam, etc.
 */
export function createSeams(overrides?: Partial<Seams>): Seams {
  const config = getConfig();

  let model: ModelSeam;
  let blob: BlobSeam;
  let wallet: WalletSeam;
  let clock: ClockSeam;
  let humanQueue: HumanQueueSeam;

  if (config.mode === "live") {
    model = createLiveModelSeam(config);
    blob = new LiveBlobSeam();
    wallet = new LiveWalletSeam(config);
    clock = new LiveClockSeam();
    humanQueue = new LiveHumanQueueSeam();
  } else {
    // mock (default) — deterministic, no network
    model = new MockModelSeam();
    blob = new MockBlobSeam();
    wallet = new MockWalletSeam();
    clock = new MockClockSeam();
    humanQueue = new MockHumanQueueSeam();
  }

  return {
    model: overrides?.model ?? model,
    blob: overrides?.blob ?? blob,
    wallet: overrides?.wallet ?? wallet,
    clock: overrides?.clock ?? clock,
    humanQueue: overrides?.humanQueue ?? humanQueue,
  };
}
