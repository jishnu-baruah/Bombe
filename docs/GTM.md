# Bombe business model and go-to-market

For the Business Potential dimension (general scorecard) and the post-hackathon plan. Covers who
pays, why, how Bombe reaches them, the moat, and the next 90 days. Grounded in what the product
already does (the `/request` paid flow, the public verify API, the on-chain attestation streak), not
in a hypothetical.

## 1. The problem worth money

RWA yield reporting is trust-based: an issuer states a number and everyone downstream takes it on
faith. The consumers of that number (DeFi protocols listing or collateralizing the asset, allocators
sizing a position, auditors signing off, and increasingly autonomous agents) have no cheap way to
independently verify it. Today they either trust blindly or pay humans to reconcile reports slowly.
Bombe replaces faith with a check anyone can rerun, with a bond behind it.

## 2. Who pays, and for what

- **RWA issuers** pay for independent, on-chain attestation of their reported yields and cashflows.
  Third-party verification is something they already buy from auditors and risk firms; Bombe makes it
  continuous, cheaper, and machine-readable. This is the `/request` self-serve flow today: connect a
  wallet, pay, receive a verifiable on-chain attestation.
- **DeFi protocols and integrators** pay for a verified yield signal before they list, price, or
  collateralize an RWA. A protocol that lends against USDY wants the yield it underwrites to be
  checkable, not taken from a dashboard.
- **Risk, audit, and allocation teams** pay for the tamper-evident audit trail and the Tier-2
  document reconciliation (cashflow match, encumbrance checks) that today is manual.
- **Autonomous agents** pay per call. Bombe is agent-native (MCP server, `llms.txt`, x402
  pay-per-call), so an agent that needs a trustworthy RWA number can discover Bombe and pay for a
  verified answer without a human in the loop. This is a small market today and a large one as
  agent-driven allocation grows.

## 3. Revenue model

- **Pay-per-attestation** (live today via the `/request` flow and x402). A metered fee per verified
  claim. Scales with usage, no seat licensing.
- **API / integration subscriptions.** The public read and verify API is free to seed adoption;
  paid tiers add rate limits, SLAs, webhooks, and private claim types for integrators.
- **Protocol fees on bonds and disputes.** A small cut of attestation bonds and dispute resolution,
  paid in MNT, accrues to the protocol as the attestor network grows.
- **Enterprise attestation-as-a-service.** For an issuer that needs a permissioned, KYC'd attestor
  set and custom claim schemas, a managed deployment.

**On tokenomics, honestly:** Bombe needs **no new token**. Bonds and slashing are denominated in
**MNT**, which aligns the protocol with the Mantle ecosystem and avoids the speculative-token trap
that weighs on comparable AI-oracle projects. A fee or governance token is a possible later step, not
a requirement for the product to work or to earn revenue. Not needing a token is a feature.

## 4. Go-to-market

Land in the Mantle RWA niche where the assets and the demand already exist, then widen.

- **Phase 0 (now): demonstrator + free verify API.** Live contracts on Mantle, a daily on-chain
  attestation streak, mETH and USDY verified, a public verify-hash endpoint. Goal: prove the
  primitive and seed integrators with free reads.
- **Phase 1: single-asset paid pilot.** One real issuer (USDY-class) paying for repeated, monitored
  attestations through `/request`. Goal: first revenue and a reference customer. This is the
  Stage-0-to-Stage-1 jump named in MARKET-READINESS.md.
- **Phase 2: asset-adapter library + attestor network.** A library of asset adapters and an opened,
  bonded multi-attestor set so verification is decentralized rather than operator-run. Goal: remove
  the Bombe team from the critical path of onboarding a new asset.
- **Phase 3: the messy market.** Tokenized **private credit** (Maple, Centrifuge, Goldfinch and
  successors), where over $10B has been originated on-chain, reporting is opaque by the industry's
  own admission, and the consumer of a risk signal is a smart contract that cannot read a PDF. The
  same attest / abstain / dispute machinery, retooled from oracle-fetching to document
  reconciliation. This is the large prize; mETH and USDY are the calibration environment, not the
  market.

**Distribution advantages:** Mantle-native assets (mETH, USDY) put Bombe where the RWA liquidity
already is, and agent-native access (MCP, llms.txt, x402) makes Bombe reachable by the fastest-growing
class of consumer without a sales motion.

## 5. Market

Tokenized real-world assets have grown into the tens of billions of dollars on-chain and are among
the fastest-growing segments in crypto, with major institutions (BlackRock's BUIDL, Franklin
Templeton, Ondo) issuing on-chain. Every one of those instruments makes yield and cashflow claims
that someone downstream has to trust. The verification and attestation slice of that market is
unclaimed by a reasoning-native, vertical RWA player. On-chain private credit alone has originated
more than $10B cumulatively and is structurally the hardest to verify, which is precisely where a
document-reconciling attestor is most valuable.

## 6. Competitive position

- **UMA (optimistic oracle):** owns the bond-and-dispute mechanism, but is general-purpose and
  human-proposer-driven, and has publicly concluded AI cannot yet independently resolve markets.
  Bombe is vertical (RWA), uses AI to gather and a deterministic reconciler to decide, and is built
  around the abstain-on-judgment rule UMA's own research points toward.
- **Allora (decentralized inference) and Chainlink (data):** Allora scores general model
  predictions; Chainlink delivers data but does not reconcile claims against it. Bombe renders
  judgment over data for a specific vertical, with a verifiable trace.
- **The moat** is the combination, not any one piece: vertical RWA focus, contract-enforced
  refusal-to-value (genuinely novel), Mantle-native distribution, agent-native access, and outputs
  any stranger can recompute. The primitive is replicable; the focused, honest packaging on Mantle is
  the wedge.

## 7. The next 90 days

1. Close the Stage-1 pilot: one issuer paying for repeated USDY-class attestations through `/request`.
2. Open a second live, bonded attestor so the network is not single-operator.
3. Ship two more asset adapters to prove the adapter pattern beyond mETH and USDY.
4. Publish the attestation schema as an ecosystem-standard intake so issuers and agents can integrate
   without bespoke work.
5. Begin the private-credit document-reconciliation prototype against one public servicer report.
