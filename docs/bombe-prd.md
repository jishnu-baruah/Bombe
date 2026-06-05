# Bombe — Product Requirements Document (PRD)

**Version:** 2.1 (post-debate redesign + Plugboard + autonomous-execution hardening)
**Audience:** An autonomous coding agent executing this end-to-end without human clarification.
**Prime directive:** Where this document is ambiguous, choose the simplest option that passes the acceptance criteria in §14, record the decision in `docs/DECISIONS.md`, and keep going. Do not block. Follow the execution protocol in §15.

---

## 1. Product summary

Bombe is an autonomous AI attestor network for real-world-asset (RWA) claims on Mantle. AI agents pick up posted claims, run a tool-using reasoning loop, and either post a stake-backed attestation on-chain or **abstain**. Wrong attestations get slashed. A public leaderboard ranks AI agents and human attestors side by side on accuracy, latency, cost, abstention rate, and slashes.

Core thesis made product: agents attest **only to falsifiable claims**; judgment-laden claims produce abstentions and flags, never attestations. Attestations are "economically warranted statements," not truth claims. Safety guarantees live at the **contract layer** — proven live by Plugboard, an external attestor on the Hermes Agent runtime that Bombe's team did not write.

Target: submission to Mantle Turing Test Hackathon 2026, Track 3 (AI x RWA). Chain: Mantle Sepolia (chain id 5003).

---

## 2. Goals and non-goals

### Goals
1. Working end-to-end flow: claim posted → agents race → attestations/abstentions on-chain → leaderboard updates → trace viewable.
2. Three SDK reference agents (Reflector / Rotor / Stator) with visibly different temperaments, plus one external attestor (Plugboard, Hermes Agent runtime).
3. Claim taxonomy (Tier 1 deterministic / Tier 2 document-falsifiable / Tier 3 judgment) enforced in both SDK and contracts.
4. Flagship demo: live race view with one clean claim, one ambiguous claim (Reflector abstains, Rotor commits), one document-mismatch claim, and one judgment claim where Plugboard's attestation attempt is **rejected by the contract on-chain**.
5. Mock-first AND test-first: entire system runs deterministically with zero credentials; every suite emits machine-readable JSON reports; a single golden-path test (`pnpm test:demo`) answers "can we submit."
6. Resilience: model failover, cost circuit breakers, tool-error recovery — the live demo survives API hiccups.

### Non-goals (explicitly out of scope — do not build)
- Mainnet deployment, token launch, real economic value.
- Real document ingestion (PDF parsing). Tier 2 uses **fixture documents** (JSON simulating servicer reports / bank statements).
- KYC, auth beyond operator key, native mobile apps (the web race view must be responsive; that is sufficient).
- The SaaS diligence report product, PDF export. Only the trace viewer exists; the trace URL is the shareable artifact.
- UMA integration. Disputes use the in-protocol stake-weighted vote (§6.2).
- Runtime mock/live switching. Mode is fixed at boot; switching requires restart (recorded rationale: runtime mode mutation is shared mutable state and an operator-surface security risk).
- Discord/Telegram bots and the `/turing` blind mode are **stretch only** (M7) and never gate acceptance.

---

## 3. Users

| User | What they do | Surfaces |
| --- | --- | --- |
| Spectator / judge | Watches the race, browses leaderboard, opens traces | `/`, `/live`, `/leaderboard`, `/claim/[id]` |
| Agent operator | Registers agents, funds bonds, seeds/advances/settles claims, monitors health | `/operator`, `/operator/health` |
| Claim submitter | Posts claims (demo: operator console seeds them) | `/operator` |
| Human attestor | Registers like an agent; attests via operator console form; simulated queue latency in mock | `/live`, leaderboard, `/operator` |

---

## 4. System architecture

```
┌─────────────┐   posts claim    ┌──────────────────────────┐
│  Submitter   │ ───────────────▶ │ Contracts (Mantle Sepolia)│
└─────────────┘                  │ Registry · Attestation ·  │
                                 │ Leaderboard · Slashing    │
┌──────────────────┐ watch+attest└─────────┬────────────────┘
│ Agent runner      │ ◀──────────────────▶ │ events
│  ├ Reflector (SDK)│                      ▼
│  ├ Rotor     (SDK)│   traces      ┌────────────┐
│  ├ Stator    (SDK)│ ─────▶ Blob   │  Indexer    │──▶ Neon Postgres
│  └ HumanQueueSeam │   rows        └────────────┘        │
└──────────────────┘ ─────▶ Postgres                      ▼
┌──────────────────┐  HTTP tools                Next.js app (SSE /api/stream)
│ Plugboard         │ ────▶ ┌──────────────┐
│ (Hermes runtime,  │       │ tool-gateway  │──▶ same tool impls as SDK
│  external, own    │ attest└──────────────┘
│  wallet)          │ ────▶ Contracts
└──────────────────┘
```

- **Contracts** are the source of truth for attestations, bonds, slashes, epochs.
- **Postgres** is a read model: indexed events + run telemetry, feeding the UI via SSE.
- **Blob storage** holds full reasoning traces; contracts store only `keccak256(trace)` + URL.
- **Agent runner**: subscribes to `ClaimPosted` (mock: in-process event bus). Runs SDK agents **concurrently** via `Promise.allSettled` with a 15s per-agent timeout; individual failures never block others. The human queue is a seam in the same runner. Plugboard runs out-of-process.

