# Bombe — Development Workflow & Task Flow (Design)

**Date:** 2026-06-05
**Status:** Approved (brainstorming)
**Scope of this pass:** Set up the development workflow and task board only. No package/product code. Modeled on the `manjeetsharma0796/klink` async task-board workflow, adapted for a mostly-solo developer.

---

## 1. Decisions made (this conversation)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Lightweight solo workflow** — keep klink's `TODO.md` T-XXX board, branch-per-task, task-ID commits, and PR-to-main; **drop** the two-phase claim PRs, auto-merge, and stale-claim rules. | Traceable history without multi-person coordination overhead. |
| D2 | **This pass = workflow + task board only.** No package scaffolding, no implementation. | Clean separation between "set up how we work" and "build the product." |
| D3 | **GitHub remote + real PRs**, with GitHub Actions running `pnpm ci`. | Hackathon submission benefits from a self-review + CI gate on every task. |
| D4 | **No Telegram workflow notifications.** The M7 Telegram *bot* feature remains a stretch task on the board. | "Skip the tg update of the workflow" = no TG process notifications. |
| D5 | **Operator TODO queue** (`OPERATOR_TODO.md`) for anything needing the human (credentials, live-service verification, owner-only decisions). | Enables long autonomous sessions: park human-needed items, keep working unblocked tasks. |
| D6 | **Hybrid auto-merge.** PRs on `docs/` and `chore/` branches auto-merge when CI is green + no conflict; `feat/` and `fix/` PRs (logic-bearing) wait for the operator's manual merge. | Velocity on low-risk changes; keeps the operator as the gate on logic, honoring the spirit of PRD §15.4 (recorded as a scoped exception in DECISIONS.md). |

These are mirrored into `docs/DECISIONS.md` as the project's first dated entry.

## 2. Repo & git foundation

- `git init`, default branch `main`. (Done during brainstorming so this spec is versioned.)
- `.gitignore` for the PRD stack: Node/pnpm, Foundry (`out`/`cache`/`broadcast`), Next.js (`.next`), `.env*` (except `.env.example`), `.test-reports/`, pglite files, mock blob dir.
- GitHub remote: `gh repo create bombe --private --source=. --remote=origin` (operator runs `gh auth login`). Defaults: repo `bombe`, **private**, handle `klinksolana` — adjustable.
- `main` protected by convention: everything lands via PR; no direct pushes.

## 3. Branch / commit / PR conventions

- **Branches:** `feat/T-XXX-slug`, `fix/T-XXX-slug`, `docs/T-XXX-slug`, `chore/T-XXX-slug`.
- **Commits:** `T-XXX: <verb> <object>` (reconciles the PRD §15 `fix:` style → `T-XXX: fix <desc>`).
- **One task = one PR.** If a task balloons, split it and create a new T-XXX entry.
- **PR title:** `T-XXX — <task title>`. The merge commit also flips the task to Done in `TODO.md`.
- No `claim:`/`unclaim:`/`override:` PRs; no stale-claim rule (solo).
- **Merge gating (D6):** both "no conflict" and "CI green" are required. On `docs/`/`chore/` PRs the agent enables GitHub auto-merge (`gh pr merge --auto --squash`) so they land themselves once green. On `feat/`/`fix/` PRs the agent opens the PR, leaves it in a mergeable state, and the operator clicks merge — so finished logic queues up for review during unattended sessions.

## 4. Claude Code context files

- **`CLAUDE.md`** — operating manual, auto-loaded each session: the conventions above, the PRD §15 fix-loop, the §15.4 guardrails (never touch `.env*`, lockfile by hand, or `traceHash` values by hand; branches only; no disabling tests to go green), and how to read `.test-reports/`.
- **`CONTEXT.md`** — locked strategic framing: the core thesis (attest only to falsifiable claims; safety lives at the contract layer; Plugboard is the external proof), the non-goals (§2), and §14 acceptance criteria as the definition of done.

## 5. `docs/` structure (follows the PRD's own §5 layout)

