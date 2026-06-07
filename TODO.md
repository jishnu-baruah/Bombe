# Bombe, Task Board

The file is the board; every status change is a visible commit.

> **Active work is at the top. Completed tasks are condensed into `## Done (archive)` at the bottom**, newest areas last, one line each with the merge date. Open the git history of a task ID for its full acceptance notes.
>
> **Current source of truth is the v2/v3 PRDs**, not the original M1-M8 milestone framing. The M1-M8 build (contracts, SDK, agents, runner, web, tests, live seams) is complete and live on Mantle Sepolia. What remains is a short tail of polish/ship tasks plus the v3 agent-access surface (some of which is gated on operator credentials or external-council decisions).
>
> Hackathon submission gates live in the `T-Jxx` blocks. Full rubric and requirement→task map: [`HACKATHON.md`](HACKATHON.md). **Mandate: ship live on-chain, not a mock.**

## Status legend

- `pending`, not started; deps may or may not be met.
- `in-progress YYYY-MM-DD`, picked up, being built.
- `review`, code complete, PR open, awaiting merge.
- `blocked, <reason | see OP-N>`, cannot proceed; cites the reason or the `OPERATOR_TODO.md` entry that gates it.
- `done YYYY-MM-DD`, Acceptance criteria pass and the merge landed (archived below).

## Numbering legend (range → area → PRD milestone)

| Range | Area | PRD milestone |
|-------|------|---------------|
| T-0xx | Repo / workflow / ops / CI / deploy | this pass, M8 |
| T-1xx | Contracts (Foundry) | M1 |
| T-2xx | `packages/shared` + `agent-sdk` | M2 |
| T-3xx | `agent-reference` | M2 / M4 |
| T-4xx | Runner + indexer + tool-gateway + DB | M3 |
| T-5xx | Plugboard mock path | M4 |
| T-6xx | Web app + operator API | M5 |
| T-7xx | Autonomous testing harness | M6 |
| T-8xx | Live seams + ship (README/DEMO/DECISIONS) | M8 |
| T-9xx | Stretch (M7: Discord, `/turing`, Telegram bot) | M7 |
| T-Jxx | Hackathon submission & judging gates | submission |

## Task block format

```
### T-XXX, <task title>
- Status: pending
- Depends-on: T-AAA, T-BBB        # or, for none
- Scope: contracts               # contracts | shared | agent-sdk | runner | web | ops | docs | ...
- Acceptance: <checkable criteria, ending with (PRD §refs)>
- Notes: none
```

---

## Active

### T-J05, Demo video (≥ 2 min) of the live core use case
- Status: blocked, operator-only (screen recording)
- Depends-on: T-J04, T-806
- Scope: docs
- Acceptance: ≥2-minute screen recording walking the A→D claim flow on the **live** deployment, narrated for non-technical viewers; public link in HACKATHON.md §8. (Deployment Award §Product; Best UI/UX; Community Voting)
- Notes: script is ready at `docs/DEMO-SCRIPT.md`; only the operator can record + publish.

### T-J06, DoraHacks submission package
- Status: review 2026-06-07
- Depends-on: T-J01, T-J02, T-J03, T-J04, T-J05, T-805
- Scope: docs
- Acceptance: DoraHacks submission filled, track nomination, one-line pitch, three "Tell us" answers, 4 deployed addresses, verified links, the live attest tx hash, public frontend URL, demo-video link, repo URL. (Grand Champion + AI & RWA)
- Notes: Package drafted at `docs/SUBMISSION.md`. Remaining are operator-owned: demo video (T-J05), confirm deadline + hit submit.

### T-J07, Community Voting asset (X thread + shareable demo)
- Status: blocked, operator-only (posting)
- Depends-on: T-J05
- Scope: stretch
- Acceptance: a shareable X thread linking the demo video + public URL, framing the pain point and the falsifiable-attestation thesis. (Community Voting)
- Notes: STRETCH; draft ready at `docs/X-THREAD.md`; operator posts.

### T-901, Telegram bot (/race, /leaderboard, /subscribe)
- Status: blocked, needs a Telegram bot token (operator credential)
- Depends-on: none
- Scope: stretch
- Acceptance: bot exposes `/race`, `/leaderboard`, `/subscribe`. (PRD §11 M7)
- Notes: STRETCH, never gates acceptance.

### T-902, Discord bot (threads, channel whitelist)
- Status: blocked, needs a Discord bot token (operator credential)
- Depends-on: none
- Scope: stretch
- Acceptance: bot with threads + channel whitelist. (PRD §11 M7)
- Notes: STRETCH, never gates acceptance.

---

## Done (archive)

One line per landed task, grouped by area. The full acceptance notes live in the merge commit for each task ID.

