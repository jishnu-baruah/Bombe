# Quickstart

Read a claim and verify its verdict in two calls. No keys, no wallet, CORS open.

Base URL: `https://bombe-web.vercel.app/api/v1`

## 1. List the assets Bombe attests

```sh
curl https://bombe-web.vercel.app/api/v1/assets
```

Returns the curated assets (mETH, USDY), the chain, and the `AgentAttestation` address. The full open universe is at `GET /api/v1/discover`.

## 2. Read a claim and its verdicts

A claim id looks like `mETH-2026-06-07` (symbol plus date for the daily streak).

```sh
curl https://bombe-web.vercel.app/api/v1/claims/mETH-2026-06-07
```

```json
{
  "claimId": "mETH-2026-06-07",
  "posted": true,
  "tier": 1,
  "closed": false,
  "attestorCount": 1,
  "attestations": [
    {
      "attestor": "0x3BA08C723D41A98339D43Ffa01174791EaE813Fa",
      "decision": "VALID",
      "confidenceBps": 10000,
      "reasoningHash": "0x363137...",
      "sourcesHash": "0x...",
      "traceURI": "https://bombe-web.vercel.app/api/trace/mETH-2026-06-07/0x3ba0...",
      "lockedStakeWei": "20000000000000000"
    }
  ]
}
```

`decision` is one of `VALID`, `REJECTED`, `ABSTAIN`.

## 3. Verify the verdict

This re-derives the reasoning hash from the published trace and compares it to the on-chain value.

```sh
curl https://bombe-web.vercel.app/api/v1/verify/mETH-2026-06-07
```

```json
{
  "claimId": "mETH-2026-06-07",
  "results": [
    {
      "attestor": "0x3BA08C723D41A98339D43Ffa01174791EaE813Fa",
      "decision": "VALID",
      "onChainReasoningHash": "0x363137...",
      "recomputed": "0x363137...",
      "match": true,
      "status": "verified"
    }
  ]
}
```

`status` is `verified` (hash matches), `mismatch` (trace altered), or `trace_unavailable` (trace not yet durably stored).

## In JavaScript

```js
const BASE = "https://bombe-web.vercel.app/api/v1";

const claim = await fetch(`${BASE}/claims/mETH-2026-06-07`).then((r) => r.json());
console.log(claim.attestations[0].decision); // "VALID"

const verify = await fetch(`${BASE}/verify/mETH-2026-06-07`).then((r) => r.json());
console.log(verify.results[0].status); // "verified"
```

## Next

- Want the hash math yourself? [Verify a claim](verify.md).
- Want your own claim attested? [Attestation and payment](attestation-and-payment.md).
- Every endpoint: [API reference](api-reference.md).
