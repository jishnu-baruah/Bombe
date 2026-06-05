# Workflow runbook

Human-readable copy of the dev-workflow spec §3 (branch / commit / PR conventions) and §8 (fix-loop → task lifecycle). `CLAUDE.md` is the authoritative copy of the fix-loop and guardrails; this runbook is the quick reference.

## Branch / commit / PR conventions

- **Branch naming:** `feat|fix|docs|chore/T-XXX-slug` — one of the four prefixes, the task ID, then a short slug (e.g. `docs/T-002-docs-restructure`).
- **Commit format:** `T-XXX: <verb> <object>` (reconciles the PRD §15 `fix:` style as `T-XXX: fix <desc>`).
- **PR title:** `T-XXX — <title>`.
- **One task = one PR.** If a task balloons, split it and create a new T-XXX entry in `TODO.md`.
- No `claim:` / `unclaim:` / `override:` PRs; no stale-claim rule (solo developer).

## Merge gating (D6 — hybrid auto-merge)

Both "no conflict" and "CI green" are required before any merge.

- **`docs/` and `chore/` PRs** auto-merge once CI is green: the agent enables GitHub auto-merge with `gh pr merge --auto --squash`, so they land themselves.
- **`feat/` and `fix/` PRs** (logic-bearing) wait for the operator. The agent opens the PR and leaves it in a mergeable state; the operator clicks merge. Finished logic queues up for review during unattended sessions.

This is a scoped exception to PRD §15.4 ("main requires human approval") — see `docs/DECISIONS.md`.

## Task lifecycle (spec §8: PRD §15 → tasks)

1. **Pick** a `pending` task whose dependencies are all `done` → set it `in-progress YYYY-MM-DD`, cut branch `feat/T-XXX-slug` (or the matching prefix).
2. **Build** via the §15.3 fix-loop (below).
3. **Gate:** `pnpm test:demo` must pass before the task can be marked done (once the relevant subsystem exists).
4. **Ship:** open PR `T-XXX — <title>`. `pnpm ci` is the CI gate. The merge commit flips the task to `done YYYY-MM-DD` in `TODO.md`.
5. **Checkpoint** (§15.4): commit before each fix session; branches only, never direct to main.

## The fix-loop (PRD §15.3) — in brief

The autonomous builder *is* the loop; there is no inner self-patching script.

1. After any change: run `pnpm test:agent`, then parse `.test-reports/*`.
2. Route the failure by category: `contract_logic`/`contract_gas` → `.sol` (always `forge fmt` + `forge build` after); `typescript_type`/`runtime_error`/`assertion_mismatch` → TS; `determinism_failure` → seams / fixtures / `canonicalJson`; `demo_sequence` → fixtures or taxonomy.
3. Fix, then re-run **only** the failing test (`forge test --match-test X` / `vitest run <pattern>`). Green → commit `T-XXX: fix <description>` to a branch.
4. `network_timeout` or `unknown` in mock mode is a determinism bug, not flake — do not retry-until-green.
5. **Two failed attempts on the same test** → write the failure analysis to `docs/DECISIONS.md` under `## ESCALATIONS` (or file an `OP-N` in `OPERATOR_TODO.md` if it needs the operator) and move to other work.

## Guardrails (PRD §15.4) — in brief

- Git checkpoint before each fix session: commit or stash as `agent-checkpoint-<timestamp>`.
- Never modify by hand: `.env*`, git history, the lockfile (use package-manager commands), or `fixtures/model-scripts/**` `traceHash` values (regenerate via the validator util).
- Forbidden in any generated change: `rm -rf` outside build dirs, `selfdestruct`, `delegatecall`, reading `process.env.*KEY*` outside the seams/config module, disabling tests to make suites go green (skipped tests count as failures for milestone purposes).
- Push to branches only; **main requires human approval** (D6 narrows this for `docs/`/`chore/` only).

> `CLAUDE.md` is the authoritative copy of the fix-loop and guardrails. If this runbook and `CLAUDE.md` disagree, `CLAUDE.md` wins.
