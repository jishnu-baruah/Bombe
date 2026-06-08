# Attestation schema, the ecosystem-standard intake

Status: SPEC for review (2026-06-08). Not yet implemented. Decision record: D25 (proposed).
Builds on the open resolver (D20), pipeline + gates (D21), Tier-2 document step (D22),
and the catalog/grades (D23/D24).

## Purpose

Let **any issuer of any RWA type** self-serve an attestation without Bombe writing
per-asset code. The issuer submits a self-describing claim; the system routes it by
**claim type** to a deterministic check, and returns an on-chain verdict + trace, or
ABSTAINS. This document defines (1) what the issuer submits, (2) what the system checks
and returns per claim type, and (3) the new check kinds to add.

## The one invariant (non-negotiable)

> The issuer gives a **falsifiable claim** and **at least one source Bombe can fetch and
> recompute itself**. Bombe never takes the issuer's word; it re-derives the value and
> cross-checks. If no checkable source is supplied, or the claim is a judgment/opinion,
> the verdict is **ABSTAIN** (the contract rejects any non-abstain on a judgment tier).

This is what keeps "anyone can get attested" from becoming "we attest anything." A
dashboard (e.g. rwa.xyz) displays the issuer's number; Bombe re-derives it, stakes on it,
and can refuse it. That difference is the product.

## Intake schema (`POST /api/v1/attest`)

The same shape for every asset type. Asset-specific behavior is data (`claimType` +
`sources`), not code.

```jsonc
{
  "asset": {
    "symbol":   "USDY",            // open string
    "name":     "Ondo US Dollar Yield",
    "chain":    "Mantle",          // optional
    "contract": "0x...",           // optional, enables on-chain checks
    "assetClass": "tokenized-treasury" // optional hint; routes display/gates
  },
  "claimType": "YIELD_BPS",        // REQUIRED. Determines tier + checks (table below)
  "assertion": {
    "metric": "annualized_yield",
    "value":  510,
    "unit":   "bps",               // bps | usd | ratio | bool
    "windowDays": 30               // for windowed metrics; actual window always reported
  },
  "sources": [                     // REQUIRED for non-judgment tiers: >=1 checkable source
    { "scheme": "defillama",    "ref": "<poolId>" },
    { "scheme": "onchain-rate", "ref": "0xVault#convertToAssets", "chain": "Mantle" },
    { "scheme": "oracle",       "ref": "chainlink:0xFeed", "chain": "Ethereum" },
    { "scheme": "custom-http",  "ref": "https://issuer/yield.json", "jsonPath": "data.apy" }
  ],
  "document": { "url": "...", "jsonPath|target": "..." }, // Tier-2 doc claims only
  "rule": { "trigger": "price < 0.98", "action": "exit", "withinBlocks": 1200 }, // RULE_ADHERENCE only
  "payment": { "txHash": "0x...", "payer": "0x..." }      // non-custodial fee
}
```

Validation: `assertion.value` finite; `claimType` known; for non-judgment tiers,
`sources.length >= 1` with a recognized `scheme`; payment verified on-chain (existing).
Unknown/judgment claim types short-circuit to ABSTAIN before any fetch.

## Claim-type capability registry (the matrix)

Each claim type is one entry `{ claimType, tier, requires, checks, returns, abstainWhen,
schemes }`. The system has no per-asset branches, only per-claim-type handlers.

