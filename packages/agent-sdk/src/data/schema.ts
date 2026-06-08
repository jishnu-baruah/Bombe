/**
 * data/schema.ts — The published attestation schema. (docs/ATTESTATION-SCHEMA.md, D25.7)
 *
 * The ecosystem-standard artifact: a machine + human readable description of the intake
 * shape, the claim-type capability matrix, the per-class tolerances, and the grade /
 * ABSTAIN-reason definitions. Served at GET /api/v1/schema and MCP bombe_get_schema.
 *
 * Tamper-evidence (D25.7): `tolerancesHash` is the keccak of the canonical tolerances, so
 * the published bands cannot be silently widened to force a VALID without changing a hash
 * anyone can recompute and that is intended to be anchored on-chain / surfaced in traces.
 *
 * Honesty: `status` states what is actually attestable now (`live`) vs `planned` (built
 * post-2026-07-10, demand-gated). Contract-enforced abstain is claimed ONLY for the
 * hardcoded FAIR_VALUE guard until the on-chain claimTypeTier mapping ships (D25.3).
 */

import { hashCanonical } from "@bombe/shared";

export type CapabilityStatus = "live" | "planned";

/** One claim type's capability: what to submit, what we check, when we abstain. */
export interface ClaimTypeCapability {
  claimType: string;
  tier: 1 | 2 | 3;
  status: CapabilityStatus;
  /** Fields the issuer must provide. */
  requires: string[];
  /** What Bombe checks, independently. */
  checks: string;
  /** What the verdict + trace return. */
  returns: string;
  /** When the verdict is ABSTAIN. */
  abstainWhen: string;
  /** Applicable source schemes. */
  schemes: string[];
}

/** The capability matrix, exactly as locked in the spec (D25.1–D25.4). */
export const CAPABILITY_REGISTRY: ClaimTypeCapability[] = [
  {
    claimType: "YIELD_BPS",
    tier: 1,
    status: "live",
    requires: ["sources[>=1]", "assertion.value(bps)", "assertion.windowDays"],
    checks:
      "fetch each source, compute realized/reported yield, reconcile the legs, compare to the asserted value within tolerance",
    returns: "VALID/REJECTED + reconciled value + provenance trace + on-chain attestation",
    abstainWhen: "sources disagree, stale, or out of the category's plausible band",
    schemes: ["defillama", "mantle-meth-api", "onchain-rate", "custom-http"],
  },
  {
    claimType: "DOCUMENTED_NAV",
    tier: 2,
    status: "live",
    requires: ["document.url", "document.jsonPath|target", "assertion.value"],
    checks:
      "pin + hash the document, extract the figure with a citation (deterministic json-path, or a model whose quote must appear verbatim in the pinned bytes), then deterministically cross-check",
    returns: "VALID/REJECTED + docHash + cited quote + provenance",
    abstainWhen: "document unreadable or the figure is absent",
    schemes: ["document"],
  },
  {
    claimType: "CASHFLOW_MATCH",
    tier: 2,
    status: "live",
    requires: ["document.url", "document.target", "assertion.value"],
    checks: "same as DOCUMENTED_NAV over a cashflow/statement figure",
    returns: "VALID/REJECTED + docHash + cited quote",
    abstainWhen: "document unreadable or the figure is absent",
    schemes: ["document"],
  },
  {
    claimType: "NAV_PER_SHARE",
    tier: 1,
    status: "planned",
    requires: ["asset.contract(ERC-4626)", "assertion.value", "assertion.windowDays?"],
    checks:
      "read convertToAssets(1e18) on-chain at the latest block (current NAV); for realized yield, read at two blocks ~windowDays apart and annualize the delta (archive-gated)",
    returns: "VALID/REJECTED + NAV (+ realized yield)",
    abstainWhen: "contract not readable / not ERC-4626 / no archive RPC for the historical window",
    schemes: ["onchain-rate"],
  },
  {
    claimType: "PRICE",
    tier: 1,
    status: "planned",
    requires: ["two sources with different manipulation profiles", "assertion.value"],
    checks:
      "read both legs (e.g. an off-chain heartbeat oracle + an on-chain DEX TWAP), reconcile within the per-class tolerance",
    returns: "VALID/REJECTED + both read prices + sources",
    abstainWhen:
      "SOURCE_DISAGREEMENT / STALE_SOURCE / INSUFFICIENT_LIQUIDITY / fewer than two qualifying sources",
    schemes: ["oracle", "dex-twap"],
  },
  {
    claimType: "BACKING_RATIO",
    tier: 1,
    status: "planned",
    requires: ["a recognized third-party reserve attestor", "asset.contract"],
    checks: "reserves / (on-chain totalSupply x unit price) >= 1",
    returns: "VALID/REJECTED + ratio",
    abstainWhen:
      "reserves issuer-controlled or custom-http (graded-down or abstain, never a clean VALID)",
    schemes: ["reserve-attestor", "onchain-supply"],
  },
  {
    claimType: "DISTRIBUTION_PAID",
    tier: 1,
    status: "planned",
    requires: ["tx/event reference"],
    checks: "confirm the on-chain transfer/event occurred",
    returns: "VALID/REJECTED",
    abstainWhen: "no on-chain record found",
    schemes: ["onchain-event"],
  },
  {
    claimType: "RULE_ADHERENCE",
    tier: 2,
    status: "planned",
    requires: ["a DSL rule {trigger, action, withinBlocks}", "a trigger source"],
    checks:
      "over the window, find each time the trigger held on-chain and verify the action fired within the bound",
    returns: "VALID/REJECTED + matching/violating events (or partial-scan summary)",
    abstainWhen: "rule not DSL-expressible, history insufficient, or the pattern is ambiguous",
    schemes: ["onchain-event", "oracle", "dex-twap"],
  },
  {
    claimType: "ENCUMBRANCE_ABSENT",
    tier: 2,
    status: "planned",
    requires: ["a registry/document"],
    checks: "document/registry lookup",
    returns: "VALID/REJECTED",
    abstainWhen: "no checkable record",
    schemes: ["document"],
  },
  {
    claimType: "FAIR_VALUE",
    tier: 3,
    status: "live",
    requires: [],
    checks: "none, it is judgment",
    returns: "ABSTAIN (contract-enforced: the hardcoded FAIR_VALUE Tier-3 guard)",
    abstainWhen: "always",
    schemes: [],
  },
  {
    claimType: "APPRAISAL/RATING/STRATEGY_QUALITY",
    tier: 3,
    status: "planned",
    requires: [],
    checks: "none, it is judgment",
    returns: "ABSTAIN (contract enforcement pending the on-chain claimTypeTier mapping, D25.3)",
    abstainWhen: "always",
    schemes: [],
  },
];

