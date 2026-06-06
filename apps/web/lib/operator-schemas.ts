/**
 * operator-schemas.ts — Zod schemas for all operator API request/response bodies.
 *
 * All endpoints use these schemas so live wiring won't change the response shape.
 * PRD §6.6 — Operator API.
 *
 * NO `any` anywhere.
 */

// ---------------------------------------------------------------------------
// Minimal Zod-like validation without importing zod
// (zod is not in the project deps; we implement pure-TS shape validation)
// ---------------------------------------------------------------------------

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export const CLAIM_TYPES = [
  "YIELD_BPS",
  "DISTRIBUTION_PAID",
  "CASHFLOW_MATCH",
  "ENCUMBRANCE_ABSENT",
  "FAIR_VALUE",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const DECISIONS = ["VALID", "REJECTED", "ABSTAIN"] as const;
export type Decision = (typeof DECISIONS)[number];

// ---------------------------------------------------------------------------
// seed-claim
// ---------------------------------------------------------------------------

export interface SeedClaimBody {
  claimId: string;
  claimType: ClaimType;
  asset: string;
  payload: Record<string, unknown>;
}

export interface SeedClaimAck {
  ok: true;
  claimId: string;
  txHash: string;
  seededAt: number;
}

export function parseSeedClaimBody(raw: unknown): ValidationResult<SeedClaimBody> {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, error: "body must be an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.claimId !== "string" || obj.claimId.length === 0) {
    return { success: false, error: "claimId must be a non-empty string" };
  }
  if (!CLAIM_TYPES.includes(obj.claimType as ClaimType)) {
    return { success: false, error: `claimType must be one of ${CLAIM_TYPES.join(", ")}` };
  }
  if (typeof obj.asset !== "string" || obj.asset.length === 0) {
    return { success: false, error: "asset must be a non-empty string" };
  }
  if (typeof obj.payload !== "object" || obj.payload === null || Array.isArray(obj.payload)) {
    return { success: false, error: "payload must be an object" };
  }
  return {
    success: true,
    data: {
      claimId: obj.claimId as string,
      claimType: obj.claimType as ClaimType,
      asset: obj.asset as string,
      payload: obj.payload as Record<string, unknown>,
    },
  };
}

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------

export interface AdvanceAck {
  ok: true;
  previousClaim: string;
  nextClaim: string | null;
}

// ---------------------------------------------------------------------------
// settle
// ---------------------------------------------------------------------------

export interface SettleBody {
  claimId: string;
  groundTruth: Decision;
}

export interface SettleAck {
  ok: true;
  claimId: string;
  groundTruth: Decision;
  txHash: string;
  settledAt: number;
}

export function parseSettleBody(raw: unknown): ValidationResult<SettleBody> {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, error: "body must be an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.claimId !== "string" || obj.claimId.length === 0) {
    return { success: false, error: "claimId must be a non-empty string" };
  }
  if (!DECISIONS.includes(obj.groundTruth as Decision)) {
    return { success: false, error: `groundTruth must be one of ${DECISIONS.join(", ")}` };
  }
  return {
    success: true,
    data: {
      claimId: obj.claimId as string,
      groundTruth: obj.groundTruth as Decision,
    },
  };
}

// ---------------------------------------------------------------------------
// register-agent
// ---------------------------------------------------------------------------

export interface RegisterAgentBody {
  name: string;
  model: string;
  isHuman: boolean;
  bondWei: string;
}

export interface RegisterAgentAck {
  ok: true;
  address: string;
  name: string;
  registeredAt: number;
}

export function parseRegisterAgentBody(raw: unknown): ValidationResult<RegisterAgentBody> {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, error: "body must be an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    return { success: false, error: "name must be a non-empty string" };
  }
  if (typeof obj.model !== "string" || obj.model.length === 0) {
    return { success: false, error: "model must be a non-empty string" };
  }
  if (typeof obj.isHuman !== "boolean") {
    return { success: false, error: "isHuman must be a boolean" };
  }
  if (typeof obj.bondWei !== "string" || obj.bondWei.length === 0) {
    return { success: false, error: "bondWei must be a non-empty string" };
  }
  return {
    success: true,
    data: {
      name: obj.name as string,
      model: obj.model as string,
      isHuman: obj.isHuman as boolean,
      bondWei: obj.bondWei as string,
    },
  };
}

// ---------------------------------------------------------------------------
// human-attest
// ---------------------------------------------------------------------------

export interface HumanAttestBody {
  claimId: string;
  decision: Decision;
  confidenceBps: number;
}

export interface HumanAttestAck {
  ok: true;
  claimId: string;
  decision: Decision;
  confidenceBps: number;
  txHash: string;
  attestedAt: number;
}

export function parseHumanAttestBody(raw: unknown): ValidationResult<HumanAttestBody> {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, error: "body must be an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.claimId !== "string" || obj.claimId.length === 0) {
    return { success: false, error: "claimId must be a non-empty string" };
  }
  if (!DECISIONS.includes(obj.decision as Decision)) {
    return { success: false, error: `decision must be one of ${DECISIONS.join(", ")}` };
  }
  const bps = obj.confidenceBps;
  if (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > 10000) {
    return { success: false, error: "confidenceBps must be an integer 0–10000" };
  }
  return {
    success: true,
    data: {
      claimId: obj.claimId as string,
      decision: obj.decision as Decision,
      confidenceBps: bps,
    },
  };
}

// ---------------------------------------------------------------------------
// freeze-plugboard / unfreeze-plugboard
// ---------------------------------------------------------------------------

export interface FreezePlugboardAck {
  ok: true;
  frozen: boolean;
  frozenAt: number;
  snapshotHash: string;
}

export interface UnfreezePlugboardAck {
  ok: true;
  frozen: boolean;
  unfrozenAt: number;
}
