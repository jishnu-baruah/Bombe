/**
 * POST /api/operator/dispute
 *
 * Gated by x-operator-key. Escalates a recorded dispute to the real on-chain
 * AgentSlashing.openDispute (bonds 0.05 MNT from the registered challenger key).
 * Body: { disputeId } to escalate a recorded intake, or { claimId, accused } to
 * open one directly. Records the openDispute tx + on-chain dispute id.
 */

import { getDispute, markDisputeEscalated } from "@/lib/db";
import { disputeEscalationLive, openDisputeOnChain } from "@/lib/dispute-onchain";
import { validateOperatorKey } from "@/lib/server-config";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

interface Body {
  disputeId?: number;
  claimId?: string;
  accused?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!validateOperatorKey(req.headers)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve the target from a recorded dispute id, or from explicit claim+accused.
  let claimId = body.claimId;
  let accused = body.accused;
  let recordId: number | null = null;
  if (body.disputeId != null) {
    const d = await getDispute(Number(body.disputeId));
    if (!d) return Response.json({ ok: false, error: "dispute not found" }, { status: 404 });
    claimId = d.claimId;
    accused = d.accused;
    recordId = d.id;
  }

  if (!claimId || !accused || !/^0x[0-9a-fA-F]{40}$/.test(accused)) {
    return Response.json(
      { ok: false, error: "Provide disputeId, or claimId + a valid accused address." },
      { status: 400 },
    );
  }
  if (!disputeEscalationLive()) {
    return Response.json(
      {
        ok: false,
        error: "On-chain escalation is not enabled (needs live mode + a challenger key).",
      },
      { status: 503 },
    );
  }

  try {
    const res = await openDisputeOnChain(claimId, accused);
    if (res.status === "success" && recordId != null) {
      await markDisputeEscalated(recordId, res.txHash, res.disputeId);
    }
    return Response.json({
      ok: res.status === "success",
      claimId,
      accused,
      ...res,
      explorerTx: `https://sepolia.mantlescan.xyz/tx/${res.txHash}`,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
