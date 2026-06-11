# Bombe v3.2 PRD: follow-up questions and assessment

Companion to BOMBE-V3-AGENT-ACCESS-PRD.md (3.2-locked). Written by the executor before starting.
This does not relitigate the locked re-scope; it surfaces the things that will cause rework or a
broken promise if not pinned down, plus an honest assessment. Each item has a recommended default so
the council can accept or override. The two marked CRITICAL touch the core "stranger can verify"
claim and should be answered before WS-T starts.

Overall: the re-scope is sound and I agree with its philosophy (collapse effort-deferrals, hold
principle-deferrals, absorb ambition into shadow, make the external verifier the structural answer to
self-graded). The verify-don't-trust trio (durable traces + npx verify + independent external
verifier) is the crown jewel; the items below are mostly about making it actually hold on the live
path.

---

## A. CRITICAL: the existing v2 headline attestations are NOT stranger-verifiable

**What is true now.** The two v2 headline attestations in SUBMISSION.md (mETH and USDY) were posted by
the raw live path, which set a placeholder `traceURI` (`bombe.example/...`) and never stored the
trace. The on-chain `reasoningHash` is real, but the trace that produced it is gone, and it cannot be
regenerated: the trace embeds the exact `Date.now()` timestamps and the exact live DefiLlama value at
that second, neither of which is reproducible. So `npx bombe-verify` run against today's headline tx
would fail (nothing to fetch at the URI), and even with the trace it could not be rebuilt to match.

**Why it matters.** Gate P1 says "npx verify passes on a live headline claim." If the submission's
headline tx is one a judge cannot verify, the central pitch breaks at the sharpest moment.

**Recommended default.** Sequence it: ship WS-T (durable trace storage) first, make the live attest
path upload the canonical trace and set the real `traceURI`, then capture FRESH headline attestations
(both assets) whose traces are stored and verifiable. Those fresh txns become the submission
headlines; the v2 ones are relabeled "historical, hash-on-chain, trace not preserved" (honest, per
Ruling 1 and D10). Every attestation from trace-storage onward, including the daily streak, is then
stranger-verifiable. **Blocks:** the verification thesis. **Decide before WS-T.**

## B. CRITICAL: trace storage mechanism and the credential

**Context.** A `LiveBlobSeam` already exists in the SDK (HTTP PUT to a blob store using a
`BLOB_RW_TOKEN`); `buildAndSubmitAttestation` already calls `blob.put(canonicalJson(trace))` and uses
the returned URL as `traceURI`. The v2 raw live path bypassed this and used a placeholder. So WS-T is
mostly: route the live attest path through the blob upload, and provide the token.

**The credential.** Trace storage needs a publicly-fetchable store. Two options:
1. Vercel Blob via `BLOB_RW_TOKEN` (this is the open operator blob-token item). Public URLs, no serving
   code, the `traceURI` is the blob URL. Simplest. Requires the operator to create a Blob store and
   add `BLOB_RW_TOKEN` to `.env.local` and the GitHub Action secrets.
2. The existing Neon Postgres (`DATABASE_URL` is already provisioned) plus wiring the web `/api/trace`
   route to read from it. Avoids a new credential but needs serving-route work and the route must be
   live on the public site.

**Recommended default.** Use Vercel Blob (`BLOB_RW_TOKEN`): the `LiveBlobSeam` is already written, the
URLs are public with zero serving code, and it works identically from the local script and the GitHub
Action. Add the token to both `.env.local` and the Action secrets. **Blocks:** Gate T, and therefore
A. **Decide before WS-T.**

## C. CRITICAL: publish the canonical hashing spec so the independent verifier can match

**Context.** The external verifier in bombe-consumer must have ZERO Bombe imports to be a credible
independent audit. That means it reimplements the hash from scratch and must match byte-for-byte. The
algorithm is simple and fully specifiable: `canonicalJson` sorts object keys lexicographically at
every level, preserves array order, JSON-stringifies primitives, drops `undefined`; the hash is
`keccak256(utf8Bytes(canonicalJson(value)))`. But it currently lives only in our code and a comment.

**Risk.** If the independent reimplementation differs in any detail (key ordering on non-ASCII,
number formatting, string escaping, the exact bytes fed to keccak), it produces false reds, and a
public false red on our own verifier is damaging.

**Recommended default.** Publish a precise `docs/HASHING-SPEC.md` (the algorithm above, with worked
examples and test vectors: a known input, its canonical string, and its hash). bombe-consumer and any
third party implement against the spec, not our library. This both enables the independent verifier
and strengthens the pitch (a documented algorithm anyone can implement, not "trust our package").
**Blocks:** the external verifier's correctness. **Decide before WS-V.**

