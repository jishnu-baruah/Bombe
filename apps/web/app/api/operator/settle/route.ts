/**
 * POST /api/operator/settle
 *
 * Gated by x-operator-key header. Settles a claim with ground truth.
 * In live mode: calls settleTier1 (or dispute resolution) on-chain.
 *
 * PRD §6.6 — Operator API.
 */

import type { NextRequest } from "next/server";
import { type SettleAck, parseSettleBody } from "../../../../lib/operator-schemas";
import { settleClaim } from "../../../../lib/operator-state";
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

  const parsed = parseSettleBody(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { claimId, groundTruth } = parsed.data;
  const result = settleClaim(claimId, groundTruth);

  const ack: SettleAck = {
    ok: true,
    claimId: result.claimId,
    groundTruth: result.groundTruth,
    txHash: result.txHash,
    settledAt: result.settledAt,
  };

  return Response.json(ack, { status: 200 });
}
