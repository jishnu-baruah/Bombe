# API reference

Public JSON API. Base URL `https://bombe-web.vercel.app/api/v1`. CORS open (`Access-Control-Allow-Origin: *`). All reads are keyless. Only `POST /request` involves payment.

## Endpoints

| Method | Path | Purpose | Page |
|--------|------|---------|------|
| GET | `/assets` | Curated assets Bombe attests + attestation address | [Discovery](discovery.md) |
| GET | `/discover` | The full open universe of attestable RWA yields | [Discovery](discovery.md) |
| GET | `/schema` | The intake schema, capability matrix, tolerances | [Discovery](discovery.md) |
| GET | `/claims/{claimId}` | A claim and its on-chain attestations | [Claims and verification](claims.md) |
| GET | `/verify/{claimId}` | Re-derive the reasoning hash per attestation | [Claims and verification](claims.md) |
| GET | `/nav-check` | Live Tier-1 NAV check against an ERC-4626 vault | [Live checks](checks.md) |
| GET | `/document-check` | Live Tier-2 document check against a pinned document | [Live checks](checks.md) |
| POST | `/request` | Self-serve paid attestation (pay, then submit tx hash) | [Request an attestation](request.md) |
| POST | `/trace` | Store a self-authenticating reasoning trace | [Claims and verification](claims.md) |
| POST | `/asset-request` | Request a source for an asset with no live route yet | [Request an attestation](request.md) |

There is also `GET /api/trace/{claimId}/{agent}` (note: under `/api/trace`, not `/api/v1`), which serves the raw trace JSON an attestation's `traceURI` points to.

Next: [Discovery](discovery.md).