## D. Custodial paid-request mechanics need to be precise

**What the PRD says.** "Custodial paid requests, direct on-chain CLAIM_FEE from the requester's
wallet ... accepted requests posted by the existing operator key."

**The ambiguity.** `postClaim` is `OPERATOR_ROLE`, so the requester cannot pay the contract directly;
the operator posts (and pays the 0.01 fee as msg.value). So "direct on-chain CLAIM_FEE from the
requester's wallet" must mean the requester pays Bombe's treasury on-chain, and the operator then
posts and attests. That is genuinely custodial, which is fine if labeled, but the mechanics need
nailing: the treasury address, the required amount, and how a request is matched to its payment (for
example the requester sends MNT to the treasury with the intended claimId, and the API verifies that
on-chain transfer before posting).

**Recommended default.** Define it explicitly: `POST /requests` returns a treasury address, a price,
and a `claimId`; the requester sends the fee to the treasury on-chain referencing that claimId (or the
API watches the requester's address); on confirmed payment the operator posts and attests; the
response carries the claimId to read and verify. Label "custodial: Bombe holds the fee and posts on
your behalf; permissionless on-chain posting ships in the July batch." **Blocks:** Gate P2. **Decide
before Jun 10.**

## E. MCP server transport and hosting

For agents to call Bombe remotely (the whole point), the MCP server needs an HTTP/SSE transport and a
host, not just stdio (which is local-only). **Recommended default:** ship the MCP server with HTTP/SSE
transport, hosted alongside the web app (Vercel) or the read API, so a remote agent can connect by
URL; document a stdio option for local use. Confirm the host. **Decide before WS (MCP).**

## F. Velocity reconsiderations (my opinion; I lean toward the PRD, but flag them)

Velocity removes the effort constraint, so two principle-deferrals are worth a conscious re-confirm:

- **x402 (R1).** The remaining blockers were no Mantle facilitator and no EIP-3009 token, both
  buildable now (a standalone EIP-3009 test token does not touch the frozen Bombe contracts, so the
  freeze does not technically forbid it). So x402 is now an honesty/value call, not an effort one: a
  self-deployed-token, self-hosted-facilitator x402 demo is real code but is arguably theater versus a
  production rail, and the direct CLAIM_FEE path is cleaner and more honest. **My lean: keep R1 (docs
  paragraph), unless the council specifically wants the Agentic Economy track narrative, in which case
  build it in shadow and label it "we built the Mantle facilitator because none exists."**
- **ERC-8004 (R3).** Deploying the registries on Mantle is feasible now, but the standard is young and
  the value is positioning. **My lean: keep R3 (vocabulary mapping), revisit in the v4 batch.**

These are confirmations, not changes; I raise them only because "deferred for effort" no longer
applies, so the council should own them as value judgments.

## G. Minor clarifications

- **G1.** "Byte-identical verdicts vs live path for 7 days" (adapter shadow): the adapter produces a
  different trace, so the reasoning hash will differ. This should mean identical DECISION and
  reconciled value, not identical trace bytes. Recommend stating "identical decision and reconciled
  value."
- **G2.** `npx bombe-verify` distribution: publishing to npm needs an npm token. Recommend the
  `npx github:jishnu-baruah/bombe-consumer` form to avoid a new credential, or request the npm token
  on Jun 7 with the others.
- **G3.** The daily streak currently does NOT store traces (the live streak runner uses the raw path).
  Once WS-T lands, the streak runner must also route through the blob upload, or the streak entries
  are not verifiable either. Fold this into WS-T explicitly.

## H. What I think (the short version)

The plan is right and I can execute the Jun 7 to Jun 11 build in a day or two; at that point the
pacing is exactly what the PRD says it is (streak length, soak, operator review, credentials, the
frozen system), none of which velocity changes. The single highest-leverage thing is the
verify-don't-trust trio, and the single biggest risk is shipping a submission headline that a stranger
cannot actually verify (item A). Get trace storage live, capture fresh verifiable headlines, publish
the hashing spec, and stand up the independent external verifier, and the "verify, do not trust"
thesis becomes literally true and self-evident. Everything else in the agent-access layer is
straightforward glue over the permissionless reads. Hold the principle-based deferrals exactly as the
council set them; they are about trust and standards maturity, not effort, so speed does not change
them.

## I. Decide before execution
Before WS-T: A (fresh verifiable headlines), B (blob token), C (hashing spec).
Before WS-V: C again (the external verifier depends on it).
Before Jun 10: D (custodial mechanics), E (MCP hosting).
Confirm consciously: F (x402, ERC-8004 given velocity). Everything else is accept-the-default.
