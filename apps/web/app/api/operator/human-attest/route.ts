/**
 * POST /api/operator/human-attest
 *
 * Gated by x-operator-key header. Records a human attestation for a claim.
 * In live mode: routes through the same attest() contract path with the
 * human's registered wallet.
 *
 * PRD §6.6 — Operator API; §3 — Human attestor user story.
 */

import type { NextRequest } from "next/server";
import { type HumanAttestAck, parseHumanAttestBody } from "../../../../lib/operator-schemas";
import { humanAttest } from "../../../../lib/operator-state";
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

  const parsed = parseHumanAttestBody(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { claimId, decision, confidenceBps } = parsed.data;
  const result = humanAttest(claimId, decision, confidenceBps);

  const ack: HumanAttestAck = {
    ok: true,
    claimId: result.claimId,
    decision: result.decision,
    confidenceBps: result.confidenceBps,
    txHash: result.txHash,
    attestedAt: result.attestedAt,
  };

  return Response.json(ack, { status: 200 });
}
