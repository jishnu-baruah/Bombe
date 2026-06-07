# Open source resolver, scope to attest any RWA yield

Status: building (2026-06-08). Decision record: D20 in `docs/DECISIONS.md`.

## Why

A hand-curated allowlist of a few verifiable pools is a demo, not a product. RWA is
many schemes, many assets, and new assets arriving constantly. Bombe must have the
*scope* to attest any of them without a code change per asset. The thesis is
unchanged: the verdict stays a deterministic reconciliation a verifier can rerun, and
every source is auditable. Only the *source space* opens up.

## Model

An attestable asset is no longer a fixed enum. It is an `AssetSpec`: a symbol plus one
or more `SourceDescriptor`s and an honest label.

```
SourceDescriptor = {
  scheme:  SourceScheme   // HOW to fetch: "defillama" | "mantle-meth-api" | "custom-http"
  ref:     string         // WHICH one: a DefiLlama poolId, an API URL, a contract address
  kind:    "pricePerShare" | "reportedApy"
  legName: string
  label?:  string
}

AssetSpec = {
  symbol:  string         // open: "mETH", "rETH", "ISSUER-XYZ-NOTE"
  name?:   string
  sources: SourceDescriptor[]
  independenceLabel: string
  verified: boolean       // featured/curated vs issuer-specified
  chain?:  string
}
```

- **scheme** = a pluggable adapter. A genuinely new *kind* of source is one new fetcher
  (~30 lines) registered in `SCHEME_FETCHERS`. Everything else is data.
- **ref** = identifies the specific source. A new *asset* within a known scheme is pure
  data and can come from the issuer's request itself: **zero code for a new token.**
- **verified** distinguishes the curated showcase (auto-attested on the streak) from
  issuer-specified sources (accepted, attested, labeled "verify the ref").

## Schemes (today)

- `defillama` — reads `https://yields.llama.fi/chart/{poolId}`; pricePerShare-windowed
  or reported-APY. Covers the whole DefiLlama yield/RWA universe.
- `mantle-meth-api` — reads `https://meth.mantle.xyz/api/stats/apy` for the live
  `METHtoETH` rate + `OneDay/Week/MonthAPY`. This is mETH's real second computation
  path (folds in the old "mETH second leg"); proves the registry is not DefiLlama-only.
- `custom-http` (later) — the any-URL lane: an issuer-supplied endpoint + a JSON path,
  always labeled UNVERIFIED, never on the verified streak.

## Featured set (verified=true)

`mETH` (two sources: defillama + mantle-meth-api, "one ground truth, two computation
paths"), `USDY`, `sUSDe` (Ethena on Mantle), `BUIDL`, `OUSG`. Mantle-native RWA first.
`cmETH` is deferred until a clean restaking-APR source exists (no garbage data).

## Discovery

`discoverAssets(filter)` enumerates the live universe (DefiLlama `/pools`, filterable by
chain / project / category / minTvl) and returns ready-to-attest descriptors. Surfaced
at `GET /api/v1/discover` and via the MCP `bombe_discover_assets` tool. "New assets
coming up" are in scope the moment any source lists them.

## Provenance graph (auditability)

Each attestation's trace carries a `provenance` DAG so the reasoning is walkable, not
just prose:

- nodes: each `SourceDescriptor` (with its `ref` URL), each fetched evidence value
  (valueBps + window), the reconciliation node, the verdict node (decision +
  reasoningHash).
- edges: descriptor → evidence → reconcile → verdict.

A verifier walks the graph from the verdict back to each source URL. With multiple
sources/schemes per asset, the graph branches, and the cross-check (agreement within
tolerance, or ABSTAIN) is visible at the reconcile node. The graph is part of the
canonical trace, so it is covered by `reasoningHash` and re-derivable at `/verify`.

A scope visualization (assets ↔ schemes ↔ sources) on the site renders the same graph
shape at the network level to *show* the breadth.

## Safety / honesty (unchanged)

- The verdict is the deterministic reconciler over evidence values; never a model.
- The word "independent" is never used for sources that share one ground truth.
- `windowDays` is always displayed; a short window is never called "30-day yield".
- Issuer-specified (`verified=false`) sources are always labeled as such.
- Adding an asset adds zero attack surface to the contract or the reconciler; it is
  data fed to the same deterministic path.
