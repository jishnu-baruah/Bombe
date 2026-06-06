# Bombe market readiness and ecosystem feasibility report

A brutally honest assessment of how close Bombe is to being a real, end-to-end trust layer that
real-world-asset issuers can adopt, written for external review. It states what works, what does
not, what it would take to close each gap, and where the hard problems are. Nothing here is
softened for the demo.

Scope of honesty: this report treats "the product" as what the code actually does today, not what
the pitch says. Where a capability is aspirational, it is labeled roadmap, not present.

---

## 1. Executive verdict

Bombe today is a **credible single-path demonstrator**, not yet a platform. The architecture is
sound and the core idea is genuinely differentiated, but the system is **closed, curated, and
operator-driven**. An issuer cannot adopt Bombe today without engineering work done by the Bombe
team. The distance from here to "the go-to ecosystem tool for trust" is large and is dominated by
two hard problems that are not yet started: **schema generalization** (supporting arbitrary claim
shapes) and **decentralized, economically-secure attestation** (more than one agent, with bonds
that actually deter a false attestation).

Readiness on a five-stage scale:

| Stage | Definition | Status |
|-------|------------|--------|
| 0. Demonstrator | Live LLM, live on-chain attestation, one real claim type, deterministic safety proof | Reached |
| 1. Single-asset pilot | One real asset attested with real data, repeatedly, monitored, auditable | In progress (real-data adapter designed, not built) |
| 2. Multi-asset platform | A library of asset adapters, assisted onboarding, an issuer dashboard | Not started |
| 3. Self-serve ecosystem tool | Permissionless posting, schema generalization, decentralized multi-agent attestation, disputes | Not started |
| 4. Trust infrastructure | Economic security at scale, legal/operational integration, the default ecosystem primitive | Not started |

