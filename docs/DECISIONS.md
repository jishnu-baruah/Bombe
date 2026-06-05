# DECISIONS

Per the PRD prime directive (§0) and §15.3, every resolved ambiguity is recorded here, dated. When the document is ambiguous, the builder chooses the simplest option that passes the §14 acceptance criteria, records the decision in this file, and keeps going. This file is also where the autonomous builder logs **escalations** — a test that fails twice in a row gets its failure analysis written under `## ESCALATIONS` rather than blocking the run.

---

## 2026-06-05 — Workflow setup

| Decision | Rationale |
|----------|-----------|
| **D1 — Lightweight solo workflow.** Keep klink's `TODO.md` T-XXX board, branch-per-task, task-ID commits, and PR-to-main; **drop** the two-phase claim PRs, auto-merge, and stale-claim rules. | Traceable history without multi-person coordination overhead. |
| **D2 — This pass = workflow + task board only.** No package scaffolding, no implementation. | Clean separation between "set up how we work" and "build the product." |
| **D3 — GitHub remote + real PRs**, with GitHub Actions running `pnpm ci`. | Hackathon submission benefits from a self-review + CI gate on every task. |
| **D4 — No Telegram workflow notifications.** The M7 Telegram *bot* feature remains a stretch task on the board. | "Skip the tg update of the workflow" = no TG process notifications. |
| **D5 — Operator TODO queue** (`OPERATOR_TODO.md`) for anything needing the human (credentials, live-service verification, owner-only decisions). | Enables long autonomous sessions: park human-needed items, keep working unblocked tasks. |
| **D6 — Hybrid auto-merge.** PRs on `docs/` and `chore/` branches auto-merge when CI is green + no conflict; `feat/` and `fix/` PRs (logic-bearing) wait for the operator's manual merge. | Velocity on low-risk changes; keeps the operator as the gate on logic, honoring the spirit of PRD §15.4 (recorded as a scoped exception here). |

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
