# Attestation schema, the ecosystem-standard intake

Status: **LOCKED (D25)**, 2026-06-08. Council-approved to spec. **Build is demand-gated and
post-2026-07-10 (v4 batch)**, except the `/schema` endpoint, which is **P0 and cleared to
build first** (D25.7). Resolutions D25.1–D25.7 are recorded in "Council rulings" below and
applied throughout. Builds on the open resolver (D20), pipeline + gates (D21), Tier-2
document step (D22), and the catalog/grades (D23/D24).

## Purpose

Let **any issuer of any RWA type** self-serve an attestation without Bombe writing
per-asset code. The issuer submits a self-describing claim; the system routes it by
**claim type** to a deterministic check, and returns an on-chain verdict + trace, or
ABSTAINS. This document defines (1) what the issuer submits, (2) what the system checks
and returns per claim type, and (3) the new check kinds to add.

## The one invariant (non-negotiable)

> The issuer gives a **falsifiable claim** and **enough independently fetchable evidence
> for Bombe to recompute and cross-check it**. Bombe never takes the issuer's word. If the
> evidence is not sufficient for an independent re-derivation, or the claim is a
> judgment/opinion, the verdict is **ABSTAIN**.

A dashboard (e.g. rwa.xyz) displays the issuer's number; Bombe re-derives it, cross-checks
it, stakes on it, and refuses what it cannot verify. That difference is the product. A
single relayed read is **not** recomputation (see D25.1/D25.6).

## Council rulings (D25.1–D25.7), binding

- **D25.1 — `PRICE` requires two sources or ABSTAIN.** A single oracle read is an
  oracle-of-an-oracle with zero value-add and violates the invariant above. Require two
  sources with *different manipulation profiles* (off-chain heartbeat oracle + on-chain
  DEX TWAP, or two distinct oracles), reconciled within a per-class tolerance. ABSTAIN
  reasons are explicit: `SOURCE_DISAGREEMENT`, `STALE_SOURCE`, `INSUFFICIENT_LIQUIDITY`.
  The guarantee is *divergence-forces-abstain*, not source purity; the TWAP leg is never
  claimed manipulation-proof.
- **D25.2 — `BACKING_RATIO` is VALID only against a recognized third-party reserve
  attestor.** Issuer-controlled or `custom-http` reserves are graded-down or ABSTAIN,
  never a clean VALID. Reserve fraud is the failure mode that matters; a "does not audit
  the custodian" disclaimer does not survive a depeg headline.
- **D25.3 — the `claimType → tier` mapping must live on-chain.** "The chain enforces
  abstain" is currently a convention: an agent could mislabel a Tier-3 valuation as Tier-1
  and the contract would not catch it. Add a governance-set on-chain
  `mapping(bytes32 => uint8) claimTypeTier` that `attest()` reads to enforce the
  judgment-tier abstain guard. This is a **v4 contract change in the 2026-07-11 batch**.
  **Until it ships, do not claim contract-enforced abstain for any claim type beyond the
  ones already hardcoded** (the existing Tier-3 `FAIR_VALUE` guard).
- **D25.4 — `RULE_ADHERENCE` is Tier-2, default ABSTAIN.** Capped to a tiny DSL
  (comparison + action + window). A rule not expressible in the DSL is not falsifiable →
  ABSTAIN. Replay is archive-dependent and reorg/partial-fill/MEV-sensitive; VALID only
  for unambiguous trigger→event patterns, else ABSTAIN with a partial-scan summary.
- **D25.5 — build order (corrected):** (1) `/schema` endpoint, (2) **current-NAV**
  `NAV_PER_SHARE` (single on-chain read, no archive, genuinely independent), (3) `PRICE`
  dual-source, (4) **historical-NAV / realized-yield** once an L1 archive RPC is
  provisioned, (5) `BACKING_RATIO`, (6) `RULE_ADHERENCE`.
