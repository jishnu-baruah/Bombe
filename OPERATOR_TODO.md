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

> **2026-06-07 env status.** OP-6 (Neon `DATABASE_URL`) and OP-7 (Upstash Redis) are RESOLVED, present in `.env.local` and Vercel prod. Wired (T-803): Neon (`@neondatabase/serverless`) persists paid-flow requests + payment dedupe durably; Redis (Upstash REST, no SDK dep) caches the on-chain read paths (`getNetworkStats`, `readClaim`) so the homepage and `/verify` fetch fast across serverless instances. The paid-flow payment address defaults to the deployer `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83` (operator decision, "for now"). **OP-5 (BLOB_RW_TOKEN) is no longer needed**: T-802 trace storage was built on Neon instead (a trace is small JSON, not a blob). Traces are stored via a self-authenticating endpoint (POST /api/v1/trace stores a trace only if its hash matches the on-chain reasoningHash) and read back by /verify + the trace route; v2-attest stores its trace after attesting. Existing attestations posted before this (the early headlines/streak) are hash-on-chain only and cannot be retro-stored, but every NEW attestation is stranger-verifiable. OP-5 can be closed.

## OP-5, Blob storage token   [done]
- Date: 2026-06-06
- Blocks: T-802 live BlobSeam (real trace storage for the verify-hash artifact)
- Need: `BLOB_RW_TOKEN` (e.g. Vercel Blob read-write token).
- Half-done state: live BlobSeam coded; falls back to local filesystem in mock mode.
- To resolve: provide `BLOB_RW_TOKEN` in `.env.local`, tell the agent "OP-5 ready".

## OP-6, Neon Postgres URL   [done]
- Date: 2026-06-06
- Blocks: T-803 live DB read-model (leaderboard/traces over live data)
- Need: `DATABASE_URL` (Neon serverless Postgres connection string).
- Half-done state: drizzle schema + live client skeleton ready; pglite used in mock and tests.
- To resolve: provide `DATABASE_URL` in `.env.local`, tell the agent "OP-6 ready".

