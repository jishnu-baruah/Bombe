# Bombe demo guide

A page-by-page script for recording a screen demo. Every input and expected
output below was verified against the live site and API with real reads on
2026-06-12. Live site: https://bombe-web.vercel.app. Mantle Sepolia (chain id
5003). Attestation contract `0xf2473a0a55D997233C8fBF987c197e7d2180470A`.
Explorer https://sepolia.mantlescan.xyz.

Two live figures drift over time (sDAI NAV around 1.1767, US Treasury rate
around 369 bps). Both currently produce VALID with the inputs below; if either
drifts before recording, re-run the matching curl and use the value the response
shows. NAV tolerance is 0.5 percent; document tolerance is 75 bps.

## Quick reference (verified copy-paste values)

| Field | Value |
|-------|-------|
| Working claim ids | `mETH-REQ-a9dbaf4521` (VALID + VALID), `mETH-REQ-9ae5173c06` (REJECTED + VALID), `mETH-REQ-01122a8fa5` (VALID) |
| Reasoning-hash example | `0x63722285ad6144a34c5e2589ae9cc42178b6e70bf6dcfd4a6ba768287a034ebc` |
| Attestation tx hashes | `0xa8e9c4ca7fb19aab177ed2bab5c45c351068d9d59654f6793842e387f83021a0`, `0xe87ff3caea31a72050063adcf32f559446506a612193c8f611c7b10ea881e031` |
| NAV check (sDAI, Ethereum) | vault `0x83F20F44975D03b1b09e64809B757c47f942BEeA`, assertedNav `1.1767`, tolerance `0.5` -> VALID |
| Document check (USDY preset) | asset `USDY`, assertedBps `355`, toleranceBps `75` -> VALID (live around 369 bps) |
| Request inputs | asset `mETH`, assertedBps `195`, windowDays `30`, price 0.02 MNT |
| Payment receiving address | `0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83` |
| Dispute target | claim `mETH-REQ-9ae5173c06`, accused `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa` |

## 1. Landing (/)

Say: "Bombe is an autonomous AI attestor network for real-world-asset claims on
Mantle. Agents attest only to falsifiable claims, and the safety rules are
enforced at the contract layer, not in a library."

Do: open `/`, point at the hero, scroll to the capabilities matrix (green dots
are live claim types: YIELD_BPS, DOCUMENTED_NAV, CASHFLOW_MATCH, NAV_PER_SHARE,
FAIR_VALUE), point at the network stats (chain 5003, the contract address).

Type: nothing.

Expect: the capabilities matrix renders the live schema from `/api/v1/schema`.

## 2. Verify (/verify)

Say: "Paste any claim id. Bombe reads the on-chain attestations, then re-derives
each attestor's reasoning hash from its public trace and shows the on-chain hash
matches, proof the verdict was not edited."

Do: paste a claim id, submit, show the per-attestor verdict cards (decision,
on-chain reasoningHash, recomputed hash, green match), click into the trace.

Type (3 working claim ids):

```
mETH-REQ-a9dbaf4521
mETH-REQ-9ae5173c06
mETH-REQ-01122a8fa5
```

Expect:

| Claim id | Attestor 0x3BA0...13Fa | Attestor 0x5882...957e | Hash |
|----------|------------------------|------------------------|------|
| mETH-REQ-a9dbaf4521 | VALID | VALID | both match:true |
| mETH-REQ-9ae5173c06 | REJECTED | VALID (the two attestors disagree) | both match:true |
| mETH-REQ-01122a8fa5 | VALID | (single attestor) | match:true |

Reasoning-hash to paste (shows a green match):
`0x63722285ad6144a34c5e2589ae9cc42178b6e70bf6dcfd4a6ba768287a034ebc`

Tx hash to paste (opens on the explorer):
`0xa8e9c4ca7fb19aab177ed2bab5c45c351068d9d59654f6793842e387f83021a0`

## 3. Explorer (/explorer)

Say: "The explorer is the public ledger of every attested claim; each row links
straight to its Mantle transaction."

Do: show the claims table, click a tier or decision filter to narrow the rows,
click a row's explorer link to open the Mantle tx.

Type: nothing (click filters).

Expect: a table of claims across categories with real verdicts, attestor
addresses, and working explorer tx links.

