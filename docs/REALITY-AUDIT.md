# Reality audit, what is real vs mock

An honest, current inventory of every part of Bombe: what runs for real on live data
and on-chain, what is partial, and what is still mock/scripted/fixture, with the path
to making each real. Updated 2026-06-08. The rule: never claim in copy what this file
marks partial or mock.

## Real (live, on-chain, not mock)

- **Contracts.** Four contracts deployed + verified on Mantle Sepolia (5003). `postClaim`,
  `attest`, the Tier-3 abstain revert, slashing, and the leaderboard are real Solidity,
  deep-tested + fuzzed.
- **Open source resolver.** `LiveDataSource` resolves an `AssetSpec` over a pluggable
  scheme registry (`source-registry.ts`): a new asset within a known scheme (defillama,
  mantle-meth-api) is pure data; a new kind of source is one new fetcher. The featured
  set is real and live: mETH, USDY, sUSDe (Ethena on Mantle), BUIDL, OUSG (tokenized US
  Treasuries). Each leg records its auditable source URL in the trace.
- **mETH: two real computation paths.** mETH reconciles a DefiLlama aggregator
  (pricePerShare-derived) leg against the Mantle protocol API (METHtoETH rate +
  reported APY) leg, resilient if one source is down. One ground truth, two
  computation paths, both live.
- **Discovery.** `GET /api/v1/discover` (+ MCP `bombe_discover_assets`) enumerates the
  live DefiLlama yield/RWA universe as ready-to-attest descriptors; any descriptor can
  be attested via the open `spec` on `POST /api/v1/request`. The scope is any RWA yield,
  not a fixed list.
- **Provenance graph.** Each attestation's trace carries a `provenance` DAG
  (source -> evidence -> reconcile -> verdict, with source URLs) so a verifier can walk
  the reasoning. It is part of the canonical trace, so it is covered by `reasoningHash`.
- **Deterministic verdict.** `decideTier1` is real arithmetic (reconcile, compare to the
  asserted value). The verdict is never a model's opinion.
- **Real LLM reasoning.** `narrate.ts` has a real model (gpt-oss:20b via the AI gateway)
  reason over the fetched evidence and write the train of thought + rationale, citing the
  source URLs. Verified live (e.g. mETH-REQ-198c85eb4b). No templates in the live path.
- **Trace storage + verify.** Traces persist on Neon; `/verify` re-derives
  keccak256(canonicalJson(trace)) and compares to the on-chain reasoningHash. Real,
  stranger-checkable.
- **Self-serve paid flow.** Pay from your own wallet -> payment verified on-chain -> the agent
  posts + attests + stores the trace -> returns a verifiable claim. Real, end to end.
- **Public API + MCP + SKILL.** Keyless read/verify/request endpoints; an MCP server an agent
  can call headlessly. Real.
- **Daily streak.** A real daily on-chain attestation per asset, with periodic self-tests.
- **Redis cache, Neon persistence.** Real.

## Partial (real but not the full claim yet)

- **Issuer-specified ("unverified") sources are accepted but not independently vetted.**
  The open `spec` path attests any source an issuer supplies; the verdict + provenance are
  real and rerunnable, but a `verified:false` source's trustworthiness is the issuer's, not
  Bombe's. Labeled as such. The featured set is the curated/verified showcase.
- **Single attestor, single run, not "triple-run".** The live attestation is one
  deterministic computation posted by one attestor (Reflector). The "single-model triple-run
  redundancy" and the three reference agents (Reflector/Rotor/Stator) are the demo/benchmark,
  not the live verdict. Path to real: run the computation N times / N attestors and require
  agreement, or be explicit that live is single-attestor.
- **Leaderboard live numbers.** The leaderboard reads `lifetimeStats`, which are only
  populated by settlement (`settleTier1`). Settlement is not automated, so live lifetime stats
  can be empty/zero. Path to real: automate settlement against ground truth, or surface the
  raw attestation history instead of settled stats.
- **Source links.** The trace cites the DefiLlama chart URL (real). On-chain reads do not yet
  carry an explorer link in the leg. Path to real: add the contract+method URL to each leg
  (part of the source registry below).

## Mock / scripted / fixture (by design or not-yet-real)

- **The /live race view (A->D) is scripted.** It is an SSE replay of the §6.7 demo sequence
  (the four canonical claims, all five attestors including Plugboard and Human), not live
  events. It is the deterministic demo/fallback, clearly the showcase path, not live data.
- **The five-attestor field (Rotor, Stator, Plugboard, Human) is demo-only.** Live claims have
  only Reflector. Rotor/Stator are agent configs exercised in the demo/benchmark; Plugboard
  (external runtime) and the Human queue are simulated in the demo. The contract-enforced
  Tier-3 revert is real, but Plugboard's live participation is not.
- **The agent ReAct loop + tool catalog (feeds/chain-compute/doc-history) read fixtures in
  tests.** The loop is a real LLM ReAct loop (benchmarked against a real model), but the live
  verdict path uses the deterministic `decideTier1` + the live data layer, not this loop. The
  fixture-backed tools are for deterministic tests.
- **Document verification (Tier-2) is fixture-only.** `read_document` / `cross_check_history`
  exist over fixtures; no live Tier-2 attestation over a real fetched document yet.
- **The human attestor is simulated** (seeded latency), used only in the demo.
- **Mainnet is intentionally not deployed.** `DeployMainnet.s.sol` is compile-only/guard-inert
  (an empty mainnet registry would be signaling theater).

## Make-it-real backlog (priority order)

1. ~~**Source registry / `IAssetAdapter`.**~~ DONE: the open scheme registry +
   discovery + provenance graph (`source-registry.ts`, `discover.ts`, D20).
2. ~~**mETH on-chain second leg.**~~ DONE: mETH reconciles a DefiLlama leg against the
   Mantle protocol API leg (two computation paths, resilient).
3. **Tier-2 document verification** over a real document source.
4. **Settlement automation** so the leaderboard/slashing run live.
5. **Multi-attestor / N-run** so redundancy is real, or relabel live as single-attestor.
6. **Live /live** (real event stream) instead of the scripted replay.
7. **`custom-http` scheme** (the any-URL issuer lane), always labeled unverified.

These are tracked in docs/V3-BACKLOG.md. The constitution rule still holds: understate, and
never write a claim in copy that this audit marks partial or mock.
