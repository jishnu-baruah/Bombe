# Design, Issuer page, Integrate page, and Integration guide (T-J08)

_Date: 2026-06-06 · Status: approved-pending-review · Task: T-J08_

## Problem

Bombe demonstrates the *supply* side (autonomous attestors racing on live claims) but
the submission never answers the judge's obvious question: **who pays for attestations,
why, and how would they integrate?** We need a credible demand-side story and proof that
integration is real, without overstating what the contracts actually permit today.

## Goals

- Give judges a one-scroll **demand-side narrative** (who the buyer is, the economics, the falsifiable-only credibility pitch).
- Show that integration is **simple and beneficial** at a glance.
- Provide a **runnable technical reference** grounded in the live Mantle Sepolia contracts.
- Stay strictly honest about what is live vs. roadmap (esp. operator-gated `postClaim`).

## Non-goals (YAGNI)

- No permissionless self-serve `postClaim` implementation (it's `OPERATOR_ROLE` today; that's roadmap).
- No real issuer signup/funnel/CRM. No claims of partnerships.
- No new contracts or SDK changes. This is web pages + docs over the existing system.

## Three artifacts, split by intent (no redundancy)

| Artifact | Intent | Audience | Answers |
|----------|--------|----------|---------|
| `/issuers` page | **Why pay** (business) | Issuer decision-maker | Who's the buyer, the economics, why falsifiable-only is the credibility pitch |
| `/integrate` page | **How easy + what you gain** (hook) | Developer skimming | "Integrate in 4 steps / ~20 lines", the benefits, small code peeks → CTA to full guide |
| `docs/INTEGRATION.md` | **Full runnable reference** | Developer doing it | Exact signatures, addresses, end-to-end working steps |

`/issuers` sells; `/integrate` shows it's simple and links onward; the doc is the full technical truth.

## Ground truth (verified against contracts/src, 2026-06-06)

- `AgentAttestation.CLAIM_FEE = 0.01 ether`, `ATTEST_LOCK = 0.02 ether`; `AgentRegistry.MIN_BOND = 0.1 ether`.
- `postClaim(bytes32 id, uint8 tier, bytes32 claimHash, string claimURI) payable`, **`onlyRole(OPERATOR_ROLE)`**, requires `msg.value == CLAIM_FEE`, `tier ∈ [1,3]`.
- `attest(...)`, restricted to registered (bonded) attestors; `VALID/REJECTED` require `msg.value == ATTEST_LOCK`; `tier==3 && decision!=ABSTAIN` reverts `JudgmentTierRequiresAbstain`.
- Public `view` getters (permissionless): `getClaim`, `getAttestation(claimId, attestor)`, `getClaimAttestors(claimId)`, `attestorCount(claimId)`.
- `Attestation` carries `decision`, `confidenceBps`, `sourcesHash`, `reasoningHash`, `traceURI`, `lockedStake`.
- Live addresses: see `docs/DEPLOYMENTS.md` (REGISTRY/ATTESTATION/SLASHING/LEADERBOARD on chain 5003). Reference impl of the full flow: `scripts/live-attest.ts`.

**Honest integration reality (stated on every artifact):**
1. **Read + verify**, permissionless, works today. *(the simple headline path)*
2. **Post a claim**, the operator posts claims today (`postClaim` is operator-gated; e.g. via `scripts/live-attest.ts`); a permissionless issuer-submits flow is roadmap.
3. **Become an attestor**, bonded + registered via the SDK.

## Artifact 1, `/issuers` page

App Router page `apps/web/app/issuers/page.tsx`, reusing the design system (Badge/Button/Card,
off-black sections, cobalt accent). Sections:

1. **Eyebrow + headline**, "For issuers, turn *'trust me'* into *'verify it on-chain.'*"
2. **Who pays & why**, 3–4 issuer archetypes, explicitly labeled *illustrative examples, not partners*:
   RWA yield/treasury protocols (mETH-yield demo shape), lenders accepting RWA collateral,
   fund admins/auditors, allocating DAOs. One line of pain each.
3. **What you get**, independent, slashing-backed, explorer-visible attestation + a reasoning
   trace whose `reasoningHash` is on-chain and re-derivable.
4. **The economics**, table from real constants: issuer pays `CLAIM_FEE` 0.01 MNT; attestors
   stake `ATTEST_LOCK` 0.02 MNT, earn fee + trust-score when right, slashed when wrong.
