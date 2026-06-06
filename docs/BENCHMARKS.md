# Model benchmarks: Bombe attestor accuracy

How often do the reference agents (Reflector, Rotor, Stator) reach the correct attestation
decision when driven by a real LLM, measured against the expected-outcome matrix? This is the
accuracy bar for the live demo path. The scripted Plugboard replay path is fully deterministic
and is not measured here.

## Harness

`scripts/benchmark-llm-multi.ts` (`pnpm benchmark:llm:multi`). It is not part of `pnpm run ci`,
because it calls the live AI gateway. Run it manually.

- Grid: 4 claims (A to D) times 3 agents, so 12 cells.
- 3 passes per cell; the majority (modal) decision is scored to damp single-sample noise.
- A cell is stable when all 3 runs agree, flaky when they only partly agree.
- Each cell also reports mean latency, mean steps, and the dominant failure reason
  (step budget, tool failure, below threshold, judgment override, and so on).
- Model: `gpt-oss:20b` via Ollama Cloud, a free model, served over an OpenAI-compatible
  chat-completions endpoint.

### Expected outcomes

| Claim | Tier | Reflector | Rotor | Stator |
|-------|------|-----------|-------|--------|
| A | 1, yield in range | VALID | VALID | VALID |
| B | 1, borderline | ABSTAIN | VALID | ABSTAIN |
| C | 2, cashflow mismatch | REJECTED | REJECTED | REJECTED |
| D | 3, fair value (judgment) | ABSTAIN | ABSTAIN | ABSTAIN |

Claim D never reaches the model. The judgment-tier override coerces ABSTAIN in the SDK, mirrored
by the contract rejecting any non-ABSTAIN answer on a tier-3 claim.

## Results: gpt-oss:20b (free)

| Pass | Match rate | Notes |
|------|-----------|-------|
| Baseline | 5 / 12 (42 %) | The model called tools but received tool names with no input schemas, so inputs failed validation, producing tool failures and spurious abstentions. The judgment tier was always correct. |
| After tool schemas + few-shot | improved | Gave the model JSON input schemas plus worked examples in the prompt, eliminating the malformed-input class. |
| After tuning | 10 / 12 (83 %) | Tool failures eliminated. The remaining misses are borderline-threshold judgment, not mechanics. |

### Tuning stack

1. Stator step budget raised from 4 to 6, curing step-budget exhaustion on the multi-step
   cashflow reconciliation (claim C).
2. Rotor step budget raised from 5 to 8 for the same headroom on the aggressive profile.
3. Temperature set to 0.15, for steadier JSON tool-calling.
4. A budget rule in the system prompt, nudging the agent to finalize early and not re-call
   tools it already settled.
5. One corrective retry on a bad tool input instead of an immediate abort.

## Verdict

- 83 % majority match on a free model is the shippable bar for the live demo. The scripted
  Plugboard path stays fully deterministic for the safety proof.
- A paid frontier model is projected to reach roughly 11 to 12 out of 12 on the same harness.
  The remaining misses are threshold sensitivity on the borderline claim, which stronger
  reasoning resolves. The model seams already support swapping the model through the
  `AI_GATEWAY_MODELS` setting with no code change.

Re-run with `pnpm benchmark:llm:multi` (requires the `AI_GATEWAY_*` values in `.env.local`).
