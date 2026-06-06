# Bombe v2 PRD: follow-up questions and clarifications

Companion to `BOMBE-V2-PRD.md` (v2.1-final). Purpose: surface ambiguities, one possibly-better
alternative, and the ETA sensitivity, for the external council to resolve. This does not relitigate
the locked decisions in PRD section 1; where a question touches a locked decision, it is a request
for a clarification or an implementation default, not a reversal.

Each item lists: what the PRD says, the ambiguity or risk, a recommended default (so the council can
simply accept or override), and which workstream or gate it blocks.

Overall assessment: the PRD is sound and ready to execute. The items below are the parts that will
cause confusion or rework during execution if not pinned down first. The two marked CRITICAL touch
the central trust claim and should be answered before WS1 starts.

---

## A. The one alternative I think may be absolutely better

### Q1 (CRITICAL). Should the Tier-1 verdict be decided by deterministic computation, with the models only orchestrating and explaining, rather than the models deciding the verdict?

**What the PRD says.** WS2 has three models vote; 2-of-3 agreement produces the decisive
VALID/REJECTED. Section 3 already states the trust claim rests on "cross-check + abstain + consensus
mechanics, not on a model accuracy number."

**The observation.** For a Tier-1 yield claim, the actual decision ("is the observed value within
tolerance of the asserted value?") is arithmetic. If reconciled live sources produce a number, the
verdict is a pure function of that number, the asserted value, and the tolerance. A language model
deciding that comparison adds a non-deterministic element to something that is deterministic, and it
is the part a skeptic trusts least. If the verdict is computed deterministically and the models are
used for evidence gathering, source orchestration, and the human-readable rationale, then the trust
rests entirely on math the verifier can rerun, which is a stronger and more honest claim, and it
matches Section 3's own framing.

**Why this is not relitigating D5.** D5 locks that consensus exists and that a split produces
abstain. This question is about who computes the decisive comparison (the deterministic reconciler
versus the model), which the PRD does not specify. Both designs keep multi-model consensus; they
differ in what the models are trusted to decide.

**Where consensus still earns its keep under this alternative.** It catches orchestration and
tool-use failures (a model that fetched the wrong period, parsed a field wrong, or failed to call a
source), and it is the right mechanism for the parts that are genuinely judgment. So consensus is
still valuable, just not the thing that decides a deterministic arithmetic comparison.

**Recommended default.** For Tier-1 (YIELD_BPS), make the verdict a deterministic function over
reconciled sources; use the models for evidence gathering, reconciliation orchestration, and the
rationale; keep 2-of-3 consensus as the guard on the orchestration and as the mechanism for any
non-deterministic step. Keep Tier-3 (judgment) exactly as is: model-driven, abstain-enforced.
**Blocks:** WS1 and WS2 design. **Decision needed before WS2.**

---

## B. Critical data-semantics ambiguities

### Q2 (CRITICAL). Are the two mETH sources genuinely independent, or do they both derive from the same on-chain exchange rate?

**What the PRD says.** D3 and WS1 pick mETH first because it has "two genuinely independent sources
(DefiLlama + direct mETHToETH read)," and the demo headline is the "strong cross-check."

**The risk.** Research confirmed DefiLlama's mETH pool exposes `pricePerShare`, which is the mETH
exchange rate. The direct `mETHToETH` read is also the exchange rate. So both legs likely derive from
the same underlying on-chain quantity, one via an aggregator and one direct. That catches aggregator
staleness, transport errors, and computation bugs, but it does not catch a problem in the underlying
rate, and it is not "two independent witnesses to the yield." Calling it "strong, genuinely
independent" on camera risks a D10 honesty violation if a judge knows DefiLlama derives mETH from the
same rate.

**Recommended default.** Keep mETH first (it is still the cleanest live read), but reframe the honesty
label: the mETH cross-check verifies "aggregator computation versus a from-scratch on-chain
computation of the same ground-truth rate," which catches transport and computation faults, not
source fraud. Reserve the phrase "independent sources" for cases where the underlying data genuinely
differs. **Blocks:** WS1 trace labels, WS5 demo script. **Decision needed before WS5 video.**

### Q3 (CRITICAL). What exactly is USDY's second source, and does it actually verify the yield rather than just the price? How is the D4 cross-check-or-abstain rule satisfied for USDY?

**What the PRD says.** WS1: "USDY: on-chain reads available on Mantle (price/supply), used as the
second leg." D4: attest only when all bound sources reconcile within tolerance, else abstain.

**The risk.** USDY's published APY (the claim) comes from DefiLlama, which itself partially derives
from Ondo's disclosure (the PRD admits this in WS1 and the risk table). An on-chain USDY price or
supply read gives a price, not necessarily the published APY. To verify a yield from on-chain USDY
data you would derive a realized yield from the price accrual over a window, which is the same
historical-window problem as mETH and is its own metric (see Q4). If there is no genuinely
independent on-chain USDY yield, then under D4's strict rule USDY has effectively one source and
would either always abstain (no second leg to reconcile) or attest on a single source (violating D4).
This is an unresolved tension between the USDY pilot (D2) and the cross-check rule (D4).

**Recommended default.** Define USDY's second leg explicitly as the on-chain-derived realized yield
from USDY price accrual over the available window, compared to DefiLlama's APY within a wide,
documented tolerance, and label it "partial independence" everywhere. If the council judges that
comparison too weak to be a real cross-check, then either (a) accept USDY as a labeled single-source
attestation for v2 (a narrow, explicit exception to D4 for USDY only), or (b) drop USDY from the
decisive pilot and keep it as a read-only displayed figure, pitching mETH as the live proof. Pick one
before WS1-USDY. **Blocks:** Gate 1b. **Decision needed before WS1-USDY.**

### Q4 (CRITICAL). How do we reconcile a short-window on-chain realized yield against DefiLlama's 30-day APY without the cross-check disagreeing and abstaining on almost every early run?

**What the PRD says.** WS1 short-window rule: until 30 days of samples exist, compute over the
available window and label `windowDays`. D4: disagreement beyond tolerance abstains.

**The risk.** The two mETH legs measure different things early in the streak: DefiLlama reports a
30-day mean annualized APY, while the on-chain leg can only offer a realized yield over the few days
of samples collected since launch. A 5-day realized rate, annualized, can diverge materially from a
30-day mean APY purely because they are different windows, not because anything is wrong. Under a
tight tolerance this produces a disagreement abstain on most early runs; under a tolerance wide
enough to absorb the window mismatch, the cross-check stops meaning much. Either way the headline
mETH attestations in the first two weeks (exactly the submission window) are at risk of being mostly
abstains or mostly meaningless.

**Recommended default.** Compare like for like: annualize both legs over the same available window
(use DefiLlama's per-window series, for example `apyBase7d` or the pricePerShare delta over the same
N days, rather than `apyMean30d`) so the two legs measure the same window. Set tolerance from the
observed sampling noise. State the window length everywhere. If like-for-like windowing is not
feasible from DefiLlama's fields, treat early runs as legitimately abstaining and frame that as the
mechanism working, but the council should decide knowingly, because it affects whether the June 15
headline is a VALID attestation or an ABSTAIN. **Blocks:** Gate 1a, the submission headline.
**Decision needed before WS1-mETH.**

---

## C. Consensus and model ambiguities

### Q5. Are three genuinely different models actually available in the current gateway today, with no new credits, as D6 requires?

**What the PRD says.** D6: "Three existing, working models only (current gateway: Claude /
GPT-class / open-weight via Ollama Cloud). No new providers, no sponsor-credit dependencies in the
critical path." G2 requires 2-of-3 across "genuinely different models."

