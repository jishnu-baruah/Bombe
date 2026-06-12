# Examples

Copy-paste examples against the live network. Base URL `https://bombe-web.vercel.app/api/v1`.

## 1. Verify a claim end to end

Read a claim, then re-derive its reasoning hash yourself.

```js
const BASE = "https://bombe-web.vercel.app/api/v1";
import { hashCanonical } from "@bombe/shared";

const claimId = "mETH-2026-06-07";
const claim = await fetch(`${BASE}/claims/${claimId}`).then((r) => r.json());

for (const a of claim.attestations) {
  const trace = await fetch(a.traceURI).then((r) => r.json());
  const local = hashCanonical(trace);
  console.log(`${a.attestor} ${a.decision}:`, local === a.reasoningHash ? "verified" : "mismatch");
}
```

No SDK? Let the endpoint do it:

```sh
curl https://bombe-web.vercel.app/api/v1/verify/mETH-2026-06-07
```

## 2. Discover attestable assets

Find RWA yields the network can attest, filtered to RWA issuers.

```sh
curl "https://bombe-web.vercel.app/api/v1/discover?rwaOnly=1&limit=10"
```

```js
const BASE = "https://bombe-web.vercel.app/api/v1";
const res = await fetch(`${BASE}/discover?rwaOnly=1&limit=10`).then((r) => r.json());
for (const a of res.assets) {
  console.log(a.symbol, a.category, a.verified ? "(verified)" : "(open)");
}
// Each `a` can be passed as `spec` to POST /request for a non-featured asset.
```

## 3. Request an attestation (outline)

Non-custodial: pay first, then submit the payment tx hash. Full detail in [Attestation and payment](attestation-and-payment.md).

```js
import { createWalletClient, custom, parseEther } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";

const BASE = "https://bombe-web.vercel.app/api/v1";
const RECEIVE = "0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83";

// 1. Pay the flat fee (0.02 MNT) from your own wallet.
const wallet = createWalletClient({
  account,
  chain: mantleSepoliaTestnet,
  transport: custom(window.ethereum),
});
const paymentTxHash = await wallet.sendTransaction({
  to: RECEIVE,
  value: parseEther("0.02"),
});

// 2. Submit the claim + payment proof.
const out = await fetch(`${BASE}/request`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    asset: "USDY",
    claimType: "YIELD_BPS",
    assertedBps: 355,
    windowDays: 30,
    payer: account,
    paymentTxHash,
  }),
}).then((r) => r.json());

console.log(out.claimId, out.decision); // e.g. "USDY-REQ-..." "VALID"

// 3. Verify the result.
const v = await fetch(`${BASE}/verify/${out.claimId}`).then((r) => r.json());
console.log(v.results[0]?.status); // "verified"
```

## 4. A free live document check

No payment, no claim posted; a live deterministic Tier-2 check.

```sh
curl "https://bombe-web.vercel.app/api/v1/document-check?asset=USDY&assertedBps=355&toleranceBps=75"
```

Point it at your own document with `docUrl` plus `jsonPath` and `scaleToBps`.
