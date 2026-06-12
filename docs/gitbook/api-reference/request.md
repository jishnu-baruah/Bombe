# Request an attestation

The paid, non-custodial write path and the no-source fallback.

## POST /request

Self-serve paid attestation. Non-custodial: you pay the fee from your own wallet to the receiving address, then POST the payment tx hash. Full walkthrough in [Get an attestation](../attestation/README.md).

Body:

| Field | Type | Notes |
|-------|------|-------|
| `asset` | string | a featured symbol, or any symbol with a valid `spec` |
| `claimType` | string | must be `YIELD_BPS` |
| `assertedBps` | integer | positive |
| `windowDays` | integer | positive |
| `payer` | string | the address you paid from |
| `paymentTxHash` | string | the Mantle Sepolia tx hash of your fee payment |
| `spec` | object | optional; required for a non-featured asset (from `/discover`) |

`GET /request` returns the service metadata (supported assets, claim type, `priceMnt`).

## POST /asset-request

Record a request for an asset the network has no live source for yet. Body: `{ "symbol": "...", "category"?, "sourceUrl"?, "note"?, "contact"? }`. Only `symbol` is required.
