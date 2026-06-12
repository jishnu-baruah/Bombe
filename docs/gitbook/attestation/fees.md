# Fees and what is on-chain

## Fee and receiving address

| | |
|---|---|
| Fee | `0.02 MNT` (flat, on Mantle Sepolia) |
| Receiving address | `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83` |
| Chain | Mantle Sepolia, chain id `5003` |

The exact live fee and address are returned by `GET /api/v1/request`. The fee is a single MNT transfer to the receiving address; this is the issuer-facing price. (The on-chain `CLAIM_FEE` of 0.01 MNT and the attestor `ATTEST_LOCK` of 0.02 MNT are paid by the protocol's posting and attestor keys, not by you.)

## Featured vs open assets

- A featured symbol (from `GET /api/v1/assets`) resolves automatically.
- Any other asset is allowed only with a valid `spec` (a source descriptor from `GET /api/v1/discover`), and is attested but labeled unverified. The `spec.symbol` must equal `asset`, and its sources must use a live scheme.
- If there is no live source at all, record the ask with `POST /api/v1/asset-request`.

## Notes

- Window is always recorded and shown with the verdict. A short window is never described as a 30-day yield.
- The verdict over `YIELD_BPS` is computed by the deterministic reconciler over live data; no AI gateway is required for the decision.
