# DECISIONS

Per the PRD prime directive (§0) and §15.3, every resolved ambiguity is recorded here, dated. When the document is ambiguous, the builder chooses the simplest option that passes the §14 acceptance criteria, records the decision in this file, and keeps going. This file is also where the autonomous builder logs **escalations**, a test that fails twice in a row gets its failure analysis written under `## ESCALATIONS` rather than blocking the run.

---

## 2026-06-05, Workflow setup

| Decision | Rationale |
|----------|-----------|
| **D1, Lightweight solo workflow.** Keep klink's `TODO.md` T-XXX board, branch-per-task, task-ID commits, and PR-to-main; **drop** the two-phase claim PRs, auto-merge, and stale-claim rules. | Traceable history without multi-person coordination overhead. |
| **D2, This pass = workflow + task board only.** No package scaffolding, no implementation. | Clean separation between "set up how we work" and "build the product." |
| **D3, GitHub remote + real PRs**, with GitHub Actions running `pnpm run ci`. | Hackathon submission benefits from a self-review + CI gate on every task. |
| **D4, No Telegram workflow notifications.** The M7 Telegram *bot* feature remains a stretch task on the board. | "Skip the tg update of the workflow" = no TG process notifications. |
| **D5, Operator TODO queue** (`OPERATOR_TODO.md`) for anything needing the human (credentials, live-service verification, owner-only decisions). | Enables long autonomous sessions: park human-needed items, keep working unblocked tasks. |
| **D6, Hybrid auto-merge.** PRs on `docs/` and `chore/` branches auto-merge when CI is green + no conflict; `feat/` and `fix/` PRs (logic-bearing) wait for the operator's manual merge. | Velocity on low-risk changes; keeps the operator as the gate on logic, honoring the spirit of PRD §15.4 (recorded as a scoped exception here). |
| **D8, Branch protection on `main` requires the `ci` check.** Auto-merge (D6) only gates on CI when the target branch has a required status check; otherwise GitHub merges a PR as soon as it is conflict-free, ignoring CI. `main` now requires the `ci` check (`strict: false`, `enforce_admins: false` so the owner keeps an override). | Without this, D6's "CI green before merge" is unenforceable, discovered when PR #1 auto-merged before its CI finished. The required check makes the gate real for both auto-merged (docs/chore) and manually-merged (feat/fix) PRs. |
| **D7, Incremental `ci` script + invoked via `pnpm run ci`.** The root `ci` script is green from T-009 running only the gates implemented so far (lint + typecheck); `forge test`, `vitest`, and `pnpm test:demo` are appended to `ci` as the milestones that introduce them land. CI and operators invoke it as **`pnpm run ci`**, because pnpm 9 reserves the bare `pnpm ci` name as a built-in stub (`ERR_PNPM_CI_NOT_IMPLEMENTED`). | A red `pnpm ci` from task one would break the D6 merge-gate workflow, so the gate must be green at every step and grow with the codebase. The `run` form is required to reach our package script past pnpm's reserved command. The `.github/workflows/ci.yml` step uses `pnpm run ci` accordingly. |
| **D9, Autonomous execution mode.** During the operator-directed 'work until done' run, `feat`/`fix` PRs auto-merge after green required CI + a passing two-stage subagent review (spec + quality), substituting adversarial review for the human merge gate. Operator can revert to D6 manual logic-merge at any time. | Operator explicitly requested continuous unattended progress; downstream tasks depend on merges, so logic cannot wait for manual merge. |
| **D10, YieldProof via vendored fallback.** No YieldProof submodule URL was provided, so `contracts/src/interfaces/IYieldProofAttestor.sol` is vendored per PRD §6.2's fallback. Wiring the real submodule under `contracts/lib/yieldproof` is parked as OP-2. | PRD §6.2 explicitly allows the vendored fallback when the submodule is unavailable at build time. |
| **D11, Attestation stake (`ATTEST_LOCK` 0.02e) is supplied as `msg.value` on `attest()` and held by `AgentAttestation`, separate from the registration bond in `AgentRegistry`. ABSTAIN requires `msg.value == 0`.** | PRD §6.2 specifies the lock amount but not its source; a per-attestation payable lock held by the attestation contract is the simplest model that satisfies §14.6 slash math and "abstain locks nothing", and keeps the registration bond independent. |

