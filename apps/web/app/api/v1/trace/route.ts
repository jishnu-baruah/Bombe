/**
 * POST /api/v1/trace, self-authenticating trace storage (T-802 on Neon).
 *
 * Body: { claimId, attestor, trace }. The route recomputes
 * keccak256(canonicalJson(trace)) and stores the trace only if it matches the
 * on-chain reasoningHash for that claim+attestor. No secret is needed: a trace
 * authenticates itself against the chain, so only a trace that genuinely
 * produced the on-chain verdict can be stored.
 */

import { storeTrace } from "@/lib/db";
import { readClaim } from "@/lib/public-api";
import { hashCanonical } from "@bombe/shared";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

interface Body {
  claimId?: string;
  attestor?: string;
  trace?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  const { claimId, attestor, trace } = body;
  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ error: "claimId required" }, { status: 400, headers: CORS });
  }
  if (!attestor || !/^0x[0-9a-fA-F]{40}$/.test(attestor)) {
    return NextResponse.json(
      { error: "attestor must be a 20-byte address" },
      { status: 400, headers: CORS },
    );
  }
  if (trace === undefined || trace === null || typeof trace !== "object") {
    return NextResponse.json({ error: "trace object required" }, { status: 400, headers: CORS });
  }

  const recomputed = hashCanonical(trace).toLowerCase();

  // Find the on-chain reasoningHash for this claim+attestor.
  let onChainHash: string | undefined;
  try {
    const claim = await readClaim(claimId);
    const att = claim.attestations.find((a) => a.attestor.toLowerCase() === attestor.toLowerCase());
    onChainHash = att?.reasoningHash.toLowerCase();
  } catch (e) {
    return NextResponse.json(
      { error: "chain read failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: CORS },
    );
  }

  if (!onChainHash) {
    return NextResponse.json(
      { error: "no on-chain attestation for that claim+attestor" },
      { status: 404, headers: CORS },
    );
  }
  if (recomputed !== onChainHash) {
    return NextResponse.json(
      {
        error: "trace hash does not match the on-chain reasoningHash",
        recomputed,
        onChainHash,
      },
      { status: 409, headers: CORS },
    );
  }

  await storeTrace(claimId, attestor, JSON.stringify(trace), recomputed);
  return NextResponse.json(
    { stored: true, claimId, attestor, reasoningHash: recomputed },
    {
      headers: CORS,
    },
  );
}
