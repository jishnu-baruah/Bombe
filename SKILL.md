# Bombe agent skill, use the attestor network headlessly

This file tells an AI agent how to use Bombe with no human in the loop: read a
verdict, verify it yourself, or pay for a new attestation, all over a keyless
HTTP API plus one contract on Mantle Sepolia (chain id 5003). An MCP server in
`packages/mcp` wraps these as callable tools; this document is the underlying
contract so any agent can integrate directly.

Base URL: `https://bombe-web.vercel.app`.
Contract (AgentAttestation): `0xf2473a0a55D997233C8fBF987c197e7d2180470A`.
RPC: `https://rpc.sepolia.mantle.xyz` (Mantle Sepolia, chain id 5003).
Explorer: `https://sepolia.mantlescan.xyz`.
Receiving address for paid requests: `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83`.
Contract ABIs are exported from the `@bombe/shared` package (`AgentAttestationAbi`).

## What Bombe attests

Falsifiable real-world-asset claims. The curated set is 36+ assets across several
chains (browse `GET /api/v1/assets`); the open universe is `GET /api/v1/discover`.
The headline live type is annualized yield in basis points (`YIELD_BPS`, e.g.
mETH, USDY), plus document-falsifiable and vault-NAV checks. The verdict is
deterministic (reconcile evidence within tolerance, then compare to the asserted
value), and every verdict carries a reasoning hash stored on-chain so the agent
can recompute and trust it without trusting Bombe.

## Example claim ids (resolve live right now)

`mETH-REQ-a9dbaf4521` (two attestors, both VALID), `mETH-REQ-9ae5173c06` (two
attestors disagree: REJECTED and VALID), `mETH-REQ-01122a8fa5` (one VALID).
Claim ids follow `{SYMBOL}-{TAG}` (self-serve requests use `{SYMBOL}-REQ-{hash}`;
seeded daily claims use `{SYMBOL}-YYYY-MM-DD`, which may not exist for the current
day until it is posted). To browse existing claims, use the explorer at
`/explorer` (or its data) rather than guessing ids.

## 1. Discover what is attestable

```
GET /api/v1/assets
-> { "attestation": "0xf247...", "chainId": 5003, "count": 36,
     "assets": [ { "symbol": "mETH", "name": "Mantle Staked ETH", "chain": "Mantle",
                   "metric": "annualized_yield_bps", "category", "verified",
                   "sources": [...], "claimIdPattern": "mETH-YYYY-MM-DD" }, ... ],
     "network", "explorer", "discover", "read" }
GET /api/v1/discover?rwaOnly=1   -> the full open universe with live TVL/APY
GET /api/v1/schema               -> the live capability matrix (claim types, tolerances)
```

## 2. Read a verdict

```
GET /api/v1/claims/{claimId}
-> { "claimId", "posted", "tier", "closed", "attestorCount",
     "attestations": [
       { "attestor", "decision": "VALID|REJECTED|ABSTAIN", "confidenceBps",
         "reasoningHash", "sourcesHash", "traceURI", "lockedStakeWei" } ] }
```
On-chain read path (no API needed): call `getClaimAttestors(claimId)` then
`getAttestation(claimId, attestor)` on the AgentAttestation contract via the RPC
above, using `AgentAttestationAbi` from `@bombe/shared`. `claimId` is the string
encoded as bytes32 (`stringToHex(id, { size: 32 })`).

## 3. Verify a verdict yourself (do not trust, check)

```
GET /api/v1/verify/{claimId}
-> { "claimId", "results": [ { "attestor", "onChainReasoningHash",
       "recomputed", "match": true, "status": "verified" } ] }
```
`status` is `verified` (recomputed equals the on-chain `reasoningHash`),
`mismatch` (trace tampered), or `trace_unavailable` (trace not durably stored).

To recompute the hash yourself, trusting nothing: fetch the trace JSON at the
attestation's `traceURI`, then `reasoningHash = keccak256(utf8Bytes(canonicalJson(trace)))`.
Canonical JSON (the exact rule, also exported as `hashCanonical` from
`@bombe/shared`): object keys sorted lexicographically at every nesting level;
arrays kept in order; primitives serialized as standard JSON; `undefined`
properties dropped; no whitespace. Hash the entire trace object as served.

## 4. Request a new attestation (paid, non-custodial)

The agent pays the fee from its own wallet, then submits the payment for
fulfilment. Bombe posts the claim and attests it; the agent reads the result back.

```
1. Pay: send 0.02 MNT (the live price is GET /api/v1/request -> priceMnt) from
   your wallet to the receiving address 0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83
   on Mantle Sepolia. Keep the payment tx hash.
2. POST /api/v1/request
   body: { "asset":"mETH", "claimType":"YIELD_BPS", "assertedBps":195,
           "windowDays":30, "payer":"0x<your address>", "paymentTxHash":"0x<tx>" }
   -> { "ok": true, "fulfilled": true, "claimId", "decision", "reasoningHash", "verifyUrl" }
   (If the network is slow the call may 502 with "your payment is safe, resubmit";
   the payment is not consumed, so retry with the same tx hash.)
3. Verify: GET /api/v1/verify/{claimId} -> "verified".
```
Payment is verified on-chain (correct recipient, sender, amount) and deduped by tx
hash. Posting is operator-side because `postClaim` is role-gated on the contract;
the agent never hands over keys and Bombe never custodies the agent's funds.

## 5. Free checks an agent can run without paying

```
GET /api/v1/nav-check?chain=Ethereum&contract=0x<vault>&assertedNav=1.1767&tolerancePct=0.5
   -> cross-checks an ERC-4626 vault's on-chain share price against an asserted NAV
GET /api/v1/document-check?asset=USDY&assertedBps=355&toleranceBps=75
   -> pins + hashes a source document and cross-checks an asserted figure
```

## 6. Dispute a verdict

```
POST /api/dispute
   body: { "claimId", "accused":"0x<attestor>", "reason":"why it is wrong" }
   -> { "ok": true, "disputeId" }
```
The accused must have a non-ABSTAIN attestation on the claim. Recorded for review;
a vetted dispute is carried on-chain as a bonded `AgentSlashing.openDispute`.

## MCP tools (server in `packages/mcp`)

`bombe_get_schema`, `bombe_list_assets`, `bombe_discover_assets`, `bombe_get_claim`,
`bombe_verify_claim`, `bombe_check_nav`, `bombe_check_document`,
`bombe_request_attestation`. Each maps to the matching endpoint above.

## Honest limits

Bombe only attests claims it can falsifiably verify (yield, vault NAV, and
document-falsifiable figures; the asset set grows via the adapter registry).
Judgment/valuation claims are refused at the contract layer (the chain reverts a
non-abstain attestation on a Tier-3 claim). `windowDays` is always part of the
claim; a short window is never presented as a 30-day yield.
