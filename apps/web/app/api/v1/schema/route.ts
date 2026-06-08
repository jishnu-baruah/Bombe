import { schemaDocument } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

/**
 * GET /api/v1/schema — the ecosystem-standard attestation schema (D25.7).
 *
 * Publishes the intake shape, the claim-type capability matrix (with honest live/planned
 * status), the per-class tolerances, and the grade / ABSTAIN-reason definitions. The
 * `tolerancesHash` makes the published bands tamper-evident: the same hash is intended to
 * appear in every reasoning trace, so an operator cannot quietly widen a band to force a
 * VALID. Any issuer or agent reads this to know exactly what to submit and what is checked.
 */
export function GET() {
  return NextResponse.json(schemaDocument(), { headers: CORS });
}
