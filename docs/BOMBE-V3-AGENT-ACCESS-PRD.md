# Bombe v3 proposal: the agent-access layer

**Status:** proposal for external council review. Not yet locked.
**Date:** 2026-06-07
**Companion docs:** MARKET-READINESS.md (honest baseline), BOMBE-V2-PRD.md (the running service that v2 shipped), INTEGRATION.md (current read path).

## 0. One-paragraph summary

Bombe v2 made Bombe a running service: real data, deterministic verdicts, both flagship assets
attested on-chain daily, four verified contracts, and a permissionless read path. What v2 does not
have is a way for other agents to use Bombe without writing viem by hand. v3 proposes the
agent-access layer: a public read API with an OpenAPI spec, an MCP server so any agent runtime can
call Bombe as a tool, a Bombe skill file for discovery, durable trace storage so the verify-the-hash
story works for live attestations, permissionless attestation requests paid on-chain (with x402 as a
clearly-scoped optional seam), and ERC-8004 Validation Registry alignment because Bombe already is a
validation primitive. v3 also makes adding new asset types cheap, which today requires editing core
enums. None of this changes the v2 trust model; it exposes it.

## 1. Context and velocity (so ETAs are calibrated, not guessed)

In roughly 36 hours the team shipped v2 end to end: a live cross-checked data layer, a deterministic
reconciler that issues the verdict (not a model), evidence-consensus, a daily unattended on-chain
streak with self-tests, two real-data headline attestations on Mantle Sepolia with on-chain reasoning
hashes equal to the locally computed hashes, four contracts verified on Mantlescan, and the full
public docs set. That is the velocity the ETAs below are scaled to. Treat the day estimates as
"focused build days at the v2 pace," and assume we can change, upgrade, or replace any v2 piece if v3
needs it; nothing here is constrained by what already exists.

## 2. Current working state (ground truth, what an agent can and cannot do today)

What an external agent can do **today**, with no help from us:

- **Read any verdict, permissionlessly.** The four contracts expose public view functions:
  `getClaim`, `getClaimAttestors`, `getAttestation`, `attestorCount` (AgentAttestation);
  `trustScore`, `lifetimeStats` (TuringLeaderboard); `isRegistered`, `getAgent` (AgentRegistry). An
  agent reads a verdict with `getClaimAttestors(claimId)` then `getAttestation(claimId, attestor)`.
  This works now and is documented in the README consumer quickstart and INTEGRATION.md.
- **See a live, daily, on-chain track record.** The daily workflow posts a real attestation per asset
  (mETH, USDY) and the on-chain history is the streak.

What an agent **cannot** do today (the gaps v3 closes):

- **Call Bombe as a tool.** There is no public REST API, no OpenAPI spec, and no MCP server. The only
  read interface is raw contract calls; the only HTTP surfaces are the internal tool-gateway
  (`POST /tools/:name`, used by our own SDK agents to gather evidence) and the web app's
  operator-only routes plus a trace-serving route.
- **Verify a live attestation's reasoning.** The on-chain `reasoningHash` exists, but live
  attestations currently write a placeholder `traceURI` and the trace is not durably stored or
  served, so a third party cannot fetch the trace to recompute the hash for a live claim. The
  verify-the-hash story is complete for the fixtures path and incomplete for the live path. This is
  the most important correctness gap for agent trust.
- **Request an attestation.** Posting a claim is operator-gated (`postClaim` is `OPERATOR_ROLE`).
  There is no way for an agent to ask Bombe to attest a new claim, paid or unpaid.
- **Discover Bombe.** There is no Bombe skill file, no `.well-known` manifest, and no ERC-8004
  identity. Plugboard ships a Hermes skill file, but that is Bombe acting as an attestor elsewhere,
  not Bombe being discoverable as a service.

### 2.1 Feature working-state table

