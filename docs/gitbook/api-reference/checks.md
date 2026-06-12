# Live checks

Free, keyless, deterministic checks you can run without posting a claim. The evidence is the chain itself or a fetched, hashed document.

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

Next: [Request an attestation](request.md).
