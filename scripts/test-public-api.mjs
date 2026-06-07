/**
 * scripts/test-public-api.mjs — third-party consumer test for the public read API.
 *
 * Deliberately context-less: no Bombe imports, no viem, nothing but `fetch`. This
 * is exactly what an external agent or protocol would do. It reads a verdict and
 * checks the verify endpoint over plain HTTP.
 *
 *   API_BASE=http://localhost:3000 node scripts/test-public-api.mjs [claimId]
 *   API_BASE=https://bombe-web.vercel.app node scripts/test-public-api.mjs
 */

const BASE = process.env.API_BASE ?? "http://localhost:3000";
const CLAIM = process.argv[2] ?? "mETH-2026-06-07";
let failures = 0;

function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`[test] base=${BASE} claim=${CLAIM}\n`);

  // 1. /assets
  const assets = await getJson("/api/v1/assets");
  check("GET /assets returns 200", assets.status === 200);
  const symbols = (assets.body.assets ?? []).map((a) => a.symbol);
  check(
    "/assets lists mETH and USDY",
    symbols.includes("mETH") && symbols.includes("USDY"),
    `[${symbols}]`,
  );
  check(
    "/assets exposes the attestation address",
    /^0x[0-9a-fA-F]{40}$/.test(assets.body.attestation ?? ""),
    assets.body.attestation,
  );

  // 2. /claims/{id} — read a real verdict off-chain via the API
  const claim = await getJson(`/api/v1/claims/${CLAIM}`);
  check("GET /claims/{id} returns 200", claim.status === 200, `status=${claim.status}`);
  check("claim is posted on-chain", claim.body.posted === true);
  const atts = claim.body.attestations ?? [];
  check("claim has at least one attestation", atts.length > 0, `count=${atts.length}`);
  const first = atts[0] ?? {};
  check(
    "attestation has a decision",
    ["VALID", "REJECTED", "ABSTAIN"].includes(first.decision),
    first.decision,
  );
  check(
    "attestation has a 32-byte reasoning hash",
    /^0x[0-9a-fA-F]{64}$/.test(first.reasoningHash ?? ""),
    first.reasoningHash,
  );
  console.log(
    `      -> ${CLAIM}: ${first.decision} by ${first.attestor} (conf ${first.confidenceBps} bps)`,
  );

  // 3. /verify/{id} — the endpoint exists and reports per-attestation status
  const verify = await getJson(`/api/v1/verify/${CLAIM}`);
  check("GET /verify/{id} returns 200", verify.status === 200);
  const vr = (verify.body.results ?? [])[0] ?? {};
  check(
    "verify reflects the on-chain hash",
    (vr.onChainReasoningHash ?? "") === (first.reasoningHash ?? ""),
  );
  console.log(`      -> verify status: ${vr.status} (match=${vr.match})`);

  console.log(`\n[test] ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[test] FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
