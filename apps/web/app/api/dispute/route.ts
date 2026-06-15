/**
 * /api/dispute — public, keyless dispute intake.
 *
 * POST: a reader who believes an attestation's verdict is wrong files a dispute
 * against that attestor on that claim. We verify the attestation actually exists
 * on-chain and is disputable (a non-ABSTAIN verdict carries stake), then record
 * the dispute "under review". An operator escalates it to the real on-chain
 * AgentSlashing.openDispute via /api/operator/dispute (that path bonds + can
 * slash, and the contract permissions it to registered attestors).
 *
 * GET: list disputes for a claim (public fields only) so the verify/claim
 * surfaces can show that a verdict is contested.
 */

import { listDisputes, recordDispute } from "@/lib/db";
import { readClaim } from "@/lib/public-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*" };

interface Body {
  claimId?: string;
  accused?: string;
  reason?: string;
  contact?: string;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const claimId = (body.claimId ?? "").trim();
  const accused = (body.accused ?? "").trim();
  const reason = (body.reason ?? "").trim();
  const contact = body.contact?.trim() || undefined;

  if (!claimId) return bad("claimId is required.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(accused)) {
    return bad("accused must be the 20-byte address of the attestor being disputed.");
  }
  if (reason.length < 10) {
    return bad("reason must explain why the verdict is wrong (at least 10 characters).");
  }
  if (reason.length > 2000) return bad("reason is too long (2000 characters max).");

  // The dispute must target a real, disputable attestation. Mirror the on-chain
  // rule: the accused must have a non-ABSTAIN verdict on this claim (ABSTAIN
  // locks no stake and is not disputable).
  let decision: string | undefined;
  try {
    const claim = await readClaim(claimId);
    const att = claim.attestations.find((a) => a.attestor.toLowerCase() === accused.toLowerCase());
    if (!att) {
      return bad("That attestor has no attestation on this claim, so there is nothing to dispute.");
    }
    decision = att.decision;
  } catch (e) {
    return NextResponse.json(
      { error: "chain read failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: CORS },
    );
  }
  if (decision === "ABSTAIN") {
    return bad("An abstention carries no stake and cannot be disputed.");
  }

  const id = await recordDispute({ claimId, accused, reason, contact });

  return NextResponse.json(
    {
      ok: true,
      disputeId: id,
      message:
        "Dispute recorded and under review. If it holds up it is carried on-chain as a bonded " +
        "AgentSlashing.openDispute, where registered attestors vote and a wrong verdict is slashed. " +
        "You can track it on the claim's verify page.",
    },
    { headers: CORS },
  );
}

export async function GET(req: Request) {
  const claimId = new URL(req.url).searchParams.get("claimId") ?? undefined;
  const disputes = await listDisputes(claimId);
  // Public projection: never leak the contact field.
  return NextResponse.json(
    {
      disputes: disputes.map((d) => ({
        id: d.id,
        claimId: d.claimId,
        accused: d.accused,
        reason: d.reason,
        status: d.status,
        disputeTxHash: d.disputeTxHash,
        onchainDisputeId: d.onchainDisputeId,
        createdAt: d.createdAt,
      })),
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
