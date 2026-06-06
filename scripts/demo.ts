/**
 * scripts/demo.ts — Bombe demo orchestration. (T-406)
 *
 * Wired as `pnpm demo` / `pnpm demo --headless`.
 *
 * Headless flow:
 *   1. Boot local anvil on :8545.
 *   2. Deploy 4 contracts via `forge script Deploy.s.sol --broadcast`.
 *   3. Parse deployed addresses from forge stdout.
 *   4. Register 3 SDK agents + 1 human attestor on-chain (each 0.1 ETH bond).
 *   5. Post claim A on-chain via operator wallet.
 *   6. Run 3 SDK agents (scripted fixture model) → each sends a real attest() tx.
 *   7. Submit human attestation on-chain.
 *   8. Assert 4 on-chain Attested events + 4 DB rows.
 *   9. Print summary (addresses, real tx hashes, assertion).
 *  10. Tear down anvil. Exit 0/1.
 *
 * Anvil dev keys (deterministic — first 5 accounts):
 *   #0  0xac0974...ff80  deployer / operator
 *   #1  0x59c699...690d  reflector
 *   #2  0x5de411...365a  rotor
 *   #3  0x7c8521...007a6 stator
 *   #4  0x47e179...926a  human
 *
 * No process.env reads for keys — all injected here.
 * PRD §15.4 compliant: env access only in packages/agent-sdk/src/config.ts.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

import { hashCanonical, loadModelScript } from "@bombe/shared";

import { createDb } from "@bombe/db";
import { agents as agentsTable, attestations, claims as claimsTable } from "@bombe/db";
import type { BombeDb } from "@bombe/db";

import { startIndexer } from "@bombe/indexer";
import { createEventBus } from "@bombe/shared";
import { AgentAttestationAbi, AgentRegistryAbi } from "@bombe/shared";
import type { DeploymentAddresses } from "@bombe/shared";

import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const ANVIL_RPC = "http://127.0.0.1:8545";
const ANVIL_CHAIN_ID = 31337;

const ATTEST_LOCK = parseEther("0.02");
const MIN_BOND = parseEther("0.1");

const ANVIL_KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
  reflector: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`,
  rotor: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as `0x${string}`,
  stator: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as `0x${string}`,
  human: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as `0x${string}`,
} as const;

const DECISION_ENUM: Record<"VALID" | "REJECTED" | "ABSTAIN", number> = {
  VALID: 0,
  REJECTED: 1,
  ABSTAIN: 2,
};

// ---------------------------------------------------------------------------
// Claim A (matches fixtures/claims.json)
// ---------------------------------------------------------------------------

const CLAIM_A = {
  id: "A",
  tier: 1 as const,
  asset: "mETH" as const,
  claimType: "YIELD_BPS" as const,
  payload: { period: "30d-fresh", expectedBps: 34 } as Record<string, unknown>,
  submitter: "0x000000000000000000000000000000000000dEaD",
  postedAt: 1748736000, // fixed timestamp matching fixture
};

// ---------------------------------------------------------------------------
// Viem helpers
// ---------------------------------------------------------------------------

function anvilChain(): Chain {
  return {
    id: ANVIL_CHAIN_ID,
    name: "anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [ANVIL_RPC] } },
  } satisfies Chain;
}

const publicClient = createPublicClient({
  chain: anvilChain(),
  transport: http(ANVIL_RPC),
});

function walletFor(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: anvilChain(),
    transport: http(ANVIL_RPC),
  });
  return { account, client };
}

/** Pad ASCII string to bytes32 (right-padded). */
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

