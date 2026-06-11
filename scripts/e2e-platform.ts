/**
 * scripts/e2e-platform.ts — REAL end-to-end through the actual platform route.
 *
 * Drives POST /api/v1/request exactly as the website does: make a real payment on
 * Mantle Sepolia, submit the payment hash, let the live server verify + post + attest +
 * store the trace, then verify the returned claim on-chain and dump the real LLM trace.
 * Funds the live posting key from the deployer if needed (operator-authorized, <= 5 MNT).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http, createPublicClient, createWalletClient, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ENV: Record<string, string> = {};
for (const line of readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const e = t.indexOf("=");
  if (e > 0) ENV[t.slice(0, e).trim()] = t.slice(e + 1).trim();
}
const POSTING = JSON.parse(readFileSync(resolve(__dirname, "..", ".posting-key.json"), "utf-8"));

const SITE = "https://bombe-web.vercel.app";
const rpc = ENV.RPC_URL;
const chain = mantleSepoliaTestnet;
const pub = createPublicClient({ chain, transport: http(rpc) });
const deployer = privateKeyToAccount(ENV.DEPLOYER_KEY as `0x${string}`);
const PAYMENT_ADDRESS = (deployer.address as string).toLowerCase(); // route default = deployer
const wallet = createWalletClient({ account: deployer, chain, transport: http(rpc) });

const ASSET = process.env.ASSET ?? "mETH";
const ASSERTED = Number(process.env.ASSERTED_BPS ?? "192");

const wei = (n: bigint) => (Number(n) / 1e18).toFixed(4);

// 1. Make sure the live poster (POSTING_KEY) AND attestor (ATTESTOR_KEY = AGENT_KEYS[0])
//    are funded; both run server-side in the /request fulfill path.
const attestor = privateKeyToAccount((ENV.AGENT_KEYS ?? "").split(",")[0]?.trim() as `0x${string}`);
for (const w of [
  { name: "posting", addr: POSTING.address as `0x${string}`, top: "0.5" },
  { name: "attestor", addr: attestor.address, top: "1.0" },
]) {
  const bal = await pub.getBalance({ address: w.addr });
  console.log(`${w.name} key ${w.addr}: ${wei(bal)} MNT`);
  if (bal < parseEther("0.15")) {
    console.log(`  funding ${w.name} ${w.top} MNT from deployer (authorized)...`);
    const ftx = await wallet.sendTransaction({
      account: deployer,
      to: w.addr,
      value: parseEther(w.top),
      chain,
    });
    await pub.waitForTransactionReceipt({ hash: ftx });
    console.log(`  funded: ${ftx}`);
  }
}

// 2. Pay the fee on-chain (deployer -> PAYMENT_ADDRESS), exactly like the website's wallet.
console.log(`\npaying 0.05 MNT to ${PAYMENT_ADDRESS} (the fee)...`);
const payTx = await wallet.sendTransaction({
  account: deployer,
  to: PAYMENT_ADDRESS as `0x${string}`,
  value: parseEther("0.05"),
  chain,
});
await pub.waitForTransactionReceipt({ hash: payTx });
console.log(`  payment tx: https://sepolia.mantlescan.xyz/tx/${payTx}`);

// 3. Submit to the REAL platform route.
console.log(`\nPOST ${SITE}/api/v1/request  (asset=${ASSET} asserted=${ASSERTED} bps)...`);
const res = await fetch(`${SITE}/api/v1/request`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    asset: ASSET,
    claimType: "YIELD_BPS",
    assertedBps: ASSERTED,
    windowDays: 30,
    payer: deployer.address,
    paymentTxHash: payTx,
  }),
});
const data = await res.json();
console.log(`  HTTP ${res.status}:`, JSON.stringify(data, null, 2));

// 4. Verify the returned claim through the platform's own verify route.
const claimId = data.claimId as string | undefined;
if (claimId) {
  console.log(`\nverifying claim ${claimId} via /api/v1/verify ...`);
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const v = await (await fetch(`${SITE}/api/v1/verify/${encodeURIComponent(claimId)}`)).json();
    console.log(`  attempt ${i + 1}:`, JSON.stringify(v).slice(0, 400));
    if (JSON.stringify(v).includes("verified") || JSON.stringify(v).includes("VALID")) break;
  }
}
console.log("\n=== done ===");
