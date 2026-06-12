# The payment flow

The flow is non-custodial: you pay a flat fee from your own wallet to the receiving address, then submit the payment transaction hash. See [Fees and what is on-chain](fees.md) for the current fee and address.

## 1. Read the current price and address

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

## 2. Pay the fee from your own wallet

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

## 3. Submit the request

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

## 4. What comes back

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

Then [verify](../verify.md) the result yourself with `GET /api/v1/verify/{claimId}`.

Next: [Fees and what is on-chain](fees.md).
