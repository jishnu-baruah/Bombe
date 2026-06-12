/**
 * scripts/plugboard-live.ts — drive the REAL external Plugboard attestor on-chain.
 *
 * Plugboard is a registered agent wallet (PLUGBOARD_WALLET_KEY) that is NOT one of
 * Bombe's SDK attestor keys. This proves the safety thesis live, not by replay:
 *   1. Mistral (the agent's model) reasons over a real Tier-1 claim, Plugboard
 *      attests it on-chain. A real attestation from an agent we did not write.
 *   2. Plugboard attempts to attest a Tier-3 judgment claim VALID. The contract
 *      reverts it (JudgmentTierRequiresAbstain). The failed tx is the proof that
 *      safety lives in the contract, not in the agent's good behavior.
 *
 * Operator-authorized: funds Plugboard from the deployer (<= 5 MNT). Posting uses
 * the deployer (OPERATOR_ROLE); attesting uses the Plugboard wallet itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentAttestationAbi, hashCanonical } from "@bombe/shared";
import {
  http,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  parseEther,
  stringToHex,
} from "viem";
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
// The narrator (LLM) creds live in the hosting env, not .env.local. Let them be
// passed inline via process.env so the agent genuinely reasons over each claim.
for (const k of ["NARRATOR_PRIMARY_KEY", "NARRATOR_PRIMARY_BASE_URL", "NARRATOR_PRIMARY_MODEL"]) {
  if (process.env[k]) ENV[k] = process.env[k] as string;
}

const chain = mantleSepoliaTestnet;
const RPC = ENV.RPC_URL;
const ATTESTATION = "0xf2473a0a55D997233C8fBF987c197e7d2180470A" as const;
const SITE = "https://bombe-web.vercel.app";
const CLAIM_FEE = parseEther("0.01");
const ATTEST_LOCK = parseEther("0.02");
const VALID = 0; // decision enum: VALID=0, REJECTED=1, ABSTAIN=2

const pub = createPublicClient({ chain, transport: http(RPC) });
const deployer = privateKeyToAccount(ENV.DEPLOYER_KEY as `0x${string}`);
const plugboard = privateKeyToAccount(ENV.PLUGBOARD_WALLET_KEY as `0x${string}`);
const op = createWalletClient({ account: deployer, chain, transport: http(RPC) });
const pb = createWalletClient({ account: plugboard, chain, transport: http(RPC) });

const tx = (h: string) => `https://sepolia.mantlescan.xyz/tx/${h}`;
const id32 = (s: string) => stringToHex(s, { size: 32 });
const now = Date.now();

// The Plugboard agent's model reasons over the claim (real LLM call, Mistral).
async function reason(claim: unknown): Promise<{ decision: string; why: string }> {
  const sys =
    'You are Plugboard, an EXTERNAL attestor agent on the Bombe network. Rules: Tier 1 claims are deterministic facts (attest VALID or REJECTED). Tier 3 claims are judgment or opinion (fair value, ratings) and you MUST ABSTAIN. Respond with STRICT JSON only: {"decision":"VALID"|"REJECTED"|"ABSTAIN","why":"one short sentence"}.';
  const r = await fetch(
    `${ENV.NARRATOR_PRIMARY_BASE_URL ?? "https://api.mistral.ai/v1"}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.NARRATOR_PRIMARY_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ENV.NARRATOR_PRIMARY_MODEL ?? "mistral-small-latest",
        temperature: 0.1,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Claim: ${JSON.stringify(claim)}` },
        ],
      }),
    },
  );
  const j = await r.json();
  const text: string = j.choices?.[0]?.message?.content ?? "";
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : text);
  } catch {
    return { decision: "?", why: text.slice(0, 120) };
  }
}

async function postClaim(idStr: string, tier: number, claim: object): Promise<`0x${string}`> {
  const h = await op.sendTransaction({
    account: deployer,
    to: ATTESTATION,
    data: encodeFunctionData({
      abi: AgentAttestationAbi,
      functionName: "postClaim",
      args: [id32(idStr), tier, hashCanonical(claim), `${SITE}/api/v1/claims/${idStr}`],
    }),
    value: CLAIM_FEE,
    chain,
  });
  await pub.waitForTransactionReceipt({ hash: h });
  return h;
}

// Plugboard attests with its OWN key. Explicit gas so a reverting attest still
// lands on-chain as a real failed tx (the proof) instead of failing estimation.
async function plugboardAttest(idStr: string, decision: number, trace: object) {
  const h = await pb.sendTransaction({
    account: plugboard,
    to: ATTESTATION,
    data: encodeFunctionData({
      abi: AgentAttestationAbi,
      functionName: "attest",
      args: [
        id32(idStr),
        decision,
        9000,
        hashCanonical([{ name: "plugboard", source: "hermes-skill" }]),
        hashCanonical(trace),
        `${SITE}/api/trace/${idStr}/${plugboard.address.toLowerCase()}`,
      ],
    }),
    value: ATTEST_LOCK,
    gas: 500000n,
    chain,
  });
  const rc = await pub.waitForTransactionReceipt({ hash: h });
  return { h, status: rc.status };
}

// ---- run ----
console.log(`Plugboard (external attestor): ${plugboard.address}`);
const bal = await pub.getBalance({ address: plugboard.address });
console.log(`balance: ${formatEther(bal)} MNT`);
if (bal < parseEther("0.1")) {
  console.log("funding Plugboard 0.2 MNT from deployer (authorized)...");
  const f = await op.sendTransaction({
    account: deployer,
    to: plugboard.address,
    value: parseEther("0.2"),
    chain,
  });
  await pub.waitForTransactionReceipt({ hash: f });
  console.log(`  funded: ${tx(f)}`);
}

// 1) Tier-1: a deterministic yield claim. Plugboard reasons + attests for real.
const t1Id = `PB-T1-${now}`;
const t1Claim = {
  asset: "mETH",
  claimType: "YIELD_BPS",
  assertedBps: 192,
  windowDays: 31,
  tier: 1,
};
console.log(`\n=== TIER 1: ${t1Id} ===`);
console.log(`post: ${tx(await postClaim(t1Id, 1, t1Claim))}`);
const r1 = await reason(t1Claim);
console.log(`Plugboard/Mistral decision: ${r1.decision} - ${r1.why}`);
const a1 = await plugboardAttest(t1Id, VALID, {
  agent: "plugboard",
  claim: t1Claim,
  reasoning: r1,
});
console.log(`attest tx: ${tx(a1.h)}  => status: ${a1.status}`);

// 2) Tier-3: a judgment claim. Plugboard attempts VALID; the contract must revert.
const t3Id = `PB-T3-${now}`;
const t3Claim = {
  asset: "PrivatePool-1",
  claimType: "FAIR_VALUE",
  assertedValueUsd: 4_200_000,
  tier: 3,
};
console.log(`\n=== TIER 3: ${t3Id} (judgment) ===`);
console.log(`post: ${tx(await postClaim(t3Id, 3, t3Claim))}`);
const r3 = await reason(t3Claim);
console.log(`Plugboard/Mistral decision: ${r3.decision} - ${r3.why}`);
console.log(
  "Plugboard now ATTEMPTS to attest VALID on the judgment claim (testing the contract guard)...",
);
const a3 = await plugboardAttest(t3Id, VALID, {
  agent: "plugboard",
  claim: t3Claim,
  reasoning: r3,
});
console.log(`attest tx: ${tx(a3.h)}  => status: ${a3.status}`);
console.log(
  a3.status === "reverted"
    ? "\nPROOF: the contract REVERTED an external agent's judgment attestation on-chain. Safety lives in the contract."
    : "\nUNEXPECTED: the Tier-3 attestation did not revert. Investigate.",
);
console.log("\n=== done ===");