**The risk.** The benchmarked and live work to date used a single open-weight model (gpt-oss:20b via
Ollama Cloud). If the gateway does not already have a Claude-class and a GPT-class model wired and
paid, then G2 either needs new credits (which D6 forbids on the critical path) or degenerates to
three runs of the same model, which is not "genuinely different" and undercuts the consensus claim.

**Recommended default.** Before WS2, confirm three genuinely different models respond through the
existing gateway with no new billing setup. If only one is truly available without credits, the
council should decide whether consensus for v2 means "three temperaments on one model" (honest, but
not multi-model) or whether a second provider is acceptable as a non-blocking nicety. Do not let WS2
silently become three calls to one model labeled as multi-model. **Blocks:** Gate 2a.
**Decision needed before WS2.**

### Q6. Is the consensus axis model-diversity, temperament-diversity, or both, and does mixing them confound what a disagreement means?

**What the PRD says.** WS2: "the three existing reference agents on three different models." The
reference agents (Reflector, Rotor, Stator) are differentiated by temperament (thresholds, step
budgets), not by model.

**The risk.** Pairing each temperament-differentiated agent with a different model varies two things
at once. A split vote could then be caused by temperament (a conservative agent abstains where an
aggressive one commits) rather than by model disagreement, so "2-of-3 across genuinely different
models" becomes ambiguous. A disagreement abstain might be a temperament artifact, not a real signal
of uncertainty.

