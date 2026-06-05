# DECISIONS

Per the PRD prime directive (§0) and §15.3, every resolved ambiguity is recorded here, dated. When the document is ambiguous, the builder chooses the simplest option that passes the §14 acceptance criteria, records the decision in this file, and keeps going. This file is also where the autonomous builder logs **escalations** — a test that fails twice in a row gets its failure analysis written under `## ESCALATIONS` rather than blocking the run.

---

## 2026-06-05 — Workflow setup

| Decision | Rationale |
|----------|-----------|
| **D1 — Lightweight solo workflow.** Keep klink's `TODO.md` T-XXX board, branch-per-task, task-ID commits, and PR-to-main; **drop** the two-phase claim PRs, auto-merge, and stale-claim rules. | Traceable history without multi-person coordination overhead. |
| **D2 — This pass = workflow + task board only.** No package scaffolding, no implementation. | Clean separation between "set up how we work" and "build the product." |
| **D3 — GitHub remote + real PRs**, with GitHub Actions running `pnpm run ci`. | Hackathon submission benefits from a self-review + CI gate on every task. |
| **D4 — No Telegram workflow notifications.** The M7 Telegram *bot* feature remains a stretch task on the board. | "Skip the tg update of the workflow" = no TG process notifications. |
| **D5 — Operator TODO queue** (`OPERATOR_TODO.md`) for anything needing the human (credentials, live-service verification, owner-only decisions). | Enables long autonomous sessions: park human-needed items, keep working unblocked tasks. |
| **D6 — Hybrid auto-merge.** PRs on `docs/` and `chore/` branches auto-merge when CI is green + no conflict; `feat/` and `fix/` PRs (logic-bearing) wait for the operator's manual merge. | Velocity on low-risk changes; keeps the operator as the gate on logic, honoring the spirit of PRD §15.4 (recorded as a scoped exception here). |
| **D8 — Branch protection on `main` requires the `ci` check.** Auto-merge (D6) only gates on CI when the target branch has a required status check; otherwise GitHub merges a PR as soon as it is conflict-free, ignoring CI. `main` now requires the `ci` check (`strict: false`, `enforce_admins: false` so the owner keeps an override). | Without this, D6's "CI green before merge" is unenforceable — discovered when PR #1 auto-merged before its CI finished. The required check makes the gate real for both auto-merged (docs/chore) and manually-merged (feat/fix) PRs. |
| **D7 — Incremental `ci` script + invoked via `pnpm run ci`.** The root `ci` script is green from T-009 running only the gates implemented so far (lint + typecheck); `forge test`, `vitest`, and `pnpm test:demo` are appended to `ci` as the milestones that introduce them land. CI and operators invoke it as **`pnpm run ci`**, because pnpm 9 reserves the bare `pnpm ci` name as a built-in stub (`ERR_PNPM_CI_NOT_IMPLEMENTED`). | A red `pnpm ci` from task one would break the D6 merge-gate workflow, so the gate must be green at every step and grow with the codebase. The `run` form is required to reach our package script past pnpm's reserved command. The `.github/workflows/ci.yml` step uses `pnpm run ci` accordingly. |
| **D9 — Autonomous execution mode.** During the operator-directed 'work until done' run, `feat`/`fix` PRs auto-merge after green required CI + a passing two-stage subagent review (spec + quality), substituting adversarial review for the human merge gate. Operator can revert to D6 manual logic-merge at any time. | Operator explicitly requested continuous unattended progress; downstream tasks depend on merges, so logic cannot wait for manual merge. |
| **D10 — YieldProof via vendored fallback.** No YieldProof submodule URL was provided, so `contracts/src/interfaces/IYieldProofAttestor.sol` is vendored per PRD §6.2's fallback. Wiring the real submodule under `contracts/lib/yieldproof` is parked as OP-2. | PRD §6.2 explicitly allows the vendored fallback when the submodule is unavailable at build time. |

**D6 is a scoped exception to PRD §15.4** ("main requires human approval"). Only `docs/` and `chore/` PRs auto-merge on green CI; logic-bearing PRs (`feat/` and `fix/`) still require the operator's manual merge. The human therefore remains the gate on every change that touches behavior.

**Repo owner / remote.** Owner **Jishnu Baruah** (`jishnu-baruah`); remote `https://github.com/jishnu-baruah/Bombe.git`; visibility per GitHub. This supersedes the spec's placeholder default of `klinksolana` / `bombe`.

---

## ESCALATIONS

Format for each escalation entry:

```
### <date> — T-XXX <test>
Two failed attempts. Analysis: …
```

_(none yet)_
