/**
 * generate-hashes.ts — Computes traceHash values for all plugboard transcripts.
 *
 * GUARDRAIL (PRD §15.4): traceHash values MUST NOT be hand-edited.
 * Run this script to regenerate them after updating the `steps` arrays.
 *
 * Usage:
 *   node --import tsx/esm packages/plugboard/src/generate-hashes.ts
 *
 * The script computes hashCanonical(steps) for each transcript and prints
 * the results to stdout. The test suite asserts these values match the
 * stored hashes in the JSON fixtures.
 */

import { hashCanonical } from "@bombe/shared";

// ---------------------------------------------------------------------------
// Transcript step arrays (source of truth — JSON fixtures are derived from these)
// ---------------------------------------------------------------------------

// Claim A: mETH YIELD_BPS — VALID (fresh oracle, within tolerance)
const stepsA = [
  {
    step: 1,
    thought: "Claim A: mETH 30-day yield 34bps. Fetching primary oracle snapshot.",
    action: { tool: "fetch_meth_yield", input: { period: "30d-fresh" } },
    observation: {
      value: 34,
      stale: false,
      source: "fixture:oracles/meth.json",
      fetchedAt: 1748736000,
      confidence: 9500,
    },
  },
  {
    step: 2,
    thought:
      "Primary source confirms 34 bps, fresh. Fetching Chainlink as secondary corroboration.",
    action: {
      tool: "fetch_chainlink_price",
      input: { asset: "mETH", period: "30d-fresh" },
    },
    observation: {
      value: 34,
      stale: false,
      source: "fixture:oracles/chainlink-meth.json",
      fetchedAt: 1748736000,
      confidence: 9000,
    },
  },
  {
    step: 3,
    thought: "Two fresh independent sources confirm 34 bps. Finalizing VALID.",
    action: {
      finalize: {
        decision: "VALID",
        confidenceBps: 9200,
        rationaleSummary:
          "Two independent fresh oracle sources confirm mETH 30-day yield is 34 bps, matching expected value within ±2 bps tolerance.",
      },
    },
  },
];

// Claim B: mETH YIELD_BPS — stale feed, single source → ABSTAIN
const stepsB = [
  {
    step: 1,
    thought: "Claim B: mETH 30-day yield 34bps. Fetching oracle — expecting possible staleness.",
    action: { tool: "fetch_meth_yield", input: { period: "30d-stale" } },
    observation: {
      value: 34,
      stale: true,
      source: "fixture:oracles/meth-stale.json",
      fetchedAt: 1748649600,
      confidence: 2000,
    },
  },
  {
    step: 2,
    thought:
      "Primary source is stale with low confidence. Only one source available. Cannot attest with a stale single source.",
    action: {
      finalize: {
        decision: "ABSTAIN",
        confidenceBps: 0,
        rationaleSummary:
          "mETH yield oracle is stale (>24h) and no secondary source is available. Abstaining per staleness rule.",
      },
    },
  },
];

// Claim C: PC-POOL-1 CASHFLOW_MATCH — document mismatch → REJECTED
const stepsC = [
  {
    step: 1,
    thought: "Claim C: PC-POOL-1 cashflow match. Reading servicer report.",
    action: {
      tool: "read_document",
      input: { docRef: "pc-pool-1-servicer", version: "v1" },
    },
    observation: {
      docRef: "pc-pool-1-servicer",
      cashflowTotal: 50000,
      currency: "USD",
      source: "fixture:documents/v1/pc-pool-1-servicer.json",
      fetchedAt: 1748736000,
    },
  },
  {
    step: 2,
    thought: "Servicer report shows cashflowTotal 50,000 USD. Now reading bank statement.",
    action: {
      tool: "read_document",
      input: { docRef: "pc-pool-1-statement", version: "v1" },
    },
    observation: {
      docRef: "pc-pool-1-statement",
      lineItemsTotal: 45000,
      currency: "USD",
      source: "fixture:documents/v1/pc-pool-1-statement.json",
      fetchedAt: 1748736000,
    },
  },
  {
    step: 3,
    thought:
      "Statement lineItemsTotal is 45,000 vs servicer 50,000 — delta 5,000. Verifying computation.",
    action: {
      tool: "compute_expected",
      input: { observedBps: 45000, expectedBps: 50000 },
    },
    observation: {
      withinTolerance: false,
      delta: 5000,
      toleranceBps: 2,
    },
  },
  {
    step: 4,
    thought:
      "5,000 USD mismatch confirmed. Servicer report and bank statement diverge. Cashflow match claim is false.",
    action: {
      finalize: {
        decision: "REJECTED",
        confidenceBps: 9500,
        rationaleSummary:
          "Servicer report (50,000 USD) and bank statement line-items (45,000 USD) differ by 5,000 USD — outside any reasonable tolerance. CASHFLOW_MATCH claim REJECTED. Both documents hashed and cited.",
      },
    },
  },
];

// Claim D: PC-POOL-1 FAIR_VALUE — Tier 3 → contract revert → ABSTAIN
const stepsD = [
  {
    step: 1,
    thought:
      "Claim D: PC-POOL-1 FAIR_VALUE $4.2M. This is a Tier-3 judgment claim. Reviewing claim details.",
    action: {
      tool: "read_document",
      input: { docRef: "pc-pool-1-servicer", version: "v1" },
    },
    observation: {
      docRef: "pc-pool-1-servicer",
      cashflowTotal: 50000,
      currency: "USD",
      source: "fixture:documents/v1/pc-pool-1-servicer.json",
      fetchedAt: 1748736000,
    },
  },
  {
    step: 2,
    thought:
      "Based on cashflow data, estimating fair value at $4.2M seems plausible. Attempting VALID attestation.",
    action: {
      finalize: {
        decision: "VALID",
        confidenceBps: 8200,
        rationaleSummary: "Cashflow data supports a $4.2M valuation. Attempting attestation.",
      },
    },
    contractRevert: "JudgmentTierRequiresAbstain",
  },
  {
    step: 3,
    thought:
      "Contract rejected the attestation: JudgmentTierRequiresAbstain. FAIR_VALUE is a Tier-3 judgment claim. Re-submitting ABSTAIN.",
    action: {
      finalize: {
        decision: "ABSTAIN",
        confidenceBps: 0,
        rationaleSummary:
          "Protocol rejected VALID attestation for Tier-3 judgment claim (JudgmentTierRequiresAbstain). Abstaining as required.",
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Compute and print hashes
// ---------------------------------------------------------------------------

const transcripts = [
  { claimId: "A", steps: stepsA, expectedOnChainDecision: "VALID" },
  { claimId: "B", steps: stepsB, expectedOnChainDecision: "ABSTAIN" },
  { claimId: "C", steps: stepsC, expectedOnChainDecision: "REJECTED" },
  { claimId: "D", steps: stepsD, expectedOnChainDecision: "ABSTAIN" },
] as const;

for (const { claimId, steps, expectedOnChainDecision } of transcripts) {
  const traceHash = hashCanonical(steps);
  console.log(
    `Claim ${claimId}: traceHash=${traceHash} expectedOnChainDecision=${expectedOnChainDecision}`,
  );
}
