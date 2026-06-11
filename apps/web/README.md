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

### Guardrails

- System prompt injected server-side only (the client cannot set it).
- Per-message input cap (2000 chars), bounded conversation window sent to the
  model, capped output tokens.
- Scope, honesty, and anti-injection rules live in the system prompt; off-topic
  and jailbreak attempts are declined.
