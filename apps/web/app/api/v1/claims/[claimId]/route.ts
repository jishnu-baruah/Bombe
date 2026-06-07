import { readClaim } from "@/lib/public-api";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

/** GET /api/v1/claims/{claimId} — the claim and its on-chain attestations (verdicts). */
export async function GET(_req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  const id = decodeURIComponent(claimId);
  try {
    const claim = await readClaim(id);
    if (!claim.posted) {
      return NextResponse.json(
        { error: "claim not found", claimId: id },
        { status: 404, headers: CORS },
      );
    }
    return NextResponse.json(claim, { headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { error: "chain read failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: CORS },
    );
  }
}
