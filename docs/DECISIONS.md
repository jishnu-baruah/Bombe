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
| **D11 — Attestation stake (`ATTEST_LOCK` 0.02e) is supplied as `msg.value` on `attest()` and held by `AgentAttestation`, separate from the registration bond in `AgentRegistry`. ABSTAIN requires `msg.value == 0`.** | PRD §6.2 specifies the lock amount but not its source; a per-attestation payable lock held by the attestation contract is the simplest model that satisfies §14.6 slash math and "abstain locks nothing", and keeps the registration bond independent. |

| **D12 — Settlement responsibility split (T-105/T-106).** `TuringLeaderboard.settleTier1` orchestrates: it applies ALL reputation deltas (+1 correct / −10 wrong / ±0 abstain), credits correct attestors' released own-stake (seized from `AgentAttestation` via `SETTLER_ROLE`, then forwarded to `AgentSlashing.creditClaimable`), and calls `AgentSlashing.slashTier1` once per wrong attestor. `AgentSlashing` handles ONLY the seized-stake economics (burn 50% / redistribute 50% pro-rata via pull-payment `claimable`) and never mutates reputation; it exposes the single `withdraw()` surface for all payouts. The burn is implemented as ETH retained permanently in `AgentSlashing` (never credited to any `claimable`), accounted in `totalBurned`. ABSTAIN attestations hold no stake and never enter any slash path (§14.6); the conservation invariant `seized == burn + distributed` holds exactly (rounding remainder folded into the burn). | The PRD assigns the −10/+1 deltas and the burn/redistribute split across two contracts; centralizing all reputation in the Leaderboard and all seized-stake math in Slashing avoids double-walking the attestor list and keeps a single withdrawal surface. |
| **D13 — Tier-2 dispute economics + conservation (T-107).** For the **agent-wrong** verdict (votesWrong > votesRight), the accused's locked `ATTEST_LOCK` is seized (`seizeStake`). The split is: `burnHalf = seized / 2`; `distributeHalf = seized − burnHalf`; `challengerReward = seized / 10` (exactly 10% of seized, drawn from `distributeHalf`); `remainderForPeers = distributeHalf − challengerReward`. `remainderForPeers` is distributed pro-rata (equal shares) to all other non-abstain attestors of the same claim except the accused; if none exist it folds into burn. Any integer-division remainder also folds to burn. Conservation holds exactly: `seized == burnActual + challengerReward + distributed` where `burnActual` absorbs all rounding. The challenger also receives their `DISPUTE_BOND` back. For the **agent-right** verdict (votesRight ≥ votesWrong, including **tie** — tie → agent right by benefit of the doubt, simplest rule that keeps the protocol honest without penalising disputed-but-correct attestors): challenger's `DISPUTE_BOND` is split `accusedCredit = bond / 2`, `burnCredit = bond − accusedCredit`; no slash, no reputation change. The tie→agent-right rule is documented here and in the contract NatSpec. | PRD §6.2 specifies the split percentages; the exact derivation of "10% of seized from distributeHalf" chosen so conservation holds across all ATTEST_LOCK multiples without wei loss. Tie → agent right gives benefit of doubt to the accused and discourages frivolous disputes. |

**D6 is a scoped exception to PRD §15.4** ("main requires human approval"). Only `docs/` and `chore/` PRs auto-merge on green CI; logic-bearing PRs (`feat/` and `fix/`) still require the operator's manual merge. The human therefore remains the gate on every change that touches behavior.

**Repo owner / remote.** Owner **Jishnu Baruah** (`jishnu-baruah`); remote `https://github.com/jishnu-baruah/Bombe.git`; visibility per GitHub. This supersedes the spec's placeholder default of `klinksolana` / `bombe`.

---

## 2026-06-06 — Contracts M1 completion

| Decision | Rationale |
|----------|-----------|
| **D14 — Canonical deployment topology (T-109).** The six role grants wired by `Deploy.s.sol` are the required minimum for settlement and disputes to function: `registry.REPUTATION_ROLE → leaderboard`; `registry.DISPUTE_ROLE → slashing`; `registry.REPUTATION_ROLE → slashing` (so `resolveDispute` can apply the −10 penalty to a losing accused — without it tier-2 agent-wrong resolutions revert); `attestation.SETTLER_ROLE → leaderboard`; `attestation.SETTLER_ROLE → slashing`; `slashing.LEADERBOARD_ROLE → leaderboard`. `OPERATOR_ROLE` on both `AgentAttestation` and `TuringLeaderboard` is granted to the deployer in their respective constructors (operator == admin at deploy time), so no extra `grantRole` calls are needed. Demo timing defaults are `epochSeconds = 300` and `disputeWindowSeconds = 60`, read from env vars `DEMO_EPOCH_SECONDS` / `DEMO_DISPUTE_WINDOW_SECONDS` with those defaults, per PRD §6.2 §7. For production / Mantle Sepolia `epochSeconds = 3600` and `disputeWindowSeconds = 600` are the PRD defaults and should be supplied via env. | The deploy script must be the single canonical source of truth for role wiring so that live deploys replicate the exact topology verified in tests. Recording the topology here satisfies the T-109 Acceptance criterion and provides an audit trail. |

---

## ESCALATIONS

Format for each escalation entry:

```
### <date> — T-XXX <test>
Two failed attempts. Analysis: …
```

_(none yet)_
