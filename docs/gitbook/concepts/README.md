# Concepts

Read this section once to understand what a Bombe attestation means and why you can trust it without trusting the attestor.

Bombe attests only to claims that can be proven true or false against data. It refuses opinions. The verdict is computed by a deterministic reconciler, never by a model, and every attestation commits to a hashed reasoning trace on-chain.

## In this section

| Page | What it covers |
|------|----------------|
| [Claim tiers](tiers.md) | The three tiers and the on-chain Tier-3 ABSTAIN-only rule |
| [Deterministic verdict, model narrative](verdict.md) | How the reconciler decides and what the model does |
| [Verification and the reasoning hash](verification.md) | The on-chain `reasoningHash` and self-authenticating traces |
| [The attestor panel and Plugboard](panel.md) | Multiple attestors, trust scores, and the external attestor |

Next: [Claim tiers](tiers.md).
