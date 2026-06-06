# Bombe

Autonomous AI attestor network for real-world-asset (RWA) claims on **Mantle Sepolia** (chain id 5003). Agents attest only to falsifiable claims (Tier 1 deterministic / Tier 2 document-falsifiable); judgment claims (Tier 3) produce abstentions, never attestations. Safety lives at the contract layer — proven live by Plugboard, an external attestor Bombe's team did not write.

- Thesis & non-goals: [CONTEXT.md](CONTEXT.md)
- Full spec: [docs/bombe-prd.md](docs/bombe-prd.md)

---

## Progress Dashboard

<!-- PROGRESS:START -->
_Generated: 2026-06-06_

### Overall

| Done | In-Progress | Blocked | Pending | Total | % Done |
|------|-------------|---------|---------|-------|--------|
| 49 | 0 | 0 | 25 | 74 | 66% |

### Per-Range Breakdown

| Range | Area | Done | Total |
|-------|------|------|-------|
| T-0xx | Ops | 14 | 14 |
| T-1xx | Contracts (M1) | 9 | 9 |
| T-2xx | shared + agent-sdk (M2) | 14 | 14 |
| T-3xx | reference agents (M2/M4) | 4 | 4 |
| T-4xx | runner + indexer + gateway + DB (M3) | 5 | 6 |
| T-5xx | Plugboard mock path (M4) | 0 | 5 |
| T-6xx | web app (M5) | 3 | 8 |
| T-7xx | autonomous testing (M6) | 0 | 4 |
| T-8xx | live seams + ship (M8) | 0 | 7 |
| T-9xx | STRETCH (M7) | 0 | 3 |

### Test Counts

- 71 forge tests
- 467 vitest tests

### Operator TODO

**Open:**
- **OP-3**: AI gateway key (real LLM)
- **OP-4**: Mantle Sepolia RPC + funded wallets
- **OP-5**: Blob storage token
- **OP-6**: Neon Postgres URL
_Resolved: 2_
<!-- PROGRESS:END -->

Refresh the dashboard with `pnpm progress`.

---

## Shipping target

Bombe ships **live on Mantle Sepolia**: real LLM inference, real on-chain `attest()` transactions (explorer-visible at https://explorer.sepolia.mantle.xyz), and real blob-backed trace traceability. See [`HACKATHON.md`](HACKATHON.md) for the submission spec and judging rubric. Four operator-provided credentials gate the live path — see [`OPERATOR_TODO.md`](OPERATOR_TODO.md) OP-3 (AI gateway key), OP-4 (RPC + funded wallets), OP-5 (blob token), OP-6 (Neon Postgres URL).

---

## Workflow at a Glance

### Branch naming
```
feat|fix|docs|chore/T-XXX-slug
```

### Commit format
```
T-XXX: <verb> <object>
```

### PR title format
```
T-XXX — <title>
```

### Merge policy (D6 + D9)
- `docs/` and `chore/` PRs: auto-merge on green CI (`gh pr merge --auto --squash`).
- `feat/` and `fix/` PRs: operator merges manually — logic changes require the human gate.
- **D9 autonomous-mode override:** during operator-directed unattended runs, `feat`/`fix` PRs auto-merge after green required CI + a passing two-stage subagent review, substituting adversarial review for the human merge gate.
- Branch protection on `main` requires the `ci` status check (D8).

### The fix-loop
1. Run `pnpm run ci` or `pnpm test:agent`; parse `.test-reports/*`.
2. Route failures by category: `contract_logic`/`contract_gas` → edit `.sol` then `forge fmt` + `forge build`; `typescript_type`/`runtime_error`/`assertion_mismatch` → TS; `determinism_failure` → seams / fixtures / `canonicalJson`; `demo_sequence` → fixtures or taxonomy.
3. Fix, re-run only the failing test. Green → commit.
4. Two failed attempts → escalate to `docs/DECISIONS.md` under `## ESCALATIONS` (or open an `OP-N`).

### OPERATOR_TODO protocol
When blocked on a credential, a live-service verification, or an owner-only decision:
1. Append an `OP-N` entry to `OPERATOR_TODO.md`.
2. Set the related task to `Status: blocked — see OP-N`.
3. Keep working other unblocked tasks.
**Never fabricate credentials or fake verification to appear done.**

See [docs/runbooks/workflow.md](docs/runbooks/workflow.md) and [CLAUDE.md](CLAUDE.md) as authoritative references.

---

## Quickstart

```sh
# Activate pnpm (Node 24, corepack)
corepack prepare pnpm@9 --activate

# Install dependencies
pnpm install

# Pull submodules (forge-std, OZ, YieldProof reference)
git submodule update --init --recursive

# Full CI gate: lint + typecheck + forge build + forge test + vitest
pnpm run ci        # NOTE: pnpm run ci (NOT pnpm ci — reserved by pnpm, D7)

# Contracts only
forge test --root contracts

# Deep fuzz (10 000 runs)
pnpm test:contracts:deep
```

`pnpm demo` and `pnpm deploy:testnet` are stubs; they exit non-zero until later milestones (M3+ and T-804 respectively).

---

## Tracking

Refresh the dashboard with `pnpm progress`.

> A fuller README per PRD §12 — architecture diagram, "Why not LangGraph/CrewAI/ElizaOS", env table, Plugboard trust model — is a later task **T-805** and will expand this file significantly.
