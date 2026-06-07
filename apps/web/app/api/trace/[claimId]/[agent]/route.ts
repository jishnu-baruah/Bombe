/**
 * /api/trace/[claimId]/[agent] — Serve reasoning trace JSON.
 *
 * MODE=mock : returns the fixture trace from demo-data.ts (for verify-hash in tests).
 * MODE=live : reads the stored trace from Neon (T-802). [agent] is the attestor
 *             address. Returns 404 if not stored.
 *
 * This is what an attestation's traceURI points to, so the /claim verify-hash
 * button and /verify can fetch the trace and re-derive the hash.
 */

import { getStoredTrace } from "@/lib/db";
import { getTrace } from "@/lib/demo-data";
import { getRunMode } from "@/lib/server-config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  claimId: string;
  agent: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const { claimId, agent } = await params;

  if (getRunMode() === "live") {
    try {
      const stored = await getStoredTrace(claimId, agent);
      if (stored) {
        return new NextResponse(stored, {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300, s-maxage=300",
          },
        });
      }
      return NextResponse.json(
        {
          error: "trace_not_found",
          message:
            "No stored trace for this claim+attestor yet. Traces are stored at attest time; " +
            "attestations posted before trace storage went live are hash-on-chain only.",
          claimId,
          agent,
        },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    } catch (e) {
      return NextResponse.json(
        { error: "db_error", message: e instanceof Error ? e.message : "trace lookup failed" },
        { status: 503, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }
  }

  // Mock mode — serve fixture trace
  const trace = getTrace(claimId, agent);
  if (!trace) {
    return NextResponse.json(
      { error: "not_found", message: `No trace for ${claimId}/${agent}` },
      { status: 404 },
    );
  }

  return NextResponse.json(trace, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