### T-0xx, Ops / workflow / CI
- T-001 done 2026-06-05 — .gitattributes line-ending normalization
- T-002 done 2026-06-05 — docs restructure (PRD→docs/, DECISIONS, DEMO, runbook)
- T-003 done 2026-06-05 — CLAUDE.md agent operating manual
- T-004 done 2026-06-05 — CONTEXT.md strategic framing
- T-005 done 2026-06-05 — TODO.md board
- T-006 done 2026-06-05 — OPERATOR_TODO.md human-in-the-loop queue
- T-007 done 2026-06-05 — CI workflow + PR template
- T-008 done 2026-06-05 — GitHub remote create + push
- T-009 done 2026-06-05 — pnpm workspace bootstrap
- T-010 done 2026-06-05 — Foundry init in contracts/
- T-011 done 2026-06-05 — CI gate hardening (required status check, D8)
- T-012 done 2026-06-06 — README progress dashboard + YieldProof reference submodule (OP-2, D15)
- T-013 done 2026-06-06 — integrate live-ship mandate + reference docs (D16, OP-3..OP-6)
- T-014 done 2026-06-06 — auto-update README progress dashboard on every PR

### T-1xx, Contracts (M1)
- T-101 done 2026-06-05 — IYieldProofAttestor interface + vendored fallback
- T-102 done 2026-06-05 — AgentRegistry (bond, reputation, dispute guards)
- T-103 done 2026-06-05 — AgentAttestation storage + postClaim (D11)
- T-104 done 2026-06-05 — AgentAttestation.attest + tier-3 revert
- T-105 done 2026-06-06 — TuringLeaderboard.settleTier1 + stats/views (D12)
- T-106 done 2026-06-06 — AgentSlashing Tier 1 (burn/redistribute, reputation)
- T-107 done 2026-06-06 — AgentSlashing Tier 2 disputes (D13)
- T-108 done 2026-06-06 — Fuzz + deep-test wiring (conservation)
- T-109 done 2026-06-06 — Deploy.s.sol (4 contracts wired, D14)
- T-016 done 2026-06-06 — CLAIM_FEE reward model + 0-100 trust score

### T-2xx, shared + agent-sdk (M2)
- T-201 done 2026-06-06 — packages/shared taxonomy
- T-202 done 2026-06-06 — canonicalJson() + hashing
- T-203 done 2026-06-06 — test-report.ts + events.ts schemas
- T-204 done 2026-06-06 — fixtures loader + fixtures tree
- T-205 done 2026-06-06 — agent-sdk seams (Model/Blob/Wallet/Clock/HumanQueue)
- T-206 done 2026-06-06 — ModelRouter (fallback + switch trace)
- T-207 done 2026-06-06 — cost circuit breaker
- T-208 done 2026-06-06 — tool error recovery
- T-209 done 2026-06-06 — router.ts TOOL_MAP
- T-210 done 2026-06-06 — tools: price/yield feeds + snapshots
- T-211 done 2026-06-06 — tools: chain-state + compute
- T-212 done 2026-06-06 — tools: document + history
- T-213 done 2026-06-06 — loop.ts ReAct + hard rules
- T-214 done 2026-06-06 — attest.ts builder (M2 SDK core complete)

### T-3xx, reference agents (M2/M4)
- T-301 done 2026-06-06 — Reflector (conservative 8500/8)
- T-302 done 2026-06-06 — Rotor (aggressive 6500/5)
- T-303 done 2026-06-06 — Stator (cost-optimized 7000/4)
- T-304 done 2026-06-06 — mock model-scripts A–D for the three SDK agents
- T-015 done 2026-06-06 — agent prompt tool-schema + few-shot improvements
- T-017 done 2026-06-06 — multi-run benchmark harness + free-model tuning

### T-4xx, runner + indexer + gateway + DB (M3)
- T-401 done 2026-06-06 — DB schema + migrations + pglite
- T-402 done 2026-06-06 — indexer (idempotent upsert)
- T-403 done 2026-06-06 — runner (3 agents, Promise.allSettled, isolation)
- T-404 done 2026-06-06 — human queue seam
- T-405 done 2026-06-06 — tool-gateway (bearer auth + rate limit)
- T-406 done 2026-06-06 — anvil integration (pnpm demo --headless)

### T-5xx, Plugboard mock path (M4)
- T-501 done 2026-06-06 — transcript replay engine
- T-502 done 2026-06-06 — claim-D revert flow
- T-503 done 2026-06-06 — skill snapshot plumbing
- T-504 done 2026-06-06 — live fallback + isolation (RUNTIME OFFLINE)
- T-505 done 2026-06-06 — plugboard fixtures (transcripts A–D + epoch-0 skill)

### T-6xx, web app (M5)
- T-601 done 2026-06-06 — app shell + SSE
- T-608 done 2026-06-07 — responsive ≤380px verified (all 8 routes, no horizontal overflow, race view stacks)
- T-38 done 2026-06-07 — inline-gloss component + glossary; applied on /verify, /leaderboard, /claim; internal spec refs (§6.7) removed from /live public copy
- T-018 done 2026-06-06 — UI taste-skill redesign + TASTE-CONTEXT.md
- T-602 done 2026-06-06 — / landing
- T-019 done 2026-06-06 — fix landing layout (Tailwind v4 spacing/size collision)
- T-603 done 2026-06-06 — /live race view
- T-604 done 2026-06-06 — /leaderboard
- T-605 done 2026-06-06 — /claim/[id] trace viewer (client verify-hash)
- T-606 done 2026-06-06 — /operator + operator API
- T-607 done 2026-06-06 — /operator/health

