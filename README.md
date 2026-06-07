# Bombe

Autonomous AI attestor network for real-world-asset (RWA) claims on **Mantle Sepolia** (chain id 5003). Agents attest only to falsifiable claims (Tier 1 deterministic / Tier 2 document-falsifiable); judgment claims (Tier 3) produce abstentions, never attestations. Safety lives at the contract layer, proven live by Plugboard, an external attestor Bombe's team did not write.

- Thesis & non-goals: [CONTEXT.md](CONTEXT.md)
- Full spec: [docs/bombe-prd.md](docs/bombe-prd.md)
- Hackathon submission: [HACKATHON.md](HACKATHON.md) · Live deployment: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md)
- For issuers: [/issuers](https://bombe-web.vercel.app/issuers) · Integration guide: [docs/INTEGRATION.md](docs/INTEGRATION.md)
- Model accuracy benchmarks: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)
- Honest readiness assessment: [docs/MARKET-READINESS.md](docs/MARKET-READINESS.md)
- **Live site:** https://bombe-web.vercel.app · **Explorer:** https://sepolia.mantlescan.xyz

---

## Read an attestation (consumer quickstart)

Consuming a verdict is a few read calls against one contract on Mantle Sepolia. No keys, no infra.

```solidity
// AgentAttestation: 0xf2473a0a55D997233C8fBF987c197e7d2180470A  (decision: 0 VALID, 1 REJECTED, 2 ABSTAIN)
interface IAgentAttestation {
    function getClaimAttestors(bytes32 claimId) external view returns (address[] memory);
    function getAttestation(bytes32 claimId, address attestor) external view returns (
        bool exists, uint8 decision, uint16 confidenceBps,
        bytes32 sourcesHash, bytes32 reasoningHash, string memory traceURI, uint256 lockedStake);
}
```

```ts
import { createPublicClient, http } from "viem"; // abi: see docs/INTEGRATION.md or `pnpm gen:abis`
const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const ATT = "0xf2473a0a55D997233C8fBF987c197e7d2180470A";
const who = await client.readContract({ address: ATT, abi, functionName: "getClaimAttestors", args: [claimId] });
const a = await client.readContract({ address: ATT, abi, functionName: "getAttestation", args: [claimId, who[0]] });
// a.decision -> 0 VALID | 1 REJECTED | 2 ABSTAIN ; re-derive a.reasoningHash from the published trace to verify
```

Full guide: [docs/INTEGRATION.md](docs/INTEGRATION.md). Where the project honestly stands today: [docs/MARKET-READINESS.md](docs/MARKET-READINESS.md).

---

## Progress Dashboard

<!-- PROGRESS:START -->
_Generated: 2026-06-07_

### Overall

| Done | In-Progress | Blocked | Pending | Total | % Done |
|------|-------------|---------|---------|-------|--------|
| 74 | 1 | 4 | 9 | 88 | 84% |

### Per-Range Breakdown

| Area | Done | Total |
|------|------|-------|
| T-0xx, ops / workflow / CI | 19 | 19 |
| T-1xx, contracts | 9 | 9 |
| T-2xx, shared + agent-sdk | 14 | 14 |
| T-3xx, reference agents | 4 | 4 |
| T-4xx, runner + indexer + gateway + DB | 6 | 6 |
| T-5xx, Plugboard | 5 | 5 |
| T-6xx, web app | 7 | 8 |
| T-7xx, testing | 3 | 4 |
| T-8xx, live seams + ship | 1 | 7 |
| T-9xx, stretch | 0 | 3 |
| T-Jxx, submission gates | 6 | 9 |

### Test Counts

- forge tests: run `pnpm run ci` for live count
- vitest tests: run `pnpm run ci` for live count

### Operator Items

4 open, 4 resolved (tracked in OPERATOR_TODO.md).
<!-- PROGRESS:END -->

Refresh the dashboard with `pnpm progress`.

---

## Shipping target

Bombe ships **live on Mantle Sepolia**: real LLM inference, real on-chain `attest()` transactions (visible on the explorer at https://sepolia.mantlescan.xyz), and real blob-backed trace traceability. See [`HACKATHON.md`](HACKATHON.md) for the submission spec and judging rubric, and [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md) for the live addresses and a verified end-to-end run.

---

## Contributing

Branch, commit, and PR conventions, the merge policy, the fix-loop, and the operator-handoff protocol are documented in [CLAUDE.md](CLAUDE.md) and [docs/runbooks/workflow.md](docs/runbooks/workflow.md), which are the authoritative references.

---

## Quickstart

```sh
# Activate pnpm (Node 24, corepack)
corepack prepare pnpm@9 --activate

# Install dependencies
pnpm install

# Pull submodules (forge-std, OZ, YieldProof reference)
git submodule update --init --recursive

# Full CI gate: lint + typecheck + forge build + forge test + vitest
pnpm run ci        # NOTE: pnpm run ci (NOT pnpm ci, which is reserved by pnpm)

# Contracts only
forge test --root contracts

# Deep fuzz (10 000 runs)
pnpm test:contracts:deep
```

`pnpm demo` runs the scripted end-to-end demo. The contracts are live on Mantle Sepolia (see [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md)). **Mainnet deployment: July 2026, after the public Sepolia streak validates the loop** (`contracts/script/DeployMainnet.s.sol` is compile-only and is never run in this phase; an empty mainnet registry would be signaling theater, so we do not deploy one).

---

## Tracking

Refresh the dashboard with `pnpm progress`.

> A fuller README (architecture diagram, a "Why not LangGraph / CrewAI / ElizaOS" rationale, an env table, and the Plugboard trust model) is planned and will expand this file.