---

## 5. Monorepo layout

pnpm workspace. Node 22, TypeScript 5.x strict. Foundry latest stable.

```
contracts/                  Foundry project (YieldProof as git submodule under contracts/lib/yieldproof)
  src/{AgentRegistry,AgentAttestation,TuringLeaderboard,AgentSlashing}.sol
  src/interfaces/IYieldProofAttestor.sol   (vendored fallback, §6.2)
  test/                     unit + fuzz; ≥13 tests
  script/Deploy.s.sol
packages/shared/            zod schemas, types, fixture loader, test-report schema, SSE event types
packages/agent-sdk/
  src/taxonomy.ts  src/tools/  src/loop.ts  src/attest.ts  src/router.ts  src/seams/
  test/
packages/agent-reference/   reflector.ts rotor.ts stator.ts + prompts/
apps/web/                   Next.js 16, App Router, Tailwind v4
apps/indexer/               event indexer → Postgres
apps/tool-gateway/          HTTP wrapper over SDK tools (Plugboard's only tool access)
agents/plugboard/           Hermes Agent workspace: skill file, docker-compose, epoch-snapshots/
fixtures/                   claims, documents, oracle snapshots, model-scripts/, human-decisions.json, model-costs.json
scripts/                    test-agent.ts (report aggregator), test-demo.ts (golden path), seed-bug.ts (drill, §15)
.test-reports/              gitignored JSON output of every suite
docs/                       this PRD, DECISIONS.md, DEMO.md
```

**Fixture loader (`packages/shared/src/fixtures.ts`):** pure functions `loadOracleSnapshot(asset, period)`, `loadDocument(docRef)`, `loadModelScript(agentId, claimId)`, `loadHumanDecision(claimId)`. Mock mode reads from `fixtures/` via fs; live mode ignores fixtures (seams call real APIs). All fixtures committed and versioned; document fixtures live under `fixtures/documents/v1/` and traces record `docVersion`.

Root scripts (must exist and work):
- `pnpm test` — Foundry + all TS unit/integration suites, each writing JSON to `.test-reports/`.
- `pnpm test:agent` — runs everything, then parses and prints a single machine-readable summary (§15.1).
- `pnpm test:demo` — golden-path demo validation, headless, <30s (§15.2).
- `pnpm demo` — boots everything in mock mode (local anvil, in-memory blob, pglite, fixture oracles, seeded claims) and serves the web app. One command, zero credentials.
- `pnpm deploy:testnet` — deploys to Mantle Sepolia using env keys (clear named error if keys missing).

---

## 6. Detailed specifications

### 6.1 Claim taxonomy (`packages/shared/src/taxonomy.ts`)

```ts
export type ClaimTier = 1 | 2 | 3;
// Tier 1 DETERMINISTIC: truth derivable from on-chain state / oracle math.
//   Slashing: direct, automatic against ground truth at settlement.
// Tier 2 DOCUMENT: truth derivable from referenced fixture documents.
//   Slashing: only via dispute resolution (stake-weighted vote).
// Tier 3 JUDGMENT: valuation/opinion. Attestation FORBIDDEN.
//   SDK coerces to ABSTAIN; the contract rejects tier-3 non-ABSTAIN attestations.

export const ClaimSchema = z.object({
  id: z.string(),                  // bytes32 hex
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  asset: z.enum(["mETH", "USDY", "PC-POOL-1"]),
  claimType: z.enum([
    "YIELD_BPS",            // Tier 1
    "DISTRIBUTION_PAID",    // Tier 1
    "CASHFLOW_MATCH",       // Tier 2
    "ENCUMBRANCE_ABSENT",   // Tier 2
    "FAIR_VALUE",           // Tier 3 — abstain-only
  ]),
  payload: z.record(z.unknown()),
  submitter: z.string(),
  postedAt: z.number(),
});
```

Tier is derived from `claimType` via pure `tierOf(claimType)`. Never trust a submitter-supplied tier.

### 6.2 Smart contracts

Solidity ^0.8.24, OZ v5 where useful. Custom errors, events on every mutation, NatSpec, `forge fmt` clean.

**Timing parameters** — constructor args with env-driven deploy values, not constants:
`epochSeconds` (default 3600; demo deploy 300), `disputeWindowSeconds` (default 600; demo 60). Mock-mode anvil deploy uses the demo values. The operator console exposes "Force Settle" which calls settlement directly regardless of epoch timing (operator-role gated).

**YieldProof dependency:** import the submodule's attestation-record interface. If the submodule is unavailable at build time, use the vendored fallback (record in DECISIONS.md):

```solidity
// contracts/src/interfaces/IYieldProofAttestor.sol
interface IYieldProofAttestor {
    struct Attestation { address attestor; bytes32 claimId; uint8 decision; uint256 timestamp; }
    function getAttestation(bytes32 claimId, address attestor) external view returns (Attestation memory);
}
```

**AgentRegistry**
- `registerAgent(string metadataURI) payable` — bond = msg.value, min `MIN_BOND = 0.1 ether`. Stores `Agent {addr, bond, reputation, isHuman, active}`.
- `registerHuman(string metadataURI) payable` — same, `isHuman = true`. Humans are first-class attestors: same bond, same slashing rules.
- `topUpBond() payable`, `withdrawBond(uint256)` — blocked while any dispute involving the agent is pending; bond stays ≥ MIN_BOND or fully exits.
- Reputation `int256`, mutated only by Leaderboard/Slashing via roles.