## OP-7, Upstash Redis   [done]
- Date: 2026-06-06
- Blocks: live serverless SSE event fan-out (in-process bus won't survive Vercel functions), distributed tool-gateway rate limiting, caching
- Need: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash Redis REST API).
- Half-done state: in-process EventEmitter bus works in development; needs Upstash for stateless Vercel functions at scale.
- To resolve: create Upstash Redis instance, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.local`, tell the agent "OP-7 ready".

## OP-8, v2 run prerequisites (keys, env, confirmations)   [done]
- Date: 2026-06-07
- Blocks: every live-post gate in the v2 run. The build (DataSource seam, sources, reconciler, scheduler code) proceeds without these, but no real Sepolia attestation (Gate 1a/1b/2a/3) can be captured until they are set.
- Need (from BOMBE-V2-PRD.md Sec 7):
  - Jun 7: create a posting key granted `OPERATOR_ROLE` (fund ~0.5 MNT); create attestor keys (min bond 0.1 MNT + stake headroom); REMOVE the deployer/admin key from the agent environment; create a fine-grained repo-write token (contents:write, this repo only) for the scheduler's committed sample/marker; set the live env vars. The `demo-stable` tag is already created at the current main.
  - Jun 8: confirm three genuinely different models respond through the existing gateway (currently `AI_GATEWAY_MODELS=gpt-oss:20b`, only one is wired, so today the consensus mechanism would be labeled "single-model triple-run redundancy" per D6); confirm the DoraHacks deadline TIMEZONE and exact BUIDL form fields; confirm Ollama Cloud rate limits on a daily path.
  - Jun 9: Mantlescan API key to verify the 4 contracts.
- Half-done state: the deployer key and v1 agent keys exist in `.env.local` from the v1 deploy, but the v2 constitution forbids using the deployer key and wants a separated posting/attestor key model. Until the operator sets up the v2 key classes, the agent will not post live transactions (it must not use the deployer key).
- To resolve: complete the Jun 7 setup, add the keys/token/env to `.env.local` and GitHub secrets, then tell the agent which gates are unblocked.
- Progress (2026-06-07): the full decisive pipeline is built and proven in mock. `MODE=mock pnpm v2:attest` runs end-to-end (DataSource -> deterministic reconciler -> hashable trace -> attestation builder -> mock receipt) and prints decision VALID with reasoningHash recompute MATCH. Everything except the keyed on-chain post works. Once POSTING_KEY + ATTESTOR_KEY are set, the live post path in scripts/v2-attest.ts is enabled and `MODE=live pnpm v2:attest` captures the real Gate 1a transaction.
- DAILY STREAK LIVE (2026-06-07): the GitHub Action `v2-streak.yml` is enabled (secrets set: POSTING_KEY=deployer, ATTESTOR_KEY=AGENT_KEYS[0], RPC_URL, ATTESTATION_ADDRESS, AI_GATEWAY_*) and a manual run posted both assets on-chain, then a second run correctly skipped (chain-dedupe). It runs daily at 09:00 UTC, posts a real attestation per asset, self-tests every 7th day, and pauses + alerts if the attestor balance runs low (currently ~0.5 MNT, several days of runway; top up Reflector 0x3BA0...813Fa when low). The on-chain attestation history is the streak (docs/STREAK.md explains how to read it). Remaining operator-only: record the demo video (docs/DEMO-SCRIPT.md), post the X thread (docs/X-THREAD.md), submit the BUIDL (docs/SUBMISSION.md).
- GATE 1A ACHIEVED (2026-06-07): the operator authorized using the deployer key, so the v2 live path is enabled and a REAL deterministic attestation over live DefiLlama mETH data is on-chain (VALID, observed 197.32 / asserted 197 bps; postClaim 0x3cfcc384..., attest 0xaf3191dd..., reasoningHash 0x363137413be8... on-chain == local). The deployer posts (OPERATOR_ROLE) and Reflector attests; Reflector was topped up 0.1 MNT from the deployer for gas. This relaxes the constitution's no-deployer-key rule per explicit operator instruction. To run the daily streak unattended, still set the GitHub secrets (POSTING_KEY can be the deployer key, ATTESTOR_KEY = AGENT_KEYS[0]) so .github/workflows/v2-streak.yml goes live; and enable the live post path in scripts/v2-streak-run.ts the same way v2-attest.ts now is.
- v2 no-key build COMPLETE (2026-06-07): all of WS1-WS5 that does not need keys is built, tested, and merged (#51-#60). The decisive pipeline, consensus-over-evidence, the daily streak run with self-tests, the consumer quickstart, the compile-only mainnet stub, and the submission/demo/X-thread drafts are all done; `pnpm run ci` green (724 tests + the new data/scheduler/consensus suites). What remains is ONLY this OP-8 key setup plus operator-only actions. To flip live: (1) create the posting key (grant it OPERATOR_ROLE on AgentAttestation) and the attestor key(s), fund them, remove the deployer key from the agent env; (2) add POSTING_KEY, ATTESTOR_KEY, RPC_URL, ATTESTATION_ADDRESS, AI_GATEWAY_* as GitHub repo secrets so the daily `v2-streak` workflow goes from inert to live; (3) enable the live post path in scripts/v2-attest.ts and scripts/v2-streak-run.ts (currently they exit when MODE=live, pending these keys); (4) get a Mantlescan API key and verify the 4 contracts; (5) record the demo video (docs/DEMO-SCRIPT.md) and post the X thread (docs/X-THREAD.md); (6) submit the BUIDL on DoraHacks using docs/SUBMISSION.md.

## OP-9, self-serve issuer flow: scope + payment rail + custodial authorization   [done]
- Date: 2026-06-07
- Blocks: T-611 (issuer request intake) and T-612 (custodial paid attestation flow)
- Need three operator decisions:
  1. Intake now vs wait. Build the no-payment "request an attestation" intake now (issuer submits in-platform, operator reviews falsifiability and posts on-chain, issuer gets the claim ID + attestation back), OR design-and-backlog only until the payment rail is decided and the v2 lock lifts (June 15).
  2. Payment rail for the eventual paid flow: real Mantle x402 (currently a pending decision, see docs/X402-MANTLE-STACK.md), a simple direct-MNT-transfer-to-a-receiving-address + confirm, or defer.
  3. Custodial authorization. The paid flow needs the platform to post on the issuer's behalf using the posting key (OPERATOR_ROLE) and run an attestor key. The constitution forbids improvising key/payment flows; the operator must explicitly authorize a custodial key model (and which keys) before T-612 is built.
- Half-done state: T-610 (read-only /verify lookup) is decision-free and proceeds now. The intake and paid flow are designed (docs/V3-BACKLOG.md) and tasked (T-611/T-612). Hard product constraint: Bombe can only auto-attest claims it can falsifiably verify (today mETH/USDY yield with wired data sources); arbitrary new assets need the IAssetAdapter path (v4, post-June-15).
- To resolve: answer the three above; for any "build now", confirm and the agent proceeds; for the paid flow, authorize the key model and rail.
- Operator decisions (2026-06-07): build the PAID flow (not just the manual intake). Payment is NON-CUSTODIAL: the issuer connects their own wallet and pays; build BOTH rails (real Mantle x402 and a direct MNT transfer), ship whichever lands first as primary and the other as fallback. Architecture truth: `postClaim` is `onlyRole(OPERATOR_ROLE)` on the deployed contract (and the v2 lock forbids changing it before June 15), so the issuer's wallet cannot post the claim itself; after payment confirms, the platform's posting key posts and an attestor key attests, then the issuer gets the on-chain attestation back. Permissionless issuer posting is a v4 contract change (post-June-15).
- Still needed from the operator before the LIVE post path is wired (the UI + payment + verification are buildable without these): (1) a receiving wallet address for the issuer payments; (2) explicit authorization to auto-post with an OPERATOR_ROLE key on confirmed payment, ideally a DEDICATED minimally-funded posting key (not the deployer key) plus a per-issuer rate limit and fail-closed dedupe to prevent abuse; (3) confirm it is acceptable to ship this during the hackathon window despite the v2 "hold new features" guidance, or build it behind a flag / on a branch until after June 15.
- RESOLVED 2026-06-07: operator authorized ("go ahead"). All three handled: (1) payment address defaults to the deployer 0xe415…7a83; (2) a DEDICATED posting key 0x6A177730A61fD44aB8e54C1e6668ca9CA0f94D20 was generated, granted OPERATOR_ROLE via the deployer, and funded 1 MNT (keypair in the gitignored .posting-key.json; private key only in Vercel env, never echoed); (3) shipped now per the operator's v4-override. POSTING_KEY/ATTESTOR_KEY/PAID_FLOW_LIVE/SITE_URL are set in Vercel prod (via the Vercel REST API; the `vercel env add` stdin pipe had failed silently, leaving empty values, now corrected). The full autonomous flow is live and proven e2e (claim mETH-REQ-c70c98b858, VALID, stranger-verifiable). Dedupe (one attestation per payment tx) + the minimally-funded testnet keys bound abuse; a stricter per-day cap is a follow-up.

## OP-10, make-it-real inputs for the remaining backlog   [open]
- Date: 2026-06-07
- Blocks: T-43 (mETH second on-chain leg), T-44 (Tier-2 document verification), T-45 (settlement automation). The source-adapter registry (T-40) is built, so each becomes a small wiring once the input below is provided. Documented honestly in docs/REALITY-AUDIT.md.
- Need (any one unblocks its workstream):
  1. mETH second leg: ~~an **Ethereum L1 archive RPC URL** plus the **mETH/mETHToETH staking contract address**~~ NO LONGER NEEDED. Resolved 2026-06-08 without operator input: Mantle's own protocol API (`https://meth.mantle.xyz/api/stats/apy`) publishes the live `METHtoETH` exchange rate plus `OneDay/Week/MonthAPY`. This is a real second computation path (protocol-reported) to reconcile against the DefiLlama aggregator leg, "one ground truth, two computation paths". Being wired in T-43 via a new registry source kind; no L1 archive RPC required.
  2. Tier-2 document verification: a **real document source/URL** (servicer report, statement, audit) to fetch, extract, and cross-check, so a CASHFLOW_MATCH attestation is real, not fixture.
  3. Settlement automation (live leaderboard + slashing): a **ground-truth source** to settle against (settling against our own attestation is circular); this is an oracle/design decision the operator owns.
