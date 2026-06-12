/**
 * open-dispute.mjs — one-shot real AgentSlashing.openDispute demonstration.
 *
 * Operator-authorized proof that the dispute logic works on the deployed
 * contract (no contract changes). A registered challenger (Plugboard, distinct
 * from the accused) opens a bonded dispute against an attestor's verdict, then
 * we read it back via getDispute and mark the recorded intake escalated so the
 * verify page links the on-chain dispute.
 *
 * Usage: node open-dispute.mjs <claimId> <accusedAddress>
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import {
  http,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  parseEther,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

const ROOT = "C:/Users/apbar/codeFiles/Bombe";
const ENV = {};
for (const line of readFileSync(`${ROOT}/.env.local`, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const e = t.indexOf("=");
  if (e > 0) ENV[t.slice(0, e).trim()] = t.slice(e + 1).trim().replace(/^"|"$/g, "");
}

const ABI = JSON.parse(
  readFileSync(`${ROOT}/packages/shared/src/abis/AgentSlashing.abi.json`, "utf-8"),
);
const SLASHING = "0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864";
const RPC = ENV.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const DISPUTE_BOND = parseEther("0.05");
const id32 = (s) => stringToHex(s, { size: 32 });

const claimId = process.argv[2];
const accused = process.argv[3];
if (!claimId || !/^0x[0-9a-fA-F]{40}$/.test(accused ?? "")) {
  console.error("usage: node open-dispute.mjs <claimId> <accusedAddress>");
  process.exit(1);
}

const chain = mantleSepoliaTestnet;
const pub = createPublicClient({ chain, transport: http(RPC) });
const challenger = privateKeyToAccount(ENV.PLUGBOARD_WALLET_KEY);
const wallet = createWalletClient({ account: challenger, chain, transport: http(RPC) });

console.log(`challenger (plugboard): ${challenger.address}`);
console.log(`accused: ${accused}  claim: ${claimId}`);
if (challenger.address.toLowerCase() === accused.toLowerCase()) {
  console.error("challenger == accused; pick a different challenger");
  process.exit(1);
}

const hash = await wallet.sendTransaction({
  account: challenger,
  to: SLASHING,
  data: encodeFunctionData({ abi: ABI, functionName: "openDispute", args: [id32(claimId), accused] }),
  value: DISPUTE_BOND,
  chain,
});
console.log(`openDispute tx: https://sepolia.mantlescan.xyz/tx/${hash}`);
const rc = await pub.waitForTransactionReceipt({ hash });
console.log(`status: ${rc.status}`);

let disputeId = null;
for (const log of rc.logs) {
  if (log.address.toLowerCase() !== SLASHING.toLowerCase()) continue;
  try {
    const ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
    if (ev.eventName === "DisputeOpened") {
      disputeId = ev.args.disputeId.toString();
      break;
    }
  } catch {}
}
console.log(`disputeId: ${disputeId}`);

if (rc.status === "success" && disputeId != null) {
  const d = await pub.readContract({
    address: SLASHING,
    abi: ABI,
    functionName: "getDispute",
    args: [BigInt(disputeId)],
  });
  console.log(
    `getDispute -> accused ${d.accused}, challenger ${d.challenger}, bond ${d.bond}, resolved ${d.resolved}`,
  );
  if (ENV.DATABASE_URL) {
    const sql = neon(ENV.DATABASE_URL);
    const rows = await sql`
      UPDATE disputes SET status = 'escalated', dispute_tx_hash = ${hash.toLowerCase()},
        onchain_dispute_id = ${disputeId}
      WHERE claim_id = ${claimId} AND accused = ${accused.toLowerCase()} AND status = 'pending'
      RETURNING id`;
    console.log(`neon: marked ${rows.length} dispute row(s) escalated`);
  }
}
console.log("done");