- **D25.6 — single-oracle assets are a SCOPE decision, not a silent grade.** Tokenized
  stocks and commodities (no independent on-chain second source) are **out of scope** by
  default. They may be admitted later only if a paying integration explicitly wants
  oracle-echo attestations, and only at a visibly inferior grade labeled
  **"single-oracle echo, not independently cross-checked."** Coverage claims never count
  single-source relays alongside cross-checked verdicts (D10/S7). There is no
  "unlock the whole universe" metric.
- **D25.7 — `/schema` endpoint is P0, cleared to build first.** It is the cheapest
  high-leverage piece and the actual ecosystem-standard artifact. It publishes the intake
  shape, the capability matrix, the per-class tolerances, and the grade/ABSTAIN-reason
  definitions. **Tolerances are published and tamper-evident** (hashed; the hash is
  surfaced in the reasoning trace and intended for on-chain anchoring) so an operator
  cannot quietly widen a band to force a VALID.

**Blocking before ANY handler ships: D25.1, D25.2, D25.3.** Everything else is downstream.

## Intake schema (`POST /api/v1/attest`, planned v4)

The same shape for every asset type. Asset-specific behavior is data (`claimType` +
`sources`), not code.

```jsonc
{
  "asset": {
    "symbol":   "USDY",
    "name":     "Ondo US Dollar Yield",
    "chain":    "Mantle",
    "contract": "0x...",                 // optional, enables on-chain checks
    "assetClass": "tokenized-treasury"
  },
  "claimType": "YIELD_BPS",              // REQUIRED. Determines tier + checks
  "assertion": { "metric": "annualized_yield", "value": 510, "unit": "bps", "windowDays": 30 },
  "sources": [                           // REQUIRED for non-judgment tiers
    { "scheme": "defillama",    "ref": "<poolId>" },
    { "scheme": "onchain-rate", "ref": "0xVault#convertToAssets", "chain": "Mantle" },
    { "scheme": "oracle",       "ref": "chainlink:0xFeed", "chain": "Ethereum" },
    { "scheme": "dex-twap",     "ref": "0xPool", "chain": "Ethereum" }
  ],
  "document": { "url": "...", "jsonPath|target": "..." },
  "rule": { "trigger": "price < 0.98", "action": "exit", "withinBlocks": 1200 },
  "payment": { "txHash": "0x...", "payer": "0x..." }
}
```

Validation: `assertion.value` finite; `claimType` known; for non-judgment tiers a
*sufficient* source set per the matrix (e.g. PRICE needs two with different profiles);
payment verified on-chain. Unknown/judgment claim types short-circuit to ABSTAIN before
any fetch.

## Claim-type capability registry (the matrix)

Each claim type is one entry. The system has no per-asset branches, only per-claim-type
handlers. `status` is the honest build state.

| Claim type | Tier | Status | Issuer provides | Bombe checks (independently) | ABSTAIN when |
|---|---|---|---|---|---|
| `YIELD_BPS` | 1 | live | sources + bps + window | fetch each source, compute realized/reported yield, reconcile legs, compare | disagree / stale / out of band |
| `NAV_PER_SHARE` (current) | 1 | planned (first) | a vault `contract` (ERC-4626) | read `convertToAssets(1e18)` at the latest block, compare | not readable / not ERC-4626 |
| `NAV_PER_SHARE` (historical) | 1 | planned (archive-gated) | vault `contract` + window | read share price at two blocks, annualize the delta | no archive RPC / insufficient history |
| `PRICE` | 1 | planned | **two** sources, different manipulation profiles | read both, reconcile within per-class tolerance | `SOURCE_DISAGREEMENT` / `STALE_SOURCE` / `INSUFFICIENT_LIQUIDITY` / fewer than two sources |
| `BACKING_RATIO` | 1/2 | planned | a **recognized third-party** reserve attestor + token contract | reserves ÷ (on-chain supply × unit price) ≥ 1 | reserves issuer-controlled / `custom-http` / unverifiable |
| `DISTRIBUTION_PAID` | 1 | planned | tx/event reference | confirm the on-chain transfer/event occurred | no on-chain record |
| `RULE_ADHERENCE` | 2 | planned (last) | a DSL `rule` + trigger source | replay on-chain history vs the rule over the window | rule not DSL-expressible / archive-dependent / ambiguous |
| `DOCUMENTED_NAV`, `CASHFLOW_MATCH` | 2 | live | a fetchable document + figure | pin+hash doc, extract with citation, cross-check | document unreadable / figure absent |
| `ENCUMBRANCE_ABSENT` | 2 | planned | a registry/document | document/registry lookup | no checkable record |
| `FAIR_VALUE`, `APPRAISAL`, `RATING`, `STRATEGY_QUALITY` | 3 | enforced (hardcoded FAIR_VALUE; rest pending D25.3) | (nothing) | judgment | always |