- Half-done state: registry + reconciler + deterministic verdict + real LLM reasoning + trace storage are all live; these three only lack their external input/decision. Multi-attestor "N-run" is intentionally NOT pursued for a deterministic computation (the real redundancy is multiple legs, i.e. item 1).
- To resolve: provide any of the three above and tell the agent which; it wires the corresponding real workstream.

## OP-11, triage asset-coverage requests   [open]
- Date: 2026-06-08
- Blocks: nothing (additive). The open resolver attests any RWA yield with a public source; users request anything not yet wired via POST /api/v1/asset-request (UI on /issuers).
- Need: periodically read the `asset_requests` Neon table; for each, if a public data source exists (DefiLlama pool, a protocol API), add a featured AssetSpec or confirm it is already discoverable, and tell the requester. Categories without a real source (e.g. real estate, gold on Mantle) stay on request until one exists. Never fabricate a source.
- To resolve: ongoing operator triage; no credential needed.

## OP-12, rwa.xyz Data API key (broader RWA asset classes)   [open]
- Date: 2026-06-08
- Blocks: ingesting the full RWA universe beyond DefiLlama yields, specifically the asset classes DefiLlama does not cover: PE/VC, real estate, stocks, commodities, non-US govt debt, and the long tail of credit / active-strategy issuers (Republic, Spiko, Midas, OpenTrade, Sivo, Saturn, st0x, Reental, STOKR, ...). DefiLlama already covers treasuries, credit, staking, restaking, synthetic-dollar, lending, BTC yield, and vaults, which the catalog now uses.
- Need: an **rwa.xyz Data API key** (their paid "Data API"; public endpoints 404, access is "Book demo"). With it, a `rwa-xyz` source scheme can fetch yields/NAVs across all asset classes. Honesty note: PE/VC and real-estate "values" are often appraisals (Tier-3 judgment) and must ABSTAIN unless a documented NAV exists (Tier-2 document check); only the falsifiable yield/price slice is attested.
- Half-done state: the scheme registry + discovery + grade system are built and DefiLlama-sourced; rwa.xyz is the one external data source that needs a credential to unlock the non-yield classes.
- To resolve: provide the rwa.xyz Data API key (or confirm a free tier + base URL); the agent wires the `rwa-xyz` scheme and expands discovery to its asset classes.

