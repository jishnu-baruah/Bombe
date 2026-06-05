# Bombe — Task Board

The file is the board; every status change is a visible commit.

## Status legend

- `pending` — not started; deps may or may not be met.
- `in-progress YYYY-MM-DD` — picked up, being built.
- `review` — code complete, PR open, awaiting merge.
- `blocked — <reason | see OP-N>` — cannot proceed; cites the reason or the `OPERATOR_TODO.md` entry that gates it.
- `done YYYY-MM-DD` — Acceptance criteria pass and the merge landed.

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

## Task block format

```
### T-XXX — <task title>
- Status: pending
- Depends-on: T-AAA, T-BBB        # or — for none
- Scope: contracts               # contracts | shared | agent-sdk | runner | web | ops | docs | ...
- Acceptance: <checkable criteria, ending with (PRD §refs)>
- Notes: —
```

Status values: `pending` / `in-progress YYYY-MM-DD` / `review` / `blocked — <reason or see OP-N>` / `done YYYY-MM-DD`. Every Acceptance line cites the PRD section + the §14 acceptance-criteria number it satisfies. `Depends-on: —` means no dependencies.

> **Bootstrap note:** Setup tasks T-001–T-008 are completed by the bootstrap pass and marked `done` in a follow-up commit (T-000). They are seeded here as `pending`; the T-000 commit flips them.

---

## T-0xx — Ops

### T-001 — .gitattributes line-ending normalization
- Status: done 2026-06-05
- Depends-on: —
- Scope: ops
- Acceptance: `* text=auto eol=lf`, binary rules for images, lockfile marked `-diff linguist-generated`; git stops warning about CRLF. (PRD §5)
- Notes: done by this plan.

### T-002 — docs restructure (PRD→docs/, DECISIONS, DEMO, runbook)
- Status: done 2026-06-05
- Depends-on: —
- Scope: docs
- Acceptance: PRD relocated to `docs/bombe-prd.md`; `docs/DECISIONS.md` (D1–D6 + ESCALATIONS), `docs/DEMO.md` (A→D stub), `docs/runbooks/workflow.md` created. (PRD §5, §15.3)
- Notes: done by this plan.

### T-003 — CLAUDE.md agent operating manual
- Status: done 2026-06-05
- Depends-on: —
- Scope: docs
- Acceptance: auto-loaded manual with the 8 required sections (one-liner, start-of-session checklist, conventions, merge policy D6, fix-loop, OPERATOR_TODO protocol, guardrails, definition of done). (PRD §15.3, §15.4)
- Notes: done by this plan.

### T-004 — CONTEXT.md strategic framing
- Status: done 2026-06-05
- Depends-on: —
- Scope: docs
- Acceptance: locked framing with the 6 required sections (thesis, claim taxonomy, the four attestors, non-goals, definition of done, determinism contract). (PRD §2, §14)
- Notes: done by this plan.

### T-005 — TODO.md board
- Status: done 2026-06-05
- Depends-on: —
- Scope: docs
- Acceptance: header (legend + numbering table + block template) plus every task block T-0xx…T-9xx, each with Status/Depends-on/Scope/Acceptance/Notes; board parses. (PRD §5)
- Notes: done by this plan.

### T-006 — OPERATOR_TODO.md human-in-the-loop queue
- Status: done 2026-06-05
- Depends-on: —
- Scope: docs
- Acceptance: purpose, `OP-N` entry format, agent protocol, `## Open` and `## Resolved` sections; OP-1 (GitHub remote/auth) recorded. (PRD §15.4)
- Notes: done by this plan.

### T-007 — CI workflow + PR template
- Status: done 2026-06-05
- Depends-on: —
- Scope: ops
- Acceptance: `.github/workflows/ci.yml` runs `pnpm run ci` on PRs + non-main pushes (Foundry + pnpm + Node 22); `.github/pull_request_template.md` enforces task-ID + acceptance checklist; YAML valid. (PRD §8)
- Notes: done by this plan.