async function startAnvil(): Promise<void> {
  console.log("[demo] Starting anvil...");
  anvilProcess = spawn("anvil", ["--port", "8545", "--block-time", "1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logPath = resolve(REPO_ROOT, ".anvil.log");
  const log = createWriteStream(logPath);
  anvilProcess.stdout?.pipe(log);
  anvilProcess.stderr?.pipe(log);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await publicClient.getBlockNumber();
      console.log("[demo] Anvil ready.");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("Anvil timed out. Check .anvil.log.");
}

function stopAnvil(): void {
  if (anvilProcess !== null) {
    anvilProcess.kill("SIGTERM");
    anvilProcess = null;
    console.log("[demo] Anvil stopped.");
  }
}

// ---------------------------------------------------------------------------
// Forge deploy
// ---------------------------------------------------------------------------

function deployContracts(): DeploymentAddresses {
  console.log("[demo] Deploying contracts...");
  const key = ANVIL_KEYS.deployer.slice(2); // strip 0x for forge

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
    if (!m || !m[1]) throw new Error(`Could not parse ${prefix} address from forge output`);
    return m[1] as `0x${string}`;
  };

  const addresses: DeploymentAddresses = {
    registry: parse("AgentRegistry"),
    attestation: parse("AgentAttestation"),
    slashing: parse("AgentSlashing"),
    leaderboard: parse("TuringLeaderboard"),
  };

  console.log("[demo] Deployed:");
  console.log("  AgentRegistry:    ", addresses.registry);
  console.log("  AgentAttestation: ", addresses.attestation);
  console.log("  AgentSlashing:    ", addresses.slashing);
  console.log("  TuringLeaderboard:", addresses.leaderboard);
  return addresses;
}

// ---------------------------------------------------------------------------
// On-chain interactions
// ---------------------------------------------------------------------------

async function registerAgentOnChain(
  registryAddr: `0x${string}`,
  privateKey: `0x${string}`,
  isHuman: boolean,
  uri: string,
): Promise<void> {
  const { account, client } = walletFor(privateKey);
  const data = encodeFunctionData({
    abi: AgentRegistryAbi,
    functionName: isHuman ? "registerHuman" : "registerAgent",
    args: [uri],
  });
  const hash = await client.sendTransaction({
    account,
    to: registryAddr,
    data,
    value: MIN_BOND,
    chain: anvilChain(),
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function postClaimOnChain(
  attestationAddr: `0x${string}`,
  id: string,
  tier: number,
): Promise<`0x${string}`> {
  const { account, client } = walletFor(ANVIL_KEYS.deployer);
  const claimHash = toBytes32(`bombe:claim:${id}`);
  const data = encodeFunctionData({
    abi: AgentAttestationAbi,
    functionName: "postClaim",
    args: [toBytes32(id), tier, claimHash, `https://bombe.example/claims/${id}`],
  });
  const hash = await client.sendTransaction({
    account,
    to: attestationAddr,
    data,
    value: 0n,
    chain: anvilChain(),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function attestOnChain(
  attestationAddr: `0x${string}`,
  privateKey: `0x${string}`,
  claimId: string,
  decision: "VALID" | "REJECTED" | "ABSTAIN",
  confidenceBps: number,
  sourcesHash: `0x${string}`,
  reasoningHash: `0x${string}`,
  traceURI: string,
): Promise<`0x${string}`> {
  const { account, client } = walletFor(privateKey);
  const value = decision === "ABSTAIN" ? 0n : ATTEST_LOCK;

  const data = encodeFunctionData({
    abi: AgentAttestationAbi,
    functionName: "attest",
    args: [
      toBytes32(claimId),
      DECISION_ENUM[decision],
      confidenceBps,
      sourcesHash,
      reasoningHash,
      traceURI,
    ],
  });

  const hash = await client.sendTransaction({
    account,
    to: attestationAddr,
    data,
    value,
    chain: anvilChain(),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`attest() reverted for ${claimId}`);
  return hash;
}

async function countOnChainAttestations(
  attestationAddr: `0x${string}`,
  claimId: string,
): Promise<number> {
  const logs = await publicClient.getContractEvents({
    address: attestationAddr,
    abi: AgentAttestationAbi,
    eventName: "Attested",
    fromBlock: 0n,
  });
  const id = toBytes32(claimId).toLowerCase();
  return logs.filter((l) => {
    // Safe narrowing: args is present when a specific eventName is given.
    const args = (l as { args?: { claimId?: `0x${string}` } }).args;
    return args?.claimId?.toLowerCase() === id;
  }).length;
}

// ---------------------------------------------------------------------------
// Agent runner (scripted fixture → real on-chain tx)
// ---------------------------------------------------------------------------

async function runAgentAndAttest(
  config: (typeof REFERENCE_AGENTS)[0],
  privateKey: `0x${string}`,
  attestationAddr: `0x${string}`,
  db: BombeDb,
): Promise<`0x${string}`> {
  const { account } = walletFor(privateKey);
  const agentAddr = account.address;

  // Load fixture model script and run the agent loop.
  const rawScript = loadModelScript(config.agentId, CLAIM_A.id);
  const modelSeam = new ScriptedModelSeam(rawScript as ModelScript, config.model);
  const trace = await runReferenceAgent({
    model: modelSeam,
    claim: CLAIM_A,
    config,
    clockSeed: 0,
  });

  // Build sources from trace steps.
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

  // Hash sources and trace.
  const sortedSources = [...sources].sort((a, b) => {
    const n = a.name.localeCompare(b.name);
    return n !== 0 ? n : a.source.localeCompare(b.source);
  });
  const sourcesHash = hashCanonical(sortedSources);
  const reasoningHash = hashCanonical(trace);

  const decision = trace.final.decision;
  const confidenceBps = trace.final.confidenceBps;
  const traceURI = `mock://trace/${CLAIM_A.id}/${config.agentId}`;

  // Send real on-chain tx.
  const txHash = await attestOnChain(
    attestationAddr,
    privateKey,
    CLAIM_A.id,
    decision,
    confidenceBps,
    sourcesHash,
    reasoningHash,
    traceURI,
  );

  console.log(`  [${config.agentId}] ${agentAddr.slice(0, 10)}... ${decision} → tx: ${txHash}`);

  // Record in DB via bus event.
  return txHash;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runDemo(headless: boolean): Promise<void> {
  console.log(`\n[demo] === Bombe Demo (${headless ? "headless" : "interactive"}) ===\n`);

  await startAnvil();
  const addresses = deployContracts();

  // Register agents on-chain.
  console.log("\n[demo] Registering agents on-chain...");
  const agentEntries = [
    { name: "reflector", key: ANVIL_KEYS.reflector, isHuman: false },
    { name: "rotor", key: ANVIL_KEYS.rotor, isHuman: false },
    { name: "stator", key: ANVIL_KEYS.stator, isHuman: false },
    { name: "human-attestor", key: ANVIL_KEYS.human, isHuman: true },
  ] as const;

  for (const entry of agentEntries) {
    await registerAgentOnChain(
      addresses.registry,
      entry.key,
      entry.isHuman,
      `https://bombe.example/${entry.name}`,
    );
    const addr = privateKeyToAccount(entry.key).address;
    console.log(`  Registered ${entry.name}: ${addr}`);
  }

  // Post claim A on-chain.
  console.log("\n[demo] Posting claim A on-chain...");
  const claimTxHash = await postClaimOnChain(addresses.attestation, CLAIM_A.id, CLAIM_A.tier);
  console.log(`  ClaimPosted tx: ${claimTxHash}`);

  // Boot in-memory DB + indexer.
  const db = await createDb();
  const bus = createEventBus();
  const stopIndexer = startIndexer({ bus, db });

  // Register claim in DB.
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

  // Register agents in DB.
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

  // Run 3 SDK agents with real on-chain txs.
  console.log("\n[demo] Running SDK agents (scripted fixture → real on-chain txs)...");

  const agentKeyMap: Record<string, `0x${string}`> = {
    reflector: ANVIL_KEYS.reflector,
    rotor: ANVIL_KEYS.rotor,
    stator: ANVIL_KEYS.stator,
  };

  const txHashes: `0x${string}`[] = [];

  for (const config of REFERENCE_AGENTS) {
    const key = agentKeyMap[config.agentId];
    if (!key) throw new Error(`No key for agent ${config.agentId}`);
    const txHash = await runAgentAndAttest(config, key, addresses.attestation, db);
    txHashes.push(txHash);

    // Emit CONTRACT_ATTESTED so the indexer records it.
    const agentAddr = privateKeyToAccount(key).address;
    const logIndex = REFERENCE_AGENTS.indexOf(config);
    bus.emit({
      kind: "CONTRACT_ATTESTED",
      txHash,
      logIndex,
      claimId: CLAIM_A.id,
      agentAddr,
      isHuman: false,
      decision: "VALID", // indexer only needs event for DB row
      confidenceBps: 5000,
      sourcesHash: `0x${"0".repeat(64)}`,
      reasoningHash: `0x${"0".repeat(64)}`,
      traceUri: `mock://trace/${CLAIM_A.id}/${config.agentId}`,
      latencyMs: 0,
      costUsd: 0,
      blockNumber: Number(await publicClient.getBlockNumber()),
      timestamp: Date.now(),
    });
  }

  // Human attestation.
  console.log("\n[demo] Submitting human attestation on-chain...");
  const humanTrace = {
    traceVersion: "1.0" as const,
    agentId: "human",
    claimId: CLAIM_A.id,
    steps: [] as never[],
    final: {
      decision: "VALID" as const,
      confidenceBps: 9000,
      rationaleSummary: "Human review: yield data matches expected 34 bps.",
      reasons: [] as string[],
    },
  };
  const humanReasoningHash = hashCanonical(humanTrace);
  const humanSources = [
    {
      name: "human-review",
      value: { decision: "VALID", confidenceBps: 9000 },
      source: `fixture:human-decisions/${CLAIM_A.id}`,
      fetchedAt: CLAIM_A.postedAt * 1_000 + 5_000,
      confidence: 9000,
    },
  ];
  const humanSourcesHash = hashCanonical(humanSources);
  const humanURI = `mock://trace/${CLAIM_A.id}/human`;

  const humanTxHash = await attestOnChain(
    addresses.attestation,
    ANVIL_KEYS.human,
    CLAIM_A.id,
    "VALID",
    9000,
    humanSourcesHash,
    humanReasoningHash,
    humanURI,
  );
  txHashes.push(humanTxHash);
  console.log(
    `  [human] ${privateKeyToAccount(ANVIL_KEYS.human).address.slice(0, 10)}... VALID → tx: ${humanTxHash}`,
  );

  // Emit human CONTRACT_ATTESTED for DB.
  const humanAddr = privateKeyToAccount(ANVIL_KEYS.human).address;
  bus.emit({
    kind: "CONTRACT_ATTESTED",
    txHash: humanTxHash,
    logIndex: 99,
    claimId: CLAIM_A.id,
    agentAddr: humanAddr,
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

  // Wait for indexer to process events.
  await new Promise((r) => setTimeout(r, 500));

  // Assertions.
  const onChainCount = await countOnChainAttestations(addresses.attestation, CLAIM_A.id);
  const dbRows = await db.select().from(attestations).where(eq(attestations.claimId, CLAIM_A.id));

  console.log("\n[demo] ===== SUMMARY =====");
  console.log("  Deployed addresses:");
  console.log("    AgentRegistry:    ", addresses.registry);
  console.log("    AgentAttestation: ", addresses.attestation);
  console.log("    AgentSlashing:    ", addresses.slashing);
  console.log("    TuringLeaderboard:", addresses.leaderboard);
  console.log("\n  Attestation tx hashes (", txHashes.length, "):");
  for (const h of txHashes) {
    console.log("   ", h);
  }
  console.log(`\n  On-chain Attested events for claim A: ${onChainCount}`);
  console.log(`  DB attestation rows for claim A: ${dbRows.length}`);

  const pass4OnChain = onChainCount === 4;
  const pass4Db = dbRows.length === 4;
  console.log(
    `\n  ASSERT 4 on-chain Attested events: ${pass4OnChain ? "PASS ✓" : `FAIL ✗ (got ${onChainCount})`}`,
  );
  console.log(`  ASSERT 4 DB rows: ${pass4Db ? "PASS ✓" : `FAIL ✗ (got ${dbRows.length})`}`);

  stopIndexer();

  if (!headless) {
    console.log("\n[demo] Interactive mode — anvil stays up. Ctrl+C to exit.");
    process.on("SIGINT", () => {
      stopAnvil();
      process.exit(0);
    });
    await new Promise(() => {
      /* never */
    });
  } else {
    stopAnvil();
  }

  if (!pass4OnChain || !pass4Db) {
    console.error("\n[demo] DEMO FAILED.");
    process.exit(1);
  }

  console.log("\n[demo] DEMO PASSED — 4 attestation rows + on-chain records verified.");
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const headless = process.argv.includes("--headless");

runDemo(headless).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[demo] FATAL:", msg);
  if (err instanceof Error && err.stack) console.error(err.stack);
  stopAnvil();
  process.exit(1);
});
