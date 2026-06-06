# Bombe v2 Upgrade PRD

**Version:** 2.2-final (incorporates follow-up resolutions Q1-Q12 and ETA items)
**Date:** 2026-06-07
**Status:** Execution-ready. Amendment rule: changes require a broken gate, not a new argument. The Q1-Q12 follow-up qualified (every CRITICAL item blocked a gate); it is now resolved and merged. The next amendment requires a gate failing in practice.
**Owner:** Operator (human). Executor: Claude Code (continuous, bypass mode).
**Hard deadline 1:** 2026-06-15 (DoraHacks submission; listed close 15:59, TIMEZONE UNCONFIRMED, see Sec 7 Jun 8). Internal submission date: 2026-06-14.
**Hard deadline 2:** 2026-07-02/03 (Demo Day, livestreamed). Winners 2026-07-10.
**Companion docs:** MARKET-READINESS.md (ground-truth baseline), SUBMISSION.md (updated by WS5), CLAUDE.md (agent constitution, Sec 9), docs/V3-BACKLOG.md (idea parking), docs/KNOWN-ISSUES.md (contract bugs protocol).

---

## 0. One-paragraph summary

Bombe v1 proved the architecture: contract-enforced abstain on unfalsifiable claims, staked AI attestors, a recomputable reasoning hash on-chain, and an external attestor (Plugboard) reverted by protocol. v1's fatal gap: the flagship "live" attestation reasoned over fixture data. **v2 converts the demonstrator into a running service**: real data on the decisive path with cross-checked computation, deterministic verdicts the verifier can rerun, multi-model consensus guarding the evidence, daily unattended attestation of Mantle's two flagship yield assets (mETH, USDY), and a public, honest track record including self-tests, rejections, and abstains. Submitted to the Mantle Turing Test Hackathon by June 14 and accumulating a streak through Demo Day. v2 explicitly does NOT generalize schemas, open permissionless posting, or change deployed contract semantics.

---

## 1. Locked decisions (do not relitigate during execution)

