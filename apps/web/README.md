# @bombe/web

The Bombe web app (Next.js 16 App Router, Tailwind v4).

## Support chatbot

A context-aware, streaming support chatbot is mounted globally as a floating
widget (bottom-right launcher + slide-up glass panel).

- Client widget: `components/SupportChat.tsx` (client-only; uses the AI SDK
  `useChat` hook for token streaming and renders assistant replies as Markdown).
  Mounted once in `app/layout.tsx`.
- Server route: `app/api/chat/route.ts` (Node runtime). Uses the Vercel AI SDK
  `streamText` against an OpenAI-compatible provider, injects the system prompt
  server-side, and streams the reply.
- Grounding + guardrails: `lib/chat-system-prompt.ts` (Bombe knowledge + hard
  rules). Model resolution: `lib/chat-model.ts`.

The widget never imports `@bombe/agent-sdk` or any server module; all model and
prompt logic lives in the route, which keeps the webpack client bundle clean.

### Required env vars

The route resolves its model from the first key present, in this order:

| Priority | Key | Base URL var | Model var |
| --- | --- | --- | --- |
| 1 | `CHAT_API_KEY` | `CHAT_BASE_URL` | `CHAT_MODEL` |
| 2 | `NARRATOR_PRIMARY_KEY` | `NARRATOR_PRIMARY_BASE_URL` | `NARRATOR_PRIMARY_MODEL` |
| 3 | `AI_GATEWAY_KEY` | `AI_GATEWAY_BASE_URL` | `FALLBACK_MODEL` |

Defaults when the base URL / model are unset: `https://api.mistral.ai/v1` and
`mistral-small-latest` (Mistral is OpenAI-compatible).

If no key is set, `/api/chat` returns a clean `503` and the widget shows the
error; nothing else on the site is affected.

In Vercel production, set at minimum one of the keys above (for example
`CHAT_API_KEY`) so the assistant works.

## Explorer (protocol-activity feed)

`/explorer` is a server-rendered, block-explorer-style history of recent claims
and their on-chain attestations. It reads the best source available, in order:

1. A subgraph, when `SUBGRAPH_URL` is set (the scaling path; see `subgraph/`).
2. `viem` `getLogs` against the `AgentAttestation` contract over a bounded recent
   block range (the default; no indexer required).
3. The Neon trace store, used to enrich on-chain rows with the stored reasoning
   trace (claim type, asset) when present.

Data layer: `lib/activity.ts`. Cache wrapper: `lib/activity-cache.ts`.

### Caching

The feed is cached for ~30s. If Upstash Redis is configured it caches there
(shared across serverless instances, via the existing `lib/cache.ts` REST
client); otherwise the page falls back to Next.js ISR (`export const revalidate
= 30`) and still works with zero config.

### Explorer / cache / data env vars (all optional)

| Key | Purpose | Default when unset |
| --- | --- | --- |
| `SUBGRAPH_URL` | The Graph query URL; preferred source when set | falls back to `getLogs` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint for the shared cache | in-memory + ISR |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | in-memory + ISR |
| `RPC_URL` | Mantle Sepolia RPC for the `getLogs` read | public Mantle RPC |
| `ATTESTATION_ADDRESS` | `AgentAttestation` address | the deployed address |
| `EXPLORER_LOG_LOOKBACK` | `getLogs` look-back window, in blocks | `45000` |
| `DATABASE_URL` | Neon Postgres, for stored-trace enrichment | enrichment skipped |

The `getLogs` path reads a bounded recent block range because the public RPC
caps `eth_getLogs`. Set `SUBGRAPH_URL` to remove that bound.

### Guardrails

- System prompt injected server-side only (the client cannot set it).
- Per-message input cap (2000 chars), bounded conversation window sent to the
  model, capped output tokens.
- Scope, honesty, and anti-injection rules live in the system prompt; off-topic
  and jailbreak attempts are declined.
