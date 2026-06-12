# Deployments

## Mantle Sepolia (chain id 5003), 2026-06-06 (fee-model deployment)

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

All four contracts are **verified on Mantlescan** (2026-06-07, via the Etherscan v2 multichain API,
solc 0.8.24, optimizer 200 runs). Source is visible at the explorer address pages above.

### Registered attestors (each bonded 0.1 MNT)

| Attestor | Address | Type |
|----------|---------|------|
| Reflector | `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` | AI (SDK) |
| Rotor | `0x5e90bd4E238C2cE66D41B6c86f39B791441e69A7` | AI (SDK) |
| Stator | `0x3c8612D5d13636De52492c8Dfa84b455064C8bf8` | AI (SDK) |
| Human | `0x98fAb4C835475C95C797aAee9CE0C03942a524C6` | Human (`registerHuman`) |
| Plugboard | `0x58826a9FCb6956332D0833b9175CE40A7587957e` | External (Hermes) |

Status: 4 contracts live, 5 attestors registered, live LLM-driven `attest()` tx proven (see below).
Keys live only in `.env.local` (gitignored). The originally-supplied RPC `rpc.testnet.mantle.xyz` was dead; the working endpoint is `rpc.sepolia.mantle.xyz`.

---

## Live attestation proof, 2026-06-06

**Proof: AI inference → on-chain attestation (Mantle Sepolia).**

Script: `scripts/live-attest.ts` (`pnpm live:attest`)

