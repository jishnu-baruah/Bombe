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

// Live attestation traces are stored keyed by the attestor's ADDRESS (the
// on-chain traceURI uses the address). The /claim page tabs request by agent
// NAME, so resolve a known name to its deployed address before looking up.
const AGENT_ADDRESS: Record<string, string> = {
  reflector: "0x3BA08C723D41A98339D43Ffa01174791EaE813Fa",
  rotor: "0x5e90bd4E238C2cE66D41B6c86f39B791441e69A7",
  stator: "0x3c8612D5d13636De52492c8Dfa84b455064C8bf8",
  human: "0x98fAb4C835475C95C797aAee9CE0C03942a524C6",
  plugboard: "0x58826a9FCb6956332D0833b9175CE40A7587957e",
};

/** Look up a stored trace, trying the agent as-is then its mapped address (both cases). */
async function findTrace(claimId: string, agent: string): Promise<string | null> {
  const tried = new Set<string>();
  const candidates = [agent];
  const mapped = AGENT_ADDRESS[agent.toLowerCase()];
  if (mapped) candidates.push(mapped, mapped.toLowerCase());
  for (const key of candidates) {
    if (tried.has(key)) continue;
    tried.add(key);
    const stored = await getStoredTrace(claimId, key);
    if (stored) return stored;
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const { claimId, agent } = await params;

  if (getRunMode() === "live") {
    try {
      const stored = await findTrace(claimId, agent);
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
