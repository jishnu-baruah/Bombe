# DEMO

Reproducible demo click-path for the A→D claim sequence; see PRD §6.7.

| Claim | Tier | Operator action | Expected outcome |
|-------|------|-----------------|------------------|
| **A** — mETH `YIELD_BPS` (34bps/30d, fresh oracle fixtures, expected 34±2) | 1 | Seed claim A | SDK agents all VALID in <3s simulated; Plugboard VALID (transcript); human queue static |
| **B** — mETH `YIELD_BPS`, stale feed (meth.json snapshot stale, no secondary source) | 1 | Seed claim B | Reflector ABSTAIN (STALE_SINGLE_SOURCE); Rotor VALID; Stator ABSTAIN; Plugboard ABSTAIN (evolved skill encodes the staleness lesson) |
| **C** — PC-POOL-1 `CASHFLOW_MATCH` (servicer report 50,000 vs statement sum 45,000) | 2 | Seed claim C | All REJECTED; traces cite both documents with hashes; Plugboard cites exact line items first |
| **D** — PC-POOL-1 `FAIR_VALUE` ($4.2M) | 3 | Seed claim D | SDK agents ABSTAIN (tier-3); Plugboard transcript attempts VALID → contract reverts `JudgmentTierRequiresAbstain` → UI shows BLOCKED BY PROTOCOL → Plugboard re-submits ABSTAIN |

TODO: fill exact click-path once /operator console exists (T-606).

**Settle step.** Operator then settles A and B as VALID (ground truth): the leaderboard shows Rotor rewarded for B, abstainers unpunished — the temperament tradeoff, made visible.
