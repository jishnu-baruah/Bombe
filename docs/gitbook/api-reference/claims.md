# Claims and verification

Read a claim and its on-chain attestations, re-derive each reasoning hash, and store a self-authenticating trace.

## GET /claims/{claimId}

The claim and every on-chain attestation. Returns `404` if the claim is not posted.

```sh
curl https://bombe-web.vercel.app/api/v1/claims/mETH-REQ-a9dbaf4521
```

```json
{
  "claimId": "mETH-REQ-a9dbaf4521",
  "posted": true,
  "tier": 1,
  "closed": false,
  "attestorCount": 1,
  "attestations": [
    {
      "attestor": "0x3BA0...",
      "decision": "VALID",
      "confidenceBps": 10000,
      "reasoningHash": "0x...",
      "sourcesHash": "0x...",
      "traceURI": "https://.../api/trace/mETH-REQ-a9dbaf4521/0x3ba0...",
      "lockedStakeWei": "20000000000000000"
    }
  ]
}
```

## GET /verify/{claimId}

For each attestation: fetch the trace, recompute `keccak256(canonicalJson(trace))`, compare to the on-chain `reasoningHash`.

| Param | Notes |
|-------|-------|
| `attestor` (query) | optional; verify only this attestor |

```sh
curl "https://bombe-web.vercel.app/api/v1/verify/mETH-REQ-a9dbaf4521"
```

```json
{
  "claimId": "mETH-REQ-a9dbaf4521",
  "results": [
    {
      "attestor": "0x3BA0...",
      "decision": "VALID",
      "onChainReasoningHash": "0x...",
      "recomputed": "0x...",
      "match": true,
      "traceURI": "https://.../api/trace/...",
      "status": "verified"
    }
  ]
}
```

`status`: `verified` | `mismatch` | `trace_unavailable`. For the full walkthrough see [Verify a claim](../verify.md).

## POST /trace

Store a reasoning trace so an attestation is stranger-verifiable. Self-authenticating: the route recomputes `keccak256(canonicalJson(trace))` and stores it only if it matches the on-chain `reasoningHash` for that claim and attestor. No secret needed.

Body: `{ "claimId": "...", "attestor": "0x...", "trace": { ... } }`

Returns `409` if the hash does not match, `404` if there is no on-chain attestation for that claim and attestor.

Next: [Live checks](checks.md).
