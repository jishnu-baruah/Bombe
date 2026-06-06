# Deployments

## Mantle Sepolia (chain id 5003) — 2026-06-06 (NEW deployment with fee model, T-J01)

RPC: `https://rpc.sepolia.mantle.xyz` · Explorer: https://sepolia.mantlescan.xyz
Deployer / operator: `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83`
Timing: `epochSeconds=300`, `disputeWindowSeconds=60` (demo values). Roles wired per D14.
Contract model: `CLAIM_FEE=0.01 MNT` on `postClaim`, `ATTEST_LOCK=0.02 MNT` on VALID/REJECTED attestations.

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x0cB936d55eB3CADF0C8984F8adAEd180734C7246`](https://sepolia.mantlescan.xyz/address/0x0cB936d55eB3CADF0C8984F8adAEd180734C7246) |
| AgentAttestation | [`0xf2473a0a55D997233C8fBF987c197e7d2180470A`](https://sepolia.mantlescan.xyz/address/0xf2473a0a55D997233C8fBF987c197e7d2180470A) |
| AgentSlashing | [`0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864`](https://sepolia.mantlescan.xyz/address/0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864) |
| TuringLeaderboard | [`0xE5A157c349A6540C300D6CEcbe391A81EEEec018`](https://sepolia.mantlescan.xyz/address/0xE5A157c349A6540C300D6CEcbe391A81EEEec018) |

### Registered attestors (each bonded 0.1 MNT)

| Attestor | Address | Type |
|----------|---------|------|
| Reflector | `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` | AI (SDK) |
| Rotor | `0x5e90bd4E238C2cE66D41B6c86f39B791441e69A7` | AI (SDK) |
| Stator | `0x3c8612D5d13636De52492c8Dfa84b455064C8bf8` | AI (SDK) |
| Human | `0x98fAb4C835475C95C797aAee9CE0C03942a524C6` | Human (`registerHuman`) |
| Plugboard | `0x58826a9FCb6956332D0833b9175CE40A7587957e` | External (Hermes) |

Status: T-J01 done (4 contracts live + 5 attestors registered). T-J03 done (live LLM-driven `attest()` tx — see below).
Keys live only in `.env.local` (gitignored). The originally-supplied RPC `rpc.testnet.mantle.xyz` was dead; the working endpoint is `rpc.sepolia.mantle.xyz`.

---

## T-J03 Live Attest — 2026-06-06

**Proof: AI inference → on-chain attestation (Mantle Sepolia).**

Script: `scripts/live-attest.ts` (`pnpm live:attest`)

| Field | Value |
|-------|-------|
| Claim ID | `J03-YIELD-1780730720` |
| Claim type | `YIELD_BPS` (tier 1, mETH 30d yield) |
| postClaim tx | [`0x608eb32ca56dba54989b9dec4bc83de266fc791a273d441f2acdcdd91302d369`](https://sepolia.mantlescan.xyz/tx/0x608eb32ca56dba54989b9dec4bc83de266fc791a273d441f2acdcdd91302d369) |
| LLM (agent) | Reflector / `gpt-oss:20b` via Ollama Cloud |
| LLM decision | **ABSTAIN** (STEP_BUDGET — 8 steps exhausted; no finalize) |
| Confidence | 0 bps |
| Latency | 20 437 ms |
| Tokens | 31 512 in / 1 633 out |
| attest tx | [`0xa20c3362062ffdfbd20179c3229ba08339f577e421b710bf60076ae63d7ada4d`](https://sepolia.mantlescan.xyz/tx/0xa20c3362062ffdfbd20179c3229ba08339f577e421b710bf60076ae63d7ada4d) |
| on-chain `reasoningHash` | `0x156a5ff50cb214ea37b8feca78326b3c4f8499ee4ed82b70a64d12391d2fc4b4` |
| local `hashCanonical(trace)` | `0x156a5ff50cb214ea37b8feca78326b3c4f8499ee4ed82b70a64d12391d2fc4b4` |
| Hash match | **MATCH** |
| Attestor (Reflector) | `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` |

Note: ABSTAIN is a valid on-chain AI attestation — the proof is "AI inference → on-chain tx", not a specific VALID/REJECTED decision. `ATTEST_LOCK=0 MNT` for ABSTAIN per contract spec. The `reasoningHash` of the actual live trace is stored on-chain and matches the local `keccak256(canonicalJson(trace))` computation.
