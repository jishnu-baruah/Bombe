# Bombe compliance posture

How Bombe relates to real-world regulatory constraints for the assets it verifies. Written for the
RWA x AI track scorecard (compliance dimension) and for any issuer or reviewer asking "what is your
regulatory surface?" Honest about what Bombe does, what it does not do, and what is deliberately out
of scope.

## 1. What Bombe is, in regulatory terms

Bombe is a **verification and attestation layer**, not an issuer, custodian, broker-dealer,
transfer agent, or investment adviser. It does not hold customer funds, does not custody the
underlying asset, does not issue or sell securities, and does not give investment advice. It reads
public and issuer-provided data, applies a deterministic check, and writes a verifiable factual
attestation on-chain.

This matters because it keeps Bombe's own regulatory surface narrow. The compliance obligations of
the underlying asset (who may hold it, in which jurisdiction, after what onboarding) remain with the
issuer. Bombe's role is to make the issuer's reporting **independently checkable**, which is the
audit-trail side of compliance, not the gatekeeping side.

## 2. Compliance-by-design, already in the contracts

Two design decisions are compliance features, not just engineering choices:

- **Contract-enforced refusal to value (Tier 3 abstain).** Bombe will not attest a `FAIR_VALUE`
  claim. The contract returns an abstain with an empty tool set. By refusing to render valuations
  or opinions of worth, Bombe stays out of the appraisal and investment-advice regulatory zone and
  attests only **falsifiable facts** (a yield was X bps, a distribution was paid, a cashflow
  matched a document). This is the single most important compliance property: the system is built so
  it cannot be used to launder a subjective opinion into an on-chain "truth."
- **Bonded, slashable, immutable attestations.** Every decisive attestation stakes a bond, is
  slashable on a proven error, and is written immutably on-chain with a recomputable reasoning hash.
  That is exactly the **timestamped, tamper-evident audit trail** that AML monitoring, investor
  disclosure, and external audit all require.

## 3. The assets and their real-world constraints

- **mETH (Mantle liquid-staked ETH).** A crypto-native, permissionless instrument. The yield is
  derived from the on-chain exchange rate. Bombe's claim here is a pure on-chain fact with no
  investor-eligibility gating.
- **USDY (Ondo tokenized yield note).** USDY is a **regulated, KYC-gated, transfer-restricted**
  instrument: onboarding and eligibility (broadly, non-US persons) are enforced by the issuer, with
  an initial transfer-restriction window after mint. Bombe attests the **published yield** of an
  already-compliant asset; it does not bypass or alter Ondo's eligibility controls. Bombe's
  attestation is additive: it gives holders and integrators an independent check on the reported
  number.

Because Bombe verifies assets whose holder-eligibility is enforced upstream by the issuer, Bombe
does not need to perform KYC on end holders to operate honestly. Where a deployment does need
attestor-side controls, see section 5.

## 4. AI that assists compliance workflows (the track bonus)

The RWA scorecard gives explicit credit for using AI to **assist compliance workflows**. Bombe's
Tier-2 verification is exactly this:

- **`CASHFLOW_MATCH`** reads a servicer or distribution document and checks that the reported
  cashflow matches the on-chain or stated figure. This is an automated version of the reconciliation
  an auditor or fund administrator does by hand.
- **`ENCUMBRANCE_ABSENT`** checks a document/record for liens or encumbrances on the collateral.

These are AI-assisted audit and disclosure checks over real documents, producing a verifiable record
an auditor or regulator-facing report can cite. The AI gathers and extracts; a deterministic check
decides; the result is hashed on-chain. The human compliance reviewer is augmented, not replaced.

## 5. Deliberately out of scope for the hackathon (and the path to add it)

Honest boundaries, with the roadmap to close each:

- **No attestor KYC / permissioned identity.** Attestors are pseudonymous and bonded. For a
  regulated deployment, the `AgentRegistry` becomes a **permissioned allowlist** (KYC'd or
  accredited attestors, or a licensed-entity gate) without changing the attestation logic.
- **No on-chain holder identity.** Bombe does not gate who reads or consumes an attestation; that
  is the asset's concern. A future enterprise mode can bind attestations to an identity provider for
  attestor-side compliance.
- **No legal opinion / no securities determination.** Bombe states facts, not legal conclusions.
  Whether a given asset is a security in a given jurisdiction is the issuer's and counsel's call.

## 6. One-line summary for the pitch

Bombe lowers regulatory risk instead of adding it: it refuses to value (Tier 3 abstain), it attests
only falsifiable facts, it produces a tamper-evident on-chain audit trail, and its Tier-2 document
checks are AI assisting the exact reconciliation work compliance teams already do. The assets it
verifies (USDY) carry their own issuer-enforced KYC and transfer rules, which Bombe respects rather
than circumvents.
