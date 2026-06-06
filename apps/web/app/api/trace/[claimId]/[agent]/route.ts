/**
 * /api/trace/[claimId]/[agent] — Serve reasoning trace JSON.
 *
 * MODE=mock : returns the fixture trace from demo-data.ts (for verify-hash in tests).
 * MODE=live : attempts to read from Postgres (DATABASE_URL via @bombe/db);
 *             if not found, returns 404 with a clear JSON message.
 *
 * Full trace persistence is a follow-up (T-803); this route wires the endpoint
 * so the /claim/[id] verify-hash button can call traceURI → this path.
 *
 * T-J04.
 */

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
    // Attempt Postgres lookup via @bombe/db + DATABASE_URL
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        return NextResponse.json(
          {
            error: "trace_not_available",
            message: "DATABASE_URL not configured — full trace persistence is a T-803 follow-up.",
            claimId,
            agent,
          },
          { status: 404 },
        );
      }

      // Dynamic import so the module is only loaded when DATABASE_URL is set.
      // @bombe/db uses pglite (browser-safe) but in Next.js server context
      // we have Node.js. Trace data is not yet persisted via the runner in
      // the deployed environment (T-803 follow-up), so we return 404 with
      // a clear status message.
      return NextResponse.json(
        {
          error: "trace_not_found",
          message:
            "Trace not yet persisted for this agent/claim in the live database. " +
            "Full trace write-back is a T-803 follow-up. " +
            "On-chain attestation records (reasoningHash, sourcesHash, traceURI) are available " +
            "via the /leaderboard and /claim/[id] pages.",
          claimId,
          agent,
        },
        { status: 404 },
      );
    } catch {
      return NextResponse.json(
        {
          error: "db_error",
          message: "Database lookup failed. Trace persistence is a T-803 follow-up.",
          claimId,
          agent,
        },
        { status: 503 },
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
