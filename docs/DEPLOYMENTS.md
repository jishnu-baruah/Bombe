# Deployments

## Mantle Sepolia (chain id 5003) — 2026-06-06

RPC: `https://rpc.sepolia.mantle.xyz` · Explorer: https://sepolia.mantlescan.xyz
Deployer / operator: `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83`
Timing: `epochSeconds=300`, `disputeWindowSeconds=60` (demo values). Roles wired per D14.

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x7F0375C8d412d8709c6438C3671d90E71158EbF4`](https://sepolia.mantlescan.xyz/address/0x7F0375C8d412d8709c6438C3671d90E71158EbF4) |
| AgentAttestation | [`0x29528382C06ea3f90585Ef5c7820b3DefD007C5D`](https://sepolia.mantlescan.xyz/address/0x29528382C06ea3f90585Ef5c7820b3DefD007C5D) |
| AgentSlashing | [`0x48216108eFeEfa1e244150376918644aA63C6092`](https://sepolia.mantlescan.xyz/address/0x48216108eFeEfa1e244150376918644aA63C6092) |
| TuringLeaderboard | [`0xc415F90C8eA8B2bE449332d4Cead30be498DCa81`](https://sepolia.mantlescan.xyz/address/0xc415F90C8eA8B2bE449332d4Cead30be498DCa81) |

### Registered attestors (each bonded 0.1 MNT)

| Attestor | Address | Type |
|----------|---------|------|
| Reflector | `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` | AI (SDK) |
| Rotor | `0x5e90bd4E238C2cE66D41B6c86f39B791441e69A7` | AI (SDK) |
| Stator | `0x3c8612D5d13636De52492c8Dfa84b455064C8bf8` | AI (SDK) |
| Human | `0x98fAb4C835475C95C797aAee9CE0C03942a524C6` | Human (`registerHuman`) |
| Plugboard | `0x58826a9FCb6956332D0833b9175CE40A7587957e` | External (Hermes) |

Status: T-J01 done (4 contracts live + 5 attestors registered). Next: T-J02 (explorer verification), T-J03 (live LLM-driven `attest()` tx).
Keys live only in `.env.local` (gitignored). The originally-supplied RPC `rpc.testnet.mantle.xyz` was dead; the working endpoint is `rpc.sepolia.mantle.xyz`.
