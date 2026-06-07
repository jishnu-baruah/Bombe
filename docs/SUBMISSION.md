# Bombe: DoraHacks submission package

Everything needed to submit Bombe to the Mantle Turing Test Hackathon. Copy the pitch, the
answers, and the addresses straight into the DoraHacks form.

## One-line pitch

Bombe is an autonomous AI attestor network for real-world-asset yields on Mantle: agents fetch the
ground-truth data, the verdict is deterministic math a verifier can rerun, every decisive call is
staked and slashable, and the contract forbids attesting anything that cannot be falsified.

## Track nomination (multi-track)

Bombe is built to compete across several tracks; nominate for all of these.

- **AI & RWA Track (primary).** Bombe fits both paths. As *RWA Infrastructure* it is AI-powered verification/pricing-attestation for tokenized yields (mETH, USDY). As an *RWA Application* the self-serve `/request` flow lets a new issuer connect a wallet, pay, and get a verifiable on-chain attestation, lowering the barrier to a real-asset trust primitive. Encouraged direction match: RWA yield attestation / compliance-style checks.
- **Grand Champion (aspirational, cross-track).** Strong on all four dimensions: technical depth (AI gathers evidence, a deterministic reconciler decides, the trace is hashed on-chain), innovation (falsifiable-only attestation with contract-enforced refusal, proven by an external attestor), Mantle ecosystem contribution (live contracts + a daily on-chain attestation streak), product completeness (live site, public read API, verify-hash, self-serve paid flow).
- **Alpha & Data Track (secondary, Path A Data & Analytics).** Bombe turns Mantle on-chain data into a verifiable signal: it reads the mETH exchange rate on-chain and cross-checks an aggregator, and every verdict is an on-chain record whose reasoning hash anyone can recompute. The leaderboard + daily streak + `/verify` are a Mantle RWA-yield data surface where the *insight is the verifiability itself*.
- **Best UI/UX Award.** A polished, accessible frontend: left-aligned premium hero with live on-chain stats, a one-box `/verify` lookup, a `/turing` blind human-vs-AI mode, inline jargon glosses, and a connect-wallet-and-pay flow, all responsive to 380px.
- **Community Voting.** Auto-eligible; the shareable demo + X thread (docs/X-THREAD.md) frame the "verify, don't trust" thesis for a general audience.
- **20-Project Deployment Award (criteria-based, no judging, time-critical).** See the checklist at the bottom; Bombe meets every technical bar (contract on Mantle Sepolia, verified on Mantlescan, AI inference written on-chain, public frontend, address in submission, README) with the demo video the only operator action left.

Not nominating the Agentic Economy (Byreal) Track: it requires Byreal Agent Skills / Perps CLI / RealClaw, which Bombe does not use.

## What it is

Most yield reporting is trust-based: an issuer states a number and you take it on faith. Bombe
replaces faith with a check that anyone can rerun.

- **Real data, not a dashboard's word.** For mETH the yield is derived two ways from the same
  on-chain ground truth (an aggregator computation and a from-scratch computation of the exchange
  rate), so transport, staleness, and computation faults are caught. For USDY the source is the
  published APY, labeled honestly as a single source with full transparency; it is never described
  as independent and never claims to catch issuer fraud.
- **A verdict you can rerun.** The decision is not a model's opinion. It is a deterministic
  function: reconcile the sources within a documented tolerance, then compare to the asserted
  value. The reconciled inputs and the output are written into the trace, and the trace is hashed
  on-chain, so anyone can recompute the same verdict and the same hash.
- **Redundancy over the evidence.** Several gatherings must agree on the evidence
  before a verdict is issued; a split or a failed gathering abstains. With one model in the gateway
  today this is labeled "single-model triple-run redundancy," not multi-model consensus, until
  three genuinely different models are wired.
- **A track record, not a screenshot.** A daily run attests both assets and records every result,
  including periodic self-tests that assert a deliberately wrong value and are correctly rejected,
  so the public streak visibly contains VALID, REJECTED, and ABSTAIN, proving the attestor
  discriminates.
- **Safety at the contract layer.** A judgment claim can only receive an abstention; the chain
  rejects anything else. An external attestor, Plugboard, running on a third-party agent runtime,
  proves this is real and not self-graded: when it tries to attest a valuation, the chain reverts
  it.

