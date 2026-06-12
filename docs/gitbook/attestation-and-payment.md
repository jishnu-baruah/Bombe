# Attestation and payment

Get your own yield claim attested on-chain. The flow is non-custodial: you pay a flat fee from your own wallet directly to the receiving address, then submit the payment transaction hash. Bombe never holds your funds. Posting the claim is done by the protocol's posting key because `postClaim` is restricted to an authorized role on-chain.

## What you get

A claim posted on-chain and an attestation with an on-chain `reasoningHash` you can verify yourself. Today the self-serve path supports `claimType: YIELD_BPS` (annualized yield in basis points). The verdict is deterministic; the model only writes the narrative.

## Fee and receiving address

| | |
|---|---|
| Fee | `0.02 MNT` (flat, on Mantle Sepolia) |
| Receiving address | `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83` |
| Chain | Mantle Sepolia, chain id `5003` |

The exact live fee and address are returned by `GET /api/v1/request`. The fee is a single MNT transfer to the receiving address; this is the issuer-facing price. (The on-chain `CLAIM_FEE` of 0.01 MNT and the attestor `ATTEST_LOCK` of 0.02 MNT are paid by the protocol's posting and attestor keys, not by you.)

## Steps

### 1. Read the current price and address

```sh
curl https://bombe-web.vercel.app/api/v1/request
```

```json
{
  "service": "Bombe self-serve attestation request",
  "method": "POST",
  "supportedAssets": ["mETH", "USDY"],
  "claimType": "YIELD_BPS",
  "priceMnt": "0.02",
  "note": "Non-custodial: pay from your own wallet to the receiving address, then POST the payment tx hash ..."
}
```

### 2. Pay the fee from your own wallet

Send exactly the fee (or more) in MNT to the receiving address on Mantle Sepolia. In the browser the [request form](https://bombe-web.vercel.app/request) does this for you via your wallet; programmatically, send a plain transfer:

```js
import { createWalletClient, custom, parseEther } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";

const wallet = createWalletClient({
  account, // your address
  chain: mantleSepoliaTestnet,
  transport: custom(window.ethereum),
});

const paymentTxHash = await wallet.sendTransaction({
  to: "0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83",
  value: parseEther("0.02"),
});
```

Keep the `paymentTxHash`. Wait for it to confirm.

### 3. Submit the request

POST the claim details plus your payment proof.

```sh
curl -X POST https://bombe-web.vercel.app/api/v1/request \
  -H "content-type: application/json" \
  -d '{
    "asset": "USDY",
    "claimType": "YIELD_BPS",
    "assertedBps": 355,
    "windowDays": 30,
    "payer": "0xYOUR_ADDRESS",
    "paymentTxHash": "0xYOUR_PAYMENT_TX"
  }'
```

The server verifies the payment on-chain: the transaction must have succeeded, been sent to the receiving address, come from `payer`, and carried at least the fee. A reused payment hash is rejected (`409`).

### 4. What comes back

When the live post path is enabled, the response includes the on-chain claim id, the verdict, and a verify URL:

```json
{
  "ok": true,
  "fulfilled": true,
  "claimId": "USDY-REQ-abc1234567",
  "decision": "VALID",
  "reasoningHash": "0x...",
  "verifyUrl": "https://bombe-web.vercel.app/verify?q=USDY-REQ-abc1234567",
  "message": "Attested VALID on-chain. You can verify it yourself."
}
```

Other outcomes:

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ ok: true, verified: true, ... }` | Payment verified and recorded; the operator posts the claim and it appears on the verify page |
| `202` | `{ ok: true, fulfilled: false, ... }` | Payment verified and recorded, but automatic posting hit an error; the operator fulfils it. Keep your tx hash |
| `400` | `{ error: ... }` | Bad input or payment did not check out (wrong recipient, below fee, etc.) |
| `409` | `{ error: ... }` | That payment hash was already used |

Then [verify](verify.md) the result yourself with `GET /api/v1/verify/{claimId}`.

## Featured vs open assets

- A featured symbol (from `GET /api/v1/assets`) resolves automatically.
- Any other asset is allowed only with a valid `spec` (a source descriptor from `GET /api/v1/discover`), and is attested but labeled unverified. The `spec.symbol` must equal `asset`, and its sources must use a live scheme.
- If there is no live source at all, record the ask with `POST /api/v1/asset-request`.

## Notes

- Window is always recorded and shown with the verdict. A short window is never described as a 30-day yield.
- The verdict over `YIELD_BPS` is computed by the deterministic reconciler over live data; no AI gateway is required for the decision.
