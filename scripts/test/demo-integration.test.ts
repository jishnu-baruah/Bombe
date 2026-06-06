/**
 * scripts/test/demo-integration.test.ts — Anvil integration test. (T-406)
 *
 * Boots a local anvil, deploys all 4 contracts, seeds claim A, runs the 3 SDK
 * agents + human attestor, and asserts:
 *   - 4 on-chain Attested events for claim A
 *   - 4 DB attestation rows for claim A
 *   - All 4 tx hashes are non-zero real chain hashes
 *
 * GATING: This test requires a live anvil process and is intentionally NOT
 * included in the fast pnpm run ci suite. Run separately with pnpm test:integration.
 *
 * The test is excluded from vitest.config.ts include paths so that
 * pnpm run ci stays green even without anvil present.
 *
 * The unit-level pieces (ABI parse, viem wallet encoding) are covered by the
 * fast suite (see abi-bridge.test.ts and seams/live.test.ts).
 *
 * Timeout: 120 000 ms (generous, forge deploy can be slow on first run).
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  http,
  type Chain,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  type ModelScript,
  REFERENCE_AGENTS,
  ScriptedModelSeam,
  runReferenceAgent,
} from "@bombe/agent-reference";
import { type Source, StubClockSeam } from "@bombe/agent-sdk";
import {
  type BombeDb,
  agents as agentsTable,
  attestations,
  claims as claimsTable,
  createDb,
} from "@bombe/db";
import { startIndexer } from "@bombe/indexer";
import {
  AgentAttestationAbi,
  AgentRegistryAbi,
  type DeploymentAddresses,
  createEventBus,
  hashCanonical,
  loadModelScript,
} from "@bombe/shared";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const ANVIL_RPC = "http://127.0.0.1:18545"; // different port from demo to avoid collision
const ANVIL_CHAIN_ID = 31337;
const ATTEST_LOCK = parseEther("0.02");
const CLAIM_FEE = parseEther("0.01");
const MIN_BOND = parseEther("0.1");

const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
  reflector: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`,
  rotor: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as `0x${string}`,
  stator: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as `0x${string}`,
  human: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as `0x${string}`,
};

const CLAIM_A = {
  id: "A",
  tier: 1 as const,
  asset: "mETH" as const,
  claimType: "YIELD_BPS" as const,
  payload: { period: "30d-fresh", expectedBps: 34 } as Record<string, unknown>,
  submitter: "0x000000000000000000000000000000000000dEaD",
  postedAt: 1748736000,
};

const DECISION_ENUM: Record<"VALID" | "REJECTED" | "ABSTAIN", number> = {
  VALID: 0,
  REJECTED: 1,
  ABSTAIN: 2,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function testChain(): Chain {
  return {
    id: ANVIL_CHAIN_ID,
    name: "anvil-test",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [ANVIL_RPC] } },
  } satisfies Chain;
}

const publicClient = createPublicClient({
  chain: testChain(),
  transport: http(ANVIL_RPC),
});

function walletFor(key: `0x${string}`) {
  const account = privateKeyToAccount(key);
  const client = createWalletClient({
    account,
    chain: testChain(),
    transport: http(ANVIL_RPC),
  });
  return { account, client };
}

function toBytes32(str: string): `0x${string}` {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  return `0x${Array.from(padded)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

// ---------------------------------------------------------------------------
// Anvil lifecycle
// ---------------------------------------------------------------------------

let anvilProcess: ChildProcess | null = null;
let deployedAddresses: DeploymentAddresses | null = null;
let testDb: BombeDb | null = null;

async function startAnvil(): Promise<void> {
  anvilProcess = spawn("anvil", ["--port", "18545", "--block-time", "1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const log = createWriteStream(resolve(REPO_ROOT, ".anvil-integration.log"));
  anvilProcess.stdout?.pipe(log);
  anvilProcess.stderr?.pipe(log);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await publicClient.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("Anvil integration test: failed to start within 15s");
}

function stopAnvil(): void {
  if (anvilProcess !== null) {
    anvilProcess.kill("SIGTERM");
    anvilProcess = null;
  }
}

function deployContracts(): DeploymentAddresses {
  const key = KEYS.deployer.slice(2);
  const output = execSync(
    [
      "forge script script/Deploy.s.sol",
      "--broadcast",
      `--rpc-url ${ANVIL_RPC}`,
      `--private-key ${key}`,
      "--legacy",
    ].join(" "),
    { cwd: resolve(REPO_ROOT, "contracts"), encoding: "utf-8", timeout: 60_000 },
  );

  const parse = (prefix: string): `0x${string}` => {
    const m = output.match(new RegExp(`${prefix}:\\s+(0x[0-9a-fA-F]{40})`));
    if (!m?.[1]) throw new Error(`Could not parse ${prefix} from forge output`);
    return m[1] as `0x${string}`;
  };

  return {
    registry: parse("AgentRegistry"),
    attestation: parse("AgentAttestation"),
    slashing: parse("AgentSlashing"),
    leaderboard: parse("TuringLeaderboard"),
  };
}

// ---------------------------------------------------------------------------
// Before / After
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await startAnvil();
  deployedAddresses = deployContracts();
  testDb = await createDb();
}, 90_000);

afterAll(() => {
  stopAnvil();
});

// ---------------------------------------------------------------------------
// Integration test
// ---------------------------------------------------------------------------

describe(
  "Anvil integration: claim A → 4 attestations",
  () => {
    it("deploys contracts, registers agents, posts claim A, gets 4 on-chain + 4 DB attestations", async () => {
      expect(deployedAddresses).not.toBeNull();
      expect(testDb).not.toBeNull();
      const addresses = deployedAddresses as NonNullable<typeof deployedAddresses>;
      const db = testDb as NonNullable<typeof testDb>;

      // Register agents on-chain.
      const agentEntries = [
        { name: "reflector", key: KEYS.reflector, isHuman: false },
        { name: "rotor", key: KEYS.rotor, isHuman: false },
        { name: "stator", key: KEYS.stator, isHuman: false },
        { name: "human-attestor", key: KEYS.human, isHuman: true },
      ] as const;

      for (const entry of agentEntries) {
        const { account, client } = walletFor(entry.key);
        const data = encodeFunctionData({
          abi: AgentRegistryAbi,
          functionName: entry.isHuman ? "registerHuman" : "registerAgent",
          args: [`https://bombe.example/${entry.name}`],
        });
        const hash = await client.sendTransaction({
          account,
          to: addresses.registry,
          data,
          value: MIN_BOND,
          chain: testChain(),
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      // Post claim A on-chain.
      {
        const { account, client } = walletFor(KEYS.deployer);
        const data = encodeFunctionData({
          abi: AgentAttestationAbi,
          functionName: "postClaim",
          args: [
            toBytes32(CLAIM_A.id),
            CLAIM_A.tier,
            toBytes32(`bombe:claim:${CLAIM_A.id}`),
            `https://bombe.example/claims/${CLAIM_A.id}`,
          ],
        });
        const hash = await client.sendTransaction({
          account,
          to: addresses.attestation,
          data,
          value: CLAIM_FEE,
          chain: testChain(),
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      // Boot DB indexer.
      await db
        .insert(claimsTable)
        .values({
          id: CLAIM_A.id,
          tier: CLAIM_A.tier,
          asset: CLAIM_A.asset,
          claimType: CLAIM_A.claimType,
          payload: CLAIM_A.payload,
          status: "open",
          postedAt: CLAIM_A.postedAt,
        })
        .onConflictDoNothing();

      for (const entry of agentEntries) {
        const addr = privateKeyToAccount(entry.key).address;
        await db
          .insert(agentsTable)
          .values({
            addr,
            name: entry.name,
            isHuman: entry.isHuman,
            bondWei: MIN_BOND.toString(),
            reputation: 0,
            registeredAt: Date.now(),
          })
          .onConflictDoNothing();
      }

      const bus = createEventBus();
      const stopIndexer = startIndexer({ bus, db });
      const txHashes: `0x${string}`[] = [];

      // Run 3 SDK agents.
      const agentKeyMap: Record<string, `0x${string}`> = {
        reflector: KEYS.reflector,
        rotor: KEYS.rotor,
        stator: KEYS.stator,
      };

      for (const config of REFERENCE_AGENTS) {
        const key = agentKeyMap[config.agentId];
        if (!key) throw new Error(`No key for ${config.agentId}`);

        const rawScript = loadModelScript(config.agentId, CLAIM_A.id);
        const trace = await runReferenceAgent({
          model: new ScriptedModelSeam(rawScript as ModelScript, config.model),
          claim: CLAIM_A,
          config,
          clockSeed: 0,
        });

        const submitClock = new StubClockSeam(
          Array.from({ length: 50 }, (_, i) => CLAIM_A.postedAt * 1_000 + 2_000 + i * 10),
        );

        const sources: Source[] = [];
        for (const step of trace.steps) {
          const obs = step.observation;
          if (obs !== null && obs !== undefined && typeof obs === "object" && "source" in obs) {
            const o = obs as Record<string, unknown>;
            sources.push({
              name: String(o.source ?? "unknown"),
              value: o.value ?? null,
              source: String(o.source ?? "unknown"),
              fetchedAt: typeof o.fetchedAt === "number" ? o.fetchedAt : submitClock.now(),
              confidence: typeof o.confidence === "number" ? o.confidence : 5000,
            });
          }
        }
        if (sources.length === 0) {
          sources.push({
            name: "scripted",
            value: null,
            source: `fixture:model-scripts/${config.agentId}/${CLAIM_A.id}.json`,
            fetchedAt: CLAIM_A.postedAt * 1_000,
            confidence: 5000,
          });
        }

        const sorted = [...sources].sort((a, b) => {
          const n = a.name.localeCompare(b.name);
          return n !== 0 ? n : a.source.localeCompare(b.source);
        });
        const sourcesHash = hashCanonical(sorted);
        const reasoningHash = hashCanonical(trace);
        const decision = trace.final.decision;
        const confidenceBps = trace.final.confidenceBps;
        const traceURI = `mock://trace/${CLAIM_A.id}/${config.agentId}`;
        const value = decision === "ABSTAIN" ? 0n : ATTEST_LOCK;

        const { account, client } = walletFor(key);
        const data = encodeFunctionData({
          abi: AgentAttestationAbi,
          functionName: "attest",
          args: [
            toBytes32(CLAIM_A.id),
            DECISION_ENUM[decision],
            confidenceBps,
            sourcesHash,
            reasoningHash,
            traceURI,
          ],
        });

        const txHash = await client.sendTransaction({
          account,
          to: addresses.attestation,
          data,
          value,
          chain: testChain(),
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        expect(receipt.status).toBe("success");
        txHashes.push(txHash);

        // Emit for DB indexer.
        bus.emit({
          kind: "CONTRACT_ATTESTED",
          txHash,
          logIndex: REFERENCE_AGENTS.indexOf(config),
          claimId: CLAIM_A.id,
          agentAddr: account.address,
          isHuman: false,
          decision,
          confidenceBps,
          sourcesHash,
          reasoningHash,
          traceUri: traceURI,
          latencyMs: 0,
          costUsd: 0,
          blockNumber: Number(await publicClient.getBlockNumber()),
          timestamp: Date.now(),
        });
      }

      // Human attestation.
      const humanTrace = {
        traceVersion: "1.0" as const,
        agentId: "human",
        claimId: CLAIM_A.id,
        steps: [] as never[],
        final: {
          decision: "VALID" as const,
          confidenceBps: 9000,
          rationaleSummary: "Human review.",
          reasons: [] as string[],
        },
      };
      const humanReasoningHash = hashCanonical(humanTrace);
      const humanSources = [
        {
          name: "human-review",
          value: { decision: "VALID" },
          source: `fixture:human-decisions/${CLAIM_A.id}`,
          fetchedAt: CLAIM_A.postedAt * 1_000 + 5_000,
          confidence: 9000,
        },
      ];
      const humanSourcesHash = hashCanonical(humanSources);
      const humanURI = `mock://trace/${CLAIM_A.id}/human`;

      const { account: humanAccount, client: humanClient } = walletFor(KEYS.human);
      const humanData = encodeFunctionData({
        abi: AgentAttestationAbi,
        functionName: "attest",
        args: [
          toBytes32(CLAIM_A.id),
          DECISION_ENUM.VALID,
          9000,
          humanSourcesHash,
          humanReasoningHash,
          humanURI,
        ],
      });
      const humanTxHash = await humanClient.sendTransaction({
        account: humanAccount,
        to: addresses.attestation,
        data: humanData,
        value: ATTEST_LOCK,
        chain: testChain(),
      });
      const humanReceipt = await publicClient.waitForTransactionReceipt({ hash: humanTxHash });
      expect(humanReceipt.status).toBe("success");
      txHashes.push(humanTxHash);

      bus.emit({
        kind: "CONTRACT_ATTESTED",
        txHash: humanTxHash,
        logIndex: 99,
        claimId: CLAIM_A.id,
        agentAddr: humanAccount.address,
        isHuman: true,
        decision: "VALID",
        confidenceBps: 9000,
        sourcesHash: humanSourcesHash,
        reasoningHash: humanReasoningHash,
        traceUri: humanURI,
        latencyMs: 0,
        costUsd: 0,
        blockNumber: Number(await publicClient.getBlockNumber()),
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 500)); // let indexer settle

      // Assert 4 tx hashes.
      expect(txHashes).toHaveLength(4);
      for (const h of txHashes) {
        expect(h).toMatch(/^0x[0-9a-fA-F]{64}$/);
      }

      // Assert 4 on-chain Attested events.
      const logs = await publicClient.getContractEvents({
        address: addresses.attestation,
        abi: AgentAttestationAbi,
        eventName: "Attested",
        fromBlock: 0n,
      });
      const claimId32 = toBytes32(CLAIM_A.id).toLowerCase();
      const onChainCount = logs.filter((l) => {
        const args = (l as { args?: { claimId?: `0x${string}` } }).args;
        return args?.claimId?.toLowerCase() === claimId32;
      }).length;
      expect(onChainCount).toBe(4);

      // Assert 4 DB rows.
      const dbRows = await db
        .select()
        .from(attestations)
        .where(eq(attestations.claimId, CLAIM_A.id));
      expect(dbRows).toHaveLength(4);

      stopIndexer();

      console.log("\n[integration] PASS: 4 on-chain attestations + 4 DB rows");
      console.log("  Addresses:", addresses);
      console.log("  Tx hashes:", txHashes);
    }, 120_000);
  },
  { timeout: 120_000 },
);