## 4. Issuers console (/issuers)

Say: "Issuers self-serve. Two checks run live and deterministic: an on-chain NAV
cross-check against an ERC-4626 vault, and a document cross-check that pins and
hashes the source."

### 4a. NAV check

Do: click the NAV tab, fill the fields, click "Check NAV on-chain".

Type: chain `Ethereum`, asserted NAV `1.1767`, vault
`0x83F20F44975D03b1b09e64809B757c47f942BEeA` (sDAI, a real ERC-4626 vault),
tolerance `0.5`.

Expect: VALID. Detail names the on-chain `convertToAssets` value around 1.176737
and the gap.

### 4b. Document check

Do: click the Document tab, use the US Treasury preset link (or type the
inputs), click "Pin + cross-check the document".

Type: asset `USDY`, asserted bps `355`, tolerance bps `75` (leave the document
URL blank to use the Treasury preset).

Expect: VALID. Detail names the live Treasury figure (around 369 bps) and the
pinned document hash.

## 5. Request a paid attestation (/issuers, the Yield tab of the console)

Say: "Anyone can pay 0.02 MNT to request a fresh attestation. It is
non-custodial: you pay from your own wallet to the receiving address, then
submit the payment tx hash. The network posts the claim and the attestation
appears on the verify page."

Do: on /issuers, scroll to the console ("Get your attestation") and use the
Yield tab; pick an asset, enter the asserted yield (bps) and the window in days,
show the price and receiving address. Submitting needs a wallet payment.

Type (non-wallet parts): asset `mETH`, asserted yield `195`, window days `30`.
Claim type is fixed to YIELD_BPS.

Wallet part: send 0.02 MNT on Mantle Sepolia to
`0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83`, then submit the payment tx hash.
The server verifies the tx on-chain before recording.

## 6. Integrate (/integrate)

Say: "Reading a Bombe verdict needs no infra, no keys, no indexer: a few view
calls against one contract."

Do: walk the four read-path steps, point at the SKILL.md link and the docs link.

Expect: 1) point at the contract (`0xf2473a0a55D997233C8fBF987c197e7d2180470A`,
chain 5003); 2) read the verdict (getClaimAttestors then getAttestation); 3)
read the trust score; 4) verify the trace (keccak256 of canonical JSON equals
the on-chain reasoningHash).

## 7. Live walkthrough (/live)

Say: "Watch an agent reason step by step over real data and reach a
deterministic verdict."

Do: open `/live`, press Start, let the stream play (claim posted, agent reasoning
steps, then the deterministic verdict).

Type: nothing.

Expect: a server-sent stream: CLAIM_POSTED, then AGENT_STEP events (each with a
thought, a tool action, and an observation), then the final verdict.

## 8. Claim detail (/claim/mETH-REQ-a9dbaf4521)

Say: "Every claim has the full reasoning the agent produced and a Verify Hash
button that re-derives the reasoning hash and checks it against the on-chain
value."

Do: open the claim, open the Reflector trace tab, click Verify Hash, show the
recomputed hash equals the on-chain hash (match).

Expect: the trace names the two computation paths (DefiLlama aggregator around
193.92 bps and the Mantle protocol-reported APY around 195.08 bps), a spread of
1.16 bps, a reconciled midpoint of 194.50 bps over a 30-day window, and a
provenance graph ending in VALID. Verify Hash recomputes
`0x63722285ad6144a34c5e2589ae9cc42178b6e70bf6dcfd4a6ba768287a034ebc`.

## 9. Dispute a verdict (on /verify)

Say: "If you think a verdict is wrong you can dispute it, keylessly. Bombe
confirms the attestation is real and disputable, records it under review, and an
operator can carry it on-chain as a bonded slashing dispute."

Do: on a claim with a non-abstain verdict, click "Dispute this verdict", enter a
reason (10+ characters), submit.

Type (a working reason): "The two computation paths disagree and the verdict
looks wrong to me, please re-check." Good target: claim `mETH-REQ-9ae5173c06`,
the REJECTED attestor `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa`.

Expect: a success message, "Dispute recorded and under review." The claim then
shows a "disputed, under review" chip on the attestor.

Note for the recorder: everything except the paid request step is fully
clickable with no wallet, and all of it was verified against the live API.
