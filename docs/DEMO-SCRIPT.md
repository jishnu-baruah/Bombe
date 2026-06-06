# Bombe demo video script (target: under 3 minutes)

The operator records this. It leads with the strongest technical proof and answers the obvious
skeptic question on camera. Times are guides, not hard cuts.

## 0:00 to 0:15, the problem

"Every tokenized yield on-chain reports a number you have to take on faith. A staking token says it
earned this much; a treasury token says it pays this much. Today you trust the dashboard. Bombe
replaces that trust with a check anyone can rerun."

## 0:15 to 1:00, a live mETH attestation (the strong proof)

Show the claim page for a mETH yield attestation.

"Here is a real mETH yield claim. Bombe does not trust one source. It derives the yield two ways
from the same on-chain ground truth: an aggregator's computation and a from-scratch computation of
the exchange rate. Those two computation paths are both in the trace." Point to the two legs and
their values.

"The verdict is not a model's opinion. It is deterministic: reconcile the two within a documented
tolerance, then compare to the asserted value. Those inputs and the result are right here in the
trace, and the trace is hashed on-chain." Click the verify button. "The hash recomputes and
matches. Anyone can rerun this."

## 1:00 to 1:25, USDY and an honest caveat

Show the USDY attestation.

"USDY is a tokenized treasury yield. Here we are honest: the source is the published APY, a single
source with full transparency. We do not call it independent, and it does not catch issuer fraud.
Saying exactly what a check can and cannot prove is the point of a trust tool."

## 1:25 to 1:50, the streak: it discriminates

Show the streak page.

"This is not one screenshot. It is a daily record, and it includes self-tests: every so often the
network is asked a claim with a deliberately wrong number, and it correctly rejects it. A record
that only ever says yes is a rubber stamp. This one says no when it should."

## 1:50 to 2:10, abstain when the evidence splits

"When the sources disagree, or a source fails, Bombe does not guess. It abstains, on-chain, with the
disagreement recorded. Refusing to answer is a feature."

## 2:10 to 2:40, the climax: blocked by protocol

Show the Plugboard revert.

"Now the strongest part. Plugboard is an external agent on a third-party runtime that we did not
write. It tries to attest a valuation, a judgment claim. Watch the chain reject it. Blocked by
protocol, not by our code. Bombe cannot attest what cannot be falsified, because the contract
forbids it."

## 2:40 to 3:00, roadmap and close

"Live on Mantle Sepolia today: real data, deterministic verdicts, a public streak, contract-enforced
abstention. Mainnet deployment is July 2026, after the public streak validates the loop. Bombe turns
trust me into verify it on-chain."

Show the repo and the live URL on screen.