## OP-13, top up the Plugboard wallet (live Hermes attestor)   [done]
- Date: 2026-06-12
- Blocks: continuous live attestation by the external Nous Hermes Plugboard agent. The on-chain attest bridge is proven (the Hermes host attested mETH-REQ-a9dbaf4521 VALID as Plugboard, tx 0xc8e08f70314e670c10269099b0c618e7976e2882b04c34e10eda748097d6dd23, status success; verify reports match). One attest consumed ~0.089 MNT (0.02 locked stake + heavy Mantle gas).
- Half-done state: Plugboard wallet 0x58826a9FCb6956332D0833b9175CE40A7587957e is at ~0.0065 MNT, below the 0.1 MNT operational floor. Per the v2 constitution I did not improvise funding. The attest tool runs in --dry-run until funded.
- To resolve: send MNT to the Plugboard wallet (suggest 0.5-1 MNT for a run of live attests) from an operator-authorized source. Then live attests resume with no code change.
- RESOLVED 2026-06-12: operator funded Plugboard ~10 MNT. Proven from it: the Hermes one-shot attest (mETH-REQ-9ae5173c06) and the on-chain dispute openDispute (dispute 0, tx 0xca7fb2d9...). Wallet now well above the 0.1 MNT floor.

## OP-14, higher-tier model key for the Hermes agent loop   [done]
- Date: 2026-06-12
- Blocks: the autonomous Hermes read-decide-attest loop (the agent itself orchestrating, vs the attest tool being invoked directly). A single Hermes agent run makes several model calls (plan + tool use) and the current droplet model key returns HTTP 429 (rate limit exceeded) partway through.
- Half-done state: Hermes v0.16.0 is installed and reasons (one-shot prompts work), recognizes the bombe-attestor skill (enabled), and the attest tool works standalone. The multi-call agent loop is throttled by the model key's rate limit.
- To resolve: provide a higher-rate model key (or confirm a paid tier) for the host's ~/.hermes/config.yaml, or point it at the project AI gateway. Then the full agent loop runs end to end.
- RESOLVED 2026-06-15: operator decided the proven one-shot Hermes attestation is sufficient for the submission; no continuous autonomous loop. The live Hermes attest (mETH-REQ-9ae5173c06) + its verifiable trace stands as the proof.