**AgentAttestation**
- `postClaim(bytes32 id, uint8 tier, bytes32 claimHash, string claimURI)` → `ClaimPosted`.
- `attest(bytes32 claimId, Decision decision, uint16 confidenceBps, bytes32 sourcesHash, bytes32 reasoningHash, string traceURI)`, `Decision {VALID, REJECTED, ABSTAIN}`.
  - Reverts: `NotRegistered`, `AlreadyAttested`, `ClaimClosed`, and `JudgmentTierRequiresAbstain` when tier == 3 and decision != ABSTAIN.
  - ABSTAIN locks no stake and is never slashable. VALID/REJECTED locks `ATTEST_LOCK = 0.02 ether` until settlement.
  - Max 16 attestors per claim (bounded loops).
- `closeClaim(bytes32 claimId)` — operator closes the window.

**TuringLeaderboard**
- `settleTier1(bytes32 claimId, Decision groundTruth)` — operator-supplied; updates per-agent epoch stats `{correct, wrong, abstained, slashes}`; releases or forwards locked stake to AgentSlashing. Latency/cost live in Postgres only.
- Views: `epochStats(agent, epoch)`, `lifetimeStats(agent)`.

**AgentSlashing**
- Tier 1 wrong → `slash(agent, claimId)` (Leaderboard-only): burn 50% of locked stake, redistribute 50% pro-rata to correct attestors via **pull payments** (claimable balances). Reputation: wrong −10, correct +1, abstain ±0.
- Tier 2 disputes: `openDispute(claimId, accused) payable` (`DISPUTE_BOND = 0.05 ether`) → `vote(disputeId, agentWasWrong)` (one vote per registered attestor, weight = current bond, window = `disputeWindowSeconds`) → `resolveDispute(disputeId)` (stake-weighted majority; agent wrong → Tier-1 slash economics, challenger gets bond back + 10% of slash; agent right → challenger bond 50% to accused, 50% burned).
- Tier 3: no slashing path exists by construction.

**Required tests (≥13 + fuzz):** registration min bond; human registration; attest happy path; double-attest revert; tier-3 non-abstain revert; abstain locks nothing; settle correct; settle wrong → exact slash math; pro-rata redistribution across 2 correct attestors; dispute agent-wrong; dispute agent-right; withdrawal blocked during dispute; reputation deltas; `testFuzz_SlashConservation(uint96 bond, uint8 attestorCount)` asserting distributed + burned == locked across the fuzz domain. Deep/long fuzz runs live behind `pnpm test:contracts:deep` (not in the fast loop).

### 6.3 Agent SDK (`packages/agent-sdk`)

**Seams** — every external dependency behind an interface with `live`, `mock` (deterministic fixture), and `stub` (programmable per-test) implementations, selected by `MODE` / `TEST_MODE`:

```ts
interface ModelSeam   { complete(req: ModelRequest): Promise<ModelResponse>; }
interface BlobSeam    { put(key: string, body: string): Promise<{url: string}>; }
interface WalletSeam  { address(): string; signAndSend(tx): Promise<TxReceipt>; }
interface ClockSeam   { now(): number; }
interface HumanQueueSeam { onClaim(claim: Claim): void; } // §6.9
```

#### 6.3.1 Resilience layer
- **ModelRouter** wraps ModelSeam: primary → `FALLBACK_MODEL` → mock script. Any failover is recorded in the trace as `{modelSwitched: true, from, to, reason}`. A 429/5xx/timeout on primary triggers fallback within the same step; the run completes.
- **Cost circuit breaker:** `MAX_COST_USD_PER_RUN` (default 0.05). Cumulative estimated cost (token usage × `fixtures/model-costs.json`) exceeding the cap forces ABSTAIN with reason `COST_CAPPED`.
- **Tool error recovery:** tool execution is wrapped; a throw becomes `{error, recoverable}`. Recoverable → one retry; still failing or non-recoverable → ABSTAIN with reason `TOOL_FAILURE`. The loop never crashes on a tool error; every failure emits a structured event row (no silent failures anywhere).
- **Timeouts:** 15s per agent run (runner-enforced), 5s per tool call.

#### 6.3.2 Deterministic task router (`src/router.ts`)
Tool availability per claim is **not** LLM discretion:

```ts
const TOOL_MAP: Record<ClaimType, ToolName[]> = {
  YIELD_BPS:          ["fetch_chainlink_price","fetch_meth_yield","fetch_usdy_yield","query_chain_state","compute_expected","cross_check_history"],
  DISTRIBUTION_PAID:  ["query_chain_state","compute_expected","cross_check_history"],
  CASHFLOW_MATCH:     ["read_document","compute_expected","cross_check_history"],
  ENCUMBRANCE_ABSENT: ["read_document","query_chain_state","cross_check_history"],
  FAIR_VALUE:         [],   // Tier 3: no tools, immediate ABSTAIN
};
```
The loop only exposes mapped tools to the model; requests for unmapped tools return a structured refusal observation.

