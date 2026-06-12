/**
 * attest.mjs — the on-chain hand of the Nous Hermes Plugboard attestor.
 *
 * Hermes (the agent) reads a Bombe claim and decides per its bombe-attestor
 * skill. It then calls THIS tool to execute that decision on Mantle Sepolia as
 * the external Plugboard wallet, and to publish the reasoning trace so the
 * attestation is independently verifiable (verify re-derives the hash on-chain).
 *
 * Hermes does the reasoning; this tool only signs + stores. Safety is the
 * contract's job: a VALID/REJECTED on a Tier-3 judgment claim reverts on-chain,
 * and that revert is the proof, not a guardrail in this script.
 *
 * Usage:
 *   node attest.mjs --claim <claimId> --decision VALID|REJECTED|ABSTAIN \
 *        [--confidence 9000] [--rationale "one sentence"] [--source-name nous-hermes]
 *
 * Env (./.env): PLUGBOARD_WALLET_KEY, RPC_URL, ATTESTATION, SITE
 * Self-contained: no @bombe/shared; canonicalJson is replicated byte-for-byte so
 * the trace hash matches the on-chain reasoningHash and /api/v1/trace accepts it.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  http,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  keccak256,
  stringToHex,
  toBytes,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- env ----
const ENV = {};
try {
  for (const line of readFileSync(resolve(__dirname, ".env"), "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e > 0) ENV[t.slice(0, e).trim()] = t.slice(e + 1).trim();
  }
} catch {
  /* fall back to process.env */
}
const env = (k, d) => ENV[k] ?? process.env[k] ?? d;

const RPC = env("RPC_URL", "https://rpc.sepolia.mantle.xyz");
const ATTESTATION = env("ATTESTATION", "0xf2473a0a55D997233C8fBF987c197e7d2180470A");
const SITE = env("SITE", "https://bombe-web.vercel.app");
const PB_KEY = env("PLUGBOARD_WALLET_KEY");
if (!PB_KEY) {
  console.error(JSON.stringify({ ok: false, error: "PLUGBOARD_WALLET_KEY missing in ./.env" }));
  process.exit(1);
}

// ---- canonical json + hash (byte-identical to @bombe/shared) ----
function canonicalJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const pairs = [];
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v === undefined) continue;
      pairs.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
    }
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
const hashCanonical = (v) => keccak256(toBytes(canonicalJson(v)));
const id32 = (s) => stringToHex(s, { size: 32 });

// ---- args ----
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const claimId = arg("claim");
const decisionStr = (arg("decision", "") || "").toUpperCase();
const confidence = Number(arg("confidence", "9000"));
const rationale = arg("rationale", "");
const sourceName = arg("source-name", "nous-hermes");
const DECISION = { VALID: 0, REJECTED: 1, ABSTAIN: 2 };
if (!claimId || !(decisionStr in DECISION)) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "usage: --claim <id> --decision VALID|REJECTED|ABSTAIN [--confidence n] [--rationale s]",
    }),
  );
  process.exit(1);
}

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
const account = privateKeyToAccount(PB_KEY);
const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const ATTEST_LOCK = parseEther("0.02");

async function main() {
  // 1) Read the claim on-chain (confirms it is posted; carries its tier).
  const claim = await pub.readContract({
    address: ATTESTATION,
    abi: ABI,
    functionName: "getClaim",
    args: [id32(claimId)],
  });
  if (!claim.posted) throw new Error(`claim ${claimId} is not posted on-chain`);
  const tier = Number(claim.tier);

  // 2) Build the reasoning trace (Hermes's decision + rationale, made auditable).
  const trace = {
    traceVersion: 1,
    agentId: "plugboard",
    runtime: "nous-hermes",
    claimId,
    steps: [
      {
        step: 1,
        thought:
          rationale ||
          `Reviewed claim ${claimId} (tier ${tier}); decided ${decisionStr} per the Bombe attestor rules.`,
        action: { finalize: { decision: decisionStr, confidenceBps: confidence } },
        observation: { tier },
      },
    ],
    final: { decision: decisionStr, confidenceBps: confidence, rationaleSummary: rationale || null },
    provenance: { attestor: account.address, runtime: "nous-hermes", model: env("MODEL", "mistral-small-latest") },
  };
  const sources = [{ name: sourceName, source: "nous-hermes-skill" }];
  const reasoningHash = hashCanonical(trace);
  const sourcesHash = hashCanonical(sources);
  const traceURI = `${SITE}/api/trace/${claimId}/${account.address.toLowerCase()}`;

  // 3) Sign attest() on-chain as Plugboard. By default let the node estimate gas.
  //    Pass --gas <n> to force an explicit limit so a contract revert (e.g. the
  //    Tier-3 judgment guard) still lands as a real failed tx, the on-chain proof
  //    (estimation would otherwise throw before broadcast).
  // Dry-run: prove the full decision -> trace -> hash -> tx pipeline without
  // broadcasting (used when the wallet is below the funding floor, or for the
  // Hermes agent to demonstrate the loop). The only step skipped is the send.
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify({
        ok: true,
        dryRun: true,
        claimId,
        tier,
        attestor: account.address,
        decision: decisionStr,
        reasoningHash,
        sourcesHash,
        traceURI,
        wouldStoreTrace: true,
      }),
    );
    return;
  }

  const gasOverride = arg("gas");
  const hash = await wallet.sendTransaction({
    account,
    to: ATTESTATION,
    data: encodeFunctionData({
      abi: ABI,
      functionName: "attest",
      args: [id32(claimId), DECISION[decisionStr], confidence, sourcesHash, reasoningHash, traceURI],
    }),
    value: ATTEST_LOCK,
    ...(gasOverride ? { gas: BigInt(gasOverride) } : {}),
    chain,
  });
  const rc = await pub.waitForTransactionReceipt({ hash });

  // 4) Publish the trace so the attestation is verifiable. The endpoint
  //    re-derives the hash and only stores it if it matches the on-chain value.
  let stored = false;
  let storeDetail = null;
  if (rc.status === "success") {
    try {
      const r = await fetch(`${SITE}/api/v1/trace`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, attestor: account.address, trace }),
      });
      const j = await r.json();
      stored = j.stored === true;
      storeDetail = stored ? null : j;
    } catch (e) {
      storeDetail = String(e);
    }
  }

  console.log(
    JSON.stringify({
      ok: rc.status === "success",
      claimId,
      tier,
      attestor: account.address,
      decision: decisionStr,
      txHash: hash,
      status: rc.status,
      reasoningHash,
      traceStored: stored,
      storeDetail,
      explorerTx: `https://sepolia.mantlescan.xyz/tx/${hash}`,
      verifyUrl: `${SITE}/verify?q=${encodeURIComponent(claimId)}`,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.shortMessage || e?.message || String(e) }));
  process.exit(1);
});