| Field | Value |
|-------|-------|
| Claim ID | `J03-YIELD-1780730720` |
| Claim type | `YIELD_BPS` (tier 1, mETH 30d yield) |
| postClaim tx | [`0x608eb32ca56dba54989b9dec4bc83de266fc791a273d441f2acdcdd91302d369`](https://sepolia.mantlescan.xyz/tx/0x608eb32ca56dba54989b9dec4bc83de266fc791a273d441f2acdcdd91302d369) |
| LLM (agent) | Reflector / `gpt-oss:20b` via Ollama Cloud |
| LLM decision | **ABSTAIN** (STEP_BUDGET, 8 steps exhausted; no finalize) |
| Confidence | 0 bps |
| Latency | 20 437 ms |
| Tokens | 31 512 in / 1 633 out |
| attest tx | [`0xa20c3362062ffdfbd20179c3229ba08339f577e421b710bf60076ae63d7ada4d`](https://sepolia.mantlescan.xyz/tx/0xa20c3362062ffdfbd20179c3229ba08339f577e421b710bf60076ae63d7ada4d) |
| on-chain `reasoningHash` | `0x156a5ff50cb214ea37b8feca78326b3c4f8499ee4ed82b70a64d12391d2fc4b4` |
| local `hashCanonical(trace)` | `0x156a5ff50cb214ea37b8feca78326b3c4f8499ee4ed82b70a64d12391d2fc4b4` |
| Hash match | **MATCH** |
| Attestor (Reflector) | `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` |

Note: ABSTAIN is a valid on-chain AI attestation, the proof is "AI inference → on-chain tx", not a specific VALID/REJECTED decision. `ATTEST_LOCK=0 MNT` for ABSTAIN per contract spec. The `reasoningHash` of the actual live trace is stored on-chain and matches the local `keccak256(canonicalJson(trace))` computation.

---

## Vercel production deployment, 2026-06-06

**Public URL: https://bombe-web.vercel.app**

Deployment ID: `dpl_CmbkzzFTTQDScVoj7ax1vzi4HLE4`
Inspect: https://vercel.com/jishnu-baruahs-projects/bombe-web/CmbkzzFTTQDScVoj7ax1vzi4HLE4

- Framework: Next.js 16.2.7 (webpack, no Turbopack, required for workspace alias resolution)
- Monorepo: install from repo root (`pnpm install --frozen-lockfile`), build via `pnpm --filter @bombe/web build`
- `apps/web/vercel.json` configures install/build commands; project `rootDirectory=apps/web` set via Vercel API
- Mode: `MODE=live`, reads live Mantle Sepolia contracts + Neon Postgres + Upstash Redis
- Verified: `curl -sI https://bombe-web.vercel.app` → HTTP 200; `/leaderboard` renders HTML

---

## v2 live real-data attestation, 2026-06-07

The first deterministic attestation over real, live data (DefiLlama mETH yield), produced by the v2
decisive pipeline (`MODE=live pnpm v2:attest`) and posted on Mantle Sepolia. The verdict is computed
by the reconciler, not a model; the reasoning hash stored on-chain equals the locally computed
`hashCanonical(trace)`.

| Field | Value |
|-------|-------|
| Claim ID | `mETH-V2-1780794644` (mETH 30-day annualized yield) |
| Observed / asserted | 197.32 / 197 bps |
| Decision | VALID, confidence 10000 bps, lockedStake 0.02 MNT |
| Poster | deployer `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83` (OPERATOR_ROLE) |
| Attestor | Reflector `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` |
| postClaim tx | `0x3cfcc3848be5d9bcdaef46503f40eccf8ed1925b2211c61c9b91a4e0ddce9885` |
| attest tx | `0xaf3191ddf53496b9196700f01221fe0b5d5d883f21af792ba5e179594984b8da` |
| reasoningHash (on-chain == local) | `0x363137413be8dffc715c09c204381f245c8f7355369ed48dda6861b1fc72b78a` |
| Source | DefiLlama pricePerShare-derived (single leg; on-chain mETHToETH cross-check accrues over the streak) |

Key model used for this capture: the deployer key posts (operator-authorized, it holds
OPERATOR_ROLE) and Reflector attests. Reflector was topped up 0.1 MNT from the deployer for gas. Tx
explorer base: https://sepolia.mantlescan.xyz/tx

### USDY (same capture, 2026-06-07)

| Field | Value |
|-------|-------|
| Claim ID | `USDY-V2-1780795067` (USDY annualized yield) |
| Observed / asserted | 355.00 / 355 bps (window 1d) |
| Decision | VALID, confidence 10000 bps, 0.02 MNT staked (Reflector) |
| postClaim tx | `0x3df430b5fee7643766582355adb89b0932c95c0ba009c6830bb5cd221eb69b5e` |
| attest tx | `0x86fe2ceb78a52514b764dd07a17f312337b14f4a707bba5447c640491bd1440f` |
| reasoningHash (on-chain == local) | `0x0cd7a4b4ab182a6e2b3d1c95aef65c11205666d952752d01c48ae3dec6b29cbd` |
| Source | DefiLlama reported APY; labeled single source, full transparency (D4a) |

---

## External Plugboard attestor, LIVE on-chain proof

The external Plugboard attestor (an attestor the Bombe team did not write) now has LIVE on-chain
proof, not just deterministic replay. It is driven by an LLM (Mistral) via `scripts/plugboard-live.ts`,
which classifies each claim by tier, gathers evidence through the tool gateway, and submits a real
`attest()` transaction on Mantle Sepolia. This demonstrates that Bombe's contract-layer safety holds
against an agent the team did not author: a Tier-1 falsifiable claim attests cleanly, while a Tier-3
judgment claim is rejected on-chain by the contract.

| Field | Value |
|-------|-------|
| Plugboard wallet | [`0x58826a9FCb6956332D0833b9175CE40A7587957e`](https://sepolia.mantlescan.xyz/address/0x58826a9FCb6956332D0833b9175CE40A7587957e) |
| Runtime | External (Hermes), LLM-driven by Mistral via `scripts/plugboard-live.ts` |
| Tier-1 attestation (success) | [`0xc1d726a2290e8bb9da3634b042a2e36e3c74326e60a4b5cc933a4b2fbe3be87a`](https://sepolia.mantlescan.xyz/tx/0xc1d726a2290e8bb9da3634b042a2e36e3c74326e60a4b5cc933a4b2fbe3be87a) |
| Tier-3 judgment attestation (reverted) | [`0x44bb6b906d92cc62048525c85eea4ed12b14d8c8efc18da17696d0ee75543829`](https://sepolia.mantlescan.xyz/tx/0x44bb6b906d92cc62048525c85eea4ed12b14d8c8efc18da17696d0ee75543829) |
| Tier-3 revert reason | `JudgmentTierRequiresAbstain` (contract enforced the abstain rule) |

The Tier-1 transaction is a successful on-chain attestation by the external attestor. The Tier-3
transaction was reverted on-chain with `JudgmentTierRequiresAbstain`, proving that the contract,
not the agent, enforces the abstain-on-judgment rule. Explorer base:
https://sepolia.mantlescan.xyz/tx