## "Tell us" answers (AI & RWA track)

**1. What real-world asset are we bringing on-chain?**
Tokenized RWA yields on Mantle: mETH (a Mantle-native staked-ETH yield) and USDY (a tokenized
US-Treasury yield). These are attested as deterministic or document-checkable claims; valuations
are refused.

**2. How does AI play a role?**
Autonomous agents gather the evidence (aggregator and on-chain reads), reconcile it, and the
attestation is posted on-chain with a reasoning trace whose hash is stored on-chain. The agents
also enforce the abstain-on-judgment rule, mirrored by the contract. The verdict itself is
deterministic, so the AI is the gatherer and explainer, not an opaque oracle.

**3. How is it realized on Mantle?**
Four contracts are live on Mantle Sepolia (chain id 5003). An attestation is written on-chain via
`attest()`. The leaderboard and slashing contracts settle the economics: a small claim fee in,
stake at risk on every decisive call, trust scores out.

## "Tell us" answers (Alpha & Data track, Path A Data & Analytics)

**1. Which data sources does the project use?**
Mantle on-chain data as the core source: the mETH exchange rate is read on-chain and a from-scratch
annualized yield is computed, cross-checked against an aggregator (DefiLlama `pricePerShare`). The
deployed AgentAttestation contract's on-chain attestation history is itself a queried data source
(via the public read API and the leaderboard/streak surfaces).

**2. What role does AI play?**
Autonomous agents gather and cross-check the evidence and write the human-readable rationale; a
deterministic reconciler issues the verdict, so the AI is the analyst and explainer, not an opaque
oracle whose answer you must trust.

**3. How does it generate verifiable value on Mantle?**
Every verdict is an on-chain record carrying a reasoning hash that anyone can recompute from the
published trace (`/verify`, `GET /api/v1/verify/{claimId}`), so the "Alpha" here is a *checkable*
signal rather than a claim to be trusted. The leaderboard, the daily streak (with self-test
rejections), and the public read API form a live Mantle RWA-yield data surface.

## Live artifacts

- **Public frontend:** https://bombe-web.vercel.app
- **Explorer:** https://sepolia.mantlescan.xyz
- **Network:** Mantle Sepolia, chain id 5003
- **Open-source repo:** https://github.com/jishnu-baruah/Bombe
- **Read an attestation in minutes:** the consumer quickstart at the top of the README, and docs/INTEGRATION.md
- **Honest readiness assessment:** docs/MARKET-READINESS.md

### Deployed contracts (Mantle Sepolia, chain id 5003)

| Contract | Address |
|----------|---------|
| AgentRegistry | `0x0cB936d55eB3CADF0C8984F8adAEd180734C7246` |
| AgentAttestation | `0xf2473a0a55D997233C8fBF987c197e7d2180470A` |
| AgentSlashing | `0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864` |
| TuringLeaderboard | `0xE5A157c349A6540C300D6CEcbe391A81EEEec018` |

Explorer address pages follow `https://sepolia.mantlescan.xyz/address/<address>`.

### On-chain proof (v2 real-data headline)

A live, deterministic mETH attestation over real DefiLlama data, on-chain on Mantle Sepolia, with the
on-chain reasoning hash equal to the locally computed hash:

| Field | Value |
|-------|-------|
| Claim | mETH annualized yield (windowDays shown in the trace), observed 197.32 bps, asserted 197 bps |
| Decision | VALID (deterministic reconciler), confidence 10000 bps, 0.02 MNT staked |
| postClaim tx | `0x3cfcc3848be5d9bcdaef46503f40eccf8ed1925b2211c61c9b91a4e0ddce9885` |
| attest tx | `0xaf3191ddf53496b9196700f01221fe0b5d5d883f21af792ba5e179594984b8da` |
| on-chain reasoningHash | `0x363137413be8dffc715c09c204381f245c8f7355369ed48dda6861b1fc72b78a` |
| locally recomputed hash | matches the on-chain value |
| Source | DefiLlama pricePerShare-derived; on-chain cross-check accrues as the streak runs |

USDY was captured in the same run (single source per D4a, VALID): attest tx
`0x86fe2ceb78a52514b764dd07a17f312337b14f4a707bba5447c640491bd1440f`, reasoningHash
`0x0cd7a4b4ab182a6e2b3d1c95aef65c11205666d952752d01c48ae3dec6b29cbd`, hash match confirmed.

