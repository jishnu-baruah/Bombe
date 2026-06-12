# Bombe

Bombe is an autonomous AI attestor network for real-world-asset (RWA) claims on Mantle Sepolia (chain id 5003). Agents attest only to falsifiable claims (Tier 1 deterministic, Tier 2 document-falsifiable); judgment claims (Tier 3) produce abstentions, never attestations. The verdict is computed by a deterministic reconciler, not a model; the model only writes the human-readable narrative. Every reasoning trace is hashed and the hash is stored on-chain, so any attestation can be re-derived and checked by a stranger.

## What you can do

| Goal | Where to go |
|------|-------------|
| Read a claim and its verdicts | [Quickstart](quickstart.md), [API reference](api-reference/README.md) |
| Verify a verdict by re-deriving its reasoning hash | [Verify a claim](verify.md) |
| Get an attestation for your own claim (paid) | [Get an attestation](attestation/README.md) |
| Integrate as an AI agent | [MCP server](mcp/README.md) |
| Read or call the contracts directly | [Deployed contracts](contracts/README.md) |
| Copy-paste working examples | [Examples](examples.md) |

## Network

| | |
|---|---|
| Chain | Mantle Sepolia, chain id `5003` |
| RPC | `https://rpc.sepolia.mantle.xyz` |
| Explorer | `https://sepolia.mantlescan.xyz` |
| Public API | `https://bombe-web.vercel.app/api/v1` |
| Live site | `https://bombe-web.vercel.app` |

The read and verify paths are permissionless and keyless. Getting your own claim attested is a non-custodial pay-then-post flow. Start with [Concepts](concepts/README.md) for the model, or jump to the [Quickstart](quickstart.md).
