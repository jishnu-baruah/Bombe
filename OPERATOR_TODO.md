# OPERATOR_TODO.md, human-in-the-loop queue

This is the human-in-the-loop queue. When the autonomous agent hits something it **cannot do without the operator**, a credential, a need-to-verify-against-a-live-service, or an owner-only decision, it appends an `OP-N` entry here, sets the related `TODO.md` task to `Status: blocked, see OP-N`, and continues with other unblocked work so long unattended sessions never stall. `TODO.md` = what to build; `OPERATOR_TODO.md` = what needs the operator. **Never fabricate credentials or fake verification to appear done**, record the honest half-done state instead.

## Entry format

```
## OP-N, <short title>   [open]
- Date: YYYY-MM-DD
- Blocks: T-XXX (and/or a short description)
- Need: <exactly what the operator must provide/do>
- Half-done state: <what's already built and verified; what's left>
- To resolve: <the concrete step, then tell the agent "OP-N ready">
```

The status toggles `[open]` → `[done]` once the operator resolves the entry; the blocked `TODO.md` task then reopens.

## Open

> OP-5 through OP-7 unblock the live submission (D16); build proceeds mock-tested and cuts over to live when each resolves.

## OP-5, Blob storage token   [open]
- Date: 2026-06-06
- Blocks: T-802 live BlobSeam (real trace storage for the verify-hash artifact)
- Need: `BLOB_RW_TOKEN` (e.g. Vercel Blob read-write token).
- Half-done state: live BlobSeam coded; falls back to local filesystem in mock mode.
- To resolve: provide `BLOB_RW_TOKEN` in `.env.local`, tell the agent "OP-5 ready".

## OP-6, Neon Postgres URL   [open]
- Date: 2026-06-06
- Blocks: T-803 live DB read-model (leaderboard/traces over live data)
- Need: `DATABASE_URL` (Neon serverless Postgres connection string).
- Half-done state: drizzle schema + live client skeleton ready; pglite used in mock and tests.
- To resolve: provide `DATABASE_URL` in `.env.local`, tell the agent "OP-6 ready".

## OP-7, Upstash Redis   [open]
- Date: 2026-06-06
- Blocks: live serverless SSE event fan-out (in-process bus won't survive Vercel functions), distributed tool-gateway rate limiting, caching
- Need: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash Redis REST API).
- Half-done state: in-process EventEmitter bus works in development; needs Upstash for stateless Vercel functions at scale.
- To resolve: create Upstash Redis instance, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.local`, tell the agent "OP-7 ready".

## OP-5, Blob storage token   [open]
- Date: 2026-06-06
- Blocks: T-802 live BlobSeam (real trace storage for the verify-hash artifact)
- Need: `BLOB_RW_TOKEN` (e.g. Vercel Blob read-write token).
- Half-done state: live BlobSeam coded; falls back to local filesystem in mock mode.
- To resolve: provide `BLOB_RW_TOKEN` in `.env.local`, tell the agent "OP-5 ready".

## OP-6, Neon Postgres URL   [open]
- Date: 2026-06-06
- Blocks: T-803 live DB read-model (leaderboard/traces over live data)
- Need: `DATABASE_URL` (Neon serverless Postgres connection string).
- Half-done state: drizzle schema + live client skeleton ready; pglite used in mock and tests.
- To resolve: provide `DATABASE_URL` in `.env.local`, tell the agent "OP-6 ready".

## OP-8, v2 run prerequisites (keys, env, confirmations)   [open]
- Date: 2026-06-07
- Blocks: every live-post gate in the v2 run. The build (DataSource seam, sources, reconciler, scheduler code) proceeds without these, but no real Sepolia attestation (Gate 1a/1b/2a/3) can be captured until they are set.
- Need (from BOMBE-V2-PRD.md Sec 7):
  - Jun 7: create a posting key granted `OPERATOR_ROLE` (fund ~0.5 MNT); create attestor keys (min bond 0.1 MNT + stake headroom); REMOVE the deployer/admin key from the agent environment; create a fine-grained repo-write token (contents:write, this repo only) for the scheduler's committed sample/marker; set the live env vars. The `demo-stable` tag is already created at the current main.
  - Jun 8: confirm three genuinely different models respond through the existing gateway (currently `AI_GATEWAY_MODELS=gpt-oss:20b`, only one is wired, so today the consensus mechanism would be labeled "single-model triple-run redundancy" per D6); confirm the DoraHacks deadline TIMEZONE and exact BUIDL form fields; confirm Ollama Cloud rate limits on a daily path.
  - Jun 9: Mantlescan API key to verify the 4 contracts.
- Half-done state: the deployer key and v1 agent keys exist in `.env.local` from the v1 deploy, but the v2 constitution forbids using the deployer key and wants a separated posting/attestor key model. Until the operator sets up the v2 key classes, the agent will not post live transactions (it must not use the deployer key).
- To resolve: complete the Jun 7 setup, add the keys/token/env to `.env.local` and GitHub secrets, then tell the agent which gates are unblocked.

## Resolved

## OP-4, Mantle Sepolia RPC + funded wallets   [done]
- Date: 2026-06-06 (resolved 2026-06-06)
- Blocks: T-804 deploy:testnet + T-J01/T-J02/T-J03 real on-chain attestations
- Outcome: RPC `https://rpc.sepolia.mantle.xyz` (chain 5003; original `rpc.testnet.mantle.xyz` was dead), deployer `0xe415…7a83` funded 0.84 MNT, 3 agent + human + plugboard wallets generated in `.env.local`. LiveWalletSeam wired and tested (T-406).

