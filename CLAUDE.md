# CLAUDE.md — Bombe agent operating manual

Auto-loads each session. Read it, then follow it. The PRD is the source of truth; if this file and the PRD ever conflict, the PRD wins (and fix this file).

## Project one-liner

Bombe is an autonomous AI attestor network for real-world-asset (RWA) claims on **Mantle Sepolia (chain id 5003)**. Agents attest **only to falsifiable claims** (Tier 1 deterministic / Tier 2 document-falsifiable); judgment claims (Tier 3) produce abstentions, never attestations. **Safety lives at the contract layer** — proven live by Plugboard, an external attestor Bombe's team did not write.
- Thesis & non-goals: `CONTEXT.md`. Full spec: `docs/bombe-prd.md`.

## Start-of-session checklist

1. Read `CONTEXT.md` (locked strategic framing), `TODO.md` (the task board), `OPERATOR_TODO.md` (human-blocked queue).
2. Pick a `pending` task in `TODO.md` whose `Depends-on` tasks are **all** `done`.
3. Set it `Status: in-progress YYYY-MM-DD` and cut a branch (see Conventions).

## Conventions

- **Branch:** `feat|fix|docs|chore/T-XXX-slug` (one prefix, the task ID, a short slug).
- **Commit:** `T-XXX: <verb> <object>` (the PRD §15 `fix:` style becomes `T-XXX: fix <desc>`).
- **PR title:** `T-XXX — <title>`.
- **One task = one PR.** If a task balloons, split it and add a new `T-XXX` entry to `TODO.md`.
- The merge commit flips the task to `done YYYY-MM-DD` in `TODO.md`.

## Merge policy (D6)

Both "no conflict" and "CI green" are required before any merge.
- **`docs/` and `chore/` PRs:** enable GitHub auto-merge (`gh pr merge --auto --squash`) — they land themselves on green CI.
- **`feat/` and `fix/` PRs (logic-bearing):** open the PR, leave it mergeable, and **the operator merges manually**. Do not auto-merge logic.
- This is a **scoped exception to PRD §15.4** ("main requires human approval"), recorded in `docs/DECISIONS.md`.

## The fix-loop (PRD §15.3)

The builder *is* the loop — no inner self-patching script. After any change:
1. Run `pnpm test:agent`; parse `.test-reports/*` (schema: `packages/shared/src/test-report.ts`).
2. Route each failure by category:
   - `contract_logic` / `contract_gas` → edit `.sol`, then **always** `forge fmt` + `forge build`.
   - `typescript_type` / `runtime_error` / `assertion_mismatch` → TS.
   - `determinism_failure` → seams / fixtures / `canonicalJson`.
   - `demo_sequence` → fixtures or taxonomy.
3. Fix, then re-run **only** the failing test (`forge test --match-test X` / `vitest run <pattern>`). Green → commit.
4. `network_timeout` or `unknown` **in mock mode = a determinism bug, not flake** — do not retry-until-green.
5. **Two failed attempts on the same test** → write the failure analysis to `docs/DECISIONS.md` under `## ESCALATIONS` (or open an `OP-N` if it genuinely needs the operator) → move to other work.
6. `pnpm test:demo` must pass before declaring any milestone/task done.

## OPERATOR_TODO protocol

When blocked on a credential, a need-to-verify-against-a-live-service, or an owner-only decision:
1. Append an `OP-N` entry to `OPERATOR_TODO.md` (date, what it blocks, what's needed, the honest half-done state, how to resolve).
2. Set the related task `Status: blocked — see OP-N`.
3. Keep working other unblocked tasks.
- **Never fabricate credentials or fake verification to appear done.** Record the half-done state honestly.

## Guardrails (PRD §15.4)

- **Branches only — never push to `main`.** (NOTE: the one-time bootstrap pass is the documented exception; normal work uses branches + PRs.)
- Git checkpoint commit (or stash) `agent-checkpoint-<timestamp>` before each fix session.
- **Never hand-edit:** `.env*`; git history; the lockfile (use the package manager); `fixtures/model-scripts/**` `traceHash` values (regenerate via the validator util).
- **Forbidden in any change:** `rm -rf` outside build dirs; `selfdestruct`; `delegatecall`; reading `process.env.*KEY*` outside the seams/config module; disabling or skipping tests to make a suite green (**skipped tests count as failures** for milestone purposes).

## Definition of done

A task is done when **its `TODO.md` Acceptance criteria pass AND the relevant PRD §14 acceptance criterion holds**. `pnpm test:demo` is the single source of truth for "can we submit."
