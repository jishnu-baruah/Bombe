/**
 * POST /api/operator/register-agent
 *
 * Gated by x-operator-key header. Registers an agent (AI or human) in mock mode.
 * In live mode: submits a registerAgent tx with bondWei.
 *
 * PRD §6.6 — Operator API.
 */

import type { NextRequest } from "next/server";
import { type RegisterAgentAck, parseRegisterAgentBody } from "../../../../lib/operator-schemas";
import { registerAgent } from "../../../../lib/operator-state";
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

  const parsed = parseRegisterAgentBody(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { name, model, isHuman, bondWei } = parsed.data;
  const agent = registerAgent(name, model, isHuman, bondWei);

  const ack: RegisterAgentAck = {
    ok: true,
    address: agent.address,
    name: agent.name,
    registeredAt: agent.registeredAt,
  };

  return Response.json(ack, { status: 200 });
}
