# Bombe: DoraHacks submission package

Everything needed to submit Bombe to the Mantle Turing Test Hackathon. Copy the pitch, the
answers, and the addresses straight into the DoraHacks form.

## One-line pitch

Bombe is an autonomous AI attestor network for real-world-asset yields on Mantle: agents fetch the
ground-truth data, the verdict is deterministic math a verifier can rerun, every decisive call is
staked and slashable, and the contract forbids attesting anything that cannot be falsified.

## Track nomination

- Primary: AI & RWA Track (RWA Infrastructure, AI-powered verification).
- Also eligible: Grand Champion, Best UI/UX, 20-Project Deployment Award, Community Voting.

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
- **Redundancy over the evidence.** Several independent gatherings must agree on the evidence
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
| Claim | mETH 30-day annualized yield, observed 197.32 bps, asserted 197 bps |
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

The daily public streak (both assets, with self-test rejections) begins once the daily workflow's
GitHub secrets are set; the same pipeline that produced the headline above runs it.

## How it works (architecture brief)

- **Contracts (Solidity, Foundry):** a registry of bonded attestors, the attestation contract
  (claim posting, attesting, and the judgment-tier abstain rule enforced in Solidity), a
  leaderboard (trust scores, fee distribution), and slashing with disputes. Covered by a deep test
  and fuzz suite.
- **Agent SDK (TypeScript):** a live data layer that fetches and cross-checks evidence, a pure
  deterministic reconciler that issues the verdict, an evidence-consensus layer, and the attestation
  builder that hashes the trace and writes it on-chain. Seams keep every test deterministic.
- **Web app (Next.js):** a live race view, a leaderboard, a per-claim trace viewer with a verify
  button, an operator console, and the issuer and integration pages.

## Differentiator in one screen

Watch the agents converge on a deterministic claim, reject a self-test that asserts a wrong number,
abstain when the evidence splits, and then watch the external Plugboard agent try to attest a
valuation and get reverted by the contract: blocked by protocol, not by our code.

## Submission checklist

Done:
- Four contracts live on Mantle Sepolia and recorded.
- The full decisive pipeline (fetch, cross-check, deterministic verdict, hashable trace, attestation
  build) runs end-to-end with a matching recomputable hash.
- A daily run script that records a public streak with self-test rejections.
- Public frontend live, with a copy-paste consumer quickstart in the README.
- Open-source repo, integration guide, benchmarks, and an honest readiness assessment.

Operator to complete before submit:
- Set up the posting and attestor keys and add them as repo secrets, then let the daily run capture
  the live, real-data headline transaction and start the public streak.
- Verify the four contracts on the Mantle explorer.
- Record the demo video (see docs/DEMO-SCRIPT.md) and post the X thread (see docs/X-THREAD.md).
- Confirm the deadline and timezone, then submit the BUIDL on DoraHacks with the pitch, answers, and
  addresses above.