### T-008 — GitHub remote create + push
- Status: done 2026-06-05
- Depends-on: T-007
- Scope: ops
- Acceptance: `origin` set, `main` pushed, Actions tab shows CI. (PRD §8)
- Notes: OP-1 resolved — `origin` = https://github.com/jishnu-baruah/Bombe.git, `main` pushed. CI runs on the next branch/PR push.

### T-009 — pnpm workspace bootstrap
- Status: done 2026-06-05
- Depends-on: T-008
- Scope: ops
- Acceptance: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example` (every PRD §7 var, no values), Biome (lint+format) config, vitest config; root scripts `test`/`test:agent`/`test:demo`/`demo`/`ci`/`deploy:testnet` exist as wired stubs that exit non-zero with a "not implemented" message; `pnpm install` succeeds. (PRD §5, §8)
- Notes: —

### T-010 — Foundry init in contracts/
- Status: done 2026-06-05
- Depends-on: T-009
- Scope: ops
- Acceptance: `foundry.toml`, `remappings.txt`, OZ v5 dep, YieldProof git submodule under `contracts/lib/yieldproof` with the vendored `IYieldProofAttestor.sol` fallback recorded in DECISIONS.md; `forge build` succeeds on an empty src. (PRD §5, §6.2)
- Notes: —

### T-011 — CI gate hardening
- Status: done 2026-06-05
- Depends-on: T-009
- Scope: ops
- Acceptance: `.github/workflows/ci.yml` no longer double-specifies the pnpm version (reads it from `package.json` `packageManager`); `main` branch protection requires the `ci` status check so auto-merge actually gates on green CI (D6 enforceable, not just declared). (PRD §8, §15.4)
- Notes: fixes a bug where PR #1 auto-merged before CI passed because `main` had no required-check protection. See D8.

### T-012 — README progress dashboard + YieldProof reference submodule
- Status: done 2026-06-06
- Depends-on: —
- Scope: ops
- Acceptance: progress generator (`scripts/update-progress.mjs`) + `pnpm progress` script; dashboard in `README.md` between `<!-- PROGRESS:START/END -->`; YieldProof submodule wired as reference at `contracts/lib/yieldproof` (or documented as removed if incompatible); `IYieldProofAttestor.sol` NatSpec note added; OP-2 resolved; D15 in DECISIONS.md. (PRD §5, §12)
- Notes: resolves OP-2. Submodule kept — forge build unaffected (Hardhat project, nothing imported). Vendored interface retained per PRD §6.2 fallback. T-805 will expand the README with architecture diagram, env table, etc.

---

## T-1xx — Contracts (M1)

### T-101 — IYieldProofAttestor interface + vendored fallback
- Status: done 2026-06-05
- Depends-on: T-010
- Scope: contracts
- Acceptance: interface compiles; fallback path documented. (PRD §6.2)
- Notes: interface delivered in T-010 (contracts/src/interfaces/IYieldProofAttestor.sol); compiles, fallback documented in D10.

### T-102 — AgentRegistry
- Status: done 2026-06-05
- Depends-on: T-010
- Scope: contracts
- Acceptance: `registerAgent`/`registerHuman` (MIN_BOND 0.1e), `topUpBond`/`withdrawBond` (blocked during pending dispute, stays ≥MIN_BOND or full exit), reputation int256 role-gated; tests: min-bond revert, human registration, withdraw-blocked-during-dispute. (PRD §6.2, §14.2)
- Notes: contracts/src/AgentRegistry.sol + contracts/test/AgentRegistry.t.sol; 13/13 tests pass; forge fmt clean; contracts:test added to CI gate.

### T-103 — AgentAttestation storage + postClaim
- Status: done 2026-06-05
- Depends-on: T-010, T-101
- Scope: contracts
- Acceptance: `postClaim` emits `ClaimPosted`; `Decision{VALID,REJECTED,ABSTAIN}` enum. (PRD §6.2)
- Notes: contracts/src/AgentAttestation.sol + contracts/test/AgentAttestation.t.sol; 21/21 tests pass; forge fmt clean; D11 in DECISIONS.md.

### T-104 — AgentAttestation.attest + tier-3 revert
- Status: done 2026-06-05
- Depends-on: T-103
- Scope: contracts
- Acceptance: happy path; reverts `NotRegistered`/`AlreadyAttested`/`ClaimAlreadyClosed`/`JudgmentTierRequiresAbstain` (tier 3 + non-ABSTAIN); ABSTAIN locks 0 + never slashable; VALID/REJECTED locks 0.02e; cap 16; `forge fmt` clean. (PRD §6.2, §14.5, §14.6)
- Notes: Combined delivery with T-103. ClaimClosed renamed ClaimAlreadyClosed to avoid identifier collision with the ClaimClosed event (Solidity 0.8.24 does not allow an error and event to share a name).

### T-105 — TuringLeaderboard.settleTier1 + stats/views
- Status: done 2026-06-06
- Depends-on: T-104
- Scope: contracts
- Acceptance: updates epoch stats, releases/forwards locked stake; `epochStats`/`lifetimeStats` views; tests: settle correct. (PRD §6.2, §14.7)
- Notes: contracts/src/TuringLeaderboard.sol + contracts/test/Settlement.t.sol; co-delivered with T-106; 15 settlement tests pass (49 total forge). D12 in DECISIONS.md. Added SETTLER_ROLE + seizeStake to AgentAttestation (Part A) and fixed ZeroRegistry nit.

### T-106 — AgentSlashing Tier 1
- Status: done 2026-06-06
- Depends-on: T-105
- Scope: contracts
- Acceptance: wrong → burn 50% / redistribute 50% pro-rata via pull payments; reputation wrong −10 / correct +1 / abstain ±0; reentrancy guards; tests: settle-wrong slash math, pro-rata across 2 correct, reputation deltas, no ABSTAIN in any slash. (PRD §6.2, §9, §14.6)
- Notes: contracts/src/AgentSlashing.sol; co-delivered with T-105. Burn = ETH retained forever in contract (totalBurned). Reputation applied by Leaderboard (D12), not here. Conservation seized==burn+distributed asserted; full fuzz deferred to T-108.

### T-107 — AgentSlashing Tier 2 disputes
- Status: done 2026-06-06
- Depends-on: T-106
- Scope: contracts
- Acceptance: `openDispute` (0.05e bond) / `vote` (one per attestor, weight=bond, window) / `resolveDispute` (stake-weighted; agent-wrong vs agent-right economics); tests: both verdicts, withdrawal blocked during dispute. (PRD §6.2)
- Notes: AgentSlashing constructor gains `disputeWindowSeconds` immutable param; AgentRegistry.adjustReputation/setDisputePending now guard NotRegistered; D13 in DECISIONS.md; 17 new tests pass (66 total). Settlement.t.sol constructor call updated to pass 4 args.

### T-108 — Fuzz + deep-test wiring
- Status: done 2026-06-06
- Depends-on: T-106
- Scope: contracts
- Acceptance: `testFuzz_SlashConservation(uint96,uint8)` asserts distributed+burned==locked; `pnpm test:contracts:deep` runs long fuzz outside the fast loop. (PRD §6.2, §14.2)
- Notes: contracts/test/SlashConservation.t.sol; fuzz passes 256 runs default / 10 000 runs deep profile; `[profile.deep.fuzz] runs = 10_000` in foundry.toml; `test:contracts:deep` + `contracts:test:deep` added to root package.json.

### T-109 — Deploy.s.sol
- Status: done 2026-06-06
- Depends-on: T-107
- Scope: contracts
- Acceptance: env-driven `epochSeconds`/`disputeWindowSeconds` (demo 300/60), deploys all four contracts wired with roles; anvil deploy succeeds. (PRD §6.2)
- Notes: contracts/script/Deploy.s.sol; dry-run `forge script script/Deploy.s.sol` logs all 4 addresses and runs successfully; D14 in DECISIONS.md documents canonical role topology. M1 complete: 4 contracts + 71 tests (incl. fuzz) all pass.

---

## T-2xx — shared + agent-sdk (M2)

### T-201 — packages/shared taxonomy
- Status: done 2026-06-06
- Depends-on: T-009
- Scope: shared
- Acceptance: `ClaimSchema`, `ClaimTier`, pure `tierOf(claimType)`; zod; never trusts submitter tier. (PRD §6.1)
- Notes: —

### T-202 — canonicalJson() + hashing
- Status: done 2026-06-06
- Depends-on: T-201
- Scope: shared
- Acceptance: recursively sorted keys; `reasoningHash=keccak256(canonicalJson(x))`; tests: two identical traces → identical hash. (PRD §6.3, §14.4)
- Notes: packages/shared/src/canonical.ts; canonicalJson + hashCanonical + reasoningHash/sourcesHash convenience wrappers; viem keccak256/toBytes; 22 tests all pass.

### T-203 — test-report.ts + events.ts schemas
- Status: done 2026-06-06
- Depends-on: T-201
- Scope: shared
- Acceptance: `TestReport` interface (PRD §15.1) and all SSE event zod schemas (claim/agent-step/agent-done/human-queue/epoch/dispute). (PRD §6.5, §15.1, §14.17)
- Notes: TestReportSchema + FailureCategory in test-report.ts; SseEventSchema discriminated union in events.ts; 75 tests all pass; biome + tsc clean.

### T-204 — fixtures loader + fixtures tree
- Status: done 2026-06-06
- Depends-on: T-201
- Scope: shared
- Acceptance: `loadOracleSnapshot`/`loadDocument`/`loadModelScript`/`loadHumanDecision` pure fns; `fixtures/` tree incl. stale meth (claim B) and mismatched docs (claim C), `documents/v1/`, `model-costs.json`, `human-decisions.json`. (PRD §5, §6.3)
- Notes: —

### T-205 — agent-sdk seams
- Status: done 2026-06-06
- Depends-on: T-203
- Scope: agent-sdk
- Acceptance: `ModelSeam`/`BlobSeam`/`WalletSeam`/`ClockSeam`/`HumanQueueSeam` interfaces with `live`/`mock`/`stub` impls selected by `MODE`/`TEST_MODE`. (PRD §6.3)
- Notes: packages/agent-sdk created; config.ts is the sole process.env reader (PRD §15.4); live seams are skeletons (T-801/802); 53 tests pass; pnpm run ci green.

### T-206 — ModelRouter
- Status: done 2026-06-06
- Depends-on: T-205
- Scope: agent-sdk
- Acceptance: primary→FALLBACK_MODEL→mock; 429/5xx/timeout triggers in-step fallback; trace records `{modelSwitched,from,to,reason}`; test: stubbed 429 → fallback → `modelSwitched:true`. (PRD §6.3.1, §14.14)
- Notes: ModelError class + ModelRouter + createModelRouter factory in packages/agent-sdk/src/model-router.ts; 29 tests pass; switch records exposed via router.switches array + onSwitch callback.

### T-207 — cost circuit breaker
- Status: done 2026-06-06
- Depends-on: T-206
- Scope: agent-sdk
- Acceptance: cumulative tokens×model-costs > `MAX_COST_USD_PER_RUN` (0.05) forces ABSTAIN(COST_CAPPED); test with burning stub. (PRD §6.3.1, §14.15)
- Notes: CostBreaker class in packages/agent-sdk/src/cost-breaker.ts; AbstainReason union in reasons.ts; 17 tests pass; unknown model cost treated as 0 (flagged in unknownModels set).

### T-208 — tool error recovery
- Status: done 2026-06-06
- Depends-on: T-205
- Scope: agent-sdk
- Acceptance: throw → `{error,recoverable}`; recoverable → 1 retry; else ABSTAIN(TOOL_FAILURE) + `errors` row; loop never crashes; test with throwing stub. (PRD §6.3.1, §14.15)
- Notes: runToolWithRecovery in packages/agent-sdk/src/tool-recovery.ts; never throws; ToolErrorRow emitted for every failure; 23 tests pass.

### T-209 — router.ts TOOL_MAP
- Status: done 2026-06-06
- Depends-on: T-201
- Scope: agent-sdk
- Acceptance: per-claimType tool map; unmapped tool request → structured refusal observation; FAIR_VALUE → no tools. (PRD §6.3.2)
- Notes: TOOL_MAP + allowedTools/isToolAllowed/refusalObservation in packages/agent-sdk/src/router.ts; 29 tests pass; FAIR_VALUE=[] enforced at compile time.

### T-210 — tools: price/yield feeds + snapshots
- Status: done 2026-06-06
- Depends-on: T-204, T-209
- Scope: agent-sdk
- Acceptance: `fetch_chainlink_price`/`fetch_meth_yield`(stale fixture)/`fetch_usdy_yield`; zod I/O `{value,source,fetchedAt,confidence}`; deterministic snapshot tests. (PRD §6.3)
- Notes: tools/feeds.ts; stale→confidence 2000 bps+value.stale:true; 85 tool tests + 9 snapshots written; all 332 tests pass; pnpm run ci exit 0.

### T-211 — tools: chain-state + compute
- Status: done 2026-06-06
- Depends-on: T-204
- Scope: agent-sdk
- Acceptance: `query_chain_state` DSL (`balanceOf`,`eventOccurred`) + `compute_expected` (pure, ±2bps); snapshot tests. (PRD §6.3)
- Notes: tools/chain-compute.ts; DSL backed by fixtures/chain/state.json; compute_expected ±2bps tolerance validated with boundary tests.

### T-212 — tools: document + history
- Status: done 2026-06-06
- Depends-on: T-204
- Scope: agent-sdk
- Acceptance: `read_document` (servicer report + statement, mismatched pair for C) + `cross_check_history` (Postgres); snapshot tests. (PRD §6.3)
- Notes: tools/doc-history.ts; cashflow mismatch 50000 vs 45000 exposed; HistorySource seam + MockHistorySource for tests; real DB wired in T-403.

### T-213 — loop.ts ReAct + hard rules
- Status: done 2026-06-06
- Depends-on: T-206, T-207, T-208, T-209, T-210, T-211, T-212
- Scope: agent-sdk
- Acceptance: model proposes thought+action; SDK executes to finalize/maxSteps; hard rules tier3→ABSTAIN(overridden), BELOW_THRESHOLD, STALE_SINGLE_SOURCE, STEP_BUDGET; trace v1.0 shape; tests for each ABSTAIN path. (PRD §6.3, §14.6)
- Notes: T-214 cleanup nits applied: staleSourceCount dead var removed, MODEL_ABSTAIN added to AbstainReason, import fixed to `import type`.

### T-214 — attest.ts builder
- Status: done 2026-06-06
- Depends-on: T-213, T-202
- Scope: agent-sdk
- Acceptance: assembles `{claimId,tier,decision,confidenceBps,sourcesHash,reasoningHash,traceURI}`, signs via WalletSeam, writes `agent_runs`/`attestations` row w/ latency+cost; payload-shape test. (PRD §6.3)
- Notes: M2 SDK core complete. Source sort key: (name ASC, source ASC). Decision enum: VALID=0, REJECTED=1, ABSTAIN=2. InMemoryAttestationRepository for tests. 268 agent-sdk tests pass; 364 total; pnpm run ci exit 0.

---

## T-3xx — reference agents (M2/M4)

### T-301 — Reflector (conservative 8500/8)
- Status: pending
- Depends-on: T-214
- Scope: agent-reference
- Acceptance: requires 2 independent sources; scripted run on claim B → ABSTAIN(STALE_SINGLE_SOURCE) with stable hash. (PRD §6.4, M2 checkpoint)
- Notes: —

### T-302 — Rotor (aggressive 6500/5)
- Status: pending
- Depends-on: T-214
- Scope: agent-reference
- Acceptance: commits above threshold; never abstains for staleness alone. (PRD §6.4)
- Notes: —

### T-303 — Stator (cost-optimized 7000/4)
- Status: pending
- Depends-on: T-214
- Scope: agent-reference
- Acceptance: shortest path; abstains when tools disagree. (PRD §6.4)
- Notes: —

### T-304 — mock model-scripts A–D for the three SDK agents
- Status: pending
- Depends-on: T-301, T-302, T-303
- Scope: agent-reference
- Acceptance: `fixtures/model-scripts/{agent}/{claimId}.json` produce the §6.7 outcomes deterministically. (PRD §6.4, §6.7)
- Notes: —

---

## T-4xx — runner + indexer + gateway + DB (M3)

### T-401 — DB schema + migrations + pglite
- Status: pending
- Depends-on: T-009
- Scope: runner
- Acceptance: drizzle tables claims/attestations/agents/epoch_stats/events/errors; committed migrations; pglite boots zero-dep. (PRD §6.5)
- Notes: —

### T-402 — indexer
- Status: pending
- Depends-on: T-401, T-109
- Scope: indexer
- Acceptance: subscribe (mock EventEmitter / live viem), idempotent upsert on (txHash,logIndex). (PRD §6.5)
- Notes: —

### T-403 — runner
- Status: pending
- Depends-on: T-213, T-401
- Scope: runner
- Acceptance: subscribes `ClaimPosted`, runs 3 SDK agents via `Promise.allSettled` w/ 15s timeout; failures isolated; every failure → `errors` row + structured event. (PRD §4, §6.3.1)
- Notes: —

### T-404 — human queue seam
- Status: pending
- Depends-on: T-403
- Scope: runner
- Acceptance: simulated human attestor; `human-queue` SSE w/ sampled wait; submits `human-decisions.json` via standard `attest()`. (PRD §6.9)
- Notes: —

### T-405 — tool-gateway
- Status: pending
- Depends-on: T-210, T-211, T-212
- Scope: tool-gateway
- Acceptance: `POST /tools/:name` bearer auth + 60/min rate limit, same zod schemas, thin wrapper (never a rewrite); round-trip test green. (PRD §6.8, §9, M3 checkpoint)
- Notes: —

### T-406 — anvil integration
- Status: pending
- Depends-on: T-403, T-402, T-109
- Scope: runner
- Acceptance: `pnpm demo --headless` seeds claim A → 4 attestation rows + on-chain records. (PRD §11 M3)
- Notes: —

---

## T-5xx — Plugboard mock path (M4)

### T-501 — transcript replay engine
- Status: pending
- Depends-on: T-405, T-403
- Scope: plugboard
- Acceptance: replays `fixtures/model-scripts/plugboard/{claimId}.json` through gateway+wallet, no model API; validator test `keccak256(canonicalJson(steps))==traceHash` for every transcript. (PRD §6.8, §14.11)
- Notes: —

### T-502 — claim-D revert flow
- Status: pending
- Depends-on: T-501
- Scope: plugboard
- Acceptance: `contractRevert` step → send tx → expect `JudgmentTierRequiresAbstain` → `blockedByProtocol:true` in agent-done → resubmit ABSTAIN; anvil integration test. (PRD §6.8, §14.11)
- Notes: —

### T-503 — skill snapshot plumbing
- Status: pending
- Depends-on: T-501
- Scope: plugboard
- Acceptance: pre-settlement copy skill → `epoch-snapshots/epoch-N.skill.md`, keccak256 in `agents.skill_hash`; every attestation row carries active hash; mock pins epoch-0 skill. (PRD §6.8, §14.12)
- Notes: —

### T-504 — live fallback + isolation
- Status: pending
- Depends-on: T-501
- Scope: plugboard
- Acceptance: Hermes offline → auto replay + "RUNTIME OFFLINE" badge; killing Plugboard process leaves SDK agents + settlement unaffected (claim A with Plugboard disabled test). (PRD §6.8, §14.13)
- Notes: —

### T-505 — plugboard fixtures
- Status: pending
- Depends-on: T-501
- Scope: plugboard
- Acceptance: transcripts A–D + `epoch-0.skill.md` (taxonomy, tool catalog, Tier3→ABSTAIN rule, wallet usage). (PRD §6.8)
- Notes: —

---

## T-6xx — web app (M5)

### T-601 — app shell + SSE
- Status: pending
- Depends-on: T-403, T-401, T-203
- Scope: web
- Acceptance: Next.js 16 App Router, Tailwind v4, dark theme, monospace hashes; `/api/stream` `text/event-stream`; `EventSource` routes by `kind`. (PRD §6.6, §6.5)
- Notes: —

### T-602 — / landing
- Status: pending
- Depends-on: T-601
- Scope: web
- Acceptance: thesis, delta table, taxonomy explainer, CTAs. (PRD §6.6)
- Notes: —

### T-603 — /live race view
- Status: pending
- Depends-on: T-601
- Scope: web
- Acceptance: 5 columns/stacked cards, streams agent-step, decision chips incl **BLOCKED BY PROTOCOL**, guided-demo auto-advance A→D <90s w/ toasts. (PRD §6.6, §6.7)
- Notes: —

### T-604 — /leaderboard
- Status: pending
- Depends-on: T-601
- Scope: web
- Acceptance: interleaved human/AI, accuracy excludes abstentions, sortable, all §6.6 columns. (PRD §6.6, §14.8)
- Notes: —

### T-605 — /claim/[id] trace viewer
- Status: pending
- Depends-on: T-601, T-202
- Scope: web
- Acceptance: per-agent tabs, step render, source hashes, **verify-hash button** recomputes `keccak256(canonicalJson(trace))` client-side; Plugboard skill_hash + epoch-snapshot diff. (PRD §6.6, §14.4, §14.12)
- Notes: —

### T-606 — /operator + operator API
- Status: pending
- Depends-on: T-601
- Scope: web
- Acceptance: all endpoints (seed-claim/advance/settle/register-agent/human-attest/freeze-plugboard) gated by `x-operator-key`; "Attest as Human" form. (PRD §6.6, §9, §14.8)
- Notes: —

### T-607 — /operator/health
- Status: pending
- Depends-on: T-606
- Scope: web
- Acceptance: reads `.test-reports/` summaries, model latency/error/failover counts, demo readiness, mode, Plugboard status. (PRD §6.6, §10)
- Notes: —

### T-608 — responsive ≤380px
- Status: pending
- Depends-on: T-603
- Scope: web
- Acceptance: all routes usable at 380px; race view stacks w/ tap-to-expand. (PRD §6.6)
- Notes: —

---

## T-7xx — autonomous testing (M6)

### T-701 — JSON reporters
- Status: pending
- Depends-on: T-203, T-108
- Scope: testing
- Acceptance: `forge test --json` + vitest `--reporter=json` write `.test-reports/*` conforming to `test-report.ts`. (PRD §15.1, §14.17)
- Notes: —

### T-702 — scripts/test-agent.ts
- Status: pending
- Depends-on: T-701
- Scope: testing
- Acceptance: runs all suites, normalizes+categorizes (heuristic, `unknown` ok) into one machine-readable summary. (PRD §15.1, §14.16)
- Notes: —

### T-703 — scripts/test-demo.ts golden path
- Status: pending
- Depends-on: T-406, T-502, T-304
- Scope: testing
- Acceptance: boots mock headless, advances A→D, waits 4 attestations/claim (5s each), asserts §6.7 matrix + hash stability, <30s. (PRD §15.2, §14.3, §14.16)
- Notes: —

### T-704 — scripts/seed-bug.ts drill
- Status: pending
- Depends-on: T-702
- Scope: testing
- Acceptance: injects inverted contract-test assertion + a tool type error; builder detects both via reports and fixes within the protocol. (PRD §15.3, M6)
- Notes: —

---

## T-8xx — live seams + ship (M8)

### T-801 — live ModelSeam (AI gateway)
- Status: pending
- Depends-on: T-205
- Scope: agent-sdk
- Acceptance: compiles/typechecks; live call best-effort. (PRD §8 M8, §14.9)
- Notes: **OP:** AI_GATEWAY_KEY.

### T-802 — live Blob + Wallet seams (viem)
- Status: pending
- Depends-on: T-205
- Scope: agent-sdk
- Acceptance: compiles/typechecks. (PRD §14.9)
- Notes: **OP:** BLOB_RW_TOKEN, *_KEYs.

### T-803 — live DB (Neon)
- Status: pending
- Depends-on: T-401
- Scope: runner
- Acceptance: `DATABASE_URL` wiring; compiles. (PRD §6.5)
- Notes: **OP:** DATABASE_URL.

### T-804 — pnpm deploy:testnet
- Status: pending
- Depends-on: T-109
- Scope: ops
- Acceptance: deploys to Mantle Sepolia (chain 5003); boot fail-fast w/ named error on any missing live var. (PRD §5, §7, §14.9)
- Notes: **OP:** RPC_URL + keys.

### T-805 — README
- Status: pending
- Depends-on: —
- Scope: docs
- Acceptance: 10-line quickstart, architecture diagram, env table, Plugboard trust model, "Why not LangGraph/CrewAI/ElizaOS?" rationale; quickstart works as written. (PRD §12, §14.10)
- Notes: —

### T-806 — DEMO.md + DECISIONS.md final pass
- Status: pending
- Depends-on: T-606
- Scope: docs
- Acceptance: exact A→D click-path incl. guided mode + fallback notes; all resolved ambiguities dated. (PRD §12)
- Notes: —

### T-807 — ship gate
- Status: pending
- Depends-on: all above
- Scope: ops
- Acceptance: `pnpm run ci` exits 0 from fresh clone w/ submodules, no creds; `pnpm demo` cold-start <60s; A→D deterministic twice. (PRD §14.1, §14.3, §11 M8)
- Notes: —

---

## T-9xx — STRETCH (M7)

> STRETCH tasks run only after §14.1–17 pass and must not modify earlier-milestone packages. They never gate acceptance.

### T-901 — Telegram bot (/race, /leaderboard, /subscribe)
- Status: pending
- Depends-on: —
- Scope: stretch
- Acceptance: bot exposes `/race`, `/leaderboard`, `/subscribe`. (PRD §11 M7)
- Notes: STRETCH — never gates acceptance.

### T-902 — Discord bot (threads, channel whitelist)
- Status: pending
- Depends-on: —
- Scope: stretch
- Acceptance: bot with threads + channel whitelist. (PRD §11 M7)
- Notes: STRETCH — never gates acceptance.

### T-903 — /turing blind mode
- Status: pending
- Depends-on: —
- Scope: stretch
- Acceptance: blind human-vs-AI `/turing` mode. (PRD §6.6, §11 M7)
- Notes: STRETCH — never gates acceptance.
