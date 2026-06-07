# Reality audit, what is real vs mock

An honest, current inventory of every part of Bombe: what runs for real on live data
and on-chain, what is partial, and what is still mock/scripted/fixture, with the path
to making each real. Updated 2026-06-07. The rule: never claim in copy what this file
marks partial or mock.

## Real (live, on-chain, not mock)

- **Contracts.** Four contracts deployed + verified on Mantle Sepolia (5003). `postClaim`,
  `attest`, the Tier-3 abstain revert, slashing, and the leaderboard are real Solidity,
  deep-tested + fuzzed.
- **Live data fetch.** `LiveDataSource` fetches the real DefiLlama yield for mETH and USDY
  (real HTTP, real numbers), with the source chart URL recorded in the trace.
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

- **mETH "two computation paths" is currently one path.** The DefiLlama leg is live; the
  second leg (on-chain mETHToETH exchange-rate, computed from scratch) is NOT yet wired
  (`live-source.ts` notes it is "pending sample history"). So today mETH reconciles over a
  single real leg, like USDY. The "one ground truth, two computation paths" claim is the
  target, not the current state. Path to real: implement the on-chain rate leg (read the
  mETH contract rate, annualize from persisted daily samples), then reconcile the two.
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

1. **Source registry / `IAssetAdapter`.** Each asset declares its sources (name, URL, fetch,
   computeBps); the data layer fetches all and reconciles; adding a source/asset is config,
   with auditable links into the trace. Unblocks mETH's second leg + "more RWA types."
2. **mETH on-chain second leg** (the real two-path cross-check).
3. **Tier-2 document verification** over a real document source.
4. **Settlement automation** so the leaderboard/slashing run live.
5. **Multi-attestor / N-run** so redundancy is real, or relabel live as single-attestor.
6. **Live /live** (real event stream) instead of the scripted replay.

These are tracked in docs/V3-BACKLOG.md. The constitution rule still holds: understate, and
never write a claim in copy that this audit marks partial or mock.
