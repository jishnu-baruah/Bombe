/**
 * POST /api/operator/advance
 *
 * Gated by x-operator-key header. Advances the demo state machine to the next
 * claim in A→D sequence. In live mode this would trigger the on-chain epoch advance.
 *
 * PRD §6.6 — Operator API.
 */

import type { NextRequest } from "next/server";
import type { AdvanceAck } from "../../../../lib/operator-schemas";
import { advanceDemo } from "../../../../lib/operator-state";
import { validateOperatorKey } from "../../../../lib/server-config";

export async function POST(req: NextRequest): Promise<Response> {
  if (!validateOperatorKey(req.headers)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = advanceDemo();

  const ack: AdvanceAck = {
    ok: true,
    previousClaim: result.previousClaim,
    nextClaim: result.nextClaim,
  };

  return Response.json(ack, { status: 200 });
}
