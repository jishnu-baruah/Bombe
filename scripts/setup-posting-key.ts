/**
 * scripts/setup-posting-key.ts, one-time setup for the paid-flow posting key (T-612).
 *
 * Generates a DEDICATED posting key (OPERATOR_ROLE only, not the admin/deployer),
 * grants it OPERATOR_ROLE on AgentAttestation via the deployer, and funds it.
 * Writes the keypair to .posting-key.json (gitignored) for the operator to add to
 * Vercel as POSTING_KEY. The private key is never printed.
 *
 * Run: MODE=live node --import ./scripts/node_modules/tsx/dist/esm/index.mjs scripts/setup-posting-key.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  http,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseEther,
  toBytes,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
function loadEnv(p: string): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

const ENV = loadEnv(resolve(ROOT, ".env.local"));
const RPC_URL = process.env.RPC_URL ?? ENV.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const ATTESTATION = (process.env.ATTESTATION_ADDRESS ?? ENV.ATTESTATION_ADDRESS) as `0x${string}`;
const DEPLOYER_KEY = (process.env.DEPLOYER_KEY ?? ENV.DEPLOYER_KEY) as `0x${string}`;
const FUND_MNT = process.env.FUND_MNT ?? "1.0";

const OPERATOR_ROLE = keccak256(toBytes("OPERATOR_ROLE"));
const grantAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
]);

async function main() {
  if (!DEPLOYER_KEY || !ATTESTATION) throw new Error("DEPLOYER_KEY and ATTESTATION_ADDRESS required");
  const chain = mantleSepoliaTestnet;
  const pub = createPublicClient({ chain, transport: http(RPC_URL) });
  const deployer = privateKeyToAccount(DEPLOYER_KEY);
  const deployerWallet = createWalletClient({ account: deployer, chain, transport: http(RPC_URL) });

  // 1. Generate the dedicated posting key.
  const postingKey = generatePrivateKey();
  const posting = privateKeyToAccount(postingKey);
  console.log(`[setup] generated posting address: ${posting.address}`);

  // 2. Grant OPERATOR_ROLE (deployer is admin).
  const already = (await pub.readContract({
    address: ATTESTATION,
    abi: grantAbi,
    functionName: "hasRole",
    args: [OPERATOR_ROLE, posting.address],
  })) as boolean;
  if (!already) {
    const grantTx = await deployerWallet.sendTransaction({
      account: deployer,
      to: ATTESTATION,
      data: encodeFunctionData({
        abi: grantAbi,
        functionName: "grantRole",
        args: [OPERATOR_ROLE, posting.address],
      }),
      chain,
    });
    await pub.waitForTransactionReceipt({ hash: grantTx });
    console.log(`[setup] granted OPERATOR_ROLE: ${grantTx}`);
  } else {
    console.log("[setup] already has OPERATOR_ROLE");
  }

  // 3. Fund the posting key.
  const fundTx = await deployerWallet.sendTransaction({
    account: deployer,
    to: posting.address,
    value: parseEther(FUND_MNT),
    chain,
  });
  await pub.waitForTransactionReceipt({ hash: fundTx });
  console.log(`[setup] funded posting key with ${FUND_MNT} MNT: ${fundTx}`);

  // 4. Persist the keypair for the operator (gitignored); never printed.
  writeFileSync(
    resolve(ROOT, ".posting-key.json"),
    `${JSON.stringify({ address: posting.address, privateKey: postingKey }, null, 2)}\n`,
  );
  const bal = await pub.getBalance({ address: posting.address });
  console.log(`[setup] posting key balance: ${bal.toString()} wei`);
  console.log("[setup] wrote .posting-key.json (gitignored). Add its privateKey to Vercel as POSTING_KEY.");
}

main().catch((e) => {
  console.error("[setup] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
