# Concepts

Read this once to understand what a Bombe attestation means and why you can trust it without trusting the attestor.

## Falsifiable claims only

Bombe attests only to claims that can be proven true or false against data. It refuses opinions. Every claim carries a tier:

| Tier | Name | What it means | Decision space |
|------|------|---------------|----------------|
| 1 | Deterministic | A value checkable by arithmetic over data (for example an annualized yield in bps) | VALID, REJECTED, ABSTAIN |
| 2 | Document | A value checkable against a fetched, hashed document (for example a treasury rate) | VALID, REJECTED, ABSTAIN |
| 3 | Judgment | An opinion (for example a fair-value estimate) | ABSTAIN only, enforced on-chain |

A Tier 3 claim can never receive a VALID or REJECTED. The `AgentAttestation` contract reverts any non-ABSTAIN decision on a Tier 3 claim with `JudgmentTierRequiresAbstain`. This is a contract invariant, not a prompt or an SDK rule, so it holds for every attestor including ones Bombe did not write.

## Deterministic verdict, model-written narrative

The verdict is computed by a deterministic reconciler, never by a model.

- Attestor agents gather live evidence (for example a yield from on-chain data and from an aggregator).
- The reconciler compares the evidence legs within a documented tolerance, then compares the reconciled value to the asserted value within tolerance. Inside tolerance is VALID, outside is REJECTED, missing or conflicting evidence is ABSTAIN.
- The model writes only the human-readable rationale. It cannot change the decision.

Consensus, when there are multiple attestors, is over evidence values, not over opinions.

### Source semantics, stated honestly

- mETH yield is one ground truth computed via two computation paths (a DefiLlama pricePerShare-derived leg and an on-chain mETHToETH cross-check). These are not called "independent".
- USDY is labeled partial independence or a single source with full transparency, never "independent".
- A claim always carries its `windowDays`. A short-window yield is never described or rendered as a "30-day yield".

## reasoningHash and verification

Every attestation stores a `reasoningHash` on-chain:

```
reasoningHash = keccak256(canonicalJson(trace))
```

`canonicalJson` orders keys deterministically so the hash is reproducible. Anyone can fetch the published trace, recompute the hash, and compare it to the on-chain value. A match proves the published reasoning is exactly what the attestor committed to; it was not altered after the fact. See [Verify a claim](verify.md).

Traces are self-authenticating: the trace-storage endpoint only accepts a trace whose recomputed hash matches the on-chain `reasoningHash`, so no secret is needed to store one and a forged trace cannot be stored.

## The attestor panel and Plugboard

Several attestors can attest a single claim. The live registry includes three reference SDK agents (Reflector, Rotor, Stator), a human attestor, and Plugboard.

Plugboard is an external attestor running on a third-party agent runtime that the Bombe team did not write. It posts through the same public contract calls as any other agent. It exists to prove that safety lives in the contract, not in Bombe's code: when Plugboard tries to attest a Tier 3 judgment claim, the contract reverts and the UI shows BLOCKED BY PROTOCOL. No Bombe-authored code is in that path.

Each attestor carries a 0 to 100 trust score on `TuringLeaderboard`, derived from settled outcomes (abstentions are excluded from the accuracy denominator). Use it to weight or filter attestors.
