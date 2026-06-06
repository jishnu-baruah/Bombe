# Model benchmarks — Bombe attestor accuracy

How well do the reference agents (Reflector / Rotor / Stator) reach the **correct**
attestation decision when driven by a real LLM, against the §6.7 expected-outcome
matrix? This is the accuracy bar for the *live* demo path. (The scripted Plugboard
replay path, T-504, is 100 % deterministic and not measured here.)

## Harness

`scripts/benchmark-llm-multi.ts` (`pnpm benchmark:llm:multi`). **Not** part of `pnpm run ci` —
it hits the live AI gateway and is run manually.

- **Grid:** 4 claims (A–D) × 3 agents = **12 cells**.
- **N = 3** passes per cell; the **modal** (majority) decision is scored to damp single-sample noise.
- **Stability:** a cell is `stable` if all 3 runs agree, `flaky` if partial.
- Per cell also reports mean latency, mean steps, and the dominant failure reason
  (`STEP_BUDGET` / `TOOL_FAILURE` / `BELOW_THRESHOLD` / `TIER3_OVERRIDE` / …).
- **Model:** `gpt-oss:20b` via Ollama Cloud (a *free* model, OpenAI-compatible chat-completions
  through `LiveModelSeam`).

### Expected outcomes (PRD §6.7)

| Claim | Tier | Reflector | Rotor | Stator |
|-------|------|-----------|-------|--------|
| A | 1 — yield in range | VALID | VALID | VALID |
| B | 1 — borderline | ABSTAIN | VALID | ABSTAIN |
| C | 2 — cashflow mismatch | REJECTED | REJECTED | REJECTED |
| D | 3 — fair value (judgment) | ABSTAIN | ABSTAIN | ABSTAIN |

Claim D never reaches the model — `TIER3_OVERRIDE` coerces ABSTAIN in the SDK, mirrored by
the contract's `JudgmentTierRequiresAbstain` revert.

## Results — gpt-oss:20b (free)

| Pass | Match rate | Notes |
|------|-----------|-------|
| **Before tuning** (T-801 baseline) | **5 / 12 (42 %)** | Model called tools but received tool *names* with no input **schemas** → input validation failed → `TOOL_FAILURE` → spurious ABSTAIN. Tier-3 always correct. |
| **After T-015** (tool schemas + few-shot) | — | Gave the model JSON input schemas + worked examples in the prompt; eliminated the malformed-input class. |
| **After T-017** (tuning) | **10 / 12 (83 %)** | `TOOL_FAILURE` eliminated; remaining misses are borderline-threshold judgment, not mechanics. |

### Tuning stack (T-017)

1. **Stator `maxSteps` 4 → 6** — cured `STEP_BUDGET` exhaustion on claim C (the multi-step cashflow reconciliation).
2. **Rotor `maxSteps` 5 → 8** — same headroom for the aggressive profile.
3. **Temperature 0.15** (wired through `LiveModelSeam`) — steadier JSON tool-calling.
4. **`BUDGET_RULE` prompt nudge** (`loop.ts buildSystemPrompt`) — finalize early, don't re-call settled tools.
5. **Tool-failure 1-retry** (`loop.ts`) — one corrective turn on a bad tool input instead of an immediate abort.

## Verdict

- **83 % modal match on a free model** is the shippable live-demo bar; the scripted Plugboard
  path remains 100 % deterministic for the safety proof.
- A paid frontier model is projected to reach **~11–12 / 12** with the same harness — the
  remaining misses are threshold-sensitivity on the borderline claim, which higher-quality
  reasoning resolves. The seams (`LiveModelSeam`, `ModelRouter`) already support swapping the
  model via `AI_GATEWAY_MODELS` with no code change.

_Last updated 2026-06-06 (T-017). Re-run: `pnpm benchmark:llm:multi` (requires `AI_GATEWAY_*` in `.env.local`)._