```
docs/
  bombe-prd.md            the frozen product spec (moved from repo root)
  DECISIONS.md            dated record of every resolved ambiguity (seeded with D1–D5)
  DEMO.md                 click-path for the A→D demo (stub now)
  runbooks/
    workflow.md           human-readable copy of §3 + the fix-loop
  superpowers/specs/      brainstorming design docs (this file)
```

## 6. `TODO.md` — the task board

**Area-based numbering** (klink-style):

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

**Granularity:** one task ≈ one PR-sized chunk (a contract + its tests; one seam; one tool with snapshot tests; one route). Each milestone fans into ~4–10 tasks. `Depends-on` encodes milestone ordering. Board seeded with M1–M6 + M8 in full; M7 as a thin stub.

**Task block format** (klink's, minus the OS field — single machine):

```
### T-104 — AgentAttestation.attest + tier-3 revert
- Status: pending
- Depends-on: T-101, T-102
- Scope: contracts
- Acceptance: attest() happy path + AlreadyAttested + JudgmentTierRequiresAbstain
  reverts covered; ABSTAIN locks 0; forge fmt clean. (PRD §6.2, §14.5)
- Notes: —
```

Status values: `pending` / `in-progress YYYY-MM-DD` / `review` / `blocked — <reason or see OP-N>` / `done YYYY-MM-DD`.
Every Acceptance line cites the PRD section + §14 acceptance-criteria number it satisfies.

## 7. `OPERATOR_TODO.md` — human-in-the-loop queue

Append-only file for anything the agent **cannot do without the operator**. When the agent hits a credential gap, a need-to-verify-against-a-live-service, or an owner-only decision, it logs an `OP-N` entry, sets the related task `Status: blocked — see OP-N`, and continues with other unblocked work.

```
## OP-3 — Live AI gateway key needed   [open]
- Date: 2026-06-05
- Blocks: T-805 (live ModelSeam wiring)
- Need: AI_GATEWAY_KEY + FALLBACK_MODEL access (PRD §7). Mock path works without it.
- Half-done state: live seam coded + typechecks; cannot run end-to-end live call to verify.
- To resolve: put the key in .env.local (never committed), then tell the agent "OP-3 ready".
```

Rules:
- Never invent credentials or fake verification to appear "done"; record the half-done state honestly.
- On return, `OPERATOR_TODO.md` is the operator's worklist; resolved entries marked `[done]`, the blocked task reopens.
- `TODO.md` = what to build; `OPERATOR_TODO.md` = what needs the operator.

## 8. Fix-loop mapping (PRD §15 → task lifecycle)

1. **Pick** a `pending` task with all deps `done` → `in-progress`, branch `feat/T-XXX-slug`.
2. **Build** via the §15.3 loop: `pnpm test:agent` → parse `.test-reports/*` → route failure by category → fix → re-run only the failing test. Two fails on one test → DECISIONS.md "ESCALATIONS" (or an `OP-N` if it needs the operator) → move on.
3. **Gate:** `pnpm test:demo` must pass before marking done (once the subsystem exists).
4. **Ship:** PR `T-XXX — title`; merge flips to Done; `pnpm ci` is the CI gate.
5. **Checkpoint** (§15.4): commit before each fix session; branches only.

## 9. CI skeleton

- `.github/workflows/ci.yml`: on PR + push to non-main branches, run `pnpm ci` (= lint + typecheck + `forge test` + vitest + `pnpm test:demo`, per PRD §8). Foundry + pnpm + Node 22 setup.
- Activates the moment the remote exists; the same `pnpm ci` runs locally as the pre-merge gate.
- A green CI run is what releases auto-merge on `docs/`/`chore/` PRs (D6); `feat/`/`fix/` PRs still wait for the operator.

## 10. Out of scope for this pass

- Any `contracts/`, `packages/*`, `apps/*` implementation or scaffolding.
- The pnpm workspace files themselves (created when M-task execution begins).
- Telegram workflow notifications (D4).