| Feature | What it does | State | Needs |
|---|---|---|---|
| Permissionless verdict reads | getClaimAttestors + getAttestation | WORKING | nothing (contract reads) |
| Trust score / stats reads | trustScore, lifetimeStats | WORKING | nothing |
| Verify hash (fixtures) | recompute keccak(canonicalJson(trace)) vs on-chain | WORKING | nothing |
| Verify hash (live) | same, for a live attestation | NOT BUILT | platform: durable trace storage + a public trace endpoint |
| Daily on-chain streak | unattended daily attestation per asset | WORKING | nothing (keep funded) |
| Public read REST API + OpenAPI | HTTP wrapper over the reads | NOT BUILT | platform |
| MCP server | read_verdict / verify_trace / list_assets / request_attestation as agent tools | NOT BUILT | platform |
| Bombe skill file | discovery + instructions for Hermes / Claude agents | NOT BUILT | platform (cheap; reuse Plugboard) |
| Request an attestation (agent-initiated) | an agent asks Bombe to attest a claim | NOT BUILT | contract: open posting + anti-spam; platform: the request endpoint |
| Pay for an attestation | agent pays a fee per request | PARTIAL | contract has CLAIM_FEE; platform: expose it / x402 |
| Add a new asset or claim type | onboard a new RWA | HARD (code change to closed enums) | platform + contract: an adapter/registry |
| ERC-8004 validation provider | register as an on-chain validator | NOT BUILT | contract (deploy/registry) + platform |

## 3. The agent-access surfaces (what to build, ranked by impact)

### 3.1 Public read API with an OpenAPI spec (foundation, build first)

A small HTTP service (the existing Hono stack fits) exposing the read path as JSON, with a published
OpenAPI document:

- `GET /assets`: the supported assets and their current claim shapes.
- `GET /attestations/latest?asset=mETH`: the latest verified attestation (verdict, confidence,
  windowDays, reasoningHash, traceURI, attestor, tx).
- `GET /claims/{claimId}` and `GET /claims/{claimId}/attestations`: by claim.
- `GET /verify/{claimId}`: recompute and compare the reasoning hash server-side, returning match
  plus both hashes (the agent can still verify itself; this is a convenience).

Every other surface (MCP handlers, skill scripts, A2A tasks) is thin glue over this. OpenAPI is also
directly agent-consumable. **Needs:** platform only (wraps existing contract reads + trace storage).
**State:** not built. **Effort:** about 1 to 2 days.

### 3.2 MCP server (highest agent reach)

Model Context Protocol is the de-facto agent tool standard, consumed natively by Claude, Cursor, and
most runtimes with zero per-client glue. Expose four tools, each wrapping the read API:

- `list_assets()`: what can be attested.
- `read_verdict({claimId})`: verdict + reasoningHash. Permissionless, trivial.
- `verify_trace({claimId})`: recompute the hash from the served trace and compare to on-chain. Pure
  verification, no key.
- `request_attestation({asset, assertedValue, ...})`: the only tool that costs money and writes
  on-chain (sections 3.4, 3.5).

**Caveat for the council:** MCP recommends human-in-the-loop confirmation for tool calls; fully
autonomous paid calls depend on the host disabling that, which we cannot assume. The read and verify
tools are unaffected. **Needs:** platform. **State:** not built. **Effort:** about 1 to 2 days for
the read/verify tools; the paid tool inherits sections 3.4 and 3.5.

### 3.3 Bombe skill file (cheap discovery, reuse Plugboard)

A `SKILL.md` with the standard `name` plus `description` frontmatter (the format converged across
Anthropic Claude Agent Skills, the Hermes runtime, and agentskills.io, all of which we already author
for Plugboard). The body instructs an agent when and how to call Bombe's API or MCP server, installed
on Hermes by a single URL (`hermes skills install <url>`) and discoverable via
`/.well-known/skills/index.json`. A skill file is the instruction layer, not an endpoint; it must
point at the API or MCP server. **Needs:** platform (cheap). **State:** not built (only Plugboard's
exists). **Effort:** under a day.

### 3.4 Permissionless attestation requests (the gate that blocks agent self-serve)

Today `postClaim` is operator-gated, so an agent cannot ask Bombe to attest anything. v3 opens a
self-serve request path. Two honest options for the council:

1. **Direct on-chain request (recommended baseline).** The agent calls a permissionless
   `requestClaim` on the contract, paying the existing `CLAIM_FEE`, which emits an event Bombe's
   runner watches and then attests. This needs a contract change (open the gate, add anti-spam: a
   minimum fee, a per-sender rate limit or bond, and a tier guard so only supported claim types are
   accepted). Payment is on the same chain as the attestation, no new infrastructure.
2. **Off-chain request via the API, Bombe posts.** The agent calls `POST /attestations` (paid),
   Bombe posts the claim through the operator and attests. No contract change, but Bombe is in the
   loop and it is less trustless.

**Needs:** contract (option 1) or platform (option 2). **State:** not built. **Effort:** about 1 to 3
days for option 1 including the anti-spam design and a redeploy to new addresses (the v2 constitution
freezes the current addresses, so this is a post-freeze change).

### 3.5 Payments: direct CLAIM_FEE first, x402 as an optional second seam

