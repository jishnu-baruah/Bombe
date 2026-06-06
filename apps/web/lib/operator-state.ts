/**
 * operator-state.ts — in-memory mock state for the operator API.
 *
 * In mock mode all operator actions manipulate this module's state and return
 * deterministic acks. In live mode the real on-chain wiring replaces the body
 * of each handler; the response shapes (validated by Zod) remain identical.
 *
 * PRD §6.6 — operator API; §9 — operator-key gating.
 *
 * This module is server-only (imported only from API routes).
 * NO `any` anywhere.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClaimType =
  | "YIELD_BPS"
  | "DISTRIBUTION_PAID"
  | "CASHFLOW_MATCH"
  | "ENCUMBRANCE_ABSENT"
  | "FAIR_VALUE";

export type Decision = "VALID" | "REJECTED" | "ABSTAIN";

export interface RegisteredAgent {
  name: string;
  model: string;
  isHuman: boolean;
  bondWei: string;
  registeredAt: number;
  address: string;
}

export interface SeededClaim {
  claimId: string;
  claimType: ClaimType;
  asset: string;
  payload: Record<string, unknown>;
  seededAt: number;
}

export interface HumanAttestation {
  claimId: string;
  decision: Decision;
  confidenceBps: number;
  attestedAt: number;
}

export interface OperatorState {
  agents: RegisteredAgent[];
  seededClaims: SeededClaim[];
  humanAttestations: HumanAttestation[];
  /** Current demo claim index 0–3 (A=0, B=1, C=2, D=3). Wraps at 4. */
  demoIdx: number;
  plugboardFrozen: boolean;
}

// ---------------------------------------------------------------------------
// Singleton state (module-level, reset per process — deterministic in tests)
// ---------------------------------------------------------------------------

const state: OperatorState = {
  agents: [],
  seededClaims: [],
  humanAttestations: [],
  demoIdx: 0,
  plugboardFrozen: false,
};

// ---------------------------------------------------------------------------
// Getters / mutators (all synchronous — mock mode only)
// ---------------------------------------------------------------------------

export function getOperatorState(): Readonly<OperatorState> {
  return state;
}

/** Seed a claim — appends to seededClaims list. Returns a deterministic txHash mock. */
export function seedClaim(
  claimId: string,
  claimType: ClaimType,
  asset: string,
  payload: Record<string, unknown>,
): { claimId: string; txHash: string; seededAt: number } {
  const seededAt = Date.now();
  state.seededClaims.push({ claimId, claimType, asset, payload, seededAt });
  const txHash = `0xmock-seed-${claimId.toLowerCase()}-${seededAt}`;
  return { claimId, txHash, seededAt };
}

const DEMO_CLAIMS = ["A", "B", "C", "D"] as const;
type DemoClaimId = (typeof DEMO_CLAIMS)[number];

/** Advance the demo state machine to the next claim. */
export function advanceDemo(): { previousClaim: DemoClaimId; nextClaim: DemoClaimId | null } {
  const previousClaim = DEMO_CLAIMS[state.demoIdx] as DemoClaimId;
  const nextIdx = (state.demoIdx + 1) % DEMO_CLAIMS.length;
  const nextClaim = nextIdx < DEMO_CLAIMS.length ? (DEMO_CLAIMS[nextIdx] as DemoClaimId) : null;
  state.demoIdx = nextIdx;
  return { previousClaim, nextClaim };
}

/** Settle a claim — records a mock settlement ack. */
export function settleClaim(
  claimId: string,
  groundTruth: Decision,
): { claimId: string; groundTruth: Decision; txHash: string; settledAt: number } {
  const settledAt = Date.now();
  const txHash = `0xmock-settle-${claimId.toLowerCase()}-${settledAt}`;
  return { claimId, groundTruth, txHash, settledAt };
}

/** Register a new agent. Returns the agent with a deterministic mock address. */
export function registerAgent(
  name: string,
  model: string,
  isHuman: boolean,
  bondWei: string,
): RegisteredAgent {
  const registeredAt = Date.now();
  const address = `0xmock-agent-${name.toLowerCase().replace(/\s+/g, "-")}-${state.agents.length}`;
  const agent: RegisteredAgent = { name, model, isHuman, bondWei, registeredAt, address };
  state.agents.push(agent);
  return agent;
}

/** Record a human attestation. */
export function humanAttest(
  claimId: string,
  decision: Decision,
  confidenceBps: number,
): {
  claimId: string;
  decision: Decision;
  confidenceBps: number;
  txHash: string;
  attestedAt: number;
} {
  const attestedAt = Date.now();
  state.humanAttestations.push({ claimId, decision, confidenceBps, attestedAt });
  const txHash = `0xmock-human-attest-${claimId.toLowerCase()}-${attestedAt}`;
  return { claimId, decision, confidenceBps, txHash, attestedAt };
}

/** Freeze Plugboard — blocks further skill writes in mock. */
export function freezePlugboard(): { frozen: boolean; frozenAt: number; snapshotHash: string } {
  state.plugboardFrozen = true;
  const frozenAt = Date.now();
  const snapshotHash = `0xmock-skill-snapshot-${frozenAt}`;
  return { frozen: true, frozenAt, snapshotHash };
}

/** Unfreeze Plugboard — allows skill writes again in mock. */
export function unfreezePlugboard(): { frozen: boolean; unfrozenAt: number } {
  state.plugboardFrozen = false;
  const unfrozenAt = Date.now();
  return { frozen: false, unfrozenAt };
}

/** Reset state — used in tests only. */
export function resetOperatorState(): void {
  state.agents = [];
  state.seededClaims = [];
  state.humanAttestations = [];
  state.demoIdx = 0;
  state.plugboardFrozen = false;
}
