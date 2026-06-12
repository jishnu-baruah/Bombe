# Bombe agent skill, use the attestor network headlessly

This file tells an AI agent how to use Bombe with no human in the loop: read a
verdict, verify it yourself, or pay for a new attestation, all over a keyless
HTTP API plus one contract on Mantle Sepolia (chain id 5003). An MCP server in
`packages/mcp` wraps these as callable tools; this document is the underlying
contract so any agent can integrate directly.

Base URL: `https://bombe-web.vercel.app`. Contract (AgentAttestation):
`0xf2473a0a55D997233C8fBF987c197e7d2180470A`. Explorer: `https://sepolia.mantlescan.xyz`.

## What Bombe attests

Falsifiable real-world-asset yield claims. Today: mETH and USDY annualized yield.
The verdict is deterministic (reconcile evidence within tolerance, then compare to
the asserted value), and every verdict carries a reasoning hash stored on-chain so
the agent can recompute and trust it without trusting Bombe.

## 1. Discover what is attestable

```
GET /api/v1/assets
-> { "attestation": "0xf247...", "chainId": 5003, "count": 36,
     "assets": [ { "symbol": "mETH", "name": "Mantle Staked ETH", "chain": "Mantle",
                   "metric": "annualized_yield_bps", "sources": [...] }, ... ] }
```

## 2. Read a verdict

```
GET /api/v1/claims/{claimId}
-> { "claimId", "posted", "tier", "attestations": [
     { "attestor", "decision": "VALID|REJECTED|ABSTAIN", "confidenceBps",
       "reasoningHash", "sourcesHash", "traceURI", "lockedStakeWei" } ] }
```

## 3. Verify a verdict yourself (do not trust, check)

```
GET /api/v1/verify/{claimId}
-> results[].status: "verified" | "mismatch" | "trace_unavailable"
```
`verified` means the published trace re-hashes (keccak256 of the canonical JSON)
to the on-chain `reasoningHash`. An agent can also fetch the trace at `traceURI`
and recompute the hash itself, trusting nothing.

## 4. Request a new attestation (paid, non-custodial)

The agent pays the fee from its own wallet, then submits the payment for
fulfilment. Bombe posts the claim and attests it; the agent reads the result back.

```
1. Pay: send the fee (default 0.02 MNT) from your wallet to the receiving
   address, on Mantle Sepolia. Get the payment tx hash.
2. POST /api/v1/request
   body: { "asset":"mETH", "claimType":"YIELD_BPS", "assertedBps":195,
           "windowDays":30, "payer":"0x<your address>", "paymentTxHash":"0x<tx>" }
   -> { "fulfilled": true, "claimId", "decision", "reasoningHash", "verifyUrl" }
3. Verify: GET /api/v1/verify/{claimId} -> "verified".
```
Payment is verified on-chain (correct recipient, sender, amount) and deduped by tx
hash. Posting is operator-side because `postClaim` is role-gated on the contract;
the agent never hands over keys and Bombe never custodies the agent's funds.

## Honest limits

Bombe only attests claims it can falsifiably verify (mETH/USDY yield today; more
assets via the adapter registry, and document-falsifiable Tier-2 claims, are being
added). Judgment/valuation claims are refused at the contract layer (the chain
reverts a non-abstain attestation on a Tier-3 claim). `windowDays` is always part
of the claim; a short window is never presented as a 30-day yield.
