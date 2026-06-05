# Bombe Dev-Workflow Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the complete solo-developer workflow for Bombe — git conventions, Claude context files, the docs structure, a fully-seeded `TODO.md` task board, the `OPERATOR_TODO.md` human-in-the-loop queue, CI, and the GitHub remote — so that all subsequent product work (M1–M8) runs against a traceable board.

**Architecture:** Pure scaffolding pass. No `contracts/`, `packages/*`, or `apps/*` code (spec D2). The deliverables are markdown + git config + one GitHub Actions workflow. Built on a single bootstrap branch (the PR ceremony it sets up can't apply to its own creation), then merged. Verification is structural, not unit tests.

**Tech Stack:** git, GitHub CLI (`gh`), GitHub Actions, Markdown. (The product stack — pnpm/Node 22/TS 5/Foundry/Next.js 16 — is only *referenced* by the board, not installed here.)

**Source spec:** `docs/superpowers/specs/2026-06-05-bombe-dev-workflow-design.md` (decisions D1–D6).

**Already done during brainstorming:** `git init` (branch `main`), `.gitignore`, the PRD at repo root, and the design spec — committed as `c3594d1` + `460f537`.

---

## File structure (created by this plan)

| File | Responsibility |
|------|----------------|
| `.gitattributes` | Normalize line endings (`eol=lf`) — kills the CRLF churn on Windows |
| `CLAUDE.md` | Agent operating manual, auto-loaded each session: conventions + fix-loop + guardrails |
| `CONTEXT.md` | Locked strategic framing: thesis, non-goals, acceptance = done |
| `docs/bombe-prd.md` | The PRD, relocated from root (frozen spec) |
| `docs/DECISIONS.md` | Dated ambiguity log, seeded with D1–D6 |
| `docs/DEMO.md` | A→D demo click-path (stub) |
| `docs/runbooks/workflow.md` | Human-readable workflow protocol + fix-loop |
| `TODO.md` | The task board — all product tasks (T-0xx…T-9xx) |
| `OPERATOR_TODO.md` | Human-in-the-loop queue (OP-N entries) |
| `.github/workflows/ci.yml` | Runs `pnpm ci` on PRs/branch pushes; releases auto-merge |
| `.github/pull_request_template.md` | Enforces task-ID + acceptance checklist on every PR |

**Bootstrap branch:** all tasks below land on `chore/T-000-workflow-bootstrap`, one commit per task, then merged to `main` (Task 9). The remote (Task 8) is operator-gated.

---

## Task 1: Repo hygiene — `.gitattributes` (T-001)

**Files:**
- Create: `.gitattributes`

- [ ] **Step 1: Create the bootstrap branch**

```bash
git checkout -b chore/T-000-workflow-bootstrap
```

- [ ] **Step 2: Write `.gitattributes`**

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.lock -diff
pnpm-lock.yaml -diff linguist-generated
```

- [ ] **Step 3: Verify git stops warning about CRLF**

Run: `git add .gitattributes && git status`
Expected: `.gitattributes` staged; no fatal errors. (Existing CRLF warnings are cosmetic and resolve on next normalize.)

- [ ] **Step 4: Commit**

```bash
git commit -m "T-001: add .gitattributes to normalize line endings"
```

---

## Task 2: docs restructure (T-002)

**Files:**
- Move: `bombe-prd.md` → `docs/bombe-prd.md`
- Create: `docs/DECISIONS.md`, `docs/DEMO.md`, `docs/runbooks/workflow.md`

- [ ] **Step 1: Relocate the PRD**

```bash
git mv bombe-prd.md docs/bombe-prd.md
```

- [ ] **Step 2: Create `docs/DECISIONS.md`** — seed with the six workflow decisions, the PRD's "record ambiguities here" protocol, and an empty ESCALATIONS section.

Required content:
- Header explaining the file's purpose (per PRD §0 prime directive + §15.3).
- A dated `## 2026-06-05 — Workflow setup` section with a table reproducing **D1–D6 verbatim from the spec's Decisions table** (Lightweight solo / workflow-only scope / GitHub remote + real PRs / no TG workflow notifications / OPERATOR_TODO queue / hybrid auto-merge), each with rationale.
- A note that D6 is a scoped exception to PRD §15.4 ("main requires human approval"): only `docs/`/`chore/` auto-merge; logic PRs still need manual approval.
- An empty `## ESCALATIONS` section with the format: `### <date> — T-XXX <test>` / `Two failed attempts. Analysis: …`.

- [ ] **Step 3: Create `docs/DEMO.md`** — stub with the A→D table skeleton.

Required content: a heading, a one-line purpose, and the four-row claim table (A mETH YIELD_BPS / B stale feed / C CASHFLOW_MATCH mismatch / D FAIR_VALUE tier-3) with columns `Claim | Tier | Operator action | Expected outcome`, values copied from PRD §6.7, plus a `TODO: fill exact click-path once /operator exists (T-606)` line under it. (This is the one allowed TODO — it points at the task that resolves it.)

- [ ] **Step 4: Create `docs/runbooks/workflow.md`** — human-readable copy of spec §3 + §8.

Required content:
- Branch naming (`feat|fix|docs|chore/T-XXX-slug`).
- Commit format (`T-XXX: <verb> <object>`).
- PR title (`T-XXX — <title>`), one-task-one-PR, split rule.
- Merge gating (D6 hybrid): docs/chore auto-merge on green CI; feat/fix manual.
- The task lifecycle: pick (deps done) → in-progress → build via fix-loop → `pnpm test:demo` gate → PR → merge flips to Done.
- The fix-loop (PRD §15.3) and guardrails (§15.4) in brief, linking `CLAUDE.md` as the authoritative copy.

- [ ] **Step 5: Verify structure**

Run: `git add -A docs/ && git status --short`
Expected: `R  bombe-prd.md -> docs/bombe-prd.md`, plus three new `A docs/...` lines.

- [ ] **Step 6: Commit**

```bash
git commit -m "T-002: relocate PRD and add DECISIONS, DEMO, workflow runbook"
```

---

## Task 3: `CLAUDE.md` (T-003)

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `CLAUDE.md`** — the auto-loaded operating manual. Required sections:

1. **Project one-liner** — Bombe = autonomous AI attestor network for RWA claims on Mantle Sepolia; safety lives at the contract layer. Point to `CONTEXT.md` for thesis and `docs/bombe-prd.md` for the full spec.
2. **Start-of-session checklist** — read `CONTEXT.md`, `TODO.md`, `OPERATOR_TODO.md`; pick a `pending` task whose deps are `done`.
3. **Conventions** — branch/commit/PR formats (from runbook), one-task-one-PR.
4. **Merge policy (D6)** — docs/chore: enable `gh pr merge --auto --squash`; feat/fix: open PR, leave for operator.
5. **The fix-loop (PRD §15.3)** — after any change run `pnpm test:agent`, parse `.test-reports/*`, route failures by category, re-run only the failing test, commit on green. Two fails on one test → log to `docs/DECISIONS.md` ESCALATIONS (or an `OP-N` if it needs the operator) and move on. `pnpm test:demo` must pass before marking a task done.
6. **OPERATOR_TODO protocol** — when blocked on a credential / live-service verification / owner-only decision: append an `OP-N` entry, set the task `Status: blocked — see OP-N`, keep working other unblocked tasks. Never fabricate credentials or fake verification.
7. **Guardrails (PRD §15.4)** — branches only, never push to `main`; `git` checkpoint before each fix session; never edit `.env*`, the lockfile by hand, or `fixtures/model-scripts/**` traceHash values by hand; no `rm -rf` outside build dirs, no `selfdestruct`/`delegatecall`; never disable/skip tests to go green (skipped = failed for milestones); only read `process.env.*KEY*` inside the seams/config module.
8. **Definition of done** — a task is done when its Acceptance criteria pass and the relevant PRD §14 criterion holds.

- [ ] **Step 2: Verify required sections present**

Run: `grep -E "^(#|##) " CLAUDE.md`
Expected: headings for all 8 sections above.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md && git commit -m "T-003: add CLAUDE.md agent operating manual"
```

---

## Task 4: `CONTEXT.md` (T-004)

**Files:**
- Create: `CONTEXT.md`

- [ ] **Step 1: Write `CONTEXT.md`** — locked strategic framing. Required sections:

1. **Thesis** — agents attest only to *falsifiable* claims; judgment claims (Tier 3) → ABSTAIN, never attestation. Attestations are "economically warranted statements," not truth claims. Safety guarantees live at the **contract layer**, proven by Plugboard (external Hermes-runtime agent Bombe didn't write).
2. **Claim taxonomy** — Tier 1 deterministic (auto-slash), Tier 2 document-falsifiable (dispute vote), Tier 3 judgment (abstain-only, contract-rejected). Tier derived from `claimType`, never trusted from submitter.
3. **The four attestors** — Reflector (conservative), Rotor (aggressive), Stator (cost-optimized) on the SDK; Plugboard external, safety enforced only by contracts.
4. **Non-goals (PRD §2)** — no mainnet/token, no real PDF parsing (fixtures only), no KYC, no UMA, no runtime mock/live switching, no SaaS report. Telegram/Discord/`/turing` are stretch (M7) and never gate acceptance.
5. **Definition of done** — the 17 acceptance criteria in PRD §14; `pnpm test:demo` is the "can we submit" oracle.
6. **Determinism contract** — mock mode is fully deterministic (seeded clock, scripted models, pinned skill); identical demo every run.

- [ ] **Step 2: Verify**

Run: `grep -E "^(#|##) " CONTEXT.md`
Expected: headings for all 6 sections.

- [ ] **Step 3: Commit**

```bash
git add CONTEXT.md && git commit -m "T-004: add CONTEXT.md strategic framing"
```

---

## Task 5: `TODO.md` — the seeded task board (T-005)

**Files:**
- Create: `TODO.md`

- [ ] **Step 1: Write the board header** — legend + conventions.

Required content:
- Title + one-line purpose ("the file is the board; every status change is a visible commit").
- Status legend: `pending` / `in-progress YYYY-MM-DD` / `review` / `blocked — <reason | see OP-N>` / `done YYYY-MM-DD`.
- Numbering legend (the range table from spec §6).
- The task block format template (from spec §6).
- Pointer: setup tasks T-001–T-008 are completed by the bootstrap; mark them `done` as part of Task 9.

- [ ] **Step 2: Write every task block** using the format
  `### T-XXX — <title>` / `- Status:` / `- Depends-on:` / `- Scope:` / `- Acceptance: … (PRD §refs)` / `- Notes:`.
  Group under `## T-0xx Ops`, `## T-1xx Contracts`, etc. Use exactly the inventory below. Acceptance lines must cite the PRD section(s) and the §14 criterion where one applies.

**T-0xx — Ops / workflow / CI / deploy**
- T-001 `.gitattributes` line-ending normalization — *done by this plan* — Scope: ops
- T-002 docs restructure (PRD→docs/, DECISIONS, DEMO, runbook) — *done* — Scope: docs
- T-003 CLAUDE.md — *done* — Scope: docs
- T-004 CONTEXT.md — *done* — Scope: docs
- T-005 TODO.md board — *done* — Scope: docs
- T-006 OPERATOR_TODO.md — *done* — Scope: docs
- T-007 CI workflow + PR template — *done* — Scope: ops
- T-008 GitHub remote create + push — Depends-on: T-007 — Scope: ops — Acceptance: `origin` set, `main` pushed, Actions tab shows CI; **operator-gated (gh auth)**.
- T-009 pnpm workspace bootstrap — Depends-on: T-008 — Scope: ops — Acceptance: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example` (every PRD §7 var, no values), Biome (lint+format) config, vitest config; root scripts `test`/`test:agent`/`test:demo`/`demo`/`ci`/`deploy:testnet` exist as wired stubs that exit non-zero with a "not implemented" message; `pnpm install` succeeds. (PRD §5, §8)
- T-010 Foundry init in `contracts/` — Depends-on: T-009 — Scope: ops — Acceptance: `foundry.toml`, `remappings.txt`, OZ v5 dep, YieldProof git submodule under `contracts/lib/yieldproof` with the vendored `IYieldProofAttestor.sol` fallback recorded in DECISIONS.md; `forge build` succeeds on an empty src. (PRD §5, §6.2)

**T-1xx — Contracts (M1)** — all Depends-on: T-010
- T-101 `IYieldProofAttestor` interface + vendored fallback — Acceptance: interface compiles; fallback path documented. (PRD §6.2)
- T-102 `AgentRegistry` — Acceptance: `registerAgent`/`registerHuman` (MIN_BOND 0.1e), `topUpBond`/`withdrawBond` (blocked during pending dispute, stays ≥MIN_BOND or full exit), reputation int256 role-gated; tests: min-bond revert, human registration, withdraw-blocked-during-dispute. (PRD §6.2, §14.2)
- T-103 `AgentAttestation` storage + `postClaim` — Depends-on: T-101 — Acceptance: `postClaim` emits `ClaimPosted`; `Decision{VALID,REJECTED,ABSTAIN}` enum. (PRD §6.2)
- T-104 `AgentAttestation.attest` — Depends-on: T-103 — Acceptance: happy path; reverts `NotRegistered`/`AlreadyAttested`/`ClaimClosed`/`JudgmentTierRequiresAbstain` (tier 3 + non-ABSTAIN); ABSTAIN locks 0 + never slashable; VALID/REJECTED locks 0.02e; cap 16; `forge fmt` clean. (PRD §6.2, §14.5, §14.6)
- T-105 `TuringLeaderboard.settleTier1` + stats/views — Depends-on: T-104 — Acceptance: updates epoch stats, releases/forwards locked stake; `epochStats`/`lifetimeStats` views; tests: settle correct. (PRD §6.2, §14.7)
- T-106 `AgentSlashing` Tier 1 — Depends-on: T-105 — Acceptance: wrong → burn 50% / redistribute 50% pro-rata via pull payments; reputation wrong −10 / correct +1 / abstain ±0; reentrancy guards; tests: settle-wrong slash math, pro-rata across 2 correct, reputation deltas, no ABSTAIN in any slash. (PRD §6.2, §9, §14.6)
- T-107 `AgentSlashing` Tier 2 disputes — Depends-on: T-106 — Acceptance: `openDispute` (0.05e bond) / `vote` (one per attestor, weight=bond, window) / `resolveDispute` (stake-weighted; agent-wrong vs agent-right economics); tests: both verdicts, withdrawal blocked during dispute. (PRD §6.2)
- T-108 Fuzz + deep-test wiring — Depends-on: T-106 — Acceptance: `testFuzz_SlashConservation(uint96,uint8)` asserts distributed+burned==locked; `pnpm test:contracts:deep` runs long fuzz outside the fast loop. (PRD §6.2, §14.2)
- T-109 `Deploy.s.sol` — Depends-on: T-107 — Acceptance: env-driven `epochSeconds`/`disputeWindowSeconds` (demo 300/60), deploys all four contracts wired with roles; anvil deploy succeeds. (PRD §6.2)

**T-2xx — shared + agent-sdk (M2)**
- T-201 `packages/shared` taxonomy — Depends-on: T-009 — Acceptance: `ClaimSchema`, `ClaimTier`, pure `tierOf(claimType)`; zod; never trusts submitter tier. (PRD §6.1)
- T-202 `canonicalJson()` + hashing — Depends-on: T-201 — Acceptance: recursively sorted keys; `reasoningHash=keccak256(canonicalJson(x))`; tests: two identical traces → identical hash. (PRD §6.3, §14.4)
- T-203 `test-report.ts` + `events.ts` schemas — Depends-on: T-201 — Acceptance: `TestReport` interface (PRD §15.1) and all SSE event zod schemas (claim/agent-step/agent-done/human-queue/epoch/dispute). (PRD §6.5, §15.1, §14.17)
- T-204 fixtures loader + fixtures tree — Depends-on: T-201 — Acceptance: `loadOracleSnapshot`/`loadDocument`/`loadModelScript`/`loadHumanDecision` pure fns; `fixtures/` tree incl. stale meth (claim B) and mismatched docs (claim C), `documents/v1/`, `model-costs.json`, `human-decisions.json`. (PRD §5, §6.3)
- T-205 agent-sdk seams — Depends-on: T-203 — Acceptance: `ModelSeam`/`BlobSeam`/`WalletSeam`/`ClockSeam`/`HumanQueueSeam` interfaces with `live`/`mock`/`stub` impls selected by `MODE`/`TEST_MODE`. (PRD §6.3)
- T-206 ModelRouter — Depends-on: T-205 — Acceptance: primary→FALLBACK_MODEL→mock; 429/5xx/timeout triggers in-step fallback; trace records `{modelSwitched,from,to,reason}`; test: stubbed 429 → fallback → `modelSwitched:true`. (PRD §6.3.1, §14.14)
- T-207 cost circuit breaker — Depends-on: T-206 — Acceptance: cumulative tokens×model-costs > `MAX_COST_USD_PER_RUN` (0.05) forces ABSTAIN(COST_CAPPED); test with burning stub. (PRD §6.3.1, §14.15)
- T-208 tool error recovery — Depends-on: T-205 — Acceptance: throw → `{error,recoverable}`; recoverable → 1 retry; else ABSTAIN(TOOL_FAILURE) + `errors` row; loop never crashes; test with throwing stub. (PRD §6.3.1, §14.15)
- T-209 router.ts TOOL_MAP — Depends-on: T-201 — Acceptance: per-claimType tool map; unmapped tool request → structured refusal observation; FAIR_VALUE → no tools. (PRD §6.3.2)
- T-210 tools: price/yield feeds + snapshots — Depends-on: T-204, T-209 — Acceptance: `fetch_chainlink_price`/`fetch_meth_yield`(stale fixture)/`fetch_usdy_yield`; zod I/O `{value,source,fetchedAt,confidence}`; deterministic snapshot tests. (PRD §6.3)
- T-211 tools: chain-state + compute — Depends-on: T-204 — Acceptance: `query_chain_state` DSL (`balanceOf`,`eventOccurred`) + `compute_expected` (pure, ±2bps); snapshot tests. (PRD §6.3)
- T-212 tools: document + history — Depends-on: T-204 — Acceptance: `read_document` (servicer report + statement, mismatched pair for C) + `cross_check_history` (Postgres); snapshot tests. (PRD §6.3)
- T-213 loop.ts ReAct + hard rules — Depends-on: T-206, T-207, T-208, T-209, T-210, T-211, T-212 — Acceptance: model proposes thought+action; SDK executes to finalize/maxSteps; hard rules tier3→ABSTAIN(overridden), BELOW_THRESHOLD, STALE_SINGLE_SOURCE, STEP_BUDGET; trace v1.0 shape; tests for each ABSTAIN path. (PRD §6.3, §14.6)
- T-214 attest.ts builder — Depends-on: T-213, T-202 — Acceptance: assembles `{claimId,tier,decision,confidenceBps,sourcesHash,reasoningHash,traceURI}`, signs via WalletSeam, writes `agent_runs`/`attestations` row w/ latency+cost; payload-shape test. (PRD §6.3)

**T-3xx — reference agents (M2/M4)** — all Depends-on: T-214
- T-301 Reflector (conservative 8500/8) — Acceptance: requires 2 independent sources; scripted run on claim B → ABSTAIN(STALE_SINGLE_SOURCE) with stable hash. (PRD §6.4, M2 checkpoint)
- T-302 Rotor (aggressive 6500/5) — Acceptance: commits above threshold; never abstains for staleness alone. (PRD §6.4)
- T-303 Stator (cost-optimized 7000/4) — Acceptance: shortest path; abstains when tools disagree. (PRD §6.4)
- T-304 mock model-scripts A–D for the three SDK agents — Depends-on: T-301, T-302, T-303 — Acceptance: `fixtures/model-scripts/{agent}/{claimId}.json` produce the §6.7 outcomes deterministically. (PRD §6.4, §6.7)

**T-4xx — runner + indexer + gateway + DB (M3)**
- T-401 DB schema + migrations + pglite — Depends-on: T-009 — Acceptance: drizzle tables claims/attestations/agents/epoch_stats/events/errors; committed migrations; pglite boots zero-dep. (PRD §6.5)
- T-402 indexer — Depends-on: T-401, T-109 — Acceptance: subscribe (mock EventEmitter / live viem), idempotent upsert on (txHash,logIndex). (PRD §6.5)
- T-403 runner — Depends-on: T-213, T-401 — Acceptance: subscribes `ClaimPosted`, runs 3 SDK agents via `Promise.allSettled` w/ 15s timeout; failures isolated; every failure → `errors` row + structured event. (PRD §4, §6.3.1)
- T-404 human queue seam — Depends-on: T-403 — Acceptance: simulated human attestor; `human-queue` SSE w/ sampled wait; submits `human-decisions.json` via standard `attest()`. (PRD §6.9)
- T-405 tool-gateway — Depends-on: T-210, T-211, T-212 — Acceptance: `POST /tools/:name` bearer auth + 60/min rate limit, same zod schemas, thin wrapper (never a rewrite); round-trip test green. (PRD §6.8, §9, M3 checkpoint)
- T-406 anvil integration — Depends-on: T-403, T-402, T-109 — Acceptance: `pnpm demo --headless` seeds claim A → 4 attestation rows + on-chain records. (PRD §11 M3)

**T-5xx — Plugboard mock path (M4)** — base Depends-on: T-405, T-403
- T-501 transcript replay engine — Acceptance: replays `fixtures/model-scripts/plugboard/{claimId}.json` through gateway+wallet, no model API; validator test `keccak256(canonicalJson(steps))==traceHash` for every transcript. (PRD §6.8, §14.11)
- T-502 claim-D revert flow — Depends-on: T-501 — Acceptance: `contractRevert` step → send tx → expect `JudgmentTierRequiresAbstain` → `blockedByProtocol:true` in agent-done → resubmit ABSTAIN; anvil integration test. (PRD §6.8, §14.11)
- T-503 skill snapshot plumbing — Depends-on: T-501 — Acceptance: pre-settlement copy skill → `epoch-snapshots/epoch-N.skill.md`, keccak256 in `agents.skill_hash`; every attestation row carries active hash; mock pins epoch-0 skill. (PRD §6.8, §14.12)
- T-504 live fallback + isolation — Depends-on: T-501 — Acceptance: Hermes offline → auto replay + "RUNTIME OFFLINE" badge; killing Plugboard process leaves SDK agents + settlement unaffected (claim A with Plugboard disabled test). (PRD §6.8, §14.13)
- T-505 plugboard fixtures — Depends-on: T-501 — Acceptance: transcripts A–D + `epoch-0.skill.md` (taxonomy, tool catalog, Tier3→ABSTAIN rule, wallet usage). (PRD §6.8)

**T-6xx — web app (M5)** — base Depends-on: T-403, T-401, T-203
- T-601 app shell + SSE — Acceptance: Next.js 16 App Router, Tailwind v4, dark theme, monospace hashes; `/api/stream` `text/event-stream`; `EventSource` routes by `kind`. (PRD §6.6, §6.5)
- T-602 `/` landing — Depends-on: T-601 — Acceptance: thesis, delta table, taxonomy explainer, CTAs. (PRD §6.6)
- T-603 `/live` race view — Depends-on: T-601 — Acceptance: 5 columns/stacked cards, streams agent-step, decision chips incl **BLOCKED BY PROTOCOL**, guided-demo auto-advance A→D <90s w/ toasts. (PRD §6.6, §6.7)
- T-604 `/leaderboard` — Depends-on: T-601 — Acceptance: interleaved human/AI, accuracy excludes abstentions, sortable, all §6.6 columns. (PRD §6.6, §14.8)
- T-605 `/claim/[id]` trace viewer — Depends-on: T-601, T-202 — Acceptance: per-agent tabs, step render, source hashes, **verify-hash button** recomputes `keccak256(canonicalJson(trace))` client-side; Plugboard skill_hash + epoch-snapshot diff. (PRD §6.6, §14.4, §14.12)
- T-606 `/operator` + operator API — Depends-on: T-601 — Acceptance: all endpoints (seed-claim/advance/settle/register-agent/human-attest/freeze-plugboard) gated by `x-operator-key`; "Attest as Human" form. (PRD §6.6, §9, §14.8)
- T-607 `/operator/health` — Depends-on: T-606 — Acceptance: reads `.test-reports/` summaries, model latency/error/failover counts, demo readiness, mode, Plugboard status. (PRD §6.6, §10)
- T-608 responsive ≤380px — Depends-on: T-603 — Acceptance: all routes usable at 380px; race view stacks w/ tap-to-expand. (PRD §6.6)

**T-7xx — autonomous testing harness (M6)**
- T-701 JSON reporters — Depends-on: T-203, T-108 — Acceptance: `forge test --json` + vitest `--reporter=json` write `.test-reports/*` conforming to `test-report.ts`. (PRD §15.1, §14.17)
- T-702 `scripts/test-agent.ts` — Depends-on: T-701 — Acceptance: runs all suites, normalizes+categorizes (heuristic, `unknown` ok) into one machine-readable summary. (PRD §15.1, §14.16)
- T-703 `scripts/test-demo.ts` golden path — Depends-on: T-406, T-502, T-304 — Acceptance: boots mock headless, advances A→D, waits 4 attestations/claim (5s each), asserts §6.7 matrix + hash stability, <30s. (PRD §15.2, §14.3, §14.16)
- T-704 `scripts/seed-bug.ts` drill — Depends-on: T-702 — Acceptance: injects inverted contract-test assertion + a tool type error; builder detects both via reports and fixes within the protocol. (PRD §15.3, M6)

**T-8xx — live seams + ship (M8)**
- T-801 live ModelSeam (AI gateway) — Depends-on: T-205 — Acceptance: compiles/typechecks; live call best-effort. **OP: AI_GATEWAY_KEY.** (PRD §8 M8, §14.9)
- T-802 live Blob + Wallet seams (viem) — Depends-on: T-205 — Acceptance: compiles/typechecks. **OP: BLOB_RW_TOKEN, *_KEYs.** (PRD §14.9)
- T-803 live DB (Neon) — Depends-on: T-401 — Acceptance: `DATABASE_URL` wiring; compiles. **OP: DATABASE_URL.** (PRD §6.5)
- T-804 `pnpm deploy:testnet` — Depends-on: T-109 — Acceptance: deploys to Mantle Sepolia (chain 5003); boot fail-fast w/ named error on any missing live var. **OP: RPC_URL + keys.** (PRD §5, §7, §14.9)
- T-805 README — Depends-on: — Acceptance: 10-line quickstart, architecture diagram, env table, Plugboard trust model, "Why not LangGraph/CrewAI/ElizaOS?" rationale; quickstart works as written. (PRD §12, §14.10)
- T-806 DEMO.md + DECISIONS.md final pass — Depends-on: T-606 — Acceptance: exact A→D click-path incl. guided mode + fallback notes; all resolved ambiguities dated. (PRD §12)
- T-807 ship gate — Depends-on: all above — Acceptance: `pnpm ci` exits 0 from fresh clone w/ submodules, no creds; `pnpm demo` cold-start <60s; A→D deterministic twice. (PRD §14.1, §14.3, §11 M8)

**T-9xx — STRETCH (M7, only after §14.1–17 pass; must not modify earlier-milestone packages)**
- T-901 (stretch) Telegram bot (`/race`,`/leaderboard`,`/subscribe`) — **flagged stretch; never gates acceptance.** (PRD §11 M7)
- T-902 (stretch) Discord bot (threads, channel whitelist). (PRD §11 M7)
- T-903 (stretch) `/turing` blind mode. (PRD §6.6, §11 M7)

- [ ] **Step 3: Verify the board parses**

Run: `grep -c "^### T-" TODO.md`
Expected: count matches the inventory (≈55 task blocks).

- [ ] **Step 4: Commit**

```bash
git add TODO.md && git commit -m "T-005: seed task board with full M1-M8 breakdown"
```

---

## Task 6: `OPERATOR_TODO.md` (T-006)

**Files:**
- Create: `OPERATOR_TODO.md`

- [ ] **Step 1: Write `OPERATOR_TODO.md`** — header + protocol + one worked example + an OPEN/DONE structure.

Required content:
- Purpose: the human-in-the-loop queue; `TODO.md` = what to build, this = what needs the operator.
- The `OP-N` entry format (Date / Blocks / Need / Half-done state / To resolve / status `[open]`|`[done]`).
- The agent protocol (mirrors CLAUDE.md §6): on a credential/verification/decision gap → append `OP-N`, set the task `blocked — see OP-N`, keep working; never fabricate.
- An `## Open` section seeded with the one already-known item:
  `## OP-1 — GitHub auth for remote   [open]` / Blocks: T-008 / Need: operator runs `gh auth login` (and confirms repo name/visibility: default `bombe`, private, owner `klinksolana`) / Half-done state: all workflow files committed locally on the bootstrap branch / To resolve: run `!gh auth login`, then tell the agent "OP-1 ready".
- An empty `## Done` section.

- [ ] **Step 2: Verify**

Run: `grep -E "^## (OP-|Open|Done)" OPERATOR_TODO.md`
Expected: `## Open`, `## OP-1 …`, `## Done`.

- [ ] **Step 3: Commit**

```bash
git add OPERATOR_TODO.md && git commit -m "T-006: add OPERATOR_TODO human-in-the-loop queue"
```

---

## Task 7: CI workflow + PR template (T-007)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
  push:
    branches-ignore: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm ci
```

- [ ] **Step 2: Write `.github/pull_request_template.md`**

```markdown
## T-XXX — <task title>

**Closes:** T-XXX
**Scope:** <contracts | shared | agent-sdk | ... >

### Acceptance (from TODO.md)
- [ ] <criterion 1 — PRD §ref>
- [ ] <criterion 2>

### Checklist
- [ ] `pnpm ci` green locally
- [ ] `pnpm test:demo` passes (if subsystem exists)
- [ ] TODO.md status flipped to `done` in this PR
- [ ] No new `OPERATOR_TODO` blockers left unrecorded
```

- [ ] **Step 3: Validate the workflow YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('valid')"`
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add .github/ && git commit -m "T-007: add CI workflow and PR template"
```

---

## Task 8: GitHub remote (T-008) — OPERATOR-GATED

**Files:** none (git/gh operations only)

> This task needs `OP-1` resolved (operator runs `gh auth login`). If not yet resolved, leave T-008 `blocked — see OP-1`, skip to Task 9's local merge, and run this when the operator confirms "OP-1 ready".

- [ ] **Step 1: Confirm auth**

Run: `gh auth status`
Expected: logged in. If not → this is OP-1; stop and wait.

- [ ] **Step 2: Create the remote and push the bootstrap branch**

```bash
gh repo create bombe --private --source=. --remote=origin --push
git push -u origin chore/T-000-workflow-bootstrap
```
Expected: repo created; both branches pushed; Actions tab runs CI on the bootstrap branch.

- [ ] **Step 3: Verify CI triggered**

Run: `gh run list --limit 1`
Expected: one CI run for the bootstrap branch.

---

## Task 9: Merge the bootstrap & finalize the board

**Files:**
- Modify: `TODO.md` (flip T-001…T-008 to `done`)

- [ ] **Step 1: Flip completed setup tasks to done**

Edit `TODO.md`: set `Status: done 2026-06-05` on T-001 through T-007 (and T-008 if OP-1 was resolved; else leave `blocked — see OP-1`).

- [ ] **Step 2: Commit the status flips**

```bash
git add TODO.md && git commit -m "T-000: mark bootstrap tasks done"
```

- [ ] **Step 3: Merge to main**

If remote exists (OP-1 done): open a PR and merge it (this bootstrap PR is the one exception merged by the operator regardless of D6, since it establishes the process).
```bash
gh pr create --fill --base main --head chore/T-000-workflow-bootstrap
gh pr merge --squash --delete-branch
```
If local-only (OP-1 pending): merge locally.
```bash
git checkout main && git merge --no-ff chore/T-000-workflow-bootstrap -m "T-000: workflow bootstrap"
```

- [ ] **Step 4: Verify final state**

Run: `git checkout main && ls -1 CLAUDE.md CONTEXT.md TODO.md OPERATOR_TODO.md .gitattributes .github/workflows/ci.yml docs/bombe-prd.md docs/DECISIONS.md`
Expected: every file listed, no errors. The board is live; the next session picks T-009.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — §2 git → T-001/T-009-config; §3 conventions → T-002 runbook + T-007 PR template; §4 CLAUDE → T-003; §4 CONTEXT → T-004; §5 docs → T-002; §6 board → T-005; §7 OPERATOR_TODO → T-006; §8 fix-loop → encoded in CLAUDE.md (T-003) + runbook (T-002); §9 CI → T-007; §10 out-of-scope respected (no package code). D1–D6 all land in DECISIONS.md (T-002).
- **Placeholder scan:** the single `TODO:` in `docs/DEMO.md` is intentional and points at its resolving task (T-606); no other placeholders.
- **Consistency:** task IDs in the board (Task 5) match the file-structure table and the dependency references; OP-1 is referenced consistently in T-008, Task 6, and Task 8.
