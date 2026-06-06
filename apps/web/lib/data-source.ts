/**
 * data-source.ts — Selector that routes data calls to mock or live source.
 *
 * MODE=live  → live-data.ts (reads deployed Mantle Sepolia contracts via viem)
 * MODE=mock  → demo-data.ts (reads fixtures/demo-data.json, no network)
 *
 * Both sources implement the SAME typed getter signatures.
 * Pages import from this module so they are agnostic to MODE.
 *
 * PRD §6.6 — wiring must not change component props.
 * T-J04 — live on-chain data layer.
 */

import { getRunMode } from "./server-config";

export type {
  AttestationRecord,
  ClaimId,
  Decision,
  LeaderboardRow,
  StoredTrace,
  TraceStep,
  TraceFinal,
  AgentId,
} from "./demo-data";

export { ALL_AGENT_IDS } from "./demo-data";

// ---------------------------------------------------------------------------
// Sync getters — available in both modes
// ---------------------------------------------------------------------------

import type { Claim } from "@bombe/shared";
import * as demoData from "./demo-data";
import type { AttestationRecord, LeaderboardRow, StoredTrace } from "./demo-data";

// ---------------------------------------------------------------------------
// getLeaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  if (getRunMode() === "live") {
    try {
      const { getLeaderboard: getLive } = await import("./live-data");
      return await getLive();
    } catch {
      return [];
    }
  }
  return demoData.getLeaderboard();
}

// ---------------------------------------------------------------------------
// getClaims
// ---------------------------------------------------------------------------

export async function getClaims(): Promise<Claim[]> {
  if (getRunMode() === "live") {
    try {
      const { getClaims: getLive } = await import("./live-data");
      return await getLive();
    } catch {
      return [];
    }
  }
  return demoData.getClaims();
}

// ---------------------------------------------------------------------------
// getClaim
// ---------------------------------------------------------------------------

export async function getClaim(id: string): Promise<Claim | undefined> {
  if (getRunMode() === "live") {
    try {
      const { getClaim: getLive } = await import("./live-data");
      return await getLive(id);
    } catch {
      return undefined;
    }
  }
  return demoData.getClaim(id);
}

// ---------------------------------------------------------------------------
// getAttestations
// ---------------------------------------------------------------------------

export async function getAttestations(claimId: string): Promise<AttestationRecord[]> {
  if (getRunMode() === "live") {
    try {
      const { getAttestations: getLive } = await import("./live-data");
      return await getLive(claimId);
    } catch {
      return [];
    }
  }
  return demoData.getAttestations(claimId);
}

// ---------------------------------------------------------------------------
// getTrace — returns undefined in live mode (served by /api/trace/... route)
// ---------------------------------------------------------------------------

export function getTrace(claimId: string, agentId: string): StoredTrace | undefined {
  if (getRunMode() === "live") {
    return undefined;
  }
  return demoData.getTrace(claimId, agentId);
}

// ---------------------------------------------------------------------------
// getPlugboardSkillHash
// ---------------------------------------------------------------------------

export function getPlugboardSkillHash(): `0x${string}` {
  if (getRunMode() === "live") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  return demoData.getPlugboardSkillHash();
}
