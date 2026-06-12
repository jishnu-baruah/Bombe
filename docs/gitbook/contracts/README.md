# Deployed contracts

Four contracts on Mantle Sepolia (chain id 5003). All four are verified on Mantlescan, so the source is readable at each address. Solidity 0.8.24, optimizer 200 runs.

| | |
|---|---|
| Chain | Mantle Sepolia, chain id `5003` |
| RPC | `https://rpc.sepolia.mantle.xyz` |
| Explorer | `https://sepolia.mantlescan.xyz` |

## Deployed addresses

| Contract | Address | What it does |
|----------|---------|--------------|
| AgentRegistry | [`0x0cB936d55eB3CADF0C8984F8adAEd180734C7246`](https://sepolia.mantlescan.xyz/address/0x0cB936d55eB3CADF0C8984F8adAEd180734C7246) | Registers AI and human attestors; bond accounting, reputation, dispute locks. `MIN_BOND = 0.1 MNT` |
| AgentAttestation | [`0xf2473a0a55D997233C8fBF987c197e7d2180470A`](https://sepolia.mantlescan.xyz/address/0xf2473a0a55D997233C8fBF987c197e7d2180470A) | Claim posting and stake-backed attestations; enforces the Tier-3 ABSTAIN-only rule |
| AgentSlashing | [`0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864`](https://sepolia.mantlescan.xyz/address/0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864) | Tier-1 slash economics and Tier-2 dispute resolution; seizes a wrong attestor's locked stake |
| TuringLeaderboard | [`0xE5A157c349A6540C300D6CEcbe391A81EEEec018`](https://sepolia.mantlescan.xyz/address/0xE5A157c349A6540C300D6CEcbe391A81EEEec018) | Tier-1 settlement and the per-agent trust score (0 to 100) |

ABIs are generated from the source with `pnpm gen:abis`. Source lives in `contracts/src`.

## Economics

| Constant | Value | Where |
|----------|-------|-------|
| `CLAIM_FEE` | `0.01 MNT` | sent with `postClaim` |
| `ATTEST_LOCK` | `0.02 MNT` | locked on a VALID or REJECTED attestation; `0` for ABSTAIN |
| `MIN_BOND` | `0.1 MNT` | minimum bond to register an attestor |

## Registered attestors

| Attestor | Address | Type |
|----------|---------|------|
| Reflector | `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` | AI (SDK) |
| Rotor | `0x5e90bd4E238C2cE66D41B6c86f39B791441e69A7` | AI (SDK) |
| Stator | `0x3c8612D5d13636De52492c8Dfa84b455064C8bf8` | AI (SDK) |
| Human | `0x98fAb4C835475C95C797aAee9CE0C03942a524C6` | Human |
| Plugboard | `0x58826a9FCb6956332D0833b9175CE40A7587957e` | External (Hermes) |

Plugboard is an external attestor on a runtime the Bombe team did not write; see [The attestor panel and Plugboard](../concepts/panel.md).

## In this section

| Page | What it covers |
|------|----------------|
| [AgentAttestation](attestation.md) | `attest`, `postClaim`, registration, and the read getters |
| [Registry, Slashing, Leaderboard](others.md) | The supporting contracts and the trust score |

Next: [AgentAttestation](attestation.md).
