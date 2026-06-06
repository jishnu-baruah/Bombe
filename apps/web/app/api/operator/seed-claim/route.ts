/**
 * POST /api/operator/seed-claim
 *
 * Gated by x-operator-key header. Seeds a new claim in mock mode (direct call).
 * In live mode this would dispatch an on-chain tx via the operator wallet.
 * Response shape is stable regardless of mode.
 *
 * PRD §6.6 — Operator API.
 */

import type { NextRequest } from "next/server";
import { type SeedClaimAck, parseSeedClaimBody } from "../../../../lib/operator-schemas";
import { seedClaim } from "../../../../lib/operator-state";
import { validateOperatorKey } from "../../../../lib/server-config";

export async function POST(req: NextRequest): Promise<Response> {
  if (!validateOperatorKey(req.headers)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSeedClaimBody(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { claimId, claimType, asset, payload } = parsed.data;
  const result = seedClaim(claimId, claimType, asset, payload);

  const ack: SeedClaimAck = {
    ok: true,
    claimId: result.claimId,
    txHash: result.txHash,
    seededAt: result.seededAt,
  };

  return Response.json(ack, { status: 200 });
}