| # | Decision | Resolution | Rationale (short) |
|---|----------|-----------|-------------------|
| D1 | Target customer | DeFi protocols / readers of attestations (the feed), not issuers | Only buyer who must consume on-chain output |
| D2 | Pilot scope | Single pipeline, two assets (mETH, USDY). No third asset in v2 | Validate the loop before the platform |
| D3 | Build order vs pitch order | **Build mETH first, pitch USDY first (written pitch). Video leads mETH.** | mETH has the cleanest direct on-chain read. NOTE (Q2 correction): mETH's two legs are NOT independent sources; they are one ground truth (the on-chain exchange rate) computed via two paths (aggregator vs from-scratch). This catches transport, staleness, and computation faults, not source fraud. The phrase "independent sources" is reserved for assets whose legs have genuinely different underlying data |
| D4 | Data semantics on decisive path | **Cross-check, not fallback.** Fetch all bound sources; attest only on like-for-like reconciliation within documented tolerance; abstain on disagreement or source failure | Fallback = availability semantics. Cross-check = truth semantics |
| D4a | USDY exception path (Q3) | USDY's second leg = on-chain realized yield derived from price accrual over the available window, compared like-for-like to DefiLlama's same-window metric, labeled "partial independence" everywhere. **Tripwire:** if the tolerance required to avoid spurious abstains exceeds 100 bps, the comparison is meaningless; USDY then becomes a labeled single-source attestation ("single source, full transparency"), a narrow written exception to D4 for USDY only. Never claim the USDY check catches issuer fraud | Resolves the D2/D4 tension explicitly instead of silently |
| D5 | Consensus | SDK-level 2-of-3 in v2; contract-level N-of-M deferred to v3. Split or model failure on decisive path = ABSTAIN | No Solidity semantic changes under deadline |
| D6 | Models | Three existing gateway models only (Claude-class / GPT-class / open-weight via Ollama Cloud). No new providers or credit dependencies in the critical path. **Availability is verified before WS2 (Sec 7, Jun 8).** If fewer than three genuinely different models respond, v2 ships **single-model triple-run redundancy**, labeled exactly that, never "multi-model consensus" | Credits arrive on their timeline, not yours; honest labels per D10 |
| D7 | Contracts | **Frozen.** No changes, no redeploys before June 15 except a demo-blocking bug with operator approval. Non-blocking bugs: docs/KNOWN-ISSUES.md, branch fix, new addresses after June 15 | Deployed addresses + attestation history are the asset |
| D8 | Network | Sepolia through Demo Day. Mainnet (dust economics) opens v3. Mainnet signal in v2 = compile-only deploy script + dated README line; no partial deployments | The 90-day mainnet streak is the post-hackathon customer tool |
| D9 | Onboarding | Assisted only. Permissionless posting deferred | No anti-spam design exists |
| D10 | Marketing claims | Nothing in README/pitch/site/video that the code cannot substantiate. "Live" requires real data end-to-end. "Independent" requires genuinely different underlying data. When unsure, understate | Honesty is the moat |
| D11 | Verdict authority (Q1) | **Tier-1 verdicts are deterministic.** verdict = abs(reconciledValue - assertedValue) <= tolerance, computed by a DeterministicReconciler, rerunnable by any verifier. Models gather evidence, orchestrate sources, and write the rationale. Consensus (D5) votes on the EVIDENCE (each model run's fetched/reconciled values), not on the verdict; the reconciler computes the verdict from consensus evidence. Tier-3 remains abstain-by-construction (consensus moot there) | The trust claim becomes math a skeptic can rerun, matching Sec 3's own framing |
| D12 | Consensus axis (Q6) | On the decisive numeric path, temperament is held constant and only the model varies, so a split reflects genuine model disagreement on evidence. The three temperaments (Reflector/Rotor/Stator) remain for the race-view display and Tier-3 storytelling only | Don't confound two variables in the decisive vote |
| D13 | Scheduler state (Q7) | On-chain attestation history is the durable source of truth (streak rendered from chain; dedupe via chain read). Daily rate samples persist in the claim payload plus a committed JSON. A **fine-grained repo-write token (contents:write, this repo only)** is hereby enumerated as the third permitted credential class. Dedupe is fail-closed: if chain read AND committed marker are both unreachable, skip the run; never risk a double-post | No funds exposure; worst case is recoverable git vandalism |
| D14 | Minimum-viable submission fallback (ETA-3) | If Gate 1a is not green by **12:00 local, June 12**, the operator invokes the fallback: submit the v1 architecture with explicit labeling, "fixture-era data; real-data cross-check pilot in progress," leading with the contract-enforced abstain and the Plugboard revert, streak surface marked "pending real-data launch." Weaker but D10-compliant. The trigger date exists so the decision is made calmly, with video-recording time intact | Pre-deciding the fallback is the point |

---

## 2. Goals and non-goals

### v2 goals (priority order)
1. **G1, Real data on the decisive path.** Every decisive attestation reasons over live, like-for-like cross-checked evidence. Zero fixtures on the live path.
2. **G2, Verifiable verdicts.** Tier-1 verdicts are deterministic and rerunnable (D11); decisive evidence requires 2-of-3 model agreement (or honestly-labeled redundancy per D6); disagreement produces an on-chain abstain.
3. **G3, A streak, not a screenshot.** Unattended daily attestations from the earliest possible date (thin scheduler first, ETA-1), so Demo Day shows weeks of consecutive on-chain history containing VALID, REJECTED (self-tests), and ABSTAIN entries.
4. **G4, Submission complete by June 14** in the required format (X thread #MantleAIHackathon with pitch, video, GitHub, contract address; DoraHacks BUIDL; Mantlescan-verified contracts).
5. **G5, Consumable by a third party** in <15 minutes from the README quickstart.

### Explicit non-goals (defer to v3+)
Schema/verification generalizer; new claim types or assets; contract-level N-of-M; bond-sizing or slash-math changes; permissionless posting; issuer dashboard; Tier-2 live document pipeline (PC-POOL-1 stays fixture/demo-only, labeled); mainnet deployment; token; UMA/Chainlink integrations; conversational bots; sponsor-credit integrations in the critical path.

---

## 3. Success metrics

| Metric | By Jun 14 (submission) | By Demo Day (Jul 2) |
|--------|------------------------|---------------------|
| Decisive attestations on live cross-checked data | >=1 headline mETH + >=1 USDY (or D4a-labeled) | Daily streak from scheduler-live date, 2 assets |
| Fixtures on live decisive path | 0 | 0 |
| Verdict mechanism | Deterministic reconciler live; split-evidence case demonstrably ABSTAINs | Same; >=1 self-test REJECTED on the public record |
| Scheduler | Thin scheduler live ASAP after Gate 1a; 2 consecutive unattended runs before full WS3 sign-off | >=90% scheduled-run success; misses logged publicly |
| Submission artifacts | 100% required items, submitted Jun 14 | Demo rehearsed; streak page live |
| README quickstart | <=10 lines Solidity + <=10 lines TS, works copy-paste | Unchanged |
| CI | `pnpm run ci` green on every merged commit | Same |

Accuracy is tracked and published (including misses) but not gated: the v2 trust claim rests on deterministic verdicts + cross-check + abstain + consensus-guarded evidence, not on a model accuracy number. The 83% single-model figure is the floor this architecture exists to make irrelevant.

---

## 4. Workstreams

Executed as the gated queue in Sec 8. Each gate blocks the next workstream and its evidence (tx hash, test output, screenshot path) is recorded in OPERATOR_TODO.md.

### WS1, Live DataSource seam with deterministic cross-check (G1, G2), P0

**Scope.** A `DataSource` abstraction behind the existing live/mock seam; two production sources; like-for-like reconciliation; deterministic verdict.

- `DefiLlamaSource`: Yields API; pools already identified (mETH `b9f2f00a-...`, USDY-on-Mantle `b5d7a190-...`). 5-min TTL cache. Timeouts + bounded retries (availability layer only).
- `MantleRpcSource`: direct reads. mETH: staking contract `0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f` `mETHToETH`; persist daily rate samples (per D13).
- **Like-for-like windowing (Q4).** Both legs are annualized over the SAME available window: use DefiLlama per-window fields (e.g. `apyBase7d`) or compute from its `pricePerShare` series over the same N days as the on-chain samples; never compare an N-day realized yield to a 30-day mean. Tolerance is set from observed sampling noise and documented. `windowDays` lives in the claim payload; trace, frontend, and streak surface display it; a short-window claim is NEVER rendered as "30-day yield." No new claim type (D7).
- **Deterministic reconciler (D11).** `deterministicVerdict(reconciledValue, assertedValue, toleranceBps)` in the agent SDK; pure function; covered by unit tests; its inputs and output appear in the trace so any verifier can rerun it.
- **Honesty labels (Q2/Q3).** mETH trace label: "one ground truth, two computation paths (aggregator vs from-scratch on-chain); catches transport/staleness/computation faults, not source fraud." USDY trace label: "partial independence" per D4a, or "single source, full transparency" if the D4a tripwire fires. The word "independent" appears nowhere in mETH/USDY materials.
- Fixtures remain the test path; the 668 vitest tests stay deterministic; no fixture import reachable when `MODE=live` (lint rule or runtime assert).

**Order:** mETH first; USDY after WS2 (see Sec 8).
**Gate 1a:** Real Sepolia mETH attestation whose published trace shows both legs, same-window values, tolerance, the reconciler inputs/output, and a recomputable hash.
**Gate 1b:** Same for USDY under D4a (either branch).
**Gate 1c:** Forced-disagreement run produces an on-chain ABSTAIN, labeled as a forced test.

### WS2, Consensus over evidence, deterministic verdict (G2), P0

**Scope.** Runner orchestrates three runs (three models per D6, temperament constant per D12) against the same claim; consensus is computed over each run's EVIDENCE (fetched values, reconciled value); the deterministic reconciler issues the verdict from consensus evidence; the single existing `attest()` flow posts it.

- Decisive requires >=2 evidence agreement (values within tolerance of each other). Any split, model failure, or timeout on the decisive path -> ABSTAIN.
- Trace records per-run: model id, fetched values, reconciled value, latency; then the consensus evidence and the reconciler verdict. The race view surfaces the vote. Example trace shape: "Model A 34.2 bps, Model B 34.1, Model C 34.3 -> consensus 34.2 -> asserted 34.0, tolerance 5 -> VALID."
- **Model availability precheck (Q5)** happens before this workstream starts (operator, Jun 8). Fallback per D6 is single-model triple-run redundancy with that exact label.
- No contract changes. Per-agent on-chain stakes for council members are v3.

**Gate 2a:** Consensus attestation on Sepolia with the per-model evidence and reconciler verdict visible in the trace, under the correct label (multi-model or redundancy).
**Gate 2b:** Tests: split evidence -> ABSTAIN; one-model timeout -> ABSTAIN; reconciler unit tests.

### WS3, Continuous operation (G3), P0, split THIN then FULL

**WS3-thin (immediately after Gate 1a; before WS2 and USDY).** The streak is wall-clock-bound and cannot be backfilled (ETA-1), so a minimal daily mETH run goes live at the earliest possible moment. Each run's trace records its configuration (single-model, pre-consensus, window length) so early streak entries are honestly labeled and remain valid history after upgrades.
**Gate 3-thin:** Two consecutive unattended mETH runs; streak surface renders them with per-run config.

**WS3-full (after Gates 2a and 1b).** Both assets daily under consensus; plus:
- **Self-test claims (Q8).** Every 7th run posts a deliberately wrong asserted value (e.g. mETH yield asserted 1000 bps vs ~real), flagged `selfTest: true` in trace and payload, rendered with a distinct badge on the streak surface. The public record then visibly contains VALID, REJECTED, and ABSTAIN (Gate 1c run is shown with its forced-test label). A wall of green is a rubber stamp; a record with labeled rejections is a discriminator.
- **State (D13).** Chain history = source of truth; dedupe chain-read primary, committed `lastRunDate` marker secondary, fail-closed if both unreachable. Rate samples in payload + committed JSON via the scoped repo token.
- **Keys.** Posting key (`OPERATOR_ROLE`, 0.5 MNT, ~50 claims), attestor keys (minimum bond 0.1 MNT + stake headroom), scoped repo-write token. Deployer/admin key NEVER in the environment. Any key below 0.1 MNT: scheduler pauses and alerts; exposed key: operator rotates within 24h.
- GitHub Action cron (visible, public logs), idempotent, one retry window, failure alert to operator.

**Gate 3-full:** Two consecutive unattended dual-asset consensus runs; one self-test REJECTED visible on the streak surface.

### WS4, Repo, contracts, integration hygiene (G5), P1

- README rewrite: remove stale lines ("deploy:testnet is a stub", "fuller README planned"); architecture diagram; deployed addresses; honest stage framing (link MARKET-READINESS.md); top-of-file consumer quickstart (one Solidity interface + one TS snippet to read the latest verified attestation, <=10 lines each).
- **Mainnet signal (no deployment):** compile-only mainnet deploy script + README line "Mainnet: July 2026, after the public Sepolia streak validates the loop." Partial "presence" deployments are rejected (empty contracts found by diligent judges read as signaling theater; D10).
- Compress docs/INTEGRATION.md to quickstart-first. GitHub description + topics (operator pastes).
- **PRD into repo (Q12):** commit this PRD as docs/BOMBE-V2-PRD.md, converting em-dashes per the standing repo style rule (agent performs the conversion preserving meaning; tables intact).
- **Operator:** verify all four contracts on Mantlescan (API key).
- D10 claims audit across README/docs.

**Gate 4:** CI green; quickstart works copy-paste; 4 contracts verified; zero D10 violations; PRD committed.

### WS5, Submission package (G4), P1

- Replace fixture-era headline txs in SUBMISSION.md with WS1/WS2 real-data transactions (old tx kept, labeled historical).
- Pitch + DoraHacks answers in the track's vocabulary: written pitch leads USDY/institutional RWA; attestation framed as the risk input ("no yield engine should consume an unverified number"); TuringLeaderboard mapped to the hackathon's stated "on-chain benchmarking of AI" defining feature (CONFIRMED in the official announcement; Q9 resolved, no operator check needed).
- **Video (operator records, agent scripts).** Leads with the strongest technical proof: 15s problem -> live mETH attestation, both computation paths and the reconciler visible, honestly described per Q2 ("two computations of one ground truth") -> USDY with its D4a label spoken on camera (pre-empting "how do you know Ondo isn't lying?" by answering it, which is itself a D10 demonstration) -> self-test REJECTED from the streak -> split-evidence ABSTAIN -> **Plugboard revert climax** -> streak page -> roadmap incl. mainnet-July line.
- X thread draft (#MantleAIHackathon: pitch, video, GitHub, contract address, format CONFIRMED on the official hackathon page; Q10 hashtag resolved; operator still confirms BUIDL form fields and the DEADLINE TIMEZONE on DoraHacks, Jun 8). Agent drafts; operator posts.
- Frontend demo-path polish: converge -> reject -> abstain -> Plugboard-revert with no terminal.

**Gate 5:** Demo path dry-run twice clean; video <3 min; X thread + BUIDL submitted **June 14**; confirmation screenshot saved.

### WS6, Surplus-only (P2; all prior gates closed)

"More streak days" is the standing default and costs zero build effort. Build items in order: (a) one-way Telegram/Discord push for new attestations (serves humans, community, judges, NOT protocol consumption, which is on-chain via the quickstart); (b) trace-viewer UX; (c) sponsor compute-credit application (must never block). Early finish buys streak length, rehearsal, and self-tests, never v3 scope (ETA-2). New ideas -> docs/V3-BACKLOG.md.

---

## 5. v3 preview (recorded so v2 doesn't accidentally build it)

Contract-level 2-of-3 with per-agent stakes; tier-based bond sizing; `IAssetAdapter` plugin interface; data-resilience hardening; mainnet with dust economics + public accuracy page; assisted-onboarding intake; genuinely-independent second sources where they exist (issuer NAV vs on-chain vs third-party audit, the assets where "independent" becomes truthful); Mantle ecosystem/BD with the streak + MARKET-READINESS.md; Demo Day judges (Hashed, Caladan, Mirana, Nansen, Allora) as the BD/VC pipeline.

---

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| DefiLlama per-window fields insufficient for like-for-like | Medium | Compute from pricePerShare series directly; if still infeasible, early abstains are framed as the mechanism working (Q4, decided knowingly) |
| Public RPC throttling | Medium | Backoff + second endpoint; abstain-on-failure is safe by construction |
| Window mismatch causing spurious abstains | High if Q4 ignored | Like-for-like windowing is mandatory, not optional |
| USDY cross-check too weak | Medium | D4a tripwire (100 bps) with pre-decided single-source fallback label |
| <3 genuinely different models | Medium | D6 redundancy fallback with honest label; verified Jun 8 before WS2 |
| Agent breaks working demo | Medium | `demo-stable` tag pre-run; daily diff review; CI gate |
| Double-post on state failure | Low | Fail-closed dedupe (D13) |
| Deadline timezone mixup | Low/High-impact | Operator confirms tz on DoraHacks Jun 8; internal date Jun 14 |
| Real data slips past Jun 12 | Low-Med | D14 fallback, trigger 12:00 Jun 12 |
| Scope creep via synthesis | High | Sec 8 queue is the whole of v2; amendment rule in header |
| Ollama Cloud rate limits on daily path (Q11) | Unknown | Operator confirms Jun 8; if limited, swap the open-weight leg within the existing gateway |

---

## 7. Operator (human-only) calendar

| Date | Task |
|------|------|
| Jun 7 (today) | `git tag demo-stable`; paste Sec 9 into CLAUDE.md; create posting + attestor keys; fund; remove deployer key from agent env; create scoped repo token; set live env vars |
| Jun 8 | **Three confirmations:** (1) three models respond through the existing gateway (Q5); (2) DoraHacks page: deadline TIMEZONE + exact BUIDL fields (Q10); (3) Ollama Cloud rate limits on a daily path (Q11). Review Gate 1a trace |
| Jun 9 | Mantlescan API key; verify 4 contracts; GitHub description/topics; confirm WS3-thin streak rendering |
| Jun 10 | Review WS2 consensus gate + USDY D4a branch decision evidence |
| Jun 11 | **Mid-run deep review (60 min):** clean clone -> `pnpm run ci` -> `pnpm demo` -> streak surface audited against chain. Dry-run demo path |
| Jun 12 | **12:00, D14 fallback trigger check.** Then record demo video |
| Jun 13 | Finish video; **2-hour pre-submission D10 audit** of README/pitch/site/video |
| Jun 14 | **Post X thread; submit BUIDL; screenshot confirmation** |
| Jun 15 | Buffer only |
| Daily | 20-min: diff review, demo path, scheduler check, queue advance |

---

## 8. Execution queue (top-down; each gate blocks the next)

1. WS1-mETH -> Gates 1a, 1c
2. **WS3-thin** (mETH daily, honestly-labeled config) -> Gate 3-thin, pulled forward because the streak cannot be backfilled (ETA-1)
3. WS2 -> Gates 2a, 2b
4. WS1-USDY (D4a branch decided here) -> Gate 1b
5. WS3-full (dual asset, consensus, self-tests) -> Gate 3-full
6. WS4 -> Gate 4
7. WS5 -> Gate 5
8. WS6 only after 1-7 closed

If execution halts early, it halts after real data exists and the streak is running, never after a beautiful README about fixtures.

---

## 9. Agent constitution additions (copy verbatim into CLAUDE.md before the run starts)

- No contract changes or redeploys before 2026-06-15. The deployed addresses and their attestation history are the product. Exception: a demo-blocking bug, only with explicit operator approval in the session.
- Non-demo-blocking contract bugs: document in docs/KNOWN-ISSUES.md, fix in a branch, deploy to NEW Sepolia addresses only after June 15. Existing addresses and history untouched.
- Tier-1 verdicts are computed by the deterministic reconciler, never by a model. Models gather evidence and write rationale; consensus is over evidence values.
- Decisive-path data semantics are like-for-like cross-check (all legs, same window, reconcile within documented tolerance, or ABSTAIN). Fallback/retry semantics only inside a single source's availability layer.
- Never use the word "independent" for the mETH or USDY source pairs. mETH = "one ground truth, two computation paths." USDY = "partial independence" or the D4a single-source label.
- A short-window claim is never rendered or described as "30-day yield." `windowDays` is always displayed.
- Asset order: mETH, then USDY. No third asset. Queue order is Section 8 exactly; WS3-thin precedes WS2.
- Models: the three existing gateway models only. If fewer than three genuinely different models are confirmed, label the mechanism "single-model triple-run redundancy" and never "multi-model consensus."
- Key classes: posting key (OPERATOR_ROLE, claim posting only), attestor keys (minimum bond + stake headroom), and the scoped repo-write token (contents:write, this repo only) are the ONLY credentials in this environment. Never access, request, or reference the deployer/admin key. Any operational key below 0.1 MNT: pause the scheduler and alert the operator; never improvise funding.
- Dedupe is fail-closed: if both the chain read and the committed marker are unreachable, skip the run. Never risk a double-post.
- Self-test claims are always flagged selfTest in trace and payload and visually distinguished on the streak surface. Never let a self-test render as a real issuer claim.
- Every merge requires `pnpm run ci` green. No exceptions.
- Never write a claim in README, docs, site copy, or pitch that the code does not substantiate. "Live" requires real data end-to-end. When unsure, understate.
- Never post to X, DoraHacks, Telegram, Discord, or any external service. Drafts only; the operator posts.
- Never touch, rebase, or delete the `demo-stable` tag.
- Work the Section 8 queue top-down; record each gate's evidence (tx hash, test output, screenshot path) in OPERATOR_TODO.md before starting the next workstream.
- New feature ideas are appended to docs/V3-BACKLOG.md, not implemented.
- Repo docs use no em-dashes; convert when committing this PRD.

---

## 10. Definition of done (v2)

v2 is done when: both flagship assets are attested daily over like-for-like cross-checked live data with deterministic, rerunnable verdicts guarded by honestly-labeled consensus; the public streak (started at the earliest possible date) visibly contains VALID, self-test REJECTED, and ABSTAIN entries against stable verified contracts; the DoraHacks submission went in on June 14 in the confirmed format with a real-data headline transaction (or the D14 fallback, invoked calmly on June 12, not in panic on June 15); and a stranger can consume the latest verified attestation from the README in under 15 minutes. Everything else is v3.