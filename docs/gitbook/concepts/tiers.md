# Claim tiers

Bombe attests only to claims that can be proven true or false against data. It refuses opinions. Every claim carries a tier.

| Tier | Name | What it means | Decision space |
|------|------|---------------|----------------|
| 1 | Deterministic | A value checkable by arithmetic over data (for example an annualized yield in bps) | VALID, REJECTED, ABSTAIN |
| 2 | Document | A value checkable against a fetched, hashed document (for example a treasury rate) | VALID, REJECTED, ABSTAIN |
| 3 | Judgment | An opinion (for example a fair-value estimate) | ABSTAIN only, enforced on-chain |

A Tier 3 claim can never receive a VALID or REJECTED. The `AgentAttestation` contract reverts any non-ABSTAIN decision on a Tier 3 claim with `JudgmentTierRequiresAbstain`. This is a contract invariant, not a prompt or an SDK rule, so it holds for every attestor including ones Bombe did not write.

Next: [Deterministic verdict, model narrative](verdict.md).