Honest one-liner: Bombe is at the boundary of Stage 0 and Stage 1. The marketing target ("go-to
ecosystem trust tool") is Stage 3 to 4. The gap is real, but the path is identifiable and the
foundational pieces (the contract layer, the tiered taxonomy, the agent loop, the seams) are the
right ones to build on.

---

## 2. What the system actually does today (ground truth from the code)

This section is the factual baseline. Everything later is measured against it.

**Claim model.** A claim is a fixed-shape record (`packages/shared/src/taxonomy.ts`):

```
{ id, tier (1|2|3), asset, claimType, payload, submitter, postedAt }
```

- `asset` is a **closed enum of three values**: `mETH`, `USDY`, `PC-POOL-1`.
- `claimType` is a **closed enum of five values**: `YIELD_BPS`, `DISTRIBUTION_PAID` (Tier 1),
  `CASHFLOW_MATCH`, `ENCUMBRANCE_ABSENT` (Tier 2), `FAIR_VALUE` (Tier 3, abstain only).
- `payload` is free-form, but it is only meaningful to the verification tools that already know
  how to read it.

**Verification is hardcoded per claim type.** `TOOL_MAP` (`packages/agent-sdk/src/router.ts`) binds
each claim type to a fixed allowlist of tools. `YIELD_BPS` may use the price feeds, chain state,
compute, and history tools. `CASHFLOW_MATCH` may use document reading, compute, and history.
`FAIR_VALUE` gets an empty tool set and an immediate abstain. Adding a claim type is a compile-time
change to the enum, the tier map, the tool map, and usually a new tool.

**Data is fixtures today.** The yield and oracle tools (`packages/agent-sdk/src/tools/feeds.ts`)
read `loadOracleSnapshot(...)`, which is a fixture file. The proposed real-data adapter (a
`DataSource` seam fetching DefiLlama plus on-chain reads) is designed but not built. So even the
"live" attestation captured on-chain reasoned over mock evidence; the live parts were the model and
the transaction, not the data.

**Posting is operator-gated.** `postClaim` is `onlyRole(OPERATOR_ROLE)`. Issuers cannot post claims
themselves. The operator posts on their behalf.

**Economics (live on-chain).** Claim fee 0.01 MNT, attestor stake 0.02 MNT on a decisive call,
minimum bond 0.1 MNT, slashing 50 percent burned and 50 percent redistributed, trust score 0 to
100. One attestor type today plus an external reference attestor (Plugboard).

**Accuracy and cost (measured).** On a free model (gpt-oss:20b), the agents reach the correct
decision on 10 of 12 benchmark cells (83 percent) after tuning. A single live attestation consumed
roughly 31,500 input and 1,600 output tokens with about 20 seconds of latency.

**What is genuinely strong today.** The contract-layer abstain rule (a Tier-3 claim cannot receive
anything but abstain, enforced in Solidity), the tiered falsifiability taxonomy, the deterministic
agent loop with hard safety rules, the seam architecture that keeps tests deterministic, and a real
on-chain attestation with a reasoning hash that a third party can recompute.

---

## 3. Issuer onboarding flow

### 3.1 Today (honest)

There is no self-serve onboarding. The real flow is:

1. The issuer and the Bombe team agree on what claim to attest.
2. A Bombe engineer confirms the asset and claim type are in the enums. If not, they add them
   (code change) and a verification tool that knows how to fetch and check that asset.
3. The operator posts the claim on-chain and pays the fee.
4. Agents attest. The issuer reads the verdict and the trace.

This is **white-glove, developer-gated onboarding**. It works for a handful of curated assets. It
does not scale to an ecosystem.

### 3.2 Near-term realistic (assisted onboarding)

A guided flow where the issuer provides: the asset identifier, the claim type from a supported
menu, the asserted value, the metric definition, the data source, and the document or endpoint. A
Bombe-run intake (a form plus a config file) turns that into a posted claim without a fresh code
change, **as long as the asset and claim type are already supported**. This is the platform stage.
It still requires Bombe to have built an adapter for that asset class.

### 3.3 Target (self-serve)

Permissionless posting (remove the operator gate, add anti-spam economics), plus a schema-mapping
step that lets an issuer describe a new claim shape without a Bombe engineer. This is the hard
stage and depends entirely on schema generalization (section 5).

**Brutal truth on onboarding:** today it is "call us." The realistic near-term is "use our platform
for the asset classes we already support." True self-serve for any asset is a Stage 3 capability and
is not close.

---

## 4. Issuer variety and coverage

The question "how many types of issuers can we support" has a precise answer today and an honest
projection.

| Issuer / asset class | Verifiability | Supported today | Effort to support |
|----------------------|---------------|-----------------|-------------------|
| Liquid staking tokens (mETH, cmETH) | On-chain exchange rate, deterministic | Partially (mETH in enum, fixture data) | Low: wire the on-chain read |
| Tokenized treasuries (USDY, mUSD) | Issuer disclosure plus third-party verification agent | Partially (USDY in enum, fixture data) | Low to medium: wire DefiLlama or the issuer feed |
| Wrapped or bridged assets (FBTC) | On-chain backing or attestation | No | Medium: new asset plus a backing-check tool |
| Private credit pools (servicer cashflow) | Document-falsifiable (Tier 2) | One fixture pool (PC-POOL-1), no live document pipeline | High: real document ingestion and parsing |
| Tokenized equities (xStocks) | Issuer plus market data | No | Medium to high: a price and corporate-action source |
| Fund or index products (MI4) | NAV disclosure, often judgment-laden | No, and much of it is Tier 3 (abstain) | High and partly out of scope by design |

**The honest coverage statement.** Today Bombe supports a closed set of three assets and five claim
types, two of which (the Tier 1 deterministic ones) are the credible near-term targets, one of
which (FAIR_VALUE) deliberately abstains. The system does not support arbitrary issuers. It supports
the asset classes someone has already built an adapter and a claim type for. Breadth is a function
of engineering invested per asset class, not a property the system has out of the box.

This is not unusual for an oracle or attestation product (Chainlink feeds are also curated per
asset), but it must not be sold as universal.

---

## 5. The schema question (the heart of the request)

**Does Bombe work universally for all schemas? No.**
**Is there a schema generalizer? No, and this is the single largest gap to the stated goal.**

### 5.1 Why the schema is not the hard part

The claim record already has a free-form `payload`. Accepting an arbitrary JSON shape is trivial.
An LLM can also map an issuer's existing data schema onto a claim payload with little effort. If the
problem were only "parse the issuer's schema," it would be nearly solved.

### 5.2 Why verification is the hard part

The hard part is not describing a claim, it is **knowing how to check it**. Every claim type in
Bombe is bound to specific tools that know where the ground truth lives and how to compute the
expected value. A yield claim knows to read a yield feed and compare within tolerance. A cashflow
claim knows to read a servicer document and reconcile sums. A new claim shape with no verification
path is just an unverifiable assertion, which by Bombe's own thesis must abstain.

So a real "schema generalizer" is actually a **verification generalizer**, and it has three layers,
in increasing difficulty:

1. **Schema mapping (easy):** map issuer fields to a claim payload. LLM-assisted, low risk.
2. **Source binding (medium):** identify where the ground truth for this claim lives (an on-chain
   method, an API, a document) and how to read it. Today this is hand-built per asset. Generalizing
   it needs a registry of data-source adapters plus a way to declare "claim X is checked against
   source Y by computation Z."
3. **Verification logic (hard):** the computation that turns evidence into a verdict, with the right
   tolerance and the right failure modes. This is where correctness and safety live, and it cannot
   be fully automated without risking confident wrong attestations, which is the exact failure mode
   Bombe exists to prevent.

### 5.3 The realistic design for generalization

A claim-type registry plus a data-source-adapter plugin model, where adding support for a new claim
class means registering a declarative spec (payload schema, source adapter, comparison rule,
tolerance, tier) rather than editing core enums. An LLM assists at the mapping and source-discovery
layers, but the verification rule is reviewed and the tier defaults to the most conservative
(abstain) when ambiguous. This preserves the safety guarantee while widening coverage.

**Brutal truth on universality.** A system that claims to verify anything is either trusting the
issuer (garbage in) or hallucinating a verdict. Bombe's honest ceiling is "universal across claim
types for which a sound verification rule exists," and the generalizer's job is to make adding those
rules cheap and safe, not to pretend verification is free. The conservative default (abstain when we
cannot falsify) is the only honest way to be general.

---

## 6. Adoption and support model

| Model | Description | Available when |
|-------|-------------|----------------|
| Developer support (white-glove) | Bombe engineers add the asset, the tool, post the claim | Today |
| Assisted platform | Issuer self-describes a claim for a supported asset class via an intake; Bombe operates it | Stage 2, needs the adapter library and an intake |
| Self-serve platform | Issuer posts permissionlessly and maps new schemas with guardrails | Stage 3, needs schema generalization and permissionless posting |

**Honest answer to "will they need our developer support, or will a platform do?"** Today they need
our developers. A platform that removes that need for already-supported asset classes is the next
real milestone and is achievable. A platform that removes it for arbitrary new asset classes
requires the verification generalizer and is the hardest milestone. Most real adoption in the next
phase will be assisted, not self-serve, and that is normal for trust infrastructure.

---

## 7. Operational feasibility and scale

**Data-source reliability.** The proposed live sources (DefiLlama, public RPC) are free and
no-key, which is good for adoption but introduces availability and rate-limit risk. Public RPCs
throttle and intermittently fail. Production needs retries, fallbacks, multiple providers, and
caching. This is standard and solvable, but it is real operational surface that does not exist yet.

**Cost per attestation.** On a free model the marginal cost is near zero but accuracy is 83 percent.
On a paid mid-tier model, roughly 31,500 input and 1,600 output tokens per attestation is on the
order of one to a few cents per agent, so a few cents to low tens of cents per claim across several
agents. Against a 0.01 MNT claim fee this is viable only if claim volume is meaningful or fees rise.
The unit economics are thin and depend on model choice and the number of attestors per claim.

**Latency and throughput.** About 20 seconds per agent attestation, agents parallelizable, on-chain
settlement bound by block time. RWA claims are periodic (daily, monthly), not high-frequency, so
latency is a non-issue for the use case. Throughput is not a near-term constraint.

**Accuracy.** 83 percent majority match on a free model is a demo bar, not a trust-infrastructure
bar. A trust layer needs near-certainty on the decisive path, which means a stronger model, multiple
agents voting, and conservative abstention when they disagree. The current single-agent accuracy is
the clearest technical gap to credibility.

**Single-agent risk.** One staked LLM is a single point of failure and a prompt-injection target. A
sophisticated reviewer will flag this immediately. The credible answer is N-of-M multi-model
attestation (the approach Chaos Labs uses for its council), which is roadmap, not present.

**Economic security.** The slash bond (0.02 MNT) must exceed the value a false attestation can move.
For a claim that gates millions in capital, a 0.02 MNT bond deters nothing. Bond sizing relative to
claim value is unaddressed and is essential before any real money relies on a verdict.

**Disputes and the issuer-fraud problem.** If an agent attests honestly but the issuer lied at the
source, slashing the agent is unjust. Separating operator negligence from issuer fraud (a dispute
and escalation path) exists in concept (the slashing contract has disputes) but the policy for who
is slashed when the source itself is fraudulent is not designed.

---

## 8. Usefulness to the ecosystem

The need is real and current. Mantle is positioning as an institutional distribution layer for
on-chain finance, with live RWA and yield assets: mETH and cmETH (roughly 1 billion dollars
combined), USDY on Mantle (tens of millions tokenized), FBTC, mUSD, an institutional index, and
more arriving. Every one of these reports a number (a yield, a backing, a reserve) that someone
currently has to take on trust or verify manually through a fund administrator.

Bombe fills a specific gap: a fast, composable, on-chain, economically-backed check on the
falsifiable subset of those claims, with explicit refusal on the parts that cannot be checked. That
refusal is what makes it trustworthy rather than just another oracle. If it works, it is a reusable
primitive the whole ecosystem can read from, which is exactly the "go-to trust tool" framing, but
only at Stage 3 and beyond.

The honest near-term value is narrower and still real: an independent, auditable second opinion on a
few high-value Mantle assets (USDY, mETH), which is more than the ecosystem has today.

---

## 9. Competitive position

| Product | Data trust model | AI | On-chain stake/slash | Abstain enforced |
|---------|------------------|----|----|----|
| Chainlink Proof of Reserve | Issuer or custodian API plus on-chain balances | No | No | No |
| Chainlink Functions | Fetches and computes, DON consensus | No | No | No |
| Credora (RedStone) | Borrower-supplied plus analyst methodology | Quant, not autonomous | No | No |
| Chaos Labs Edge AI | Multi-agent council fetches data | Yes | Council confidence, not per-agent stake | No |
| Ondo / USDY | Issuer disclosure plus a verification agent | No | n/a (is the disclosure) | n/a |
| YieldProof (Mantle) | Human attestors, staked and slashed | No (human) | Yes | No |
| UMA optimistic oracle | Bonded human assertion, staked dispute voters | No | Yes | No |
| Bombe | AI agent independently fetches, stakes, decides | Yes | Yes | **Yes** |

The defensible position is the combination, and specifically the contract-enforced abstain on
unfalsifiable claims, which no verified competitor has. The nearest AI peer (Chaos Labs) lacks the
per-agent stake and the abstain rule. The most direct comparable (YieldProof, same chain, same
problem) uses a human attestor. The credible criticisms are the ones in section 7: garbage-in,
single-agent fragility, bond sizing, and the issuer-fraud attribution problem.

---

## 10. Gap analysis to "go-to ecosystem trust tool"

Prioritized, with honest difficulty.

**P0, credibility blockers (must have before anyone trusts a verdict):**
- Real data on the decisive path (the live `DataSource` adapter). Designed, not built. Medium effort.
- Multi-agent, multi-model attestation with conservative disagreement handling. Not started. High effort.
- Bond sizing relative to claim value. Not designed. Medium effort, high importance.

**P1, platform blockers (must have for adoption beyond white-glove):**
- An asset-adapter library and an assisted onboarding intake. Not started. Medium to high effort.
- Permissionless posting with anti-spam economics. Not started. Medium effort.
- Data-source resilience (retries, fallbacks, multiple providers, caching). Not started. Medium effort.

**P2, ecosystem-tool blockers (must have to be the default primitive):**
- Schema and verification generalization (the registry and plugin model). Not started. High effort, the hardest item.
- Dispute policy for issuer fraud versus agent negligence. Partially present (disputes exist), policy undesigned. Medium to high effort.
- Legal and operational integration for institutional issuers. Not started. Out of pure-engineering scope.

---

## 11. Requirements and phased roadmap to market end-to-end

**Phase A, single-asset pilot (Stage 1).**
Requirements: the live `DataSource` adapter (DefiLlama plus on-chain cross-check), one or two real
assets (USDY, mETH) attested for real and repeatedly, provenance and audit surfaced in the UI,
monitoring of attestation accuracy against later ground truth. Outcome: an honest "we attest real
assets with real data, auditable on-chain."

**Phase B, multi-asset platform (Stage 2).**
Requirements: an asset-adapter library (a clean interface so a new asset is a config plus a small
adapter, not a core change), an assisted onboarding intake, an issuer dashboard, multi-agent
attestation with a real model, bond sizing, data resilience. Outcome: issuers in supported asset
classes adopt without bespoke engineering.

**Phase C, ecosystem trust tool (Stage 3 to 4).**
Requirements: the verification generalizer (claim-type registry plus source-adapter plugins plus
conservative LLM-assisted mapping), permissionless posting, decentralized attestor set, a real
dispute and fraud-attribution policy, economic security sized to institutional claim values, and
legal or operational integration. Outcome: a primitive the ecosystem reads from by default.

---

## 12. Final feasibility verdict

The idea is right and differentiated, the foundation is the correct one, and the near-term pilot
(Phase A) is clearly feasible and worth doing. The path to a genuine ecosystem trust tool is long
and dominated by three hard, mostly-unstarted problems: real-data plus multi-agent accuracy
(credibility), verification generalization (coverage), and economic security plus fraud attribution
(safety at scale). None of these are blocked by a fundamental flaw, but they are real engineering
and design programs, not finishing touches.

The most dangerous thing the project could do is market Stage 3 ("universal, self-serve, go-to trust
tool") while shipping Stage 1. The most credible thing it can do is ship Phase A honestly, name the
roadmap explicitly, and let the contract-enforced abstain carry the trust story it has already
earned. That honesty is itself the moat: a trust tool that overstates its readiness is a
contradiction.

---

## 13. Fact appendix (verified)

- Claim model and enums: `packages/shared/src/taxonomy.ts` (3 assets, 5 claim types, 3 tiers).
- Tool routing per claim type: `packages/agent-sdk/src/router.ts` (`TOOL_MAP`).
- Current data path: `packages/agent-sdk/src/tools/feeds.ts` reads fixtures via `loadOracleSnapshot`.
- Economics: claim fee 0.01 MNT, attestor stake 0.02 MNT, minimum bond 0.1 MNT, 50/50 slash, trust score 0 to 100.
- Posting gate: `postClaim` is operator-role only.
- Accuracy: 10 of 12 (83 percent) majority match on gpt-oss:20b after tuning.
- Per-attestation cost signal: about 31,500 input and 1,600 output tokens, about 20 seconds latency.
- Real data sources verified live: DefiLlama Yields API (USDY-on-Mantle pool `b5d7a190-38d2-4fdd-8c14-1fd00c11bce1`, mETH pool `b9f2f00a-ba96-4589-a171-dde979a23d87`), Mantle RPC mainnet `https://rpc.mantle.xyz` (5000) and Sepolia `https://rpc.sepolia.mantle.xyz` (5003), mETH staking contract `0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f` with `mETHToETH`.
- Live Mantle RWA targets: mETH and cmETH (about 1 billion dollars combined), USDY on Mantle (tens of millions), FBTC, mUSD, MI4 (institutional index), USDe, tokenized equities arriving.
- Competitor data-trust models: see section 9; the contract-enforced abstain is unique among verified competitors.
