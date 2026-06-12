# API reference

Public JSON API. Base URL `https://bombe-web.vercel.app/api/v1`. CORS open (`Access-Control-Allow-Origin: *`). All reads are keyless. Only `POST /request` involves payment.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/assets` | Curated assets Bombe attests + attestation address |
| GET | `/discover` | The full open universe of attestable RWA yields |
| GET | `/schema` | The intake schema, capability matrix, tolerances |
| GET | `/claims/{claimId}` | A claim and its on-chain attestations |
| GET | `/verify/{claimId}` | Re-derive the reasoning hash per attestation |
| GET | `/nav-check` | Live Tier-1 NAV check against an ERC-4626 vault |
| GET | `/document-check` | Live Tier-2 document check against a pinned document |
| POST | `/request` | Self-serve paid attestation (pay, then submit tx hash) |
| POST | `/trace` | Store a self-authenticating reasoning trace |
| POST | `/asset-request` | Request a source for an asset with no live route yet |

There is also `GET /api/trace/{claimId}/{agent}` (note: under `/api/trace`, not `/api/v1`), which serves the raw trace JSON an attestation's `traceURI` points to.

---

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

---

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

Each asset's descriptor can be passed as `spec` to `POST /request`.

---

## GET /schema

The ecosystem-standard intake schema: what to submit, the claim-type capability matrix (with live/planned status), per-class tolerances (with a tamper-evident `tolerancesHash`), and the grade and ABSTAIN-reason definitions. No params.

```sh
curl https://bombe-web.vercel.app/api/v1/schema
```

---

## GET /claims/{claimId}

The claim and every on-chain attestation. Returns `404` if the claim is not posted.

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
      "attestor": "0x3BA0...",
      "decision": "VALID",
      "confidenceBps": 10000,
      "reasoningHash": "0x...",
      "sourcesHash": "0x...",
      "traceURI": "https://.../api/trace/mETH-2026-06-07/0x3ba0...",
      "lockedStakeWei": "20000000000000000"
    }
  ]
}
```

---

## GET /verify/{claimId}

For each attestation: fetch the trace, recompute `keccak256(canonicalJson(trace))`, compare to the on-chain `reasoningHash`.

| Param | Notes |
|-------|-------|
| `attestor` (query) | optional; verify only this attestor |

```sh
curl "https://bombe-web.vercel.app/api/v1/verify/mETH-2026-06-07"
```

```json
{
  "claimId": "mETH-2026-06-07",
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

`status`: `verified` | `mismatch` | `trace_unavailable`.

---

## GET /nav-check

Live Tier-1 NAV check: read an ERC-4626 vault's share price on-chain and deterministically cross-check an asserted NAV. The evidence is the chain itself.

| Param | Required | Notes |
|-------|----------|-------|
| `contract` | yes | the ERC-4626 vault address (`0x..`) |
| `assertedNav` | yes | asserted assets per 1.0 share, positive |
| `chain` | no | default `Ethereum` |
| `tolerancePct` | no | default `0.5` |

```sh
curl "https://bombe-web.vercel.app/api/v1/nav-check?chain=Ethereum&contract=0xVAULT&assertedNav=1.05&tolerancePct=0.5"
```

```json
{
  "chain": "Ethereum",
  "contract": "0xVAULT",
  "assertedNav": 1.05,
  "tolerancePct": 0.5,
  "verdict": "VALID",
  "detail": "...",
  "onchain": { "...": "..." },
  "provenance": { "...": "..." },
  "note": "NAV read straight from the vault contract on-chain ..."
}
```

---

## GET /document-check

Live Tier-2 document verification over any document: fetch and hash (pin) the document, extract a figure by JSON path, deterministically cross-check the asserted value within tolerance. With no `docUrl` it uses the US Treasury bill rate example.

| Param | Required | Notes |
|-------|----------|-------|
| `assertedBps` | yes | positive number; default `355` |
| `toleranceBps` | no | default `75` |
| `asset` | no | default `USDY` |
| `docUrl` | no | your own document URL (http/https; loopback and private hosts blocked) |
| `jsonPath` | no | e.g. `data.0.rate` |
| `scaleToBps` | no | e.g. `100` for percent to bps |
| `target` | no | text target if not JSON |
| `label` | no | display label |

```sh
curl "https://bombe-web.vercel.app/api/v1/document-check?asset=USDY&assertedBps=355"
```

```json
{
  "asset": "USDY",
  "assertedBps": 355,
  "toleranceBps": 75,
  "verdict": "VALID",
  "detail": "...",
  "document": {
    "label": "US Treasury Bills average interest rate (fiscaldata.treasury.gov)",
    "url": "https://api.fiscaldata.treasury.gov/...",
    "docHash": "0x...",
    "extracted": "..."
  },
  "provenance": { "...": "..." },
  "note": "Tier-2 document check ..."
}
```

---

## POST /request

Self-serve paid attestation. Non-custodial: you pay the fee from your own wallet to the receiving address, then POST the payment tx hash. Full walkthrough in [Attestation and payment](attestation-and-payment.md).

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

---

## POST /trace

Store a reasoning trace so an attestation is stranger-verifiable. Self-authenticating: the route recomputes `keccak256(canonicalJson(trace))` and stores it only if it matches the on-chain `reasoningHash` for that claim and attestor. No secret needed.

Body: `{ "claimId": "...", "attestor": "0x...", "trace": { ... } }`

Returns `409` if the hash does not match, `404` if there is no on-chain attestation for that claim and attestor.

---

## POST /asset-request

Record a request for an asset the network has no live source for yet. Body: `{ "symbol": "...", "category"?, "sourceUrl"?, "note"?, "contact"? }`. Only `symbol` is required.
