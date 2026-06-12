# Discovery for agents

Bombe is built to be found and used by agents without a human in the loop. Three machine-readable surfaces point at the keyless JSON API and the MCP server.

## llms.txt

`GET https://bombe-web.vercel.app/llms.txt` is the agent-facing summary (the emerging llms.txt convention): a concise, markdown-formatted map of the keyless JSON API and the MCP server. Plain text, no auth, CORS open. It lists the capability schema first, then the read, verify, check, and request endpoints, plus how to verify and how to request an attestation.

## robots and sitemap

- `GET /robots.txt` allows crawling the public pages and the keyless public READ API (`/api/v1/schema`, `/api/v1/assets`, `/api/v1/discover`, `/api/v1/verify`, `/llms.txt`) and disallows the operator console and the mutating routes (`/api/v1/request`, `/api/v1/asset-request`).
- `GET /sitemap.xml` lists the indexable human pages plus the agent entry points: the capability schema and `llms.txt`.

## The keyless API

Everything an agent needs to discover and verify is keyless and CORS-open:

| Step | Endpoint |
|------|----------|
| Read the capability registry first | `GET /api/v1/schema` |
| List curated assets | `GET /api/v1/assets` |
| Enumerate the open universe | `GET /api/v1/discover` |
| Read a claim | `GET /api/v1/claims/{claimId}` |
| Verify a claim | `GET /api/v1/verify/{claimId}` |

Only `POST /api/v1/request` (and `POST /api/v1/asset-request`) mutate, and `request` is non-custodial: the agent pays from its own wallet first, then passes the Mantle Sepolia payment tx hash. See the [API reference](../api-reference/README.md) for full shapes.
