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
_Generated: 2026-06-06_

### Overall

| Done | In-Progress | Blocked | Pending | Total | % Done |
|------|-------------|---------|---------|-------|--------|
| 69 | 0 | 0 | 10 | 79 | 87% |

### Per-Range Breakdown

| Area | Done | Total |
|------|------|-------|
| Ops | 14 | 14 |
| Contracts (M1) | 10 | 10 |
| shared + agent-sdk (M2) | 14 | 14 |
| reference agents (M2/M4) | 6 | 6 |
| runner + indexer + gateway + DB (M3) | 6 | 6 |
| Plugboard mock path (M4) | 5 | 5 |
| web app (M5) | 9 | 10 |
| autonomous testing (M6) | 3 | 4 |
| live seams + ship (M8) | 1 | 7 |
| STRETCH (M7) | 1 | 3 |

### Test Counts

- 77 forge tests
- 668 vitest tests

### Operator Items

5 open, 4 resolved (tracked in OPERATOR_TODO.md).
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
