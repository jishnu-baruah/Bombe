import { z } from "zod";

export type ClaimTier = 1 | 2 | 3;

// Tier 1 DETERMINISTIC: truth derivable from on-chain state / oracle math.
//   Slashing: direct, automatic against ground truth at settlement.
// Tier 2 DOCUMENT: truth derivable from referenced fixture documents.
//   Slashing: only via dispute resolution (stake-weighted vote).
// Tier 3 JUDGMENT: valuation/opinion. Attestation FORBIDDEN.
//   SDK coerces to ABSTAIN; the contract rejects tier-3 non-ABSTAIN attestations.

export const ClaimSchema = z.object({
  id: z.string(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  // Open asset space: any non-empty symbol. The network attests any RWA yield with a
  // real source (the curated/verified set + the discovery universe); safety lives in the
  // deterministic reconciler + the verification gates, not in a fixed symbol list.
  asset: z.string().min(1),
  claimType: z.enum([
    "YIELD_BPS", // Tier 1
    "DISTRIBUTION_PAID", // Tier 1
    "CASHFLOW_MATCH", // Tier 2
    "ENCUMBRANCE_ABSENT", // Tier 2
    "FAIR_VALUE", // Tier 3 — abstain-only
  ]),
  payload: z.record(z.unknown()),
  submitter: z.string(),
  postedAt: z.number(),
});

export type Claim = z.infer<typeof ClaimSchema>;
export type ClaimType = Claim["claimType"];

/**
 * Pure function: derives the authoritative tier from a claimType.
 * Never trust a submitter-supplied tier — always call tierOf(). (PRD §6.1)
 */
const TIER_MAP: Record<ClaimType, ClaimTier> = {
  YIELD_BPS: 1,
  DISTRIBUTION_PAID: 1,
  CASHFLOW_MATCH: 2,
  ENCUMBRANCE_ABSENT: 2,
  FAIR_VALUE: 3,
};

export function tierOf(claimType: ClaimType): ClaimTier {
  const tier = TIER_MAP[claimType];
  // Exhaustiveness: TypeScript ensures every ClaimType is in the Record above.
  // If a new claimType is ever added without updating TIER_MAP, tsc will error.
  return tier;
}