| Claim type | Tier | Issuer provides | Bombe checks (independently) | Returns | ABSTAIN when |
|---|---|---|---|---|---|
| `YIELD_BPS` | 1 | sources + bps + window | fetch each source, compute realized/reported yield, reconcile legs, compare to assertion within tolerance | VALID/REJECTED + reconciled value + provenance | sources disagree / stale / out of band |
| `PRICE` | 1 | an oracle/on-chain price source | read price at a block, compare to assertion within tolerance | VALID/REJECTED + read price + source | no verifiable price source |
| `NAV_PER_SHARE` | 1 | a vault contract (ERC-4626) | read `convertToAssets(1e18)` (current, or two blocks for realized yield), compare | VALID/REJECTED + NAV (+ realized yield) | contract not readable / not ERC-4626 |
| `BACKING_RATIO` | 1/2 | reserves source + token contract | reserves ÷ (on-chain supply × unit price) ≥ 1 | VALID/REJECTED + ratio | reserves only self-asserted, no checkable proof |
| `DISTRIBUTION_PAID` | 1 | tx/event reference | confirm the on-chain transfer/event occurred | VALID/REJECTED | no on-chain record found |
| `RULE_ADHERENCE` | 1/2 | a precise `rule` + price source | replay on-chain tx/event history vs the rule over the window | VALID/REJECTED + the matching/violating events | rule not precisely falsifiable / insufficient history |
| `DOCUMENTED_NAV`, `CASHFLOW_MATCH` | 2 | a fetchable document + figure | pin+hash doc, extract with citation, cross-check | VALID/REJECTED + docHash + quote | document unreadable / figure absent |
| `ENCUMBRANCE_ABSENT` | 2 | a registry/document | document/registry lookup | VALID/REJECTED | no checkable record |
| `FAIR_VALUE`, `APPRAISAL`, `RATING`, `STRATEGY_QUALITY` | 3 | (nothing) | nothing, it is judgment | **ABSTAIN** | always (contract-enforced) |

### Asset class -> claim type mapping (covers all of data.txt)

- Stablecoins (86) -> `BACKING_RATIO` + `PRICE` (peg)
- US Treasuries / money-market (65) -> `YIELD_BPS` (+ Treasury-rate cross-check) / `NAV_PER_SHARE`
- Credit, ABS, Corporate credit (64) -> `YIELD_BPS`, `DISTRIBUTION_PAID`, `DOCUMENTED_NAV`
- Active strategies / vaults (28) -> `YIELD_BPS`, `NAV_PER_SHARE`, `RULE_ADHERENCE`
- Stocks (284) -> `PRICE` (oracle)
- Commodities (45) -> `PRICE` (oracle)
- Real estate (64) -> `DOCUMENTED_NAV`; else ABSTAIN (appraisal = judgment)
- PE / VC (14) -> ABSTAIN unless audited `DOCUMENTED_NAV`

So ~3 additions unlock the whole universe: the `oracle`/`PRICE` path (329 stocks+commodities),
`BACKING_RATIO` (86 stablecoins), and `onchain-rate`/`NAV_PER_SHARE` (vaults/strategies).

## New check kinds, detailed (all four approved)

### 1. PRICE (+ `oracle` scheme)
- **Source schemes:** `oracle` (Chainlink/Pyth/RedStone feed address) or `onchain-price`
  (a DEX/asset contract). `ref` names the feed; the fetcher reads `latestRoundData` (or
  equivalent) at the latest block.
- **Check:** `|asserted - oraclePrice| <= tolerance` (abs or %). Determinism: a block-pinned
  read; the trace records feed address + round id + block.
- **Honesty:** a tokenized-stock/commodity price claim is only as good as the cited oracle;
  the label says which oracle and that off-oracle manipulation is not caught. No oracle ->
  ABSTAIN (we do not invent a price).

### 2. BACKING_RATIO (stablecoins)
- **Source:** a reserves figure (attestation API, or a documented attestation -> Tier-2) +
  the token `contract` for on-chain `totalSupply`.
- **Check:** `reserves_usd / (totalSupply * unitPrice) >= 1` (unitPrice ~1 for USD stables,
  or via PRICE). VALID if fully backed within tolerance, REJECTED if under-backed.
- **Tier:** 1 when reserves are independently fetchable (API/on-chain); 2 when only a PDF
  attestation exists (pin+extract). Self-asserted-only reserves -> ABSTAIN.
- **Honesty:** "backed per the cited reserves source as of T"; does not audit the custodian.

