# OPERATOR_TODO.md — human-in-the-loop queue

This is the human-in-the-loop queue. When the autonomous agent hits something it **cannot do without the operator** — a credential, a need-to-verify-against-a-live-service, or an owner-only decision — it appends an `OP-N` entry here, sets the related `TODO.md` task to `Status: blocked — see OP-N`, and continues with other unblocked work so long unattended sessions never stall. `TODO.md` = what to build; `OPERATOR_TODO.md` = what needs the operator. **Never fabricate credentials or fake verification to appear done** — record the honest half-done state instead.

## Entry format

```
## OP-N — <short title>   [open]
- Date: YYYY-MM-DD
- Blocks: T-XXX (and/or a short description)
- Need: <exactly what the operator must provide/do>
- Half-done state: <what's already built and verified; what's left>
- To resolve: <the concrete step, then tell the agent "OP-N ready">
```

The status toggles `[open]` → `[done]` once the operator resolves the entry; the blocked `TODO.md` task then reopens.

## Open

> OP-3 through OP-6 unblock the live submission (D16); build proceeds mock-tested and cuts over to live when each resolves.

## OP-3 — AI gateway key (real LLM)   [open]
- Date: 2026-06-06
- Blocks: T-801 live ModelSeam + all live agent runs
- Need: an OpenAI-compatible AI gateway base URL + API key that can serve `anthropic/claude-sonnet-4.6`, `openai/gpt-5`, `meta/llama-3.3-70b` (e.g. OpenRouter, Vercel AI Gateway) → `AI_GATEWAY_KEY` + `AI_GATEWAY_BASE_URL`.
- Half-done state: live ModelSeam is coded to a standard chat-completions HTTP call; all seam interfaces ready. Cannot make real LLM calls without the key.
- To resolve: put `AI_GATEWAY_KEY` and `AI_GATEWAY_BASE_URL` in `.env.local` (never committed), then tell the agent "OP-3 ready".

## OP-4 — Mantle Sepolia RPC + funded wallets   [open]
- Date: 2026-06-06
- Blocks: T-804 deploy:testnet + all real on-chain attestations (T-J01, T-J02, T-J03)
- Need: `RPC_URL` for Mantle Sepolia (chain 5003); `DEPLOYER_KEY`; three `AGENT_KEYS` (REFLECTOR, ROTOR, STATOR); `PLUGBOARD_WALLET_KEY`; `HUMAN_WALLET_KEY` — each funded with testnet MNT (faucet: https://faucet.sepolia.mantle.xyz).
- Half-done state: contracts + live WalletSeam + deploy script ready; cannot deploy or send real txns without funded keys.
- To resolve: provide all keys + RPC URL in `.env.local`, fund wallets, tell the agent "OP-4 ready".

## OP-5 — Blob storage token   [open]
- Date: 2026-06-06
- Blocks: T-802 live BlobSeam (real trace storage for the verify-hash artifact)
- Need: `BLOB_RW_TOKEN` (e.g. Vercel Blob read-write token).
- Half-done state: live BlobSeam coded; falls back to local filesystem in mock mode.
- To resolve: provide `BLOB_RW_TOKEN` in `.env.local`, tell the agent "OP-5 ready".

## OP-6 — Neon Postgres URL   [open]
- Date: 2026-06-06
- Blocks: T-803 live DB read-model (leaderboard/traces over live data)
- Need: `DATABASE_URL` (Neon serverless Postgres connection string).
- Half-done state: drizzle schema + live client skeleton ready; pglite used in mock and tests.
- To resolve: provide `DATABASE_URL` in `.env.local`, tell the agent "OP-6 ready".

## Resolved

## OP-2 — YieldProof submodule URL   [done]
- Date: 2026-06-05 (resolved 2026-06-06)
- Blocks: optional real-submodule wiring (resolved in T-012)
- Outcome: repo `https://github.com/imanishbarnwal/YieldProof` exists and was wired as a reference submodule at `contracts/lib/yieldproof`. The interface is **incompatible** with PRD §6.2: it uses `uint256` claimIds, a fee-based `attestToClaim`, and `struct Attestor{bool isRegistered; uint256 stake}` — no `{attestor,claimId,decision,timestamp}` record. The submodule is Hardhat-based and does NOT break Foundry's build (forge builds only what's imported, and nothing imports the submodule's contracts). The vendored `IYieldProofAttestor.sol` in `contracts/src/interfaces/` is retained as the canonical build interface per PRD §6.2 fallback; our contracts do not consume YieldProof's registry.

## OP-1 — GitHub remote & auth   [done]
- Date: 2026-06-05
- Blocks: T-008 (remote create + push)
- Need: operator confirms repo + working push auth.
- Half-done state: remote `origin` = https://github.com/jishnu-baruah/Bombe.git wired; `main` pushed successfully (auth via cached credentials). Repo owner Jishnu Baruah (jishnu-baruah).
- To resolve: RESOLVED — remote exists and push works. (Minor: a stale `credential.helper=manager-core` git config prints a harmless warning on push; fix only if pushes start prompting.)
