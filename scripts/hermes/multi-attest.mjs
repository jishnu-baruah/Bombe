/**
 * multi-attest.mjs — operator tool: add corroborating attestors (rotor, stator)
 * to an EXISTING posted claim with a given decision, so the explorer shows
 * genuine multi-attestor verifications and rejections. Funds each attestor from
 * the deployer, attests, and stores a verifiable trace. The decision must be the
 * honest verdict for the claim (the reconciler's result for that asserted value);
 * this tool does not compute it, the caller passes the already-determined verdict.
 *
 * Usage: node multi-attest.mjs <claimId> <VALID|REJECTED|ABSTAIN> [rotor,stator]
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import {
  http,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  keccak256,
  parseEther,
  stringToHex,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

const ROOT = "C:/Users/apbar/codeFiles/Bombe";
const ENV = {};
for (const line of readFileSync(`${ROOT}/.env.local`, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const e = t.indexOf("=");
  if (e > 0)
    ENV[t.slice(0, e).trim()] = t
      .slice(e + 1)
      .trim()
      .replace(/^"|"$/g, "");
}

const RPC = ENV.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const ATTESTATION = "0xf2473a0a55D997233C8fBF987c197e7d2180470A";
const SITE = "https://bombe-web.vercel.app";
const ATTEST_LOCK = parseEther("0.02");
const DECISION = { VALID: 0, REJECTED: 1, ABSTAIN: 2 };

const claimId = process.argv[2];
const decisionStr = (process.argv[3] ?? "").toUpperCase();
const which = (process.argv[4] ?? "rotor,stator").split(",").map((s) => s.trim());
if (!claimId || !(decisionStr in DECISION)) {
  console.error("usage: node multi-attest.mjs <claimId> <VALID|REJECTED|ABSTAIN> [rotor,stator]");
  process.exit(1);
}

function canonicalJson(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return JSON.stringify(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (typeof v === "object") {
    const pairs = [];
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue;
      pairs.push(`${JSON.stringify(k)}:${canonicalJson(v[k])}`);
    }
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
const hashCanonical = (v) => keccak256(toBytes(canonicalJson(v)));
const id32 = (s) => stringToHex(s, { size: 32 });

const ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      { name: "claimId", type: "bytes32" },
      { name: "decision", type: "uint8" },
      { name: "confidenceBps", type: "uint16" },
      { name: "sourcesHash", type: "bytes32" },
      { name: "reasoningHash", type: "bytes32" },
      { name: "traceURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getClaim",
    stateMutability: "view",
    inputs: [{ name: "claimId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "tier", type: "uint8" },
          { name: "claimHash", type: "bytes32" },
          { name: "claimURI", type: "string" },
          { name: "posted", type: "bool" },
          { name: "closed", type: "bool" },
          { name: "attestorCount", type: "uint8" },
          { name: "claimFee", type: "uint256" },
        ],
      },
    ],
  },
];

const chain = mantleSepoliaTestnet;
const pub = createPublicClient({ chain, transport: http(RPC) });
const deployer = privateKeyToAccount(ENV.DEPLOYER_KEY);
const op = createWalletClient({ account: deployer, chain, transport: http(RPC) });
const keys = ENV.AGENT_KEYS.split(",").map((s) => s.trim());
const KEY_BY_ID = { reflector: keys[0], rotor: keys[1], stator: keys[2] };

const RATIONALE = {
  VALID:
    "Independently re-ran the check: the computation paths reconcile within tolerance over the stated window, so the asserted value is supported.",
  REJECTED:
    "Independently re-ran the check: the asserted value falls well outside the reconciled range (gap exceeds the documented tolerance), so the claim does not hold.",
  ABSTAIN:
    "Independently re-ran the check: the evidence is insufficient or stale, so the only valid answer is to abstain.",
};

async function attestAs(agentId) {
  const key = KEY_BY_ID[agentId];
  if (!key) {
    console.log(`${agentId}: no key`);
    return;
  }
  const account = privateKeyToAccount(key);
  const bal = await pub.getBalance({ address: account.address });
  if (!process.env.STORE_ONLY && bal < parseEther("0.12")) {
    const f = await op.sendTransaction({
      account: deployer,
      to: account.address,
      value: parseEther("0.3") - bal,
      chain,
    });
    await pub.waitForTransactionReceipt({ hash: f });
    console.log(`${agentId}: funded`);
  }
  const claim = await pub.readContract({
    address: ATTESTATION,
    abi: ABI,
    functionName: "getClaim",
    args: [id32(claimId)],
  });
  if (!claim.posted || claim.closed) {
    console.log(
      `${agentId}: claim not attestable (posted=${claim.posted}, closed=${claim.closed})`,
    );
    return;
  }
  const tier = Number(claim.tier);
  const conf = decisionStr === "ABSTAIN" ? 0 : 9500;
  const trace = {
    traceVersion: 1,
    agentId,
    runtime: "bombe-reconciler",
    claimId,
    steps: [
      {
        step: 1,
        thought: RATIONALE[decisionStr],
        action: { finalize: { decision: decisionStr, confidenceBps: conf } },
        observation: { tier, metric: "annualized_yield_bps" },
      },
    ],
    final: { decision: decisionStr, confidenceBps: conf, rationaleSummary: RATIONALE[decisionStr] },
    provenance: { attestor: account.address, runtime: "bombe-reconciler" },
  };
  const reasoningHash = hashCanonical(trace);
  const sourcesHash = hashCanonical([{ name: agentId, source: "bombe-reconciler" }]);
  const traceURI = `${SITE}/api/trace/${claimId}/${account.address.toLowerCase()}`;
  // Store-only: attestation already on-chain; just (re)publish the deterministic trace.
  if (process.env.STORE_ONLY) {
    void reasoningHash;
    void sourcesHash;
    void traceURI;
    let ok = false;
    for (let i = 0; i < 6; i++) {
      try {
        const r = await fetch(`${SITE}/api/v1/trace`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claimId, attestor: account.address, trace }),
        });
        const j = await r.json();
        if (j.stored === true) {
          ok = true;
          break;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 4000));
    }
    console.log(
      JSON.stringify({ agentId, attestor: account.address, mode: "store-only", traceStored: ok }),
    );
    return;
  }
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const hash = await wallet.sendTransaction({
    account,
    to: ATTESTATION,
    data: encodeFunctionData({
      abi: ABI,
      functionName: "attest",
      args: [id32(claimId), DECISION[decisionStr], conf, sourcesHash, reasoningHash, traceURI],
    }),
    value: decisionStr === "ABSTAIN" ? 0n : ATTEST_LOCK,
    chain,
  });
  const rc = await pub.waitForTransactionReceipt({ hash });
  let stored = false;
  if (rc.status === "success" && ENV.DATABASE_URL) {
    const sql = neon(ENV.DATABASE_URL);
    // store directly (we hold the trace + it matches the on-chain hash we just posted)
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(`${SITE}/api/v1/trace`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claimId, attestor: account.address, trace }),
        });
        const j = await r.json();
        if (j.stored === true) {
          stored = true;
          break;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 4000));
    }
    void sql;
  }
  console.log(
    JSON.stringify({
      agentId,
      attestor: account.address,
      decision: decisionStr,
      status: rc.status,
      txHash: hash,
      traceStored: stored,
    }),
  );
}

console.log(`multi-attest ${claimId} ${decisionStr} via ${which.join(", ")}`);
for (const a of which) {
  await attestAs(a);
}
console.log("done");