| **D12, Settlement responsibility split (T-105/T-106).** `TuringLeaderboard.settleTier1` orchestrates: it applies ALL reputation deltas (+1 correct / −10 wrong / ±0 abstain), credits correct attestors' released own-stake (seized from `AgentAttestation` via `SETTLER_ROLE`, then forwarded to `AgentSlashing.creditClaimable`), and calls `AgentSlashing.slashTier1` once per wrong attestor. `AgentSlashing` handles ONLY the seized-stake economics (burn 50% / redistribute 50% pro-rata via pull-payment `claimable`) and never mutates reputation; it exposes the single `withdraw()` surface for all payouts. The burn is implemented as ETH retained permanently in `AgentSlashing` (never credited to any `claimable`), accounted in `totalBurned`. ABSTAIN attestations hold no stake and never enter any slash path (§14.6); the conservation invariant `seized == burn + distributed` holds exactly (rounding remainder folded into the burn). | The PRD assigns the −10/+1 deltas and the burn/redistribute split across two contracts; centralizing all reputation in the Leaderboard and all seized-stake math in Slashing avoids double-walking the attestor list and keeps a single withdrawal surface. |
| **D13, Tier-2 dispute economics + conservation (T-107).** For the **agent-wrong** verdict (votesWrong > votesRight), the accused's locked `ATTEST_LOCK` is seized (`seizeStake`). The split is: `burnHalf = seized / 2`; `distributeHalf = seized − burnHalf`; `challengerReward = seized / 10` (exactly 10% of seized, drawn from `distributeHalf`); `remainderForPeers = distributeHalf − challengerReward`. `remainderForPeers` is distributed pro-rata (equal shares) to all other non-abstain attestors of the same claim except the accused; if none exist it folds into burn. Any integer-division remainder also folds to burn. Conservation holds exactly: `seized == burnActual + challengerReward + distributed` where `burnActual` absorbs all rounding. The challenger also receives their `DISPUTE_BOND` back. For the **agent-right** verdict (votesRight ≥ votesWrong, including **tie**, tie → agent right by benefit of the doubt, simplest rule that keeps the protocol honest without penalising disputed-but-correct attestors): challenger's `DISPUTE_BOND` is split `accusedCredit = bond / 2`, `burnCredit = bond − accusedCredit`; no slash, no reputation change. The tie→agent-right rule is documented here and in the contract NatSpec. | PRD §6.2 specifies the split percentages; the exact derivation of "10% of seized from distributeHalf" chosen so conservation holds across all ATTEST_LOCK multiples without wei loss. Tie → agent right gives benefit of doubt to the accused and discourages frivolous disputes. |

**D6 is a scoped exception to PRD §15.4** ("main requires human approval"). Only `docs/` and `chore/` PRs auto-merge on green CI; logic-bearing PRs (`feat/` and `fix/`) still require the operator's manual merge. The human therefore remains the gate on every change that touches behavior.

**Repo owner / remote.** Owner **Jishnu Baruah** (`jishnu-baruah`); remote `https://github.com/jishnu-baruah/Bombe.git`; visibility per GitHub. This supersedes the spec's placeholder default of `klinksolana` / `bombe`.

---

## 2026-06-06, Contracts M1 completion

| Decision | Rationale |
|----------|-----------|
| **D14, Canonical deployment topology (T-109).** The six role grants wired by `Deploy.s.sol` are the required minimum for settlement and disputes to function: `registry.REPUTATION_ROLE → leaderboard`; `registry.DISPUTE_ROLE → slashing`; `registry.REPUTATION_ROLE → slashing` (so `resolveDispute` can apply the −10 penalty to a losing accused, without it tier-2 agent-wrong resolutions revert); `attestation.SETTLER_ROLE → leaderboard`; `attestation.SETTLER_ROLE → slashing`; `slashing.LEADERBOARD_ROLE → leaderboard`. `OPERATOR_ROLE` on both `AgentAttestation` and `TuringLeaderboard` is granted to the deployer in their respective constructors (operator == admin at deploy time), so no extra `grantRole` calls are needed. Demo timing defaults are `epochSeconds = 300` and `disputeWindowSeconds = 60`, read from env vars `DEMO_EPOCH_SECONDS` / `DEMO_DISPUTE_WINDOW_SECONDS` with those defaults, per PRD §6.2 §7. For production / Mantle Sepolia `epochSeconds = 3600` and `disputeWindowSeconds = 600` are the PRD defaults and should be supplied via env. | The deploy script must be the single canonical source of truth for role wiring so that live deploys replicate the exact topology verified in tests. Recording the topology here satisfies the T-109 Acceptance criterion and provides an audit trail. |

