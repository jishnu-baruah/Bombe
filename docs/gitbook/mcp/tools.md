# Tools

Every tool returns the raw API JSON as text, so the agent reads the same fields documented in the [API reference](../api-reference/README.md).

| Tool | What it does | Keyless |
|------|--------------|---------|
| `bombe_list_assets` | List the curated RWA yields Bombe attests and the attestation contract | yes |
| `bombe_discover_assets` | Discover the full open universe of attestable RWA yields; each result's descriptor can be passed as `spec` to the request tool | yes |
| `bombe_get_schema` | Get the intake schema, capability matrix, tolerances, and grade / abstain definitions | yes |
| `bombe_check_nav` | Tier-1 NAV check: read an ERC-4626 vault on-chain and cross-check an asserted NAV | yes |
| `bombe_check_document` | Tier-2 document check: cross-check an asserted yield against the live, hashed Treasury bill rate | yes |
| `bombe_get_claim` | Read a claim and its on-chain attestations by claim id | yes |
| `bombe_verify_claim` | Re-derive the reasoning hash from the trace and compare to on-chain | yes |
| `bombe_request_attestation` | Request a paid attestation; pay first, then pass the payment tx hash | paid |

## Tool parameters

- `bombe_discover_assets`: `chain?`, `query?`, `rwaOnly?`, `minTvl?`, `limit?`
- `bombe_check_nav`: `chain`, `contract`, `assertedNav`, `tolerancePct?`
- `bombe_check_document`: `asset`, `assertedBps`, `toleranceBps?`
- `bombe_get_claim` / `bombe_verify_claim`: `claimId`
- `bombe_request_attestation`: `asset`, `assertedBps`, `windowDays`, `payer`, `paymentTxHash`

## A typical agent loop

1. `bombe_list_assets` or `bombe_discover_assets` to find what to attest.
2. `bombe_get_schema` to learn the exact intake shape and tolerances.
3. Pay the fee on Mantle Sepolia from the agent's own wallet (see [Get an attestation](../attestation/README.md)).
4. `bombe_request_attestation` with the payment tx hash.
5. `bombe_verify_claim` to confirm the on-chain `reasoningHash` re-derives from the trace.

Next: [Discovery for agents](discovery.md).
