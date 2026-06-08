import { computeNavAttestation, defaultReadErc4626 } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };
export const maxDuration = 30;

/**
 * GET /api/v1/nav-check?chain=Ethereum&contract=0x..&assertedNav=1.05&tolerancePct=0.5
 *
 * NAV_PER_SHARE (current), live: read the ERC-4626 vault share price directly on-chain
 * (convertToAssets / pricePerShare) and deterministically cross-check the asserted NAV.
 * Genuinely independent of any aggregator, the evidence is the chain itself. Returns the
 * verdict, the on-chain read, and the provenance DAG. (D25.5 step 2)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = url.searchParams.get("chain") ?? "Ethereum";
  const contract = url.searchParams.get("contract") ?? "";
  const assertedNav = Number(url.searchParams.get("assertedNav") ?? "");
  const tolerancePct = Number(url.searchParams.get("tolerancePct") ?? "0.5");

  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    return NextResponse.json(
      { error: "contract must be a 20-byte address" },
      { status: 400, headers: CORS },
    );
  }
  if (!Number.isFinite(assertedNav) || assertedNav <= 0) {
    return NextResponse.json(
      { error: "assertedNav must be a positive number" },
      { status: 400, headers: CORS },
    );
  }

  try {
    const r = await computeNavAttestation(
      {
        claimId: `NAV-${contract.slice(2, 10)}-${new Date().toISOString().slice(0, 10)}`,
        asset: contract,
        assertedNav,
        tolerancePct,
        ref: { chain, contract, label: `ERC-4626 vault ${contract.slice(0, 10)} on ${chain}` },
      },
      { readErc4626: defaultReadErc4626 },
      { now: () => Date.now() },
      "reflector",
    );
    return NextResponse.json(
      {
        chain,
        contract,
        assertedNav,
        tolerancePct,
        verdict: r.verdict.verdict,
        detail: r.verdict.detail,
        onchain: r.read,
        provenance: r.trace.provenance,
        note: "NAV read straight from the vault contract on-chain (current block). Re-read it yourself to verify.",
      },
      { headers: CORS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "nav_check_failed", detail: (err as Error).message },
      { status: 502, headers: CORS },
    );
  }
}
