# 🔐 Bombe

### *Stop trusting. Start verifying.*

![Mantle](https://img.shields.io/badge/Mantle%20Sepolia-chain%205003-494fdf?style=for-the-badge) ![Status](https://img.shields.io/badge/status-LIVE%20on--chain-22c55e?style=for-the-badge) ![Verdicts](https://img.shields.io/badge/verdicts-deterministic-9296f5?style=for-the-badge) ![Safety](https://img.shields.io/badge/safety-contract%20enforced-f97316?style=for-the-badge)

**Bombe is an autonomous AI attestor network for Real-World-Asset yields.** Agents attest only to *falsifiable* claims. Compute a wrong answer and you get **slashed on-chain**. Submit a subjective opinion and the **smart contract refuses it**. Every verdict pins a hash of its full reasoning on-chain, so **anyone can rerun the check.**

> This file is the submission package: the pitch you can paste straight into the BUIDL Details, plus the track nominations, form answers, and the deployment checklist for the other tabs.

---

## ❌ The Problem

RWA yield reporting runs on faith. An issuer says "7.2% APY," a dashboard echoes it, and nobody can cheaply ask *is that actually true, computed right, over the window claimed?*

- **Unfalsifiable marketing** sits next to hard numbers as if equally checkable.
- **Hallucinating AI oracles** let a language model emit the final verdict, so it can be confidently wrong.
- **Self-graded safety** lives in the same code that benefits from passing.

## ✅ The Solution

```
   TRUST-BASED (today)              BOMBE
   issuer says a number     ->      agents fetch LIVE evidence
   users take it on faith   ->      a deterministic reconciler decides
   no way to check          ->      reasoningHash on-chain, anyone reruns it
```

Safety is enforced at the **contract layer**, not by a prompt, and proven by an **external agent Bombe did not write**.

---

## ⚙️ How It Works

```
 1. POST CLAIM         2. GATHER EVIDENCE          3. RECONCILE (no model)
 ┌────────────┐        ┌─────────────────────┐     ┌────────────────────┐
 │ issuer posts│       │ leg A: aggregator    │     │ within tolerance?  │
 │ claim + fee │ ────> │ leg B: protocol API  │ ──> │  yes  -> VALID     │
 │ (on-chain)  │       │ (live data + window) │     │  off  -> REJECTED  │
 └────────────┘        └─────────────────────┘     │  stale-> ABSTAIN   │
                                                    └─────────┬──────────┘
 6. VERIFY (anyone)     5. STORE TRACE              4. ATTEST + HASH
 ┌────────────────┐    ┌────────────────────┐      ┌─────────────────────┐
 │ recompute hash │ <──│ self-auth storage   │ <─── │ attest() locks stake│
 │ == on-chain    │    │ (hash MUST match)   │      │ writes reasoningHash│
 │ -> proof intact│    │                     │      │ to the chain        │
 └────────────────┘    └────────────────────┘      └─────────────────────┘
```

> **mETH** = *one ground truth, two computation paths* (a DefiLlama aggregator leg reconciled against the Mantle protocol API leg). **USDY** = a partial-independence single-source check. The claimed window length is always shown, never relabeled.

---

## 💡 What Makes Bombe Different

**1. Falsifiable-only, in three tiers**

| Tier | What | Enforcement |
|------|------|-------------|
| 🟢 **1 Deterministic** | `YIELD_BPS` from on-chain math / aggregators | wrong answer -> **automatic slashing** |
| 🟡 **2 Document** | yield checkable vs a pinned source doc | **stake-weighted dispute vote** |
| 🔴 **3 Judgment** | fair-value, opinions | **attestation forbidden by contract** |

**2. Contract-enforced safety.** A judgment claim cannot be attested. The contract reverts it:

```solidity
if (claim.tier == 3 && decision != Decision.ABSTAIN)
    revert JudgmentTierRequiresAbstain();
```

**3. Plugboard, the external proof.** An agent named **Plugboard** runs on a third-party runtime (Nous Research's Hermes) with **zero Bombe safety code**. When it tries to attest a judgment claim the contract reverts it, proving safety is the protocol's, not our library's. Plugboard has also opened a real bonded dispute on-chain.

**4. Deterministic decisions, AI narratives.** Agents gather evidence and write the reasoning; the **verdict is computed by a deterministic reconciler**, never by a model (tolerances: reconcile and verdict 50 bps, NAV 0.5%, document 75 bps).

**5. Stranger-verifiable traces.** `reasoningHash = keccak256(canonicalJson(trace))` is written on-chain; the trace lives behind a self-authenticating endpoint that only stores it if the hash matches. Recompute and check it yourself.

**6. Triple-run by default + live defense.** Every new claim is attested by **three in-house agents (Reflector, Rotor, Stator)**, each independently re-running the same reconciler over fresh data: *single-model triple-run redundancy, not multi-model consensus.* A **daily streak** verifies real mETH then USDY rates, and periodic **self-tests assert deliberately wrong values** that the network correctly posts as REJECTED.

---

## 🧭 The Tiered Decision

```
              incoming claim
                    │
       Tier 1 ──────┼────── Tier 3
   (deterministic)  │    (judgment)
        │        Tier 2          │
        ▼      (document)        ▼
  reconcile legs   │     contract REVERTS any
  vs tolerance     ▼     VALID/REJECTED attempt
        │     pin + hash         │
        ▼      a real doc        ▼
 VALID / REJECTED  │        only ABSTAIN
 (wrong = slash)   ▼        is allowed
            VALID / REJECTED
          (dispute-vote slash)
```

---

## 🏗 Architecture

```
  WEB (Next.js): live race · explorer · /verify · trace viewer · issuer console
        │ keyless reads + verify                    │ paid self-serve
        ▼                                           ▼
  AGENT SDK (TS): LiveDataSource -> reconciler -> hashable trace
        Attestors: Reflector · Rotor · Stator  +  Plugboard (external)
        │ on-chain tx pipeline
        ▼
  CONTRACTS (Mantle Sepolia 5003):
  AgentRegistry · AgentAttestation · AgentSlashing · TuringLeaderboard
```

| Contract | Role |
|----------|------|
| `AgentRegistry` | bonded attestors (`MIN_BOND 0.1 MNT`) |
| `AgentAttestation` | posting, attestation, Tier-3 revert (`CLAIM_FEE 0.01`, `ATTEST_LOCK 0.02`, `MAX_ATTESTORS 16`) |
| `AgentSlashing` | Tier-1 direct slashing, Tier-2 dispute votes |
| `TuringLeaderboard` | trust scores + fee distribution |

**Agent SDK (TypeScript):** a live data layer that fetches and cross-checks evidence, a pure deterministic reconciler that issues the verdict, an evidence-consensus layer, and the attestation builder that hashes the trace and writes it on-chain. Seams keep every test deterministic.

**Web app (Next.js):** a live race view, an explorer/ledger, a per-claim trace viewer with a verify-hash button, a keyless `/verify` lookup (paste a claim id, reasoning hash, or tx), a connect-wallet self-serve paid flow, an operator console, and a keyless public read API. Reads are Redis-cached; paid requests and traces persist on Neon.

---

## 🔎 Proof You Can Run Yourself (keyless)

- **Triple-attestor claim, all traces verify** -> `https://bombe-web.vercel.app/verify?q=mETH-2026-06-15-verify`
- **The disagreement case (REJECTED vs VALID)** -> `https://bombe-web.vercel.app/verify?q=mETH-REQ-9ae5173c06`
- **Direct API** -> `GET https://bombe-web.vercel.app/api/v1/claims/mETH-REQ-a9dbaf4521`
- **Live capability schema** -> `GET https://bombe-web.vercel.app/api/v1/schema`

An **MCP server** exposes the same discover / verify / request capabilities for headless agents.

---

## 🌐 Live Artifacts

| | |
|---|---|
| 🖥 Web app | https://bombe-web.vercel.app |
| 💻 Repo | https://github.com/jishnu-baruah/Bombe |
| 🎥 Video | https://youtu.be/vWGsdI7hrPg |
| ⛓ Network | Mantle Sepolia (5003), explorer https://sepolia.mantlescan.xyz |

### Deployed contracts (Mantle Sepolia, chain id 5003)

| Contract | Address |
|----------|---------|
| AgentRegistry | `0x0cB936d55eB3CADF0C8984F8adAEd180734C7246` |
| AgentAttestation | `0xf2473a0a55D997233C8fBF987c197e7d2180470A` |
| AgentSlashing | `0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864` |
| TuringLeaderboard | `0xE5A157c349A6540C300D6CEcbe391A81EEEec018` |

Explorer address pages follow `https://sepolia.mantlescan.xyz/address/<address>`.

### On-chain proof (real data, hash matches)

A live, deterministic mETH attestation over real DefiLlama data, on-chain, with the on-chain reasoning hash equal to the locally computed hash:

| Field | Value |
|-------|-------|
| Claim | mETH annualized yield (windowDays shown in the trace), observed 197.32 bps, asserted 197 bps |
| Decision | VALID (deterministic reconciler), confidence 10000 bps, 0.02 MNT staked |
| postClaim tx | `0x3cfcc3848be5d9bcdaef46503f40eccf8ed1925b2211c61c9b91a4e0ddce9885` |
| attest tx | `0xaf3191ddf53496b9196700f01221fe0b5d5d883f21af792ba5e179594984b8da` |
| on-chain reasoningHash | `0x363137413be8dffc715c09c204381f245c8f7355369ed48dda6861b1fc72b78a` |
| recomputed hash | matches the on-chain value |

The daily public streak runs unattended (both assets, with self-test rejections); the on-chain attestation history is the streak. Every new attestation, including the daily streak and the three-attestor claims, is verifiable through `/verify`.

---

## 📐 Honest Scope

Bombe deliberately understates.

- **Live and on-chain:** four verified contracts; the deterministic reconciler; real LLM reasoning via an AI gateway; on-chain `reasoningHash` plus self-authenticating trace storage and `/verify`; three in-house attestors by default plus Plugboard's external attestation and bonded dispute; the daily streak with self-tests; the self-serve paid flow; a keyless public API and MCP server.
- **Live verification, on-chain wiring in progress:** the Tier-2 document check runs live and deterministic against the US Treasury bill rate (`fiscaldata.treasury.gov`), pinning and hashing the source; routing a Tier-2 claim through the paid post path is the remaining step.
- **Demo only:** the scripted `/live` race replay (a deterministic showcase, clearly labeled) and fixture-backed tools used only in tests.

## 🧱 Stack and Why Mantle

Solidity + Foundry (deep-tested and fuzzed) · TypeScript Agent SDK · viem · Next.js on Vercel · Neon Postgres · Upstash Redis · The Graph subgraph · an OpenAI-compatible AI gateway · the Nous Hermes runtime for the external Plugboard agent. **Mantle's** low-cost, fast L2 settlement makes per-claim bonded attestation and constant on-chain re-verification economical, which is exactly what a public, rerunnable yield network needs.

---

# Submission form material

The pitch above is the Details tab. The sections below cover the other tabs (tracks, the "tell us" answers, and the deployment checklist).

## Track nominations (multi-track)

- **AI & RWA Track (primary).** Both paths fit. As *RWA Infrastructure* it is AI-powered verification and pricing-attestation for tokenized yields (mETH, USDY). As an *RWA Application* the self-serve request flow lets a new issuer connect a wallet, pay, and get a verifiable on-chain attestation, lowering the barrier to a real-asset trust primitive.
- **Grand Champion (aspirational, cross-track).** Strong on technical depth (AI gathers evidence, a deterministic reconciler decides, the trace is hashed on-chain), innovation (falsifiable-only attestation with contract-enforced refusal, proven by an external attestor), Mantle ecosystem contribution (live contracts plus a daily on-chain attestation streak), and product completeness (live site, public read API, verify-hash, self-serve paid flow).
- **Alpha & Data Track (secondary, Data and Analytics).** Bombe turns Mantle on-chain data into a verifiable signal: it reads the mETH exchange rate on-chain and cross-checks an aggregator, and every verdict is an on-chain record whose reasoning hash anyone can recompute. The leaderboard, the daily streak, and `/verify` are a Mantle RWA-yield data surface where the insight is the verifiability itself.
- **Best UI/UX Award.** A polished, accessible frontend: a premium hero with live on-chain stats, a one-box `/verify` lookup, inline jargon glosses, and a connect-wallet-and-pay flow, responsive down to small screens.
- **Community Voting.** Auto-eligible; the shareable demo frames the "verify, don't trust" thesis for a general audience.
- **20-Project Deployment Award (criteria-based, no judging).** Bombe meets every technical bar (contracts on Mantle Sepolia, verified on Mantlescan, AI inference written on-chain, public frontend, addresses in submission, README), with the demo video the only operator action left.

Not nominating the Agentic Economy (Byreal) Track: it requires Byreal-specific tooling Bombe does not use.

## "Tell us" answers (AI & RWA track)

**1. What real-world asset are we bringing on-chain?**
Tokenized RWA yields on Mantle: mETH (a Mantle-native staked-ETH yield) and USDY (a tokenized US-Treasury yield). These are attested as deterministic or document-checkable claims; valuations are refused.

**2. How does AI play a role?**
Autonomous agents gather the evidence (aggregator and on-chain reads), reconcile it, and the attestation is posted on-chain with a reasoning trace whose hash is stored on-chain. The agents also enforce the abstain-on-judgment rule, mirrored by the contract. The verdict itself is deterministic, so the AI is the gatherer and explainer, not an opaque oracle.

**3. How is it realized on Mantle?**
Four contracts are live on Mantle Sepolia (chain id 5003). An attestation is written on-chain via `attest()`. The leaderboard and slashing contracts settle the economics: a small claim fee in, stake at risk on every decisive call, trust scores out.

## "Tell us" answers (Alpha & Data track, Data and Analytics)

**1. Which data sources does the project use?**
Mantle on-chain data as the core source: the mETH exchange rate is read on-chain and a from-scratch annualized yield is computed, cross-checked against an aggregator (DefiLlama). The deployed AgentAttestation contract's on-chain attestation history is itself a queried data source (via the public read API and the leaderboard and streak surfaces).

**2. What role does AI play?**
Autonomous agents gather and cross-check the evidence and write the human-readable rationale; a deterministic reconciler issues the verdict, so the AI is the analyst and explainer, not an opaque oracle whose answer you must trust.

**3. How does it generate verifiable value on Mantle?**
Every verdict is an on-chain record carrying a reasoning hash that anyone can recompute from the published trace (`/verify`), so the "Alpha" is a checkable signal rather than a claim to be trusted. The leaderboard, the daily streak (with self-test rejections), and the public read API form a live Mantle RWA-yield data surface.

## Differentiator in one screen

Watch the agents converge on a deterministic claim, reject a self-test that asserts a wrong number, abstain when the evidence splits, and then watch the external Plugboard agent try to attest a valuation and get reverted by the contract: blocked by protocol, not by our code.

## Submission checklist

Done:
- Four contracts live on Mantle Sepolia, recorded, and verified on Mantlescan.
- Real-data headline attestations on-chain for both flagship assets (mETH and USDY), deterministic VALID, with the on-chain reasoning hash equal to the locally computed hash.
- Three in-house attestors (Reflector, Rotor, Stator) attesting by default on new claims, plus Plugboard's external attestation and a real bonded dispute on-chain.
- The full decisive pipeline (fetch, cross-check, deterministic verdict, hashable trace, attestation build) runs end-to-end.
- A daily run that records a public streak with self-test rejections.
- Public frontend live, with a copy-paste consumer quickstart in the README.
- Open-source repo, integration guide, benchmarks, and an honest readiness assessment.

Operator to complete before submit:
- Record the demo video and confirm the deadline and timezone, then submit the BUIDL with the pitch, answers, and addresses above, nominating the tracks listed.

## 20-Project Deployment Award checklist

- [x] Smart contracts deployed on Mantle (Sepolia testnet, chain id 5003), four contracts.
- [x] Contracts verified on Mantle Explorer (Mantlescan).
- [x] An AI-powered function is callable on-chain: an agent's inference result is written on-chain via `attest()`, with the reasoning hash recomputable off the stored trace.
- [x] Frontend publicly accessible (not localhost): https://bombe-web.vercel.app
- [x] Deployment addresses included in this submission (above).
- [x] Open-source GitHub repo with README (setup, architecture, deployed addresses).
- [ ] Demo video (operator action).

Every bar is met except the demo video.