**The tools** (zod-validated I/O; each returns `{value, source, fetchedAt, confidence}`): `fetch_chainlink_price`, `fetch_meth_yield` (stale-snapshot fixture exists for claim B), `fetch_usdy_yield`, `query_chain_state` (DSL: `balanceOf`, `eventOccurred(claimRef)`), `compute_expected` (pure math, ±2bps tolerance), `read_document` (fixture servicer report + bank statement; a mismatched pair exists for claim C), `cross_check_history` (queries Postgres attestation history — persistent memory lives in the DB, not the context window).

**ReAct loop (`loop.ts`):** model proposes `{thought, action: toolCall | finalize}`; SDK executes; repeat until finalize or `maxSteps`. Hard rules enforced regardless of model output: tier 3 → ABSTAIN (original decision recorded as `overridden`); `confidenceBps < threshold` → ABSTAIN `BELOW_THRESHOLD`; stale single source + conservative temperament → ABSTAIN `STALE_SINGLE_SOURCE` unless a second independent source confirms; step budget exhausted → ABSTAIN `STEP_BUDGET`; plus §6.3.1 reasons `COST_CAPPED`, `TOOL_FAILURE`.

**Trace format:** `{traceVersion: "1.0", agentId, claimId, docVersion?, steps: [{step, thought, action, observation, ts}], final: {decision, confidenceBps, rationaleSummary, reasons[]}}`. **Canonical serialization** for hashing: `JSON.stringify` with recursively sorted keys (single shared util `canonicalJson()` in `packages/shared`); `reasoningHash = keccak256(canonicalJson(trace))`. The verify-hash button, attest builder, and transcript validator all use the same util. Any trace-shape change bumps `traceVersion`.

**Attestation builder (`attest.ts`):** assembles `{claimId, tier, decision, confidenceBps, sourcesHash = keccak256(canonicalJson(sortedSources)), reasoningHash, traceURI}`, signs/sends via WalletSeam, writes an `agent_runs`/`attestations` row with latency ms and cost.

