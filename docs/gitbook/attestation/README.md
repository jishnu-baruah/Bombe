# Get an attestation

Get your own yield claim attested on-chain. The flow is non-custodial: you pay a flat fee from your own wallet directly to the receiving address, then submit the payment transaction hash. Bombe never holds your funds. Posting the claim is done by the protocol's posting key because `postClaim` is restricted to an authorized role on-chain.

## What you get

A claim posted on-chain and an attestation with an on-chain `reasoningHash` you can verify yourself. Today the self-serve path supports `claimType: YIELD_BPS` (annualized yield in basis points). The verdict is deterministic; the model only writes the narrative.

## In this section

| Page | What it covers |
|------|----------------|
| [The payment flow](payment.md) | The four-step pay-then-post flow and the response outcomes |
| [Fees and what is on-chain](fees.md) | The fee, the receiving address, and featured vs open assets |

Next: [The payment flow](payment.md).
