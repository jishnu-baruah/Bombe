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
      try {
        const r = await fetch(att.traceURI, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) {
          status = `trace_unavailable (HTTP ${r.status})`;
        } else {
          const trace = (await r.json()) as unknown;
          recomputed = hashCanonical(trace);
          match = recomputed.toLowerCase() === att.reasoningHash.toLowerCase();
          status = match ? "verified" : "mismatch";
        }
      } catch (e) {
        status = `trace_unavailable (${e instanceof Error ? e.message : "fetch failed"})`;
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