The 2026-native answer for autonomous machine payment is x402 (HTTP 402 plus a signed payment header
and a facilitator that settles a stablecoin gaslessly via EIP-3009). The hard truth from research:
**no hosted x402 facilitator supports Mantle, and there is no confirmed EIP-3009 stablecoin on Mantle
Sepolia.** Real x402 on Mantle today means self-hosting a facilitator and likely deploying our own
EIP-3009 test token. The Mantle Turing Test Hackathon does not list x402 as official tooling.

Therefore:

- **Baseline (recommended):** the agent pays the on-chain `CLAIM_FEE` directly (section 3.4 option 1).
  Zero facilitator, zero new token, payment on the same chain as the attestation. This is strictly
  simpler than x402 on Mantle today.
- **Optional x402 seam:** if we want the agentic-economy narrative, add a `402`-gated
  `request_attestation` HTTP endpoint backed by a self-hosted facilitator (`@x402/hono` server,
  `x402-rs` facilitator) configured for chain 5003 and a token we deploy. Label it honestly: we built
  the Mantle facilitator because none exists. **Effort:** about 2 to 4 days, with real risk on
  EIP-3009 correctness and facilitator gas relaying, both unproven on Mantle.

**Needs:** contract (baseline) or platform plus new infra (x402). **State:** not built.

### 3.6 Durable trace storage (closes the live verify gap, do this early)

For an agent to trust a verdict, it must fetch the reasoning trace and recompute the hash. Live
attestations currently store a placeholder `traceURI`. v3 stores each trace durably (a blob store or
IPFS) and serves it at the `traceURI`, so `verify_trace` works for live claims, not just fixtures.
This is small but is a prerequisite for the whole "verify, do not trust" pitch to hold on the live
path. **Needs:** platform (a storage token, already an open operator item). **State:** not built.
**Effort:** under a day once a storage credential exists.

### 3.7 ERC-8004 Validation Registry alignment (positioning, higher effort)

ERC-8004 (Trustless Agents) defines on-chain Identity, Validation, and Reputation registries.
Bombe's verdict model is an almost-exact fit for the Validation Registry: a `validationRequest`
followed by a `validationResponse` carrying a 0 to 100 score plus a `responseURI` and `responseHash`
mirrors Bombe's verdict plus reasoning hash. Registering Bombe as a validation provider would place it
inside the emerging trustless-agent standard. **Caveat:** ERC-8004's official registries are on
Ethereum, Base, Polygon, Monad, and BNB, not Mantle, so this means deploying the registries on Mantle
or operating cross-chain, and the standard is young, so this is a credibility and standards play more
than a near-term traffic source. **Needs:** contract (deploy registries on Mantle) plus platform.
**State:** not built. **Effort:** several days; defer behind the read API, MCP, and trace storage.

### 3.8 Lower priority: A2A agent card, .well-known manifests

An A2A agent card (`/.well-known/agent-card.json`) matters only once Bombe is delegated to as a peer
agent rather than called as a tool. Cheap to add once the endpoints exist; not a traffic driver on
its own. Same for `agents.json`. Add as a thin layer late.

## 4. Extensibility: how easy is it to add a new asset or verification?

**Today: hard.** The claim model is a closed enum: three assets (`mETH`, `USDY`, `PC-POOL-1`) and five
claim types, each bound to a fixed verification tool set. Adding a new RWA means editing core enums, a
tier map, a tool map, and usually a new tool, plus a DataSource leg. This is the central finding of
MARKET-READINESS.md and it directly limits how many issuers and agents Bombe can serve.

**Proposed: an asset-adapter registry.** Introduce an `IAssetAdapter` interface (declare the claim
types, the data source legs, the comparison and tolerance, the tier) so adding an asset becomes
registering a declarative spec plus a small adapter, not a core change. The honest ceiling, restated:
a system that verifies anything either trusts the issuer or hallucinates; the adapter makes adding a
*sound* verification rule cheap, and the conservative default (abstain when we cannot falsify) is what
keeps generalization safe. This is the single most valuable extensibility investment and unlocks the
agent and issuer breadth everything else assumes. **Effort:** a few days for the interface plus
migrating the existing assets onto it.

## 5. Who does what: platform vs contract vs user-provided