/**
 * Per-class tolerances. Published + hashed so they are tamper-evident (D25.7). Bps for
 * yields; percent bands for prices; ratio floor for backing.
 */
export const CLASS_TOLERANCES = {
  yield: {
    reconcileBps: 50,
    verdictBps: 75,
    note: "max pairwise leg spread (reconcile) and max gap to the asserted value (verdict)",
  },
  price: {
    stockPct: 1.0,
    commodityPct: 1.5,
    pegBps: 200,
    note: "max divergence between the two PRICE legs and to the asserted value, per asset class",
  },
  backing: {
    minRatio: 1.0,
    tolerancePct: 0.5,
    note: "reserves/liabilities floor; below it minus tolerance is REJECTED",
  },
  navPerShare: {
    tolerancePct: 0.5,
    note: "max gap between the on-chain NAV and the asserted NAV",
  },
} as const;

/** Maturity/liquidity grade definitions (D24). A liquidity-risk signal, not an endorsement. */
export const GRADES = [
  { grade: "blue-chip", minTvlUsd: 1_000_000_000 },
  { grade: "established", minTvlUsd: 100_000_000 },
  { grade: "emerging", minTvlUsd: 10_000_000 },
  { grade: "long-tail", minTvlUsd: 0 },
  { grade: "single-oracle-echo", minTvlUsd: 0, note: "not independently cross-checked (D25.6)" },
] as const;

/** ABSTAIN reason codes the system emits, with their meaning. */
export const ABSTAIN_REASONS: Record<string, string> = {
  SOURCE_DISAGREEMENT: "the sources/legs diverge beyond the per-class tolerance",
  STALE_SOURCE: "a source is older than its allowed staleness / heartbeat",
  INSUFFICIENT_LIQUIDITY: "a DEX TWAP pool is too thin to trust",
  OUT_OF_BAND: "a value falls outside the category's plausible band",
  DOCUMENT_UNREADABLE: "the referenced document could not be fetched or parsed",
  FIGURE_ABSENT: "the target figure was not found in the document",
  RULE_NOT_FALSIFIABLE: "the rule is not expressible in the falsifiable DSL",
  NO_ARCHIVE: "an archive RPC is required for the historical window and is not provisioned",
  RESERVES_UNVERIFIABLE: "reserves are issuer-controlled / not from a recognized attestor",
  TIER3_JUDGMENT: "the claim is a valuation/opinion; judgment is never attested",
};

/** A short description of the intake shape (the full JSON example lives in the spec doc). */
export const INTAKE_SHAPE = {
  asset: "{ symbol, name?, chain?, contract?, assetClass? }",
  claimType: "one of CAPABILITY_REGISTRY[].claimType",
  assertion: "{ metric, value, unit, windowDays? }",
  sources:
    "SourceDescriptor[] — checkable evidence Bombe re-derives (counts/profiles per claimType)",
  document: "{ url, jsonPath|target } — Tier-2 document claims only",
  rule: "{ trigger, action, withinBlocks } — RULE_ADHERENCE only",
  payment: "{ txHash, payer } — non-custodial fee",
} as const;

/**
 * The full published schema document. `tolerancesHash` makes the bands tamper-evident: the
 * same hash is intended to appear in every reasoning trace, so a widened band changes a
 * value anyone can verify.
 */
export function schemaDocument() {
  return {
    version: "1.0",
    invariant:
      "The issuer gives a falsifiable claim and enough independently fetchable evidence for Bombe to recompute and cross-check it. No checkable evidence, or a judgment claim, means ABSTAIN.",
    intakeShape: INTAKE_SHAPE,
    claimTypes: CAPABILITY_REGISTRY,
    tolerances: CLASS_TOLERANCES,
    tolerancesHash: hashCanonical(CLASS_TOLERANCES),
    grades: GRADES,
    abstainReasons: ABSTAIN_REASONS,
    notes: [
      "status=live is attestable now; status=planned is post-2026-07-10, demand-gated (D25).",
      "Tier-1 verdicts are deterministic, never a model. Tier-2 verdicts are deterministic given evidence; document extraction is model-assisted and graded.",
      "Contract-enforced abstain is guaranteed only for the hardcoded FAIR_VALUE guard until the on-chain claimTypeTier mapping ships (D25.3).",
      "Single-oracle relays are out of scope by default and never counted in cross-checked coverage (D25.6).",
    ],
  };
}
