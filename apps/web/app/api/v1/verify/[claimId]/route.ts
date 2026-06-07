import { getStoredTrace } from "@/lib/db";
import { readClaim } from "@/lib/public-api";
import { hashCanonical } from "@bombe/shared";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

/**
 * GET /api/v1/verify/{claimId}?attestor=0x... — re-derive the reasoning hash.
 *
 * For each attestation: fetch the trace at its traceURI, recompute
 * hashCanonical(trace), and compare to the on-chain reasoningHash. This is a
 * convenience; an agent can do the same independently. Attestations whose trace
 * is not yet durably stored report `trace_unavailable` (honest current state).
 */
export async function GET(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  const id = decodeURIComponent(claimId);
  const attestorFilter = new URL(req.url).searchParams.get("attestor");

  try {
    const claim = await readClaim(id);
    if (!claim.posted) {
      return NextResponse.json(
        { error: "claim not found", claimId: id },
        { status: 404, headers: CORS },
      );
    }

    const results = [];
    for (const att of claim.attestations) {
      if (attestorFilter && att.attestor.toLowerCase() !== attestorFilter.toLowerCase()) continue;
      let status: string;
      let recomputed: string | null = null;
      let match = false;
      let trace: unknown;
      // 1. Try the on-chain traceURI.
      try {
        const r = await fetch(att.traceURI, { signal: AbortSignal.timeout(8000) });
        if (r.ok) trace = await r.json();
      } catch {
        // fall through to the stored trace
      }
      // 2. Fall back to the trace stored in Neon (keyed by claim + attestor).
      if (trace === undefined) {
        const stored = await getStoredTrace(id, att.attestor);
        if (stored) {
          try {
            trace = JSON.parse(stored);
          } catch {
            // ignore a malformed stored trace
          }
        }
      }
      if (trace === undefined) {
        status = "trace_unavailable";
      } else {
        recomputed = hashCanonical(trace);
        match = recomputed.toLowerCase() === att.reasoningHash.toLowerCase();
        status = match ? "verified" : "mismatch";
      }
      results.push({
        attestor: att.attestor,
        decision: att.decision,
        onChainReasoningHash: att.reasoningHash,
        recomputed,
        match,
        traceURI: att.traceURI,
        status,
      });
    }

    return NextResponse.json({ claimId: id, results }, { headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { error: "chain read failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: CORS },
    );
  }
}
