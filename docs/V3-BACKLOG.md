# v3 backlog (idea parking)

New feature ideas during the v2 run are appended here, not implemented. v2 scope is locked to
BOMBE-V2-PRD.md Section 8. This list is the post-hackathon Phase 1 candidate set.

## Carried from the v2 PRD (Section 5)

- Contract-level 2-of-3 consensus with per-agent on-chain stakes (safe to touch Solidity after June 15).
- Tier-based bond sizing, `max(MIN_BOND, f(tier))`.
- `IAssetAdapter` plugin interface (declareClaimTypes / getDataSource / computeExpected) so a new asset is config plus a small adapter, not a core enum change.
- Data-resilience hardening at the availability layer (circuit breakers, provider fallback).
- Mainnet deployment with dust economics and a public accuracy page.
- Assisted-onboarding intake (form to adapter-config PR).
- Genuinely-independent second sources where they exist (issuer NAV vs on-chain vs third-party audit), the assets where the word "independent" becomes truthful.
- Mantle ecosystem and BD outreach with the streak plus MARKET-READINESS.md.

## Added during the v2 run

### Self-serve issuer onboarding + public verify lookup (2026-06-07)

Operator ask: let unintegrated issuers come to the platform, submit a claim, pay, and get the traceable on-chain attestation in the platform itself; plus a page where anyone can paste a claim ID / hash / tx and get the on-chain proof.

The hard constraint that shapes everything: Bombe only attests claims it can falsifiably verify. Today that is mETH and USDY yield, each with a wired data source and a deterministic reconciler. A new issuer cannot submit "trust my number" and get an attestation; that would break the thesis. So self-serve onboarding splits into what is verifiable now versus what needs the adapter path.

Phased design:

- **Phase 0, public /verify lookup (T-610), build now, decision-free.** Read-only UI over the already-shipped public read API. Paste a claim ID, a reasoning hash, or a tx hash; get the verdict, the on-chain proof (explorer links), and the verify-hash result. Reasoning-hash reverse lookup scans the bounded recent claim-ID set (no global index yet); honest not-found state. Directly serves the "anyone can verify" half of the ask.

- **Phase 1, issuer request intake (T-611), no in-platform payment.** A "Request an attestation" form scoped to supported claim types (or a generic Tier-2 request with a document/source pointer). Records the request; the operator reviews falsifiability and posts on-chain; the issuer gets the claim ID and on-chain attestation back. Honest interim of the self-serve vision. Gated on OP-9 decision (build now vs wait).

- **Phase 2, custodial paid flow (T-612).** In-platform payment -> custodial backend posts the claim (posting key) and runs the attestor -> returns the on-chain attestation + trace + verify link. The v3.2 "custodial paid requests" item. Gated on the x402 payment-rail decision and explicit operator authorization of a custodial key model (OP-9). Fail-closed dedupe; only supported, data-wired claim types auto-attest.

- **Phase 3, open onboarding for arbitrary assets (v4, post-June-15).** Needs the `IAssetAdapter` plugin interface (already in this backlog) so a new asset is config + a small adapter, plus the assisted-onboarding intake (form to adapter-config PR, already in this backlog). This is what makes "any issuer, any asset" real, and the right home for genuinely-open self-serve. Promote in the shadow-mode v4 batch.

Sequencing: T-610 now; T-611 next pending OP-9; T-612 after the x402 decision + custodial authorization; Phase 3 with the v4 adapter work after June 15.

Update 2026-06-07: T-610, T-611, and T-612 are all DONE and live. The full autonomous paid flow works end-to-end (pay from your own wallet, the agent posts + attests + stores the trace, the result is stranger-verifiable). What remains of this vision is the breadth, captured below.

### Expansion roadmap: adaptability, document verification, more RWA types, headless (operator vision 2026-06-07)

The operator wants to use the testnet faucet allowance (about 1000 MNT/day) to run many real attestations across a growing set of RWA yields, with an adaptability model that keeps adding supported types, plus document verification, all fully end-to-end, and to showcase headless agent integration.

- **Adapter registry (the adaptability model).** Build the `IAssetAdapter` interface (declareClaimTypes / getDataSource / computeExpected) so a new asset is config plus a small adapter, not a core enum change. The deterministic reconciler stays the verdict authority; an adapter only supplies the data source and the expected-value computation. Today mETH and USDY are effectively hard-wired adapters; generalize them, then add assets (more LSTs, more tokenized treasuries, RWA pools) one adapter at a time. This is the single highest-leverage item for "more supported RWA types."
- **Document verification (Tier-2).** Wire the document-falsifiable path for real: fetch a referenced document (servicer report, statement, audit), extract the claimed figures, cross-check, and attest CASHFLOW_MATCH / ENCUMBRANCE_ABSENT. This is where AI does more than gather numbers (it reads documents), so it lifts the AI x RWA depth materially. Slashing for Tier-2 goes through the dispute path, which already exists in the contracts.
- **Volume + budget.** A scheduler that posts many attestations per day within a configured MNT/day budget guard (pause + alert before the allowance is exhausted); settle claims to release locked stake so the attestor balance is not the bottleneck.
- **Headless integration showcase.** Make "an agent can use Bombe with no human" concrete: an MCP server + a SKILL.md describing the read/verify/attest tools over the existing public API and the contract, so an external agent can read a verdict, verify a hash, or request a paid attestation entirely headlessly. The public read API (/api/v1) and the paid-request endpoint are the substrate; this packages them for agents.

Each of these is its own workstream; the adapter registry and document verification are contract-or-pipeline depth, the headless showcase is packaging. None require a contract redeploy except the adapter interface if it touches storage (after June 15).