---

## 2026-06-06, YieldProof submodule + README

| Decision | Rationale |
|----------|-----------|
| **D15, YieldProof submodule wired for reference; vendored interface retained.** `https://github.com/imanishbarnwal/YieldProof` wired as a reference submodule at `contracts/lib/yieldproof`. Its interface is incompatible with PRD §6.2 `IYieldProofAttestor`: it uses `uint256` claimIds, a fee-based `attestToClaim`, and `struct Attestor{bool isRegistered; uint256 stake}`, no `{attestor,claimId,decision,timestamp}` record. The submodule is Hardhat-based and does not break Foundry's build (forge compiles only imported files; nothing imports the submodule's contracts). Vendored `IYieldProofAttestor.sol` at `contracts/src/interfaces/` is retained as the canonical build interface. Our contracts do not consume YieldProof's registry. | PRD §6.2 explicitly allows the vendored fallback; integrating the incompatible Hardhat model would require a shim layer with no functional benefit. The reference submodule satisfies the "wire it for visibility" intent of OP-2 without destabilising the build. |

---

## 2026-06-06, Live-ship mandate (D16)

| Decision | Rationale |
|----------|-----------|
| **D16, LIVE submission, mock is test/fallback only.** The shipped product runs in `MODE=live`: real LLM via the AI gateway, real Mantle Sepolia transactions (explorer-visible), real blob trace storage + on-chain `reasoningHash` + verify-hash. Mock mode is retained ONLY for deterministic tests and the offline fallback (Plugboard replay T-504), never the submission demo. `HACKATHON.md` = submission spec; `DESIGN.md` = web design system; PRD = build spec. | Operator mandate 2026-06-06 (see `HACKATHON.md`), judges must interact with a live on-chain product. This re-prioritizes the live seams (T-801–804) and real deployment to critical path. This is a scoped reframing of PRD §13 (whose "demo must not depend on network" now applies to the OFFLINE FALLBACK, not the live submission demo). |

---

## 2026-06-07, Public agent-read API + board restructure (D17)

| Decision | Rationale |
|----------|-----------|
| **D17, the public read API (v1) ships as the first v3 agent-access surface, ahead of the credential- or council-gated v3 items.** `apps/web/app/api/v1/{assets,claims/[claimId],verify/[claimId]}` reads the live AgentAttestation contract directly (no keys, CORS-open) and is deployed to production at https://bombe-web.vercel.app/api/v1. A context-less consumer (`scripts/test-public-api.mjs`, zero Bombe imports) verifies it end-to-end. `/verify` honestly returns `trace_unavailable` until durable trace storage lands (gated on OP-5). The TODO board is restructured klink-style: active tasks at the top, completed tasks condensed into a dated `## Done (archive)` section. | The read path is permissionless and safe to expose now (it only re-serves what any agent could read from the chain), so it does not need to wait on the x402 / MCP / trace-storage decisions that the external council still owns. Shipping it early gives integrators a real endpoint to build against and makes the "agents can use our service" claim substantiated by working code, not a promise. The board restructure keeps the active surface legible as the done list grew past 60 entries. |

---

## 2026-06-07, Self-serve issuer paid flow architecture (D18)

| Decision | Rationale |
|----------|-----------|
| **D18, the self-serve issuer paid flow is non-custodial in payment and operator-side in posting.** The issuer connects their own wallet and pays the fee directly (both rails: a direct MNT transfer and Mantle x402, ship whichever lands first as primary and the other as fallback); we never custody issuer funds. The platform then posts the claim and attests on the issuer's behalf, because `postClaim` is `onlyRole(OPERATOR_ROLE)` on the deployed `AgentAttestation` and the v2 lock forbids changing the contract before 2026-06-15. Auto-attestation is limited to claim types Bombe can falsifiably verify (mETH/USDY yield today). The live post path requires a dedicated, minimally-funded posting key (not the deployer key), a receiving address, per-issuer rate limiting, and fail-closed dedupe (OP-9). | Operator decision 2026-06-07: build the paid flow, non-custodial payment, both rails. The contract gate makes operator-side posting unavoidable now; calling it "custodial" only in the posting sense (not fund custody) keeps the description honest. Permissionless issuer posting (issuer's own wallet calls `postClaim`) is a v4 contract change after June 15. The falsifiability limit is the thesis: Bombe cannot auto-attest a claim it has no data source to check. |