Tier-1 verdicts are the deterministic check, never a model. **Tier-2 verdicts are
deterministic *given the evidence*; the document/figure extraction is model-assisted and
graded** (the structured json-path mode is deterministic, the prose mode uses a model whose
cited quote must appear verbatim in the pinned bytes). The cross-check itself is always
deterministic.

### Asset class -> claim type mapping

- Stablecoins -> `BACKING_RATIO` (third-party attestor) + `PRICE` (dual-source peg)
- US Treasuries / money-market -> `YIELD_BPS` (+ Treasury-rate cross-check) / `NAV_PER_SHARE`
- Credit, ABS, Corporate credit -> `YIELD_BPS`, `DISTRIBUTION_PAID`, `DOCUMENTED_NAV`
- Active strategies / vaults -> `YIELD_BPS`, `NAV_PER_SHARE`, `RULE_ADHERENCE`
- Real estate -> `DOCUMENTED_NAV`; else ABSTAIN (appraisal = judgment)
- PE / VC -> ABSTAIN unless audited `DOCUMENTED_NAV`
- **Stocks, Commodities -> OUT OF SCOPE (D25.6)** unless a paying integration wants a
  single-oracle echo, admitted only at the "single-oracle echo" grade. No coverage metric
  counts these alongside cross-checked verdicts.

## New check kinds, detailed (post-July-10, demand-gated)

### NAV_PER_SHARE / ERC-4626 (`onchain-rate` scheme) — built first (current), archive later
- **Current NAV (first):** single on-chain `convertToAssets(1e18)` read at the latest
  block; compare to asserted. No archive, genuinely independent of any aggregator.
- **Historical / realized yield (later):** read at the latest block and ~windowDays earlier,
  annualize the delta. Needs an **L1 archive RPC** for mainnet vaults (Mantle RPC suffices
  for Mantle vaults). Gated until that RPC is provisioned.
- **Honesty:** attests the vault's on-chain share price / realized yield, never the strategy.

### PRICE (dual-source) — D25.1
- **Sources (two, different profiles):** an `oracle` leg (Chainlink/Pyth/RedStone
  `latestRoundData`) + a `dex-twap` leg (on-chain time-weighted price), or two distinct
  oracles. Reconcile within a per-class tolerance.
- **ABSTAIN:** `SOURCE_DISAGREEMENT` (legs diverge beyond tolerance), `STALE_SOURCE`
  (heartbeat exceeded), `INSUFFICIENT_LIQUIDITY` (TWAP pool too thin to trust), or fewer
  than two qualifying sources. The guarantee is divergence-forces-abstain.

### BACKING_RATIO — D25.2
- **Source:** a **recognized third-party reserve attestor** (allowlisted) + the token
  `contract` for on-chain `totalSupply`. Issuer-controlled or `custom-http` reserves never
  yield a clean VALID — they are graded-down or ABSTAIN.