**Recommended default.** For the decisive numeric path, hold temperament constant and vary only the
model (same decision rule, three models), so a split genuinely reflects model disagreement. Keep the
three temperaments for the qualitative race view and the Tier-3 story if desired, but do not conflate
the two axes in the decisive vote. This also pairs naturally with Q1 (deterministic verdict, models
as orchestrators). **Blocks:** WS2 design. **Decision needed before WS2.**

---

## D. Operational ambiguities

### Q7. Where does scheduler state persist (daily rate samples, the streak record, and same-day dedupe) given a stateless cron, and does that introduce another write-capable key?

**What the PRD says.** WS3 uses a GitHub Action cron, idempotent, persisting daily `mETHToETH`
samples and a public streak surface. Section 9 enumerates only a posting key and attestor keys in the
environment.

**The risk.** GitHub Actions are stateless between runs. The daily samples (which feed the window in
WS1), the streak table, and the "already attested today" dedupe all need durable storage. The options
each have a cost: committing back to the repo from the Action needs a write-capable token (a key not
listed in Section 9); an external database (the Neon instance exists) needs its credential in the
environment; or the on-chain attestation history itself is the source of truth (cleanest, no new key,
but requires reading history to dedupe and to render the streak). The PRD does not say which.

**Recommended default.** Use the on-chain attestation history as the durable record (no new
write-key, matches "the deployed history is the asset"), persist the daily rate samples on-chain in
the claim payload or in a committed JSON via a narrowly-scoped token, and render the streak by reading
chain history. The council should confirm whether a repo-write token in the Action is acceptable
under the Section 9 key model, since it is a write credential not currently enumerated. **Blocks:**
WS3 design, Gate 3. **Decision needed before WS3.**

### Q8. What is the value of attesting the same two claims daily, and should the streak deliberately include occasional REJECTED and ABSTAIN cases rather than a wall of VALID?

**Observation, not a blocker.** A streak of daily VALID attestations of the same two assets can read
to a skeptic as a rubber stamp rather than a discriminator. The PRD already wants "at least one real
disagreement-abstain if it occurs." A stronger track record would periodically post a deliberately
incorrect asserted value (clearly logged as a self-test) so the public streak visibly contains VALID,
REJECTED, and ABSTAIN, proving the attestor actually discriminates. This is low effort and fits WS3.

**Recommended default.** Include a periodic labeled self-test claim with a known-wrong asserted value
so the streak demonstrably shows a REJECTED, alongside the real daily VALID and any natural abstains.
Label it as a self-test in the trace so it is not mistaken for a real issuer claim. **Blocks:**
nothing; enhances WS3 and the demo.

---

## E. ETA sensitivity (the explicit concern: we may finish early or late)

The PRD is tightly coupled to specific dates. The following holds whether we finish early or late.

