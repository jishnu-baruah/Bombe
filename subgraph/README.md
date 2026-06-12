# Bombe subgraph (the /explorer scaling path)

A The Graph subgraph that indexes the `AgentAttestation` contract on Mantle
Sepolia (chain id 5003) so the `/explorer` page can read a full, ordered history
of claims and attestations without the bounded `eth_getLogs` range of the
no-indexer path.

This is the scaling path. It is **not deployed** from this repo: deploying needs
the operator's Graph account (a deploy key / Subgraph Studio slug). The app reads
it only when `SUBGRAPH_URL` is set, and otherwise falls back to the on-chain
`getLogs` read, so the explorer works today with zero indexer.

## What it indexes

- `ClaimPosted(bytes32 claimId, uint8 tier, bytes32 claimHash, string claimURI, uint256 claimFee)` -> `Claim`
- `Attested(bytes32 claimId, address attestor, uint8 decision, uint16 confidenceBps, uint256 lockedStake)` -> `Attestation`
- `ClaimClosed(bytes32 claimId)` -> marks the `Claim` closed

Entities are defined in `schema.graphql`; handlers in `src/mapping.ts`. The query
shape matches `apps/web/lib/activity.ts` (`fromSubgraph`), so switching the app to
the subgraph is a config change, not a code change.

## Before deploying: set the start block

The deploy block of `AgentAttestation` (deployed 2026-06-06) was not recorded in
`docs/DEPLOYMENTS.md`. Open the contract-creation transaction on the explorer
(<https://sepolia.mantlescan.xyz/address/0xf2473a0a55D997233C8fBF987c197e7d2180470A>),
read the block number, and set `dataSources[0].source.startBlock` in
`subgraph.yaml` to that exact block. The placeholder there is a conservative
recent value so a first index does not scan the whole chain.

## Commands

```bash
# from this directory (subgraph/)
pnpm install                 # graph-cli + graph-ts

# 1. generate AssemblyScript types from schema + ABI
pnpm codegen                 # graph codegen

# 2. compile to wasm
pnpm build                   # graph build

# 3. deploy (operator only; needs a Studio slug + deploy key)
graph deploy <SUBGRAPH_SLUG> \
  --node https://api.studio.thegraph.com/deploy/ \
  --ipfs https://api.thegraph.com/ipfs/ \
  --deploy-key <GRAPH_DEPLOY_KEY>
```

`graph codegen` writes to `generated/` (gitignored); the imports in
`src/mapping.ts` resolve after it runs.

## Wiring the app to the subgraph

Once deployed, set the query URL in the web app's environment:

```
SUBGRAPH_URL=https://api.studio.thegraph.com/query/<id>/bombe/<version>
```

`apps/web/lib/activity.ts` prefers the subgraph when `SUBGRAPH_URL` is set and
falls back to `getLogs` (and Neon-store enrichment) otherwise. No other change is
needed.