---

## 2026-06-08, June-15 lock override + Mantle-RWA asset expansion (D19)

| Decision | Rationale |
|----------|-----------|
| **D19, the v2 "no third asset / no new features before 2026-06-15" locks are lifted with explicit in-session operator approval, and the asset set expands to prioritize Mantle-native RWA.** Added via the source-adapter registry (one entry each, no new control flow): **sUSDe** (Ethena staked USDe on Mantle, the largest Mantle yield pool), **BUIDL** (BlackRock tokenized US Treasuries), **OUSG** (Ondo tokenized US Treasuries). All are issuer-reported single sources, labeled honestly ("does not catch issuer fraud", D4a-style); the word "independent" is not used. **cmETH is deliberately deferred**: no clean yield series exists on DefiLlama (the venue pools report 0% or noise), and attesting garbage data violates the be-real mandate; it returns once a Mantle-native restaking-APR source is wired. Deployed contract addresses and their attestation history are untouched (no redeploy). | Operator override 2026-06-08 ("override all june 15 lock") in response to "prioritize all mantle rwa assets". The locks existed to protect a focused two-asset story and the deployed history; the operator explicitly chose breadth of real Mantle RWA over the lock. The registry (T-40) makes each asset a data-only addition, so the expansion adds zero attack surface to the contract or the deterministic reconciler. Honesty rules (D10/D4a) still bind every new label. The mETH second-leg input (OP-10 item 1) was independently mooted: Mantle's protocol API publishes the METHtoETH rate + APY, giving a real second computation path with no L1 archive RPC. |

---

## 2026-06-08, Per-asset verification pipeline + gates (D21)

| Decision | Rationale |
|----------|-----------|
| **D21, a verification pipeline sits above the source resolver and is auto-selected by the asset's category.** The default pipeline is fetch -> freshness-gate -> bounds-gate -> reconcile -> judge. Gates are deterministic and can force ABSTAIN, never an opinion: the **freshness gate** abstains when the freshest source leg is older than the category's max staleness (legs carry an `asOf`); the **bounds/sanity gate** abstains when a leg's annualized yield is outside the category's plausible band (e.g. a misparsed 900% APY). `pipelineFor(spec)` picks the gate config by category (CATEGORY_GATES), so a newly discovered asset inherits a sensible pipeline with no code; protocol-specific overrides are a future keyed entry. Gate outcomes appear as nodes in the provenance DAG and as `GATE_ABSTAIN(...)` reasons; a gate-forced abstain overrides the reconciler verdict and is the stated rationale. Tier-2 document verification will plug in as a `document` step in the pipelines that need a report checked. | The single fetch-reconcile path was right for two curated assets but not for an open universe where data can be stale, misparsed, or protocol-specific. Gates make every asset safer by default (stale or absurd data abstains rather than attesting noise) while keeping the verdict deterministic. Auto-selection by category means breadth (any RWA) does not mean hand-writing a path per asset. Modeling Tier-2 as a pipeline step unifies document-checkable claims into one mental model instead of a parallel path. Operator answer 2026-06-08: framework + generic gates first; Tier-2 as a pipeline step. |

---

## 2026-06-08, Tier-2 document verification as a pipeline step (D22)

| Decision | Rationale |
|----------|-----------|
| **D22, Tier-2 document verification is real, over a real document, as the pipeline `document` step.** `document.ts` fetches a referenced document, pins it by hashing its exact bytes (`docHash`), extracts the target figure with a citation, and runs a deterministic cross-check against the asserted value. Two extraction modes: **json-path** (deterministic field read for structured documents, preferred, no model) and **llm** (a model extracts the figure from prose and returns a verbatim quote; the quote is rejected unless it appears verbatim in the pinned document, so a hallucinated citation cannot pass). The first live document is the **US Treasury "average interest rate" for Treasury Bills** (fiscaldata.treasury.gov, authoritative JSON): a tokenized-treasury asset's asserted yield is cross-checked against the real government bill rate within tolerance. Exposed live at `GET /api/v1/document-check` and MCP `bombe_check_document`, with the docHash, the cited figure, and a provenance DAG (document -> extraction -> cross-check -> verdict). The verdict is the deterministic cross-check; the model only reads. An unreadable document or a missing figure ABSTAINS. | Operator answer 2026-06-08: Tier-2 lives as a pipeline document step; use WebFetch to find a real document and proceed. The US Treasury API is authoritative, machine-fetchable, and independent of both the issuer and the aggregator, so cross-checking a tokenized-treasury yield against it is a genuinely falsifiable Tier-2 claim, not a fixture. json-path extraction is deterministic and reproducible; the llm path keeps the same auditability for prose by grounding every quote in the pinned bytes. This makes the document-falsifiable tier real without a 3rd-party parser, and keeps the honesty rule (the model never decides the verdict). The 3rd-party-parser benchmark (T-49) remains a separate, credential-gated comparison. |