1. **The streak metric is wall-clock-bound, not effort-bound.** G3 (about three weeks of consecutive
   daily runs by Demo Day) cannot be compressed by finishing the code faster. The variable that
   actually moves it is the date the scheduler first runs reliably. Finishing WS1 to WS3 by June 9
   versus June 12 changes the streak length by those days directly. **Implication:** prioritize getting
   a minimal end-to-end scheduled run live as early as possible, even a thin one, then improve it,
   rather than perfecting WS1 and WS2 before the first scheduled run. The streak compounds from day
   one and cannot be backfilled.

2. **Finishing early buys streak length, rehearsal, and WS6 surplus, not scope.** v3 is deliberately
   frozen out (contracts frozen until June 15, no schema work, no mainnet). So an early finish should
   flow into more streak days, more demo rehearsal, the self-test discrimination (Q8), and at most the
   WS6 surplus items. It should not pull v3 work forward, which would risk the frozen-contract and
   honesty guarantees. The PRD handles this well; the only addition is to treat "scheduler live
   earliest" as the thing to pull forward.

3. **Finishing late is protected by the gated queue, but the minimum-viable submission is undefined.**
   Section 8's ordering ensures a late halt happens after the data seam and consensus exist. Good. But
   there is no stated fallback if WS1 (real cross-checked data) itself slips past June 14, and D10
   forbids using the word "live" without real data end-to-end. So the question "what do we submit on
   June 14 if real data is not done?" has no answer in the PRD. The honest fallback would be to submit
   with the v1 architecture and the contract-enforced-abstain proof, explicitly labeled as
   "fixture-era data, real-data pilot in progress," which is weaker but D10-compliant. The council
   should pre-decide this fallback now, while it is calm, rather than at the deadline.

4. **The 30-day window is calendar-capped regardless of build speed.** Even with infinite execution
   speed, only the days between scheduler launch and the deadline can exist as on-chain samples, so a
   true 30-day on-chain history is impossible by June 15. This is correctly handled by the short-window
   rule, but it reinforces Q4: the early headline is necessarily a short-window claim.

5. **All the dates rest on operator-confirmed facts that the spec earlier could not fetch.** The prior
   hackathon doc recorded that the DoraHacks page blocked automated fetch and the deadline had to be
   confirmed manually. The v2 PRD now asserts June 15 (submission), July 2 to 3 (Demo Day), a Phase II,
   and a named judge panel. If any of these shift, the whole calendar shifts. Worth a one-line
   confirmation from the council that these dates and the Phase II structure are verified.

---

## F. Minor clarifications and labeling

- **Q9.** WS5 maps the TuringLeaderboard to "the hackathon's own on-chain benchmarking of AI thesis."
  Confirm that framing corresponds to an actual track or stated theme, not an inferred one, so the
  pitch does not assert a track that does not exist.
- **Q10.** WS4 and WS5 assert the required X format ("#MantleAIHackathon: pitch, video, GitHub,
  contract address") and that the BUIDL submission format is fixed. Confirm the exact required hashtag
  and fields from the official rules, since a wrong hashtag can disqualify a Community Voting entry.
- **Q11.** D6 lists "open-weight via Ollama Cloud" as non-credit-dependent. Confirm Ollama Cloud usage
  is stable and not itself a credit or rate-limit risk on the daily scheduled path.
- **Q12.** The v2 PRD itself uses em-dashes and is currently untracked in git. Given the standing
  no-em-dash rule for repository docs and the desire for a clean public repo, the council or operator
  should decide whether to (a) commit it as-is, (b) commit a de-em-dashed copy, or (c) keep it local.
  This follow-up doc and all other repo docs are already em-dash-free.

---

## G. Summary of what to decide before execution starts

Answer before WS1: Q2, Q3, Q4 (data semantics and the submission headline), Q7 (scheduler state and
keys).
Answer before WS2: Q1, Q5, Q6 (verdict authority, model availability, consensus axis).
Pre-decide now for safety: ETA item 3 (minimum-viable submission fallback) and Q12 (the PRD's own
status in git).
Everything else is an enhancement or a confirmation and does not block the queue.

Nothing here changes the PRD's locked scope or its execution order. The recommended defaults are
chosen so that, if the council simply accepts them, execution can begin immediately on WS1-mETH.