- **Check:** `reserves_usd / (totalSupply × unitPrice) ≥ 1`.
- **Honesty:** "backed per the recognized attestor X as of T"; still does not audit the
  custodian's books, so the attestor allowlist is the actual trust anchor.

### RULE_ADHERENCE (Tier-2, default ABSTAIN) — D25.4
- **DSL only:** `{ trigger: <comparison>, action: <event>, withinBlocks: <n> }`. A rule
  outside the DSL is not falsifiable → ABSTAIN.
- **Check:** over the window, find each time the trigger held on-chain and verify the action
  fired within the bound. VALID only for unambiguous trigger→event patterns; otherwise
  ABSTAIN with a partial-scan summary. Reorg/partial-fill/MEV-sensitive; archive-dependent.
- **Scope guard:** attests "the documented rule fired as specified," never "the strategy is
  good" (that is `STRATEGY_QUALITY` → Tier-3 ABSTAIN).

## What the system returns (every attestation)

- Verdict: `VALID | REJECTED | ABSTAIN` (deterministic; Tier-2 deterministic given evidence).
- A reasoning trace = the provenance DAG (sources -> evidence -> gates -> check -> verdict),
  with cited source URLs / oracle round ids / document hashes; hashed on-chain.
- Explicit ABSTAIN reason codes (`SOURCE_DISAGREEMENT`, `STALE_SOURCE`,
  `INSUFFICIENT_LIQUIDITY`, `DOCUMENT_UNREADABLE`, `RULE_NOT_FALSIFIABLE`, `NO_ARCHIVE`, ...).
- An on-chain attestation (tx, stake) + a verify endpoint to re-derive it.
- The honest label: independence, grade, windowDays, and the explicit "does not catch X".

## `GET /api/v1/schema` — P0, the ecosystem-standard artifact (D25.7)

Publishes, machine + human readable:
- the intake shape,
- the capability matrix (each claim type: tier, status, requires, checks, returns,
  abstainWhen, schemes),
- the per-class **tolerances**,
- the **grade** definitions and the **ABSTAIN reason** definitions,
- a `tolerancesHash` (keccak of the canonical tolerances) so the published bands are
  **tamper-evident**: the same hash appears in every reasoning trace, and an operator
  cannot silently widen a band to force a VALID without changing a hash anyone can check.

MCP exposes it as `bombe_get_schema`. This endpoint is built now; it documents what is
`live` vs `planned` honestly.

## Built vs to build

- **Built + live:** claim/tier taxonomy + the hardcoded Tier-3 `FAIR_VALUE` abstain guard;
  `YIELD_BPS`; `DOCUMENTED_NAV`/`CASHFLOW_MATCH` (the Tier-2 document step, live at
  `/api/v1/document-check`, verified against the US Treasury rate — not fixture); scheme
  registry; gates; provenance; non-custodial paid intake; **`/api/v1/schema` (this batch).**
- **To build (post-2026-07-10, demand-gated):** the on-chain `claimTypeTier` mapping
  (D25.3, July-11 contract batch, blocking); `NAV_PER_SHARE` current then historical;
  `PRICE` dual-source; `BACKING_RATIO`; `RULE_ADHERENCE`; the generalized `/api/v1/attest`.

## Honesty rules carried from the constitution

- Tier-1 verdicts are the deterministic check, never a model. Tier-2 verdicts are
  deterministic given evidence; extraction is model-assisted and graded.
- ABSTAIN on any judgment. Contract enforcement beyond the hardcoded `FAIR_VALUE` guard is
  NOT claimed until D25.3 ships.
- Never the word "independent" for sources sharing one ground truth.
- `windowDays` always displayed; a short window is never called "30-day".
- Issuer-specified (`verified:false`), lower-grade, and single-oracle-echo sources are
  labeled as such, and never counted in cross-checked coverage metrics.
- A source we cannot fetch is not attested; we abstain rather than trust.
