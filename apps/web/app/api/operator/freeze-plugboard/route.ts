/**
 * POST /api/operator/freeze-plugboard
 *
 * Gated by x-operator-key header. Freezes Plugboard — blocks further skill
 * writes. In live mode: snapshots the live skill file to
 * epoch-snapshots/epoch-demo-frozen.skill.md and records its keccak256.
 *
 * PRD §6.6 — Operator API; §6.8 — Plugboard skill freeze.
 */

import type { NextRequest } from "next/server";
import type { FreezePlugboardAck } from "../../../../lib/operator-schemas";
import { freezePlugboard } from "../../../../lib/operator-state";
import { validateOperatorKey } from "../../../../lib/server-config";

export async function POST(req: NextRequest): Promise<Response> {
  if (!validateOperatorKey(req.headers)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = freezePlugboard();

  const ack: FreezePlugboardAck = {
    ok: true,
    frozen: result.frozen,
    frozenAt: result.frozenAt,
    snapshotHash: result.snapshotHash,
  };

  return Response.json(ack, { status: 200 });
}