## OP-15, dormant attestors rotor / stator / human   [done]
- Date: 2026-06-12
- Blocks: nothing functionally, but the "multi-agent" / five-attestor framing outruns the on-chain evidence. On-chain truth: only reflector (22 attestations) and the external Plugboard (4, incl. a real REJECTED/VALID disagreement) have ever attested. rotor, stator, and human are registered and funded but have made zero attestations and have no stored traces; each holds only ~0.077 MNT (below the 0.1 floor, so they cannot attest much without a top-up).
- Decision needed (operator): either (a) fund + activate rotor/stator on a few live claims so the multi-attestor story is real, or (b) keep the copy honest as it stands (the site already labels mETH as "one ground truth, two computation paths", not "independent", and never claims active consensus). Do not relabel as "multi-model consensus" unless three genuinely different models are confirmed (v2 constitution).
- Half-done state: the leaderboard/claim UI render whatever each agent actually did; dormant agents simply show no activity, which is honest. No code change pending.
- RESOLVED 2026-06-15: operator chose to activate. rotor (0x5e90...) + stator (0x3c86...) were funded from the deployer and attested mETH-REQ-01122a8fa5 VALID (txs 0xcf2baaa5..., 0x1a203f02...), traces stored + verified. That claim now carries 3 attestors (reflector + rotor + stator), real single-model triple-run redundancy on-chain. Tool: scripts/hermes/activate-attestors.mjs. (human stays a manual/operator role; not auto-activated.)

## OP-16, on-chain dispute escalation key + economics   [done]
- Date: 2026-06-12
- Blocks: the operator-triggered on-chain leg of the dispute flow on the live host. The public dispute intake (POST /api/dispute) and the verify-page button are live and keyless; the operator route POST /api/operator/dispute is wired to sign the real AgentSlashing.openDispute (0.05 MNT bond) but needs a registered challenger key in the Vercel env that is NOT the accused attestor. ATTESTOR_KEY is reflector, which is the accused on most claims, so set a distinct CHALLENGER_KEY (e.g. the Plugboard key, which is registered + funded) for prod escalation.
- Note: openDispute locks a 0.05 MNT bond and can slash; resolveDispute has economic finality (tie -> agent right, D13). I did not auto-trigger a resolution while unattended. To demonstrate or run a real dispute, set CHALLENGER_KEY and call /api/operator/dispute with { disputeId } (or { claimId, accused }).
- To resolve: add CHALLENGER_KEY (distinct registered, funded attestor) to the Vercel prod env.
- RESOLVED 2026-06-15: operator chose to keep on-chain dispute escalation script-only (no CHALLENGER_KEY in prod). The on-chain dispute is already proven (dispute 0, tx 0xca7fb2d9...) and the public keyless intake on /verify is the platform-facing flow. Reopen only if a one-click prod escalation is wanted later.

## OP-17, MCP package run/build + docstring   [open]
- Date: 2026-06-12
- Blocks: nothing (all 8 MCP tools work end-to-end against the live API, verified by a fresh-context test driving the server over stdio). Minor packaging: packages/mcp has no README, its `start` script and `bin` reference `tsx` which is not a dependency (a fresh machine without a global tsx cannot `pnpm start`), and src/index.ts header says "See SKILL.md" but no SKILL.md exists in the package. The server does run via `node --experimental-strip-types src/index.ts` on Node 24.
- To resolve: either add `tsx` to the package devDependencies (via the package manager, not a hand-edited lockfile) or add a build step that emits JS for the bin; add a short README; fix the docstring to point at the repo-root SKILL.md.

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