| Capability | Platform (we build/host) | Contract (on-chain change) | User/operator provides |
|---|---|---|---|
| Read API + OpenAPI | yes | no | hosting |
| MCP server | yes | no | hosting |
| Skill file | yes | no | nothing |
| Trace storage + verify | yes | no | a storage token |
| Read a verdict (agent side) | no | existing reads | nothing |
| Request an attestation (self-serve) | the endpoint | open posting + anti-spam (redeploy) | nothing |
| Pay per attestation (direct) | expose it | existing CLAIM_FEE | the agent funds its wallet |
| Pay per attestation (x402) | facilitator + middleware | a deployed EIP-3009 token | a relayer funded with MNT |
| ERC-8004 validation | the integration | deploy registries on Mantle | nothing |
| New asset/claim type | the adapter + data source | maybe a tool; redeploy if claim-type | the data source reference |

## 6. Proposed scope and phasing (with ETAs at v2 velocity)

- **Phase 1, make Bombe callable (about 3 to 5 days):** durable trace storage and the live verify
  endpoint (3.6); the public read API plus OpenAPI (3.1); the MCP server read and verify tools (3.2);
  the Bombe skill file (3.3). Outcome: any agent can discover, read, and verify a Bombe attestation
  through standard interfaces, and the verify-the-hash story holds on the live path.
- **Phase 2, make Bombe requestable (about 3 to 5 days):** permissionless on-chain `requestClaim`
  with anti-spam, paid by the existing CLAIM_FEE, redeployed to new addresses (post the v2 freeze);
  the `request_attestation` MCP tool and API endpoint on top. Outcome: an agent can pay and ask Bombe
  to attest a new claim, end to end, on-chain.
- **Phase 3, breadth and standards (about 1 week):** the asset-adapter registry (section 4) to make
  new assets cheap; ERC-8004 Validation Registry alignment on Mantle (3.7); optionally the x402 seam
  (3.5) clearly labeled. Outcome: Bombe scales to more assets and is positioned inside the
  trustless-agent standard.

Non-goals for v3: changing the deterministic verdict model, the contract-enforced abstain, or the
honesty posture. Those are the moat and stay.

## 7. Things I think we should also do

- **Ship a reference consumer agent.** A small agent that uses Bombe through the MCP server to read
  and verify a verdict, published as a demo. It proves agent consumption is real, not theoretical, and
  doubles as a test of the whole surface.
- **A public attestation feed.** `GET /attestations/latest` plus an SSE or webhook stream so an agent
  or a yield engine can subscribe to new verified attestations rather than poll. This is what a DeFi
  protocol consumer (the v2 target customer) actually wants.
- **An OpenAPI-first design.** Write the OpenAPI spec before the handlers so the MCP tools, the skill
  file, and the reference agent all derive from one contract. Cheap discipline, big consistency win.
- **Lead the agent story with the read and verify path, not payments.** The strongest, most honest
  agent pitch is "any agent can read a verdict and re-derive the hash in a few calls." Payments and
  x402 are the flashy part but are the least de-risked on Mantle; do not let them gate the narrative.
- **Be explicit about the human-in-the-loop and trust caveats** (MCP confirmation, the agent funding
  its own wallet, x402's Mantle gap) in the same docs that pitch the agent layer. Consistent with the
  honesty-is-the-moat posture that has worked so far.

## 8. Risks and honest caveats

- x402 on Mantle is not turnkey: no hosted facilitator, no confirmed EIP-3009 stablecoin. The direct
  CLAIM_FEE path avoids all of this; treat x402 as optional and self-built.
- ERC-8004 registries are not deployed on Mantle; alignment means deploying them or going cross-chain.
- MCP recommends human confirmation; fully autonomous paid calls depend on host policy.
- Live trace verification does not work until trace storage ships; until then the verify story is
  fixtures-only on one path. Fix this early.
- Opening `postClaim` removes a safety rail; anti-spam and a tier guard are mandatory, and it requires
  a redeploy to new addresses (the v2 addresses are frozen and their history is an asset).

## 9. Open questions for the council

1. Payments: direct on-chain CLAIM_FEE only for v3, or also the self-built x402 seam for the agentic
   narrative, accepting the Mantle facilitator and token risk?
2. Posting: open `postClaim` on-chain (more trustless, needs a redeploy and anti-spam), or keep Bombe
   in the loop via a paid API endpoint (no redeploy, less trustless)?
3. ERC-8004: deploy the registries on Mantle to align Bombe as a validation provider, or defer until
   the standard and Mantle support mature?
4. Surface priority: is "callable and verifiable by any agent" (Phase 1) the right first milestone, or
   does the council want requestable-and-paid (Phase 2) pulled forward for the agentic-economy framing?
5. Extensibility: is the asset-adapter registry worth doing in v3, given it is the unlock for breadth
   but also the largest single piece?
