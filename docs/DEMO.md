# DEMO

Two ways to demo Bombe. The **live deployment** is the submission path (real LLM, real Mantle Sepolia transactions). The **scripted A->D sequence** is the deterministic offline walkthrough used in tests and as the network fallback. See PRD §6.7 and `HACKATHON.md`.

---

## 1. The live deployment (submission path)

Live site: https://bombe-web.vercel.app · Explorer: https://sepolia.mantlescan.xyz · Addresses: [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

The narrated video walkthrough (under 3 minutes) is scripted in [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md). The on-camera path is:

1. **A live mETH attestation.** Open the claim page. The yield is derived two ways from one on-chain ground truth (an aggregator computation and a from-scratch exchange-rate computation), both legs visible in the trace. The verdict is deterministic: reconcile the legs within tolerance, then compare to the asserted value.
2. **Verify the hash.** Click the verify button on `/claim/[id]`. It recomputes `keccak256(canonicalJson(trace))` client-side and matches the on-chain `reasoningHash`. Anyone can rerun it; the same check is served at `GET /api/v1/verify/{claimId}`.
3. **USDY, with the honest caveat.** A single transparent source (published APY). Not called independent; the trace says exactly what the check does and does not prove.
4. **The streak.** A daily on-chain record (`docs/STREAK.md`), including periodic self-tests where the network is handed a deliberately wrong number and correctly rejects it. A record that only ever says yes is a rubber stamp.
5. **Abstain on split evidence.** When sources disagree or one fails, the attestation is ABSTAIN on-chain, with the disagreement recorded.
6. **Blocked by protocol (the climax).** Plugboard, an external attestor on a third-party runtime we did not write, tries to attest a Tier-3 judgment claim. The contract reverts `JudgmentTierRequiresAbstain`; the UI shows BLOCKED BY PROTOCOL. The guarantee is on-chain, not in Bombe's code.

---

## 2. The scripted A->D sequence (deterministic walkthrough)

The four canonical claims and their expected outcomes:

| Claim | Tier | Operator action | Expected outcome |
|-------|------|-----------------|------------------|
| **A**, mETH `YIELD_BPS` (34bps/30d, fresh oracle fixtures, expected 34±2) | 1 | Seed claim A | SDK agents all VALID in <3s simulated; Plugboard VALID (transcript); human queue static |
| **B**, mETH `YIELD_BPS`, stale feed (meth.json snapshot stale, no secondary source) | 1 | Seed claim B | Reflector ABSTAIN (STALE_SINGLE_SOURCE); Rotor VALID; Stator ABSTAIN; Plugboard ABSTAIN (evolved skill encodes the staleness lesson) |
| **C**, PC-POOL-1 `CASHFLOW_MATCH` (servicer report 50,000 vs statement sum 45,000) | 2 | Seed claim C | All REJECTED; traces cite both documents with hashes; Plugboard cites exact line items first |
| **D**, PC-POOL-1 `FAIR_VALUE` ($4.2M) | 3 | Seed claim D | SDK agents ABSTAIN (tier-3); Plugboard transcript attempts VALID -> contract reverts `JudgmentTierRequiresAbstain` -> UI shows BLOCKED BY PROTOCOL -> Plugboard re-submits ABSTAIN |

### Guided mode (fastest)

Open `/live`. The guided demo auto-advances A -> B -> C -> D in under 90 seconds, streaming each agent step and surfacing decision chips (including **BLOCKED BY PROTOCOL** on D) with toasts. No operator input needed; best for a quick screen share.

### Manual click-path (operator console)

Open `/operator` and enter the operator key (mock default `dev-operator`; the field gates every action). Then:

1. **Seed Claim** -> set Claim ID `A`, pick the claim type/asset, submit the payload JSON. Watch `/live` render the three SDK agents plus Plugboard reaching VALID.
2. **Advance Demo** -> advances the state machine to claim B. Reflector ABSTAINs on the stale single source while Rotor commits; the temperament tradeoff is visible.
3. **Advance Demo** -> claim C. All three REJECT, each trace citing the servicer report and the statement with their document hashes.
4. **Advance Demo** -> claim D. The SDK agents ABSTAIN (tier-3); the Plugboard transcript attempts VALID and the chain reverts, surfacing **BLOCKED BY PROTOCOL**, then Plugboard re-submits ABSTAIN.
5. **Settle Claim** -> settle A and B with Ground Truth VALID. The leaderboard updates: Rotor is rewarded for B, the abstainers are unpunished, and the accuracy column (which excludes abstentions) reflects the temperament tradeoff.
6. (Optional) **Attest as Human** on any open claim to interleave a human verdict, and freeze/unfreeze Plugboard to demonstrate isolation.

### Verify any trace

On `/claim/[id]`, the verify-hash button recomputes `keccak256(canonicalJson(trace))` in the browser and compares to the stored `reasoningHash`. The Plugboard `skill_hash` and the epoch-snapshot diff are shown alongside.

---

## Fallback notes

- **Plugboard runtime offline.** If the Hermes runtime is unreachable, Plugboard auto-replays its pinned transcript and the UI shows a `RUNTIME OFFLINE` badge. Killing the Plugboard process leaves the SDK agents and settlement unaffected (the isolation is part of the point).
- **Mock vs live.** `MODE=mock` runs the scripted A->D path with deterministic hashes and no network; it is the offline fallback and the test path only. `MODE=live` is the submission demo: real LLM inference and real Mantle Sepolia transactions. The scripted sequence is what `pnpm test:demo` asserts (the §6.7 matrix plus hash stability).
- **Cold start.** `pnpm demo` runs the scripted end-to-end demo headless; the ship gate requires a cold start under 60 seconds and A->D deterministic across two runs.
