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

- **Phase 0, public /verify lookup (T-610) — build now, decision-free.** Read-only UI over the already-shipped public read API. Paste a claim ID, a reasoning hash, or a tx hash; get the verdict, the on-chain proof (explorer links), and the verify-hash result. Reasoning-hash reverse lookup scans the bounded recent claim-ID set (no global index yet); honest not-found state. Directly serves the "anyone can verify" half of the ask.

- **Phase 1, issuer request intake (T-611) — no in-platform payment.** A "Request an attestation" form scoped to supported claim types (or a generic Tier-2 request with a document/source pointer). Records the request; the operator reviews falsifiability and posts on-chain; the issuer gets the claim ID and on-chain attestation back. Honest interim of the self-serve vision. Gated on OP-9 decision (build now vs wait).

- **Phase 2, custodial paid flow (T-612).** In-platform payment -> custodial backend posts the claim (posting key) and runs the attestor -> returns the on-chain attestation + trace + verify link. The v3.2 "custodial paid requests" item. Gated on the x402 payment-rail decision and explicit operator authorization of a custodial key model (OP-9). Fail-closed dedupe; only supported, data-wired claim types auto-attest.

- **Phase 3, open onboarding for arbitrary assets (v4, post-June-15).** Needs the `IAssetAdapter` plugin interface (already in this backlog) so a new asset is config + a small adapter, plus the assisted-onboarding intake (form to adapter-config PR, already in this backlog). This is what makes "any issuer, any asset" real, and the right home for genuinely-open self-serve. Promote in the shadow-mode v4 batch.

Sequencing: T-610 now; T-611 next pending OP-9; T-612 after the x402 decision + custodial authorization; Phase 3 with the v4 adapter work after June 15.
