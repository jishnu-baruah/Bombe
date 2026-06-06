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

(none yet)