---

## 2026-06-08, Large vetted featured catalog + fully open asset space (D23)

| Decision | Rationale |
|----------|-----------|
| **D23, the featured catalog expands to ~30 vetted real assets and the on-chain asset space becomes fully open.** The featured set is generated (`featured-assets.ts`) from DefiLlama pools across the yield-meaningful RWA categories (tokenized treasuries, private credit, synthetic-dollar, liquid staking, liquid restaking, lending, BTC yield), each vetted live (clean apy in the category's plausible band, fresh chart, TVL >= 2M). ~29 assets, Mantle-native sorted first, mETH leading with two computation paths. Categorization is by ISSUER project (the pool IS the asset's native yield), not by venue, to avoid mislabeling (e.g. a sUSDe-on-Aave pool is synthetic-dollar, not lending); pendle and tokenized-equity LP pools are excluded (their apy is not the asset's yield). The claim taxonomy `asset` is loosened from a fixed enum to `z.string().min(1)`: any non-empty symbol validates, so discovered/issuer assets post and display correctly. The request form and SUPPORTED_ASSETS derive from `FEATURED_SYMBOLS`; the MCP request tool accepts any string. Site copy states "30+ verified yields" (floored, never overstated) and keeps the live on-chain stats honest (they still reflect actual claims, not the catalog). | Operator directive 2026-06-08: keep adding assets, focus trending, cover all platforms incl. Mantle, batch-test, loop the target up from 20. A small curated list is not a product; the value is a large, real, vetted catalog plus the open discovery universe. Generating from vetted DefiLlama pools keeps every entry real (no fabricated pools) and the pipeline gates protect attest-time quality. Opening the taxonomy is the honest end-state of "attest any RWA yield"; safety was never the symbol list, it is the deterministic reconciler + the gates + the on-chain Tier-3 guard. A research subagent compiled the platform/slug coverage; the verified per-product slugs (superstate-ustb, openeden-tbill, hashnote-usyc, maple-rwa, clearpool-tpool, lombard-lbtc, ...) pushed the count from 5 to ~29. |

---

## 2026-06-08, Asset grades, vaults, window selection, rwa.xyz gate (D24)

| Decision | Rationale |
|----------|-----------|
| **D24, the catalog gains a maturity/liquidity grade and a vault category, the request flow exposes data-range selection, and rwa.xyz is recorded as a gated data source.** Every `AssetSpec` carries `grade` (blue-chip >=$1B / established >=$100M / emerging >=$10M / long-tail <$10M by TVL), an honest liquidity-risk signal, not a quality endorsement; lower grades abstain more often via the existing gates. The featured catalog grows to ~36 incl. a `vault` category (ERC-4626 / active-strategy vaults: Morpho, Sky, Yearn via DefiLlama), labeled to attest the vault's reported share yield, never a strategy-quality judgment. The request form exposes a 7/30/90/180/365-day window selector (the actual window is still clamped to available history and always displayed). rwa.xyz (PE/VC, real estate, stocks, commodities, the long-tail credit/strategy issuers) is key-gated (OP-12); only the falsifiable yield/price slice would be attested, with appraisals (PE/VC, real estate NAV) abstaining unless a documented NAV exists. | Operator directive 2026-06-08: add more assets even if lesser-known, with proper terminology; support vaults incl. auto-strategy vaults; offer data-range selection; ingest as much as possible incl. rwa.xyz. Grades let the catalog grow honestly instead of pretending uniform quality. Vaults are the cleanest deterministic yield (share price), so they belong; the on-chain ERC-4626 scheme + strategy-vault claim types (NAV/holdings/rule-adherence) are the next batch. The falsifiable line holds: facts attested, judgment abstained, which is what lets Bombe be the ecosystem attestation standard rather than an attest-anything toy. |

---

## ESCALATIONS

Format for each escalation entry:

```
### <date>, T-XXX <test>
Two failed attempts. Analysis: …
```

_(none yet)_
