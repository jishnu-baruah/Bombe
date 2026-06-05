# CONTEXT — Bombe strategic framing (locked)

This file holds the *why* and the invariants that do not change. The *how* — workflow,
branch/commit conventions, the fix-loop, the §15.4 guardrails — lives in `CLAUDE.md`.
When this file and the PRD (`docs/bombe-prd.md`) disagree, **the PRD wins**; fix this file.

## Thesis

Bombe is an autonomous AI attestor network for real-world-asset (RWA) claims on Mantle.
The core thesis, made product: agents attest **only to falsifiable claims**. Judgment-laden
claims (Tier 3) produce **ABSTAIN** and flags — never an attestation.

An attestation is an **"economically warranted statement," not a truth claim**. Wrong
attestations get **slashed**. Safety guarantees do not live in the agent code or in any
framework abstraction; they live at the **contract layer**. That guarantee is proven *live*
by **Plugboard** — an external attestor running on the **Hermes Agent runtime (Nous Research)
that the Bombe team did not write** — which touches the protocol only through public
interfaces (the tool gateway over HTTP and the contracts via its own wallet).
(PRD §1, §6.8)

## Claim taxonomy

Three tiers, each with a distinct truth source and slashing path
(`packages/shared/src/taxonomy.ts`, PRD §6.1):

- **Tier 1 — DETERMINISTIC** (`YIELD_BPS`, `DISTRIBUTION_PAID`): truth derivable from
  on-chain state / oracle math. Slashing is **direct and automatic** against ground truth
  at settlement.
- **Tier 2 — DOCUMENT** (`CASHFLOW_MATCH`, `ENCUMBRANCE_ABSENT`): truth derivable from the
  referenced **fixture documents**. Slashing happens **only via dispute resolution** — an
  in-protocol stake-weighted vote.
- **Tier 3 — JUDGMENT** (`FAIR_VALUE`): valuation / opinion. **Attestation is FORBIDDEN.**
  The SDK coerces any decision to **ABSTAIN**; the **contract rejects** any Tier-3 non-ABSTAIN
  attestation (`JudgmentTierRequiresAbstain`). No slashing path exists for Tier 3 by
  construction.

**Tier is derived from `claimType` via the pure `tierOf(claimType)`. A submitter-supplied
tier is NEVER trusted.** (PRD §6.1)

## The four attestors

Three reference agents are built on the **Bombe SDK**; temperament is enforced **twice** —
in the **system prompt** (style) and in **SDK hard rules** (guarantees) (PRD §6.4):

- **Reflector** — conservative; requires two independent sources for VALID, abstains on stale
  feeds.
- **Rotor** — aggressive; commits whenever above threshold, never abstains for staleness alone.
- **Stator** — cost-optimized; shortest path, abstains when tools disagree.

The fourth, **Plugboard**, runs **externally on the Hermes Agent runtime** and has **NO SDK
hard rules** — neither the prompt-style layer nor the SDK-guarantee layer. Its safety is
enforced **only by the contracts**. Plugboard is the **live proof that protocol-level
guarantees hold against agents Bombe did not write**, that the network is open to third-party
agents, and that safety is contract-level. Its bond and slashes are real; its thresholds are
self-enforced and may drift as its skill evolves — that is the point. (PRD §6.4, §6.8)

## Non-goals (PRD §2 — do not build)

- **No mainnet deployment, token launch, or real economic value.**
- **No real document ingestion / PDF parsing.** Tier 2 uses **fixture JSON documents**
  (simulated servicer reports / bank statements).
- **No KYC, no auth beyond the operator key, no native mobile apps.** The web race view must
  be responsive (down to 380px); that is sufficient.
- **No SaaS diligence report product and no PDF export.** Only the trace viewer exists; the
  **trace URL is the shareable artifact**.
- **No UMA integration.** Disputes use the **in-protocol stake-weighted vote** (PRD §6.2).
- **No runtime mock/live switching.** Mode is **fixed at boot**; switching requires a restart
  (runtime mode mutation is shared mutable state and an operator-surface security risk).
- **Discord/Telegram bots and the `/turing` blind mode are STRETCH only (M7)** — they never
  gate acceptance.

## Definition of done

The **17 acceptance criteria in PRD §14** are the definition of done. Done means **all 17 are
true** (M7 stretch items are intentionally absent from that list).

The single "can we submit" oracle is **`pnpm test:demo`** (PRD §15.2): it boots the mock stack
headless, advances the demo A→D, and asserts the exact §6.7 outcome matrix plus trace-hash
stability, in under 30s. It is the single source of truth for "can we submit" and is run
before every commit that touches fixtures, taxonomy, the loop, contracts, or transcripts.

## Determinism contract

**Mock mode is fully deterministic** (PRD §8, §6.8): seeded clock, scripted models, a pinned
Plugboard skill (`fixtures/model-scripts/plugboard/epoch-0.skill.md`, which never evolves in
mock), and fixture oracles. The demo produces the **identical A→D outcomes every run**, twice
in a row (§14.3). The demo never depends on live model APIs, the live Hermes runtime, or
network access — claims A–D run scripted with automatic fallbacks (§13).

**No silent failures.** Every tool / loop / runner error lands in the **`errors` table** and in
the machine-readable JSON test reports under `.test-reports/`. A `network_timeout` or `unknown`
failure in mock mode is treated as a **determinism bug**, never as flake. (PRD §8, §15.3)