## OP-3, AI gateway key (real LLM)   [done]
- Date: 2026-06-06 (resolved 2026-06-06)
- Blocks: T-801 live ModelSeam + all live agent runs
- Outcome: Ollama Cloud wired for testing (`https://ollama.com/v1`, model `gpt-oss:20b`, key in `.env.local`). LiveModelSeam implemented (T-801) as OpenAI-compatible chat-completions. Real benchmark run: 5/12 match rate (42%), gpt-oss:20b produces valid tool calls but tool input schemas often fail validation → TOOL_FAILURE abstain; TIER3 (claim D) always correct. For production: Vercel AI Gateway with the same OpenAI-compatible LiveModelSeam using provider-specific model IDs.

## OP-2, YieldProof submodule URL   [done]
- Date: 2026-06-05 (resolved 2026-06-06)
- Blocks: optional real-submodule wiring (resolved in T-012)
- Outcome: repo `https://github.com/imanishbarnwal/YieldProof` exists and was wired as a reference submodule at `contracts/lib/yieldproof`. The interface is **incompatible** with PRD §6.2: it uses `uint256` claimIds, a fee-based `attestToClaim`, and `struct Attestor{bool isRegistered; uint256 stake}`, no `{attestor,claimId,decision,timestamp}` record. The submodule is Hardhat-based and does NOT break Foundry's build (forge builds only what's imported, and nothing imports the submodule's contracts). The vendored `IYieldProofAttestor.sol` in `contracts/src/interfaces/` is retained as the canonical build interface per PRD §6.2 fallback; our contracts do not consume YieldProof's registry.

## OP-1, GitHub remote & auth   [done]
- Date: 2026-06-05
- Blocks: T-008 (remote create + push)
- Need: operator confirms repo + working push auth.
- Half-done state: remote `origin` = https://github.com/jishnu-baruah/Bombe.git wired; `main` pushed successfully (auth via cached credentials). Repo owner Jishnu Baruah (jishnu-baruah).
- To resolve: RESOLVED, remote exists and push works. (Minor: a stale `credential.helper=manager-core` git config prints a harmless warning on push; fix only if pushes start prompting.)
