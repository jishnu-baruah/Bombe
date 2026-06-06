/**
 * data/factory.ts — MODE-selected DataSource. (BOMBE-V2-PRD WS1)
 *
 * MODE=live  -> LiveDataSource (DefiLlama; on-chain leg added when samples exist)
 * otherwise  -> MockDataSource (fixtures; deterministic, no network)
 *
 * An explicit override wins regardless of mode (test injection), mirroring
 * createSeams().
 */

import { getMode } from "../config.js";
import { LiveDataSource } from "./live-source.js";
import { MockDataSource } from "./mock-source.js";
import type { DataSource } from "./types.js";

export function createDataSource(override?: DataSource): DataSource {
  if (override) return override;
  return getMode() === "live" ? new LiveDataSource() : new MockDataSource();
}