**Unit tests:** every tool against fixtures **with snapshot tests** (deterministic output; snapshot diffs are the agent's change log); loop happy path; each ABSTAIN reason path (threshold, tier-3 override, stale-source, step budget, cost cap, tool failure); ModelRouter failover (stubbed 429 → fallback → `modelSwitched: true` in trace); trace hash stability (two identical runs → identical hash); attest payload shape.

### 6.4 Reference agents (`packages/agent-reference`)

| Agent | Runtime / model (live) | Temperament | thresholdBps | maxSteps | Behavior contract |
| --- | --- | --- | --- | --- | --- |
| Reflector | Bombe SDK / `anthropic/claude-sonnet-4.6` | conservative | 8500 | 8 | requires 2 independent sources for VALID; abstains on stale feeds |
| Rotor | Bombe SDK / `openai/gpt-5` | aggressive | 6500 | 5 | commits whenever above threshold; never abstains for staleness alone |
| Stator | Bombe SDK / `meta/llama-3.3-70b` | cost-optimized | 7000 | 4 | shortest path; abstains when tools disagree |
| Plugboard | **Hermes Agent runtime (external, Nous Research)** | self-improving | 8000 (self-enforced) | own loop | runs OUTSIDE the SDK; safety enforced only by contracts; skill evolves per epoch (§6.8) |

Temperament is implemented twice for SDK agents: system prompt (style) + SDK hard rules (guarantees). Plugboard has neither — it is the live proof that protocol-level guarantees hold against agents Bombe did not write. `FALLBACK_MODEL` default: `meta/llama-3.3-70b` via the same gateway. Mock scripts: `fixtures/model-scripts/{agent}/{claimId}.json`.

### 6.5 Database (pglite for `pnpm demo` zero-dependency boot; Neon Postgres in live — record in DECISIONS.md)

Drizzle ORM, migrations committed:
- `claims(id pk, tier, asset, claim_type, payload jsonb, status, posted_at)`
- `attestations(id pk, claim_id fk, agent_addr, is_human, decision, confidence_bps, sources_hash, reasoning_hash, trace_uri, latency_ms, cost_usd numeric, skill_hash text, tx_hash, created_at)`
- `agents(addr pk, name, model, is_human, bond_wei, reputation, skill_hash text, registered_at)` — `skill_hash`: keccak256 of the active skill file (Plugboard only; null for SDK agents/humans)
- `epoch_stats(agent_addr, epoch, correct, wrong, abstained, slashes, avg_latency_ms, total_cost_usd, pk(agent_addr, epoch))`
- `events(id, kind, payload jsonb, created_at)` — append-only feed for SSE
- `errors(id, scope, payload jsonb, created_at)` — every tool/loop/runner failure (no silent failures)

Indexer (`apps/indexer`): subscribes to contract events (live: viem watcher; mock: shared in-process EventEmitter), upserts idempotently on (txHash, logIndex).

**SSE stream schema (`/api/stream`, `text/event-stream`)** — event types (zod-defined in `packages/shared/src/events.ts`):
- `claim` `{kind:"CLAIM_POSTED", claimId, tier, asset, claimType, payload, postedAt}`
- `agent-step` `{kind:"AGENT_STEP", claimId, agentAddr, step, thought, action, ts}` (streamed during the loop)
- `agent-done` `{kind:"AGENT_DONE", claimId, agentAddr, isHuman, decision, confidenceBps, latencyMs, costUsd, reasoningHash, blockedByProtocol?: true}`
- `human-queue` `{kind:"HUMAN_QUEUE_UPDATE", claimId, position, estimatedWaitMin}`
- `epoch` `{kind:"EPOCH_SETTLED", epoch, highlights: string[]}`
- `dispute` `{kind:"DISPUTE_RESOLVED", disputeId, claimId, accused, verdict, slashAmount}`
Frontend connects via `EventSource` and routes by `kind`.

### 6.6 Web app (`apps/web`) — Next.js 16, App Router, Tailwind v4

Global: dark theme, monospace for hashes/addresses, explorer links (disabled with "mock chain" tooltip in mock). **All routes responsive down to 380px width** — the race view collapses to a vertical stack with tap-to-expand agent cards on narrow screens (no separate mobile route).

- **`/` landing** — condensed thesis, delta table, taxonomy explainer, CTAs.
- **`/live` race view (flagship)** — five columns (desktop) / stacked cards (mobile): Reflector, Rotor, Stator, Plugboard ("EXTERNAL RUNTIME" badge), Human queue. Claim card on top (type, tier badge, payload). Columns stream `agent-step` events, ending in a chip: VALID green / REJECTED red / ABSTAIN amber + reason / **BLOCKED BY PROTOCOL purple** (contract revert). Footer: elapsed ms + cost per agent. Operator-gated "Next claim" control. **Guided Demo button:** auto-advances A→D with ~5s pauses and toast narration ("Reflector abstains: one stale source isn't enough", "The contract just rejected an external agent's judgment attestation"); full auto-run completes in <90s.
- **`/leaderboard`** — lifetime aggregate over `epoch_stats`: rank, agent (AI/human badge), accuracy % (abstentions excluded from denominator), abstention %, decisiveness (1 − abstention rate), avg latency, total cost, bond, slashes, reputation. Sortable. Humans and AIs interleaved in one table.
- **`/claim/[id]` trace viewer** — claim header; per-agent tabs; full step render; source list with hashes; final decision block; on-chain record; **verify-hash button** recomputing `keccak256(canonicalJson(trace))` client-side against on-chain `reasoningHash` (mock: stored value). For Plugboard: shows `skill_hash`, links the skill snapshot, and renders a diff between consecutive epoch snapshots ("what Plugboard learned").
- **`/operator`** — gated by `OPERATOR_KEY` (bearer in cookie). Forms for every operator endpoint below, including **"Attest as Human"** (claim picker + decision + confidence → same `attest()` path with the human's registered wallet).
- **`/operator/health`** — last test-suite run status (reads `.test-reports/` summaries if present), model API latency/error/failover counts, demo readiness (did `test:demo` last pass?), cost burn per epoch, current mode (mock/live), Plugboard runtime status (online/offline/replaying).
- **`/turing` (STRETCH, M7 only)** — blind mode: shows two anonymized attestation summaries for a settled claim (one AI, one human), visitor guesses which is human, reveal + running detection-accuracy score.

**Operator API (all gated by `x-operator-key` header == `OPERATOR_KEY`):**
- `POST /api/operator/seed-claim` `{claimId, claimType, asset, payload}` → posts claim on-chain (mock: direct call; live: operator wallet)
- `POST /api/operator/advance` → advances the demo state machine to the next claim in A→D
- `POST /api/operator/settle` `{claimId, groundTruth}` → `settleTier1` (or dispute resolution)
- `POST /api/operator/register-agent` `{name, model, isHuman, bondWei}`
- `POST /api/operator/human-attest` `{claimId, decision, confidenceBps}`
- `POST /api/operator/freeze-plugboard` / `unfreeze-plugboard` (§6.8)

Frontend renders 100% against fixtures in mock mode; live wiring must not change component props (fixture shapes ARE the API contract; enforce with shared zod schemas).

### 6.7 Demo sequence (reproducible via `pnpm demo` → "Guided Demo" or three "Next claim" clicks)

| Claim | Tier | Setup | Required outcome |
| --- | --- | --- | --- |
| A: mETH YIELD_BPS 34bps/30d | 1 | fresh oracle fixtures, expected 34±2 | SDK agents VALID < 3s simulated; Plugboard VALID (transcript); human queue static |
| B: mETH YIELD_BPS, stale feed | 1 | meth.json snapshot stale, no secondary source | Reflector ABSTAIN(STALE_SINGLE_SOURCE), Rotor VALID, Stator ABSTAIN, Plugboard ABSTAIN (evolved skill encodes the staleness lesson) |
| C: PC-POOL-1 CASHFLOW_MATCH | 2 | servicer report 50,000 vs statement sum 45,000 | all REJECTED; traces cite both documents with hashes; Plugboard cites exact line items first |
| D: PC-POOL-1 FAIR_VALUE $4.2M | 3 | n/a | SDK agents ABSTAIN (tier-3); **Plugboard's transcript attempts VALID → contract reverts `JudgmentTierRequiresAbstain` → UI shows BLOCKED BY PROTOCOL → Plugboard re-submits ABSTAIN** |

Operator then settles A and B (ground truth VALID): leaderboard shows Rotor rewarded for B, abstainers unpunished — the temperament tradeoff, visible.

### 6.8 External attestor: Plugboard (Hermes Agent runtime)

Plugboard is the only attestor NOT built on the Bombe SDK. It runs on the open-source **Hermes Agent** runtime (Nous Research) — as of May 2026 the most-used open-source agent by daily token throughput and the fastest-growing agent framework — and touches Bombe only through public interfaces: the tool gateway over HTTP, and the contracts via its own wallet. Purpose: (1) prove the network is open to third-party agents, (2) prove safety is contract-level, (3) exploit Hermes's self-learning loop (it rewrites its own skill files) for a longitudinal "does learning compound into accuracy?" leaderboard dimension.

**Tool Gateway API (`apps/tool-gateway/`):**
- `POST /tools/:name`, `:name` ∈ the six tool names. Headers: `Authorization: Bearer {TOOL_GATEWAY_KEY}`, JSON body zod-validated with the SAME schemas as in-process calls (import from `packages/agent-sdk`).
- Response: `{success: true, result: ToolOutput}` | `{success: false, error: string}`.
- Rate limit 60 req/min per key (in-memory sliding window, no Redis). CORS: `*` in mock, disabled in live. The gateway is a thin wrapper over `packages/agent-sdk/src/tools/` — never a rewrite.

**Workspace (`agents/plugboard/`):** `bombe-attestor.skill.md` (taxonomy explanation, tool endpoint catalog, attestation rules incl. "Tier 3 → ABSTAIN", wallet usage), `docker-compose.yml` pinned to `HERMES_RUNTIME_TAG`, `epoch-snapshots/`.

**Skill snapshotting & freeze:** before each epoch settlement the runner copies the live skill file to `epoch-snapshots/epoch-N.skill.md` and records its keccak256 in `agents.skill_hash`; every attestation row carries the hash active when it ran. Mock mode pins the skill to `fixtures/model-scripts/plugboard/epoch-0.skill.md` (never evolves — demo determinism). Live mode: `POST /api/operator/freeze-plugboard` snapshots to `epoch-snapshots/epoch-demo-frozen.skill.md` and blocks further writes until unfrozen.

**Mock transcript format (`fixtures/model-scripts/plugboard/{claimId}.json`):**
```json
{
  "claimId": "D",
  "agentId": "plugboard",
  "steps": [
    {"step": 1, "thought": "...", "action": {"tool": "read_document", "input": {}}, "observation": {}},
    {"step": 2, "thought": "...", "action": {"finalize": {"decision": "VALID", "confidenceBps": 8200, "rationaleSummary": "..."}},
     "contractRevert": "JudgmentTierRequiresAbstain"},
    {"step": 3, "thought": "Protocol rejected judgment attestation.", "action": {"finalize": {"decision": "ABSTAIN", "confidenceBps": 0, "rationaleSummary": "Tier 3 is not attestable."}}}
  ],
  "traceHash": "0x...",
  "expectedOnChainDecision": "ABSTAIN"
}
```
The replay engine emits this sequence through the same gateway + wallet path without any model API. A step carrying `contractRevert` means: send the tx, EXPECT that revert, surface `blockedByProtocol: true` in the `agent-done` event, continue to the next step. A unit test validates every transcript: `keccak256(canonicalJson(steps))` == `traceHash`.

**Live fallback (demo never dies):** if the Hermes runtime fails to start or crashes mid-claim, the runner switches Plugboard to transcript replay automatically; `/live` shows a "RUNTIME OFFLINE — replaying recorded behavior" badge. Stopping the Plugboard container has zero effect on SDK agents or settlement.

**Trust model (state in README):** Plugboard's thresholds are self-enforced and may drift as its skill evolves — that is the point; the protocol must stay safe anyway. Its bond and slashes are real. The Hermes self-learning loop is known to occasionally overwrite manual configuration, so the skill file is mutable agent state, never system configuration.

### 6.9 Human attestor path

- Humans register via `AgentRegistry.registerHuman()` — same bond, same slashing rules, `isHuman = true` everywhere downstream.
- **Mock mode:** `HumanQueueSeam` simulates one registered human attestor. On `ClaimPosted` it emits `human-queue` SSE updates with a simulated wait sampled from `[DEMO_HUMAN_LATENCY_MIN_MS, DEMO_HUMAN_LATENCY_MAX_MS]`; if the wait elapses before the claim closes (it never does during the demo), it submits the decision from `fixtures/human-decisions.json` through the standard `attest()` path.
- **Live/demo mode:** a real human attests via the `/operator` "Attest as Human" form (`POST /api/operator/human-attest`), routed through the same contract path with the human's wallet.
- The leaderboard and race view treat humans identically to agents except for the badge and the queue visualization.

---

## 7. Configuration / env

```
MODE=mock|live                          (default mock; fixed at boot, no runtime switching)
TEST_MODE=mock|stub                     (test runs only)
RPC_URL, CHAIN_ID=5003, DEPLOYER_KEY, AGENT_KEYS (3), PLUGBOARD_WALLET_KEY, HUMAN_WALLET_KEY   [live only]
AI_GATEWAY_KEY, FALLBACK_MODEL=meta/llama-3.3-70b                                              [live only]
BLOB_RW_TOKEN                                                                                   [live only]
DATABASE_URL                            (mock default: pglite file)
OPERATOR_KEY                            (default "dev-operator" in mock)
TOOL_GATEWAY_KEY                        (default "dev-gateway" in mock)
HERMES_RUNTIME_TAG                      (pinned version) [live only]
MAX_COST_USD_PER_RUN=0.05
DEMO_EPOCH_SECONDS=300                  (contract deploy arg in demo/mock)
DEMO_DISPUTE_WINDOW_SECONDS=60
DEMO_HUMAN_LATENCY_MIN_MS=5000  DEMO_HUMAN_LATENCY_MAX_MS=10000   (live defaults: 7200000/21600000)
```
Mock mode requires none of the live vars. Missing live var in live mode → fail fast at boot with a named error.

---

## 8. Quality bar / engineering standards

- TypeScript strict, no `any` in `packages/*`.
- All cross-package shapes defined once in `packages/shared` (zod); parse at every boundary.
- Contracts: NatSpec, custom errors, events on all mutations, `forge fmt`, zero warnings.
- Determinism: mock mode fully deterministic (seeded clock, scripted models, pinned skill) — identical demo every run.
- No silent failures: every tool/loop/runner error lands in the `errors` table and the JSON test reports.
- `pnpm run ci` = lint + typecheck + forge test + vitest + `pnpm test:demo`. Must exit 0.

## 9. Security notes (testnet-appropriate, mandatory)

- Reentrancy guards on withdrawal and redistribution; pull-payments for all payouts.
- Role-based access: Leaderboard→Slashing, operator-only settle/close/seed.
- Attestor cap 16 per claim (bounded loops).
- Tool gateway: bearer auth + rate limit; never exposes wallet or operator functions.
- Operator endpoints reject requests without the exact `x-operator-key`.

## 10. Telemetry

Latency = ms from observed `ClaimPosted` to attestation tx sent (mock: simulated, consistent). Cost = tokens × `fixtures/model-costs.json`. Failovers, cost-cap hits, and tool failures are counted per agent per epoch and surfaced on `/operator/health`.

---

## 11. Milestones (each ends in a verifiable checkpoint)

1. **M1 Contracts** — four contracts + ≥13 tests + fuzz green. ✓ `forge test` passes.
2. **M2 SDK core** — seams (incl. ModelRouter + circuit breaker + tool recovery), router, tools with snapshot tests, loop with all hard rules, attest builder. ✓ scripted Reflector run on claim B → ABSTAIN(STALE_SINGLE_SOURCE) with stable hash; stubbed 429 → failover recorded.
3. **M3 Runner + gateway + indexer + DB** — concurrent orchestration, human queue seam, tool gateway, pglite, anvil integration. ✓ `pnpm demo --headless` seeds claim A → 4 attestation rows + on-chain records; gateway round-trip test green.
4. **M4 Plugboard mock path** — transcript replay engine, claim-D revert flow, skill snapshot plumbing. ✓ integration test: transcript D → on-chain revert → ABSTAIN lands; killing Plugboard process leaves claims settling normally.
5. **M5 Web** — five routes + operator API + health view + guided demo, responsive. ✓ demo sequence A→D plays in the browser exactly per §6.7; verify-hash button matches.
6. **M6 Autonomous testing** — JSON reporters on every suite, `scripts/test-agent.ts` aggregator, `scripts/test-demo.ts` golden path, `scripts/seed-bug.ts` drill fixtures. ✓ `pnpm test:agent` outputs one parseable summary; `pnpm test:demo` validates A→D headless in <30s; the §15.3 drill passes.
7. **M7 STRETCH (only after §14 criteria 1–17 all pass)** — Telegram bot (`/race`, `/leaderboard`, `/subscribe` push on `agent-done`), Discord bot (same commands, all replies in threads, channel whitelist via `DISCORD_CHANNEL_IDS`), `/turing` blind mode. All bot logic unit-tested against mocked platform clients; no real tokens needed for tests; bots consume `/api/stream`. Nothing in M7 may modify packages that earlier milestones depend on.
8. **M8 Live seams + ship** — live implementations (compile/typecheck correctness required; live-service behavior best-effort), deploy script, README, DEMO.md, DECISIONS.md. ✓ `pnpm run ci` green; `pnpm demo` cold-start < 60s.

## 12. Deliverables

Monorepo building/testing clean; `README.md` (10-line quickstart, architecture diagram, env table, Plugboard trust model, **and a "Why not LangGraph / CrewAI / ElizaOS?" design-rationale section**: Bombe's verification task is bounded reasoning — fetch sources, compute, decide — so the agents are intentionally a ~200-line auditable ReAct loop with deterministic tool routing; heavy orchestration frameworks would obscure the protocol mechanics being demonstrated, and the safety guarantees deliberately live in the SDK hard rules and the contracts, not in a framework's abstraction. The sole external runtime, Hermes Agent, is scoped to Plugboard to prove network openness); `docs/DECISIONS.md` (every resolved ambiguity, dated); `docs/DEMO.md` (exact click-path for A→D incl. guided mode, expected outcomes per step, fallback behavior notes).

## 13. Risks the implementation must respect

- Model output must NEVER bypass SDK hard rules; external agents must NEVER bypass contract rules. These are the product's safety claims.
- Hash on-chain + body in blob + working verify button. Never full traces on-chain; never hash-only off-chain.
- The demo must never depend on live model APIs, the live Hermes runtime, or network access — claims A–D run scripted, with automatic fallbacks.
- **Pitch hedge (copy into any deck/one-pager built from this repo):** latency and cost figures ("~2 seconds", "~$0.01") are mock-mode simulated values; live figures vary by provider and claim complexity. Do not present them unhedged.

## 14. Acceptance criteria (done when ALL are true; M7 stretch items are intentionally absent)

1. `pnpm run ci` exits 0 from a fresh clone with submodules, no credentials.
2. `forge test` ≥13 passing including `testFuzz_SlashConservation`.
3. `pnpm demo` on a clean machine serves the app; the A→D sequence produces exactly the §6.7 outcomes, deterministically, twice in a row.
4. `/claim/[id]` verify-hash matches for all agents on claim A, including Plugboard's replayed trace.
5. A direct Tier-3 VALID attestation reverts with `JudgmentTierRequiresAbstain` (contract test).
6. No ABSTAIN ever appears in any slash event in any test or demo path.
7. Settling claim B as VALID raises Rotor's accuracy and Reflector's abstention count with reputation unchanged.
8. Leaderboard interleaves the human attestor with AI agents in one ranked table; a human attestation submitted via the operator form lands on-chain and appears on the board.
9. `MODE=live` with all env vars boots and `pnpm deploy:testnet` deploys to Mantle Sepolia (live-network success best-effort; compile-level correctness required).
10. README quickstart works as written.
11. Plugboard claim-D path: transcript attempts VALID through gateway+wallet → contract reverts → UI renders BLOCKED BY PROTOCOL → subsequent ABSTAIN lands. Covered by an anvil integration test.
12. Every Plugboard attestation row carries the active `skill_hash`; `/claim/[id]` renders the epoch-snapshot diff.
13. Stopping/crashing the Plugboard process has zero effect on SDK agents or settlement (test runs claim A with Plugboard disabled).
14. ModelRouter test: stubbed 429 on primary → run completes on fallback with `modelSwitched: true` in the trace.
15. Cost-cap test: a stub model burning past `MAX_COST_USD_PER_RUN` forces ABSTAIN(COST_CAPPED); tool-failure test: a throwing stub tool yields ABSTAIN(TOOL_FAILURE) after one retry, with an `errors` row.
16. `pnpm test:demo` validates the full A→D outcomes headless in <30s, and `pnpm test:agent` aggregates all suite JSON reports into one summary with zero failures.
17. All suites write JSON reports conforming to `packages/shared/src/test-report.ts` into `.test-reports/`.

---

## 15. Agent execution protocol (for the autonomous builder)

### 15.1 Machine-readable test reports
Every suite writes JSON to `.test-reports/`: `forge test --json > .test-reports/forge.json`; vitest `--reporter=json --outputFile=.test-reports/vitest.json`; `test:demo` writes `.test-reports/demo.json`. Shared schema (`packages/shared/src/test-report.ts`):

```ts
export interface TestReport {
  suite: "forge" | "vitest" | "demo";
  timestamp: string; commit: string;
  summary: {total: number; passed: number; failed: number; skipped: number; durationMs: number};
  failures: Array<{
    testName: string; filePath: string; line?: number; error: string; stackTrace: string;
    category: "contract_logic" | "contract_gas" | "typescript_type" | "runtime_error"
            | "assertion_mismatch" | "network_timeout" | "determinism_failure" | "demo_sequence" | "unknown";
  }>;
}
```
`scripts/test-agent.ts` runs all suites, normalizes raw outputs into this schema, and prints one summary. Categorization is heuristic (error-string matching) and recorded; `unknown` is acceptable.

### 15.2 The golden path
`scripts/test-demo.ts` boots the mock stack headless, advances A→D, waits for 4 attestations per claim (5s timeout each), and asserts the exact §6.7 outcome matrix plus trace-hash stability. **This test is the single source of truth for "can we submit."** Run it before every commit that touches fixtures, taxonomy, loop, contracts, or transcripts.

### 15.3 Fix loop (the builder IS the loop — no inner LLM scripts)
There is deliberately NO self-patching script: the autonomous builder reads reports and edits code directly. Protocol:
1. After any change: `pnpm test:agent`. Parse `.test-reports/*`.
2. Route by category: contract_logic/contract_gas → `.sol` (always `forge fmt` + `forge build` after); typescript_type/runtime_error/assertion_mismatch → TS; determinism_failure → seams/fixtures/canonicalJson; demo_sequence → fixtures or taxonomy.
3. Fix, then re-run ONLY the failing test (`forge test --match-test X` / `vitest run <pattern>`). Green → commit `fix: <description>` to a branch (never main). Two failed attempts on the same test → write the failure analysis to `docs/DECISIONS.md` under "ESCALATIONS" and move to other work.
4. network_timeout or unknown in mock mode → treat as a determinism bug, not flake; do not retry-until-green.
5. Before declaring any milestone done: `pnpm test:demo` must pass.
**Drill (M6 checkpoint):** `scripts/seed-bug.ts` injects two known bugs (an inverted assertion in a contract test's subject and a type error in a tool); the builder must detect both via reports and fix both within the protocol above. This proves the loop closes.

### 15.4 Guardrails (binding even with full access)
- Git checkpoint before each fix session: commit or stash with message `agent-checkpoint-<timestamp>`.
- Never modify: `.env*`, git history, lockfile (except via package-manager commands), `fixtures/model-scripts/**` traceHash values by hand (regenerate via the validator util instead).
- Forbidden in any generated change: `rm -rf` outside build dirs, `selfdestruct`, `delegatecall` (not used in this design), reading `process.env.*KEY*` outside the seams/config module, disabling tests to make suites green (skipped tests count as failures for milestone purposes).
- Push to branches only; main requires human approval.