### T-7xx, autonomous testing (M6)
- T-701 done 2026-06-06 — JSON reporters (forge + vitest → .test-reports/)
- T-702 done 2026-06-06 — scripts/test-agent.ts
- T-703 done 2026-06-06 — scripts/test-demo.ts golden path
- T-704 done 2026-06-07 — seed-bug detection drill (injects contract_logic + typescript_type, detects both, self-cleans)

### T-8xx, live seams + ship (M8)
- T-801 done 2026-06-06 — live ModelSeam (AI gateway, OpenAI-compatible)
- T-803 done 2026-06-07 — Neon DATABASE_URL wired (@neondatabase/serverless; durable paid-flow request persistence + payment dedupe); the read paths are Redis-cached (Upstash) for speed (OP-6 + OP-7)
- T-802 done 2026-06-07 — durable reasoning-trace storage on Neon (no blob token needed): self-authenticating POST /api/v1/trace stores a trace only if its hash matches the on-chain reasoningHash; GET /api/trace/[claimId]/[attestor] + /verify read it back; v2-attest stores its trace after on-chain confirmation
- T-804 done 2026-06-07 — deploy:testnet wrapper (fail-fast env validation + redeploy guard honoring the v2 lock)
- T-805 done 2026-06-07 — README (architecture, env table, HTTP API, Plugboard trust model, why-not-frameworks)
- T-806 done 2026-06-07 — DEMO.md final pass (live path + guided mode + operator click-path + fallback notes)
- T-807 done 2026-06-07 — ship gate verified (pnpm run ci green; test:demo 18/18, A→D deterministic, hash stable 0xc3cef617…, <60s cold start)

### T-9xx, stretch (M7)
- T-903 done 2026-06-07 — /turing blind human-vs-AI mode (guess identity from behavior, reveal + score), live

### T-Jxx, hackathon submission & judging gates
- T-J01 done 2026-06-06 — live Mantle Sepolia deployment + canonical addresses
- T-J02 done 2026-06-07 — verify all 4 contracts on Mantle Explorer
- T-J03 done 2026-06-06 — prove an AI function is callable on-chain (live attest tx)
- T-J04 done 2026-06-06 — live on-chain data layer (web reads chain via viem)
- T-J08 done 2026-06-06 — issuer page + integrate page + integration guide
- T-J09 done 2026-06-07 — public agent-read API (v1) live + deployed (see below)
- T-610 done 2026-06-07 — public /verify lookup page (claim ID / reasoning hash / tx -> on-chain proof), live
- T-611 done 2026-06-07 — self-serve paid flow part 1: /request connect-wallet + compose + pay (non-custodial), live
- T-612 done 2026-06-07 — autonomous paid flow part 2: on verified payment the agent posts + attests + stores the trace and returns a verifiable claim, fully live (dedicated posting key 0x6A17…4D20 w/ OPERATOR_ROLE; POSTING_KEY/ATTESTOR_KEY/PAID_FLOW_LIVE in Vercel). Proven e2e: claim mETH-REQ-c70c98b858 VALID, /verify recomputed == on-chain hash

---

## v2 / v3 notes (current source of truth: the v2/v3 PRDs)

These are tracked outside the T-number board; they layer on top of the completed M1-M8 build.

- **v2 decisive-reconciler attestation layer: shipped and live.** Deterministic Tier-1 verdict, both mETH + USDY headline attestations on-chain, daily streak GitHub Action, all 4 contracts verified. See `docs/BOMBE-V2-PRD.md`, `docs/STREAK.md`, `docs/DEPLOYMENTS.md`.
- **Public agent-read API (v1): shipped + deployed** (tracked as T-J09 in the archive). `apps/web/app/api/v1/{assets,claims/[claimId],verify/[claimId]}` + `apps/web/lib/public-api.ts`, CORS, no keys. Context-less consumer test `pnpm test:api` passes against production at https://bombe-web.vercel.app/api/v1.
- **Durable trace storage + stranger-verifiable `/verify`: blocked on OP-5** (`BLOB_RW_TOKEN`). Live attestations currently store a placeholder traceURI, so `/verify` returns `trace_unavailable`. This is the #1 remaining v3 item.
- **MCP server / SKILL.md / SSE feed / npx verify / x402: pending external-council decisions** on the v3.2 PRD (`docs/BOMBE-V3-AGENT-ACCESS-PRD.md`, `docs/BOMBE-V3-PRD-FOLLOWUP.md`). x402 is an explicit pending decision (`docs/X402-MANTLE-STACK.md`). Do not build ahead of the council; new feature ideas go to `docs/V3-BACKLOG.md`.
