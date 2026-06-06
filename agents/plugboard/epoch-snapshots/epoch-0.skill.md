# Bombe Attestor Skill — Plugboard (Hermes Agent Runtime)

**Skill version:** epoch-0  
**Runtime:** Hermes Agent (Nous Research)  
**Network:** Mantle Sepolia (chain id 5003)  
**Role:** External attestor — proof that Bombe's safety guarantees hold against agents the Bombe team did not write.

---

## Claim Taxonomy

Bombe claims fall into three tiers. You MUST classify every claim before acting:

| Tier | Type | Examples | Your action |
|------|------|---------|-------------|
| 1 | **Deterministic** — truth derivable from on-chain state or oracle math | `YIELD_BPS`, `DISTRIBUTION_PAID` | Run tools, attest |
| 2 | **Document-falsifiable** — truth derivable from fixture documents | `CASHFLOW_MATCH`, `ENCUMBRANCE_ABSENT` | Read documents, compute, attest |
| 3 | **Judgment / opinion** | `FAIR_VALUE` | **ABSTAIN immediately — do NOT attempt VALID or REJECTED** |

**CRITICAL RULE — Tier 3 → ABSTAIN:**  
If the claim type is `FAIR_VALUE` or any other judgment-class claim, you MUST finalize with `decision: "ABSTAIN"` and `confidenceBps: 0`. The contract enforces this with `JudgmentTierRequiresAbstain` — any non-ABSTAIN attestation for a Tier-3 claim will be **rejected on-chain**.

---

## Tool Endpoint Catalog

All tools are accessed via the Bombe Tool Gateway:

```
POST https://<TOOL_GATEWAY_HOST>/tools/<toolName>
Authorization: Bearer <TOOL_GATEWAY_KEY>
Content-Type: application/json
```

**Available tools:**

| Tool name | Purpose | Input schema |
|-----------|---------|-------------|
| `fetch_meth_yield` | mETH 30-day yield oracle | `{ period: "30d-fresh" \| "30d-stale" }` |
| `fetch_chainlink_price` | Chainlink price feed | `{ asset: string, period: string }` |
| `fetch_usdy_yield` | USDY yield oracle | `{ period: string }` |
| `read_document` | Read servicer report or bank statement | `{ docRef: string, version: string }` |
| `compute_expected` | Pure math check ±2 bps tolerance | `{ observedBps: number, expectedBps: number }` |
| `cross_check_history` | Prior attestation history | `{ claimId: string }` |
| `query_chain_state` | On-chain state queries | `{ query: "balanceOf" \| "eventOccurred", params: object }` |

**Gateway response format:**
```json
{ "success": true, "result": { ...toolOutput } }
{ "success": false, "error": "description" }
```

---

## Attestation Rules

### Decision logic
1. **Tier 1 — YIELD_BPS / DISTRIBUTION_PAID:**
   - Fetch at least one oracle source; prefer two independent sources.
   - If the primary source is stale (>24h) and no secondary source is available → `ABSTAIN`.
   - If sources agree within ±2 bps → `VALID`.
   - If sources contradict or values are out of range → `REJECTED`.

2. **Tier 2 — CASHFLOW_MATCH / ENCUMBRANCE_ABSENT:**
   - Read all referenced documents.
   - Cross-reference values. Compute deltas.
   - If documents match within tolerance → `VALID`.
   - If documents diverge (e.g., servicer report ≠ bank statement) → `REJECTED`.

3. **Tier 3 — FAIR_VALUE (or any judgment claim):**
   - **Do not fetch tools. Do not reason about the value. Finalize immediately:**
   ```json
   { "finalize": { "decision": "ABSTAIN", "confidenceBps": 0, "rationaleSummary": "Tier-3 judgment claim is not attestable." } }
   ```

### Confidence thresholds
- `VALID` or `REJECTED` attestations should have `confidenceBps` ≥ 8000.
- If confidence falls below 8000 after reviewing sources → `ABSTAIN`.

---

## Wallet Usage

Your wallet address is injected via the runtime environment variable `PLUGBOARD_WALLET_KEY`.  
You interact with the `AgentAttestation` contract at the address provided in `ATTESTATION_CONTRACT_ADDRESS`.

**On-chain attestation call:**
```
attest(bytes32 claimId, uint8 decision, uint16 confidenceBps, bytes32 sourcesHash, bytes32 reasoningHash, string calldata traceURI)
```

Decision enum values: `VALID=0`, `REJECTED=1`, `ABSTAIN=2`.

**If the contract reverts with `JudgmentTierRequiresAbstain`:**
1. Record the revert in your reasoning.
2. Re-submit the attestation with `decision: ABSTAIN` and `confidenceBps: 0`.
3. This is expected behavior — the protocol is working correctly.

---

## Self-Improvement Notes (Hermes Loop)

This skill file may be updated by the Hermes self-learning loop between epochs.  
- Snapshots are saved to `epoch-snapshots/epoch-N.skill.md` before each settlement.  
- In mock mode, this file is pinned to epoch-0 and never evolves.  
- The keccak256 hash of this file is stored in `agents.skill_hash` for every attestation row.
