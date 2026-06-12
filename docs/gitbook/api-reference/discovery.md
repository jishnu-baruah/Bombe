# Discovery

Find what Bombe can attest: the curated assets, the full open universe, and the intake schema.

## GET /assets

The curated, verified showcase. No params.

```sh
curl https://bombe-web.vercel.app/api/v1/assets
```

Response (shape):

```json
{
  "chainId": 5003,
  "network": "Mantle Sepolia",
  "attestation": "0xf2473a0a55D997233C8fBF987c197e7d2180470A",
  "explorer": "https://sepolia.mantlescan.xyz",
  "count": 2,
  "assets": [
    {
      "symbol": "mETH",
      "name": "...",
      "chain": "...",
      "grade": "...",
      "metric": "annualized_yield_bps",
      "sources": [{ "scheme": "...", "kind": "...", "label": "..." }],
      "note": "two computation paths",
      "verified": true,
      "claimIdPattern": "mETH-YYYY-MM-DD"
    }
  ],
  "discover": "GET /api/v1/discover?rwaOnly=1 ...",
  "read": "GET /api/v1/claims/{claimId}; verify with GET /api/v1/verify/{claimId}"
}
```

## GET /discover

Enumerate the live RWA-yield universe as ready-to-attest source descriptors.

| Param | Type | Notes |
|-------|------|-------|
| `chain` | string | e.g. `Mantle` |
| `query` | string | symbol or project substring |
| `minTvl` | number | min TVL in USD |
| `rwaOnly` | `1` | restrict to RWA/treasury/staking issuers |
| `category` | string | one of the returned `categories` |
| `limit` | number | default 50, max 200 |

```sh
curl "https://bombe-web.vercel.app/api/v1/discover?rwaOnly=1&limit=5"
```

```json
{
  "chainId": 5003,
  "network": "Mantle Sepolia",
  "count": 5,
  "categories": ["..."],
  "liveByCategory": { "treasury": 3 },
  "note": "Any descriptor below can be attested via POST /api/v1/request with its `spec` ...",
  "assets": [{ "symbol": "...", "verified": false, "...": "..." }]
}
```

Each asset's descriptor can be passed as `spec` to [`POST /request`](request.md).

## GET /schema

The ecosystem-standard intake schema: what to submit, the claim-type capability matrix (with live/planned status), per-class tolerances (with a tamper-evident `tolerancesHash`), and the grade and ABSTAIN-reason definitions. No params.

```sh
curl https://bombe-web.vercel.app/api/v1/schema
```

Next: [Claims and verification](claims.md).