### 3. NAV_PER_SHARE / ERC-4626 on-chain (`onchain-rate` scheme)
- **Source:** a vault `contract` exposing `convertToAssets`/`pricePerShare`.
- **Check:** read share price on-chain; for realized yield, read at the latest block and a
  block ~windowDays earlier, annualize the delta (deterministic, no issuer self-report).
  This is the rigorous vault path and gives mETH-style "two computation paths" for any vault.
- **Infra:** Mantle RPC for Mantle vaults; an **L1 archive RPC** for historical reads on
  mainnet vaults (operator input, like OP-10's superseded item). Current-NAV check needs no
  archive; realized-yield-over-window does.
- **Honesty:** attests the vault's on-chain share price / realized yield, never the strategy.

### 4. RULE_ADHERENCE (strategy vaults)
- **Source:** a **precise, falsifiable** `rule` (trigger condition + action + window) + a
  price/state source for the trigger.
- **Check:** over the window, find every time the trigger held on-chain, and verify the
  action occurred within the stated bound (tx/event history). VALID if the rule was honored
  every time, REJECTED if it was violated, ABSTAIN if the rule is not precisely falsifiable
  or history is insufficient.
- **Scope guard:** this attests "the documented rule fired as specified," NOT "the strategy
  is good/safe/profitable" (that is `STRATEGY_QUALITY` -> Tier-3 ABSTAIN). The line is the
  whole thesis.

## What the system returns (every attestation)

- Verdict: `VALID | REJECTED | ABSTAIN` (deterministic; never a model's opinion).
- A reasoning trace = the provenance DAG (sources -> evidence -> gates -> check -> verdict),
  with cited source URLs / oracle round ids / document hashes; hashed on-chain (`reasoningHash`).
- An on-chain attestation (tx, stake, explorer-visible) + a verify endpoint to re-derive it.
- The honest label: independence, grade, windowDays, and the explicit "does not catch X".

## Self-documenting interface

`GET /api/v1/schema` publishes the intake shape + the capability registry (machine + human
readable), so any issuer or agent reads exactly what to submit and what each claim type
checks/returns/abstains-on. That endpoint *is* the ecosystem-standard contract; MCP exposes
it as `bombe_get_schema`.

## Built vs to build

- Built: claim/tier taxonomy + on-chain abstain enforcement; `YIELD_BPS`; `DOCUMENTED_NAV`
  (Tier-2 document step); scheme registry; gates; provenance; non-custodial paid intake.
- To build (this spec): the capability registry (matrix as code); generalize intake to the
  universal shape + `/api/v1/attest`; the four new handlers (`PRICE`, `BACKING_RATIO`,
  `NAV_PER_SHARE`, `RULE_ADHERENCE`) + their schemes (`oracle`, `onchain-rate`); the
  `/api/v1/schema` endpoint. Sequence: registry + schema endpoint first (defines the
  interface), then `NAV_PER_SHARE`/`onchain-rate` (no new external dep beyond RPC), then
  `PRICE`/`oracle`, then `BACKING_RATIO`, then `RULE_ADHERENCE` (hardest).

## Honesty rules carried from the constitution

- Verdicts are the deterministic check, never a model. Models only read/explain.
- ABSTAIN on any judgment; the contract enforces it.
- Never the word "independent" for sources sharing one ground truth.
- `windowDays` always displayed; a short window is never called "30-day".
- Issuer-specified (`verified:false`) and lower-grade sources are labeled as such.
- A source we cannot fetch is not attested; we abstain rather than trust.

## Open questions (for review)

1. `/api/v1/attest` as a new generalized endpoint, or extend the existing `/api/v1/request`?
2. On-chain posting for non-`YIELD_BPS` claim types: same `postClaim`/`attest` path with the
   claimType in the payload (the contract is claim-type-agnostic except the Tier-3 guard)?
3. `BACKING_RATIO`/`PRICE` tolerance defaults per asset class (peg band vs price band)?
4. RULE_ADHERENCE: cap the rule grammar to a small, safe, falsifiable DSL (comparison +
   action + window) in v1, rather than arbitrary rules?
5. Oracle allowlist (Chainlink/Pyth/RedStone) vs any issuer-named feed (with a verified flag)?