5. **Will / won't attest**, Tier 1 + 2 = yes; Tier 3 valuations = ABSTAIN, contract-enforced.
6. **CTAs**, "See how to integrate →" (`/integrate`), "Watch a live attestation →" (`/live`), "View leaderboard →".

## Artifact 2, `/integrate` page

App Router page `apps/web/app/integrate/page.tsx`. Simplicity + benefits, distinct from `/issuers`:

1. **Headline**, "Integrate in 4 steps. Read it. Verify it. Trust it."
2. **Benefits strip**, no infra to run, explorer-visible results, cryptographically verifiable
   traces, contract-enforced Tier-3 safety.
3. **The 4 steps as a visual flow** with *small* code peeks (full code lives in the doc):
   (1) point at the live contract, (2) read the verdict (`getClaim`/`getClaimAttestors`/`getAttestation`),
   (3) read the trust-score, (4) verify the trace hash. Headlines the **permissionless read+verify** path.
4. **Honest note**, posting goes through the operator today; self-serve is roadmap.
5. **CTA**, "Read the full integration guide →" (`docs/INTEGRATION.md`), "Why issuers use Bombe →" (`/issuers`).

## Artifact 3, `docs/INTEGRATION.md`

Runnable reference built on real addresses + the proven `scripts/live-attest.ts` flow:

1. **Prereqs**, Mantle Sepolia (5003), funded wallet, live addresses from DEPLOYMENTS.md.
2. **Read a verdict (permissionless)**, viem snippets for `getClaim` / `getClaimAttestors` /
   `getAttestation`, decoding `Decision` + `confidenceBps`.
3. **Read the trust-score**, `TuringLeaderboard` getter via viem.
4. **Verify the trace**, fetch `traceURI`, recompute `keccak256(canonicalJson(trace))`,
   compare to on-chain `reasoningHash` (the T-J03 verify-hash proof).
5. **Post a claim (operator-posted today)**, claim fields `(id, tier, claimHash, claimURI)`,
   how `claimHash` is derived, the 0.01 MNT fee; note `OPERATOR_ROLE` gating + that self-serve is roadmap.
6. **Become an attestor**, register (MIN_BOND 0.1), run the SDK, `attest` with ATTEST_LOCK 0.02.
7. **Tier-3 safety demo**, a non-ABSTAIN Tier-3 `attest` reverting with `JudgmentTierRequiresAbstain`.
8. **Links**, contract source, ABIs (`pnpm gen:abis` output), `scripts/live-attest.ts`.

## Cross-linking & nav

- Add **"Issuers"** to the top nav (the shared nav component). `/integrate` reachable from `/issuers`
  and the README; not necessarily a primary nav slot (keeps nav uncluttered).
- README: add `/issuers`, `/integrate`, and `docs/INTEGRATION.md` to the links block.

## Components & isolation

- Each page is a server component rendering static content (no data fetching), independently
  testable by render assertions, mirroring `landing.test.tsx`.
- Reusable bits (economics table, step-flow, benefit chips) are local to each page unless a
  second use appears; no premature shared abstraction.
- **Apply the T-019 lesson:** never use `max-w-{sm,md,lg,xl}` (they collide with the custom
  `--spacing-*` tokens → ~24px). Use `max-w-[36rem]`-style explicit widths.

## Honesty guardrails

- Archetypes labeled illustrative; no implied partnerships.
- Every economics number + function signature taken from the contracts (verified above).
- "Live today" vs "roadmap" stated explicitly wherever `postClaim` self-serve could be misread.

## Testing

- `apps/web/test/issuers.test.tsx` + `integrate.test.tsx`: assert key copy renders (headline,
  economics numbers 0.01/0.02, Tier-3 ABSTAIN line, CTAs/links present).
- `pnpm --filter @bombe/web typecheck` + `biome check` green; existing suites unaffected.
- Manual: Playwright section screenshots at 1280px + 390px (mobile) via `scripts/shoot.mjs`.
- Deploy via the CLI procedure (git push does not deploy bombe-web).

## Task

Single task **T-J08, issuer page + integrate page + integration guide**, added to TODO.md.
Acceptance = the three artifacts above exist, pages render + are nav/README-linked, copy is
honest re: operator-gating, tests + typecheck + biome green, deployed to production.
