# Verify a claim

A Bombe attestation commits to a reasoning trace by storing `keccak256(canonicalJson(trace))` on-chain. Verification means fetching the published trace, recomputing that hash, and confirming it equals the on-chain value. A match proves the reasoning was not altered after attestation.

```
reasoningHash = keccak256(canonicalJson(trace))
```

`canonicalJson` orders object keys deterministically before hashing, so the result is reproducible by anyone.

## The easy way: the verify endpoint

The API does the fetch-and-compare for you, per attestation.

```sh
curl https://bombe-web.vercel.app/api/v1/verify/mETH-2026-06-07
```

```json
{
  "claimId": "mETH-2026-06-07",
  "results": [
    {
      "attestor": "0x3BA0...",
      "decision": "VALID",
      "onChainReasoningHash": "0x363137...",
      "recomputed": "0x363137...",
      "match": true,
      "status": "verified"
    }
  ]
}
```

| `status` | Meaning |
|----------|---------|
| `verified` | recomputed hash equals the on-chain `reasoningHash` |
| `mismatch` | the trace does not hash to the committed value (tampered or wrong trace) |
| `trace_unavailable` | the trace is not yet durably stored; the on-chain hash still stands |

Add `?attestor=0x...` to verify a single attestor.

## The independent way: re-derive it yourself

Do not trust the endpoint; reproduce the math. Fetch the trace from the attestation's `traceURI` and recompute the hash with the same canonicalization.

```js
import { hashCanonical } from "@bombe/shared"; // keccak256 over canonical JSON

// 1. Read the claim to get each attestation's traceURI + on-chain reasoningHash.
const claim = await fetch(
  "https://bombe-web.vercel.app/api/v1/claims/mETH-2026-06-07",
).then((r) => r.json());

for (const a of claim.attestations) {
  // 2. Fetch the published trace.
  const trace = await fetch(a.traceURI).then((r) => r.json());
  // 3. Recompute and compare.
  const local = hashCanonical(trace);
  console.log(a.attestor, local === a.reasoningHash ? "verified" : "mismatch");
}
```

You can also read `reasoningHash` straight off the contract instead of the API; see [Deployed contracts](contracts/README.md). The result is the same because the API reads the same contract.

## Reverse lookup

You can paste a reasoning hash or a tx hash into the site's verify surface (`/verify?q=...`) to find the matching claim. A 32-byte hash is first reverse-matched against recent reasoning hashes; if none matches, it is shown as a transaction on the Mantle explorer.