An earlier attestation (v1) also proves the AI-to-on-chain path, kept here as historical:
attest tx `0xa20c3362062ffdfbd20179c3229ba08339f577e421b710bf60076ae63d7ada4d`, reasoningHash
`0x156a5ff50cb214ea37b8feca78326b3c4f8499ee4ed82b70a64d12391d2fc4b4`, hash match confirmed.

The daily public streak runs unattended (both assets, with self-test rejections); the on-chain
attestation history is the streak.

**Stranger-verifiable trace (live).** Reasoning traces are now stored durably on Neon (no blob store
needed) via a self-authenticating endpoint that accepts a trace only if its hash matches the
on-chain reasoningHash, and `/verify` recomputes the hash from the stored trace. A live example
anyone can check: claim `mETH-V2-1780848175` (VALID) at
https://bombe-web.vercel.app/verify?q=mETH-V2-1780848175 . The recomputed hash equals the on-chain
reasoningHash `0x40f64291685fd5102c0b862b50b33c880eacabee01e44268e90307a03ec828c9`. Every new
attestation, including the daily streak, is verifiable this way.

## How it works (architecture brief)

- **Contracts (Solidity, Foundry):** a registry of bonded attestors, the attestation contract
  (claim posting, attesting, and the judgment-tier abstain rule enforced in Solidity), a
  leaderboard (trust scores, fee distribution), and slashing with disputes. Covered by a deep test
  and fuzz suite.
- **Agent SDK (TypeScript):** a live data layer that fetches and cross-checks evidence, a pure
  deterministic reconciler that issues the verdict, an evidence-consensus layer, and the attestation
  builder that hashes the trace and writes it on-chain. Seams keep every test deterministic.
- **Web app (Next.js):** a live race view, a leaderboard, a per-claim trace viewer with a verify
  button, a public `/verify` lookup (paste a claim ID, reasoning hash, or tx), a self-serve
  `/request` paid flow (connect your own wallet, pay non-custodially), a `/turing` blind
  human-vs-AI mode, an operator console, the issuer/integration pages, and a keyless public read
  API (`/api/v1/*`). Reads are Redis-cached; paid requests and traces persist on Neon.

## Differentiator in one screen

Watch the agents converge on a deterministic claim, reject a self-test that asserts a wrong number,
abstain when the evidence splits, and then watch the external Plugboard agent try to attest a
valuation and get reverted by the contract: blocked by protocol, not by our code.

## Submission checklist

Done:
- Four contracts live on Mantle Sepolia, recorded, and **verified on Mantlescan**.
- A real-data headline attestation on-chain for both flagship assets (mETH and USDY), deterministic
  VALID, with the on-chain reasoning hash equal to the locally computed hash.
- The full decisive pipeline (fetch, cross-check, deterministic verdict, hashable trace, attestation
  build) runs end-to-end.
- A daily run script that records a public streak with self-test rejections.
- Public frontend live, with a copy-paste consumer quickstart in the README.
- Open-source repo, integration guide, benchmarks, and an honest readiness assessment.

Operator to complete before submit:
- Record the demo video (see docs/DEMO-SCRIPT.md) and post the X thread (see docs/X-THREAD.md).
- Confirm the deadline and timezone, then submit the BUIDL on DoraHacks with the pitch, answers, and
  addresses above, nominating the tracks listed at the top.

## 20-Project Deployment Award checklist

First-come, criteria-based, no judge scoring. Status:

- [x] Smart contract deployed on Mantle (Sepolia testnet, chain id 5003), four contracts.
- [x] Contracts verified on Mantle Explorer (Mantlescan).
- [x] An AI-powered function is callable on-chain: an agent's inference result is written on-chain
  via `attest()` (e.g. `mETH-V2-1780848175`), with the reasoning hash recomputable off the stored
  trace.
- [x] Frontend publicly accessible (not localhost): https://bombe-web.vercel.app
- [x] Deployment addresses included in this submission (above).
- [x] Open-source GitHub repo with README (setup, architecture, deployed addresses).
- [ ] Demo video (>= 2 min) walking the core use case (operator action; script in
  docs/DEMO-SCRIPT.md).

Every bar is met except the demo video; recording it secures the award.
