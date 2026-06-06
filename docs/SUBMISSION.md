# Bombe: DoraHacks submission package

Everything needed to submit Bombe to the Mantle Turing Test Hackathon 2026. Copy the pitch, the
answers, and the addresses straight into the DoraHacks form.

## One-line pitch

Bombe is an autonomous AI attestor network for real-world-asset claims on Mantle, where agents
attest only to what they can falsify, stake on being right, and are slashed on-chain when wrong.

## Track nomination

- Primary: **AI & RWA Track** (Path A, RWA Infrastructure: AI-powered verification).
- Also eligible: **Grand Champion**, **Best UI/UX**, **20-Project Deployment Award**, **Community Voting**.

## What it is

Most attestation networks will vouch for anything, including subjective valuations no one can
verify, and face no consequence when wrong. Bombe takes the opposite stance:

- It attests only to **falsifiable** claims. Tier 1 is deterministic on-chain or oracle math.
  Tier 2 is checkable against referenced documents. Tier 3 is judgment, and the only allowed
  answer is abstain.
- **Safety lives at the contract layer.** A tier-3 claim cannot receive anything but an
  abstention, because the contract rejects any other answer. This is not a guideline in a
  framework, it is enforced by the chain.
- Attestors put up a stake on every decisive call. Correct attestors earn a share of the claim
  fee and a trust score; wrong attestors are slashed, half burned and half paid to the peers who
  got it right.
- An external attestor, **Plugboard**, runs on a third-party agent runtime that our team did not
  write. It proves the safety guarantee is real and not self-graded: when Plugboard tries to
  attest a valuation as valid, the chain reverts it.

## "Tell us" answers (AI & RWA track)

**1. What real-world asset are we bringing on-chain?**
Tokenized RWA yield and value claims. For example a token's reported 30-day yield (an mETH or
USDY style figure) or a servicer cashflow statement. These are posted as Tier 1 deterministic or
Tier 2 document-falsifiable claims and attested on-chain.

**2. How does AI play a role?**
Autonomous ReAct agents fetch oracle, feed, and document evidence, reason under explicit cost and
step budgets, and post a signed attestation (valid, rejected, or abstain) on-chain. The agent's
full reasoning trace is hashed and the hash is written on-chain, so the decision is both
explainable and tamper-evident. On a judgment claim the agents abstain, and the contract enforces
it.

**3. How is it realized on Mantle?**
Four contracts are live on Mantle Sepolia (chain id 5003). An agent's inference result is written
on-chain through the `attest()` function. The leaderboard and slashing contracts settle the
economics on Mantle: claim fees in, stake at risk, trust scores out.

## Live artifacts

- **Public frontend:** https://bombe-web.vercel.app
- **Explorer:** https://sepolia.mantlescan.xyz
- **Network:** Mantle Sepolia, chain id 5003
- **Open-source repo:** https://github.com/jishnu-baruah/Bombe
- **Integration guide:** docs/INTEGRATION.md
- **Model accuracy benchmarks:** docs/BENCHMARKS.md (free model reaches 83 percent majority match; the scripted safety path is fully deterministic)

### Deployed contracts (Mantle Sepolia, chain id 5003)

| Contract | Address |
|----------|---------|
| AgentRegistry | `0x0cB936d55eB3CADF0C8984F8adAEd180734C7246` |
| AgentAttestation | `0xf2473a0a55D997233C8fBF987c197e7d2180470A` |
| AgentSlashing | `0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864` |
| TuringLeaderboard | `0xE5A157c349A6540C300D6CEcbe391A81EEEec018` |

Explorer address pages follow the pattern `https://sepolia.mantlescan.xyz/address/<address>`.

### Live AI attestation proof

A real agent decision written on-chain, with the reasoning hash matching the published trace.

| Field | Value |
|-------|-------|
| Claim | a tier-1 mETH 30-day yield claim |
| Agent and model | Reflector, gpt-oss:20b via Ollama Cloud |
| postClaim tx | `0x608eb32ca56dba54989b9dec4bc83de266fc791a273d441f2acdcdd91302d369` |
| attest tx | `0xa20c3362062ffdfbd20179c3229ba08339f577e421b710bf60076ae63d7ada4d` |
| on-chain reasoningHash | `0x156a5ff50cb214ea37b8feca78326b3c4f8499ee4ed82b70a64d12391d2fc4b4` |
| locally recomputed hash | matches the on-chain value |

Transaction pages follow `https://sepolia.mantlescan.xyz/tx/<hash>`.

## How it works (architecture brief)

- **Contracts (Solidity, Foundry):** a registry of bonded attestors, the attestation contract
  (claim posting, attesting, the tier-3 abstain rule), a leaderboard (trust scores, fee
  distribution), and slashing with disputes. Covered by a deep test and fuzz suite.
- **Agent SDK (TypeScript):** a ReAct loop with hard safety rules, a deterministic tool router,
  cost and step budgets, model failover, and seams that swap between live and mock for testing.
  Three reference agents with distinct temperaments plus the external Plugboard attestor.
- **Web app (Next.js):** a live race view, a leaderboard, a per-claim trace viewer with a
  verify-hash button, an operator console, and the issuer and integration pages.

## Differentiator in one screen

On the live page, watch the agents converge on a deterministic claim, split on a borderline one,
reject a document mismatch, and abstain on a valuation. Then watch the external Plugboard agent
try to attest the valuation as valid and get reverted by the contract: blocked by protocol, not
by our code.

## Submission checklist

Done:
- Contracts deployed on Mantle Sepolia and recorded.
- A live, on-chain, AI-driven attestation captured with a matching reasoning hash.
- Public frontend live, wired to the live contracts.
- Open-source repo with a README, setup, architecture, and deployed addresses.
- Issuer page, integration guide, and accuracy benchmarks published.

Operator to complete before hitting submit:
- Verify the four contracts on the Mantle explorer (needs a Mantlescan API key).
- Record the demo video, at least two minutes, walking the core flow.
- Confirm the submission deadline and the voting window, then submit on DoraHacks with the pitch,
  the answers, and the addresses above.
