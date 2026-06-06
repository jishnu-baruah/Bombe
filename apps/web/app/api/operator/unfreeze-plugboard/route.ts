/**
 * POST /api/operator/unfreeze-plugboard
 *
 * Gated by x-operator-key header. Unfreezes Plugboard — allows skill writes again.
 * In live mode: removes the freeze record from the skill registry.
 *
 * PRD §6.6 — Operator API; §6.8 — Plugboard skill freeze.
 */

import type { NextRequest } from "next/server";
import type { UnfreezePlugboardAck } from "../../../../lib/operator-schemas";
import { unfreezePlugboard } from "../../../../lib/operator-state";
import { validateOperatorKey } from "../../../../lib/server-config";

export async function POST(req: NextRequest): Promise<Response> {
  if (!validateOperatorKey(req.headers)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = unfreezePlugboard();

  const ack: UnfreezePlugboardAck = {
    ok: true,
    frozen: result.frozen,
    unfrozenAt: result.unfrozenAt,
  };

  return Response.json(ack, { status: 200 });
}
