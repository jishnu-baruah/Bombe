import { recordAssetRequest } from "@/lib/db";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

interface Body {
  symbol?: string;
  category?: string;
  sourceUrl?: string;
  note?: string;
  contact?: string;
}

/**
 * POST /api/v1/asset-request — "can't find your asset? request it."
 *
 * For an RWA the network has no live source for yet (a new protocol, or a category
 * like real estate or gold with no Mantle pool yet). Recorded for the operator to
 * triage into a real source descriptor. We do not fabricate a route; we capture the
 * ask honestly. If the asset is already discoverable, the response says so.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS });
  }

  const symbol = (body.symbol ?? "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required." }, { status: 400, headers: CORS });
  }

  await recordAssetRequest({
    symbol,
    category: body.category?.trim() || undefined,
    sourceUrl: body.sourceUrl?.trim() || undefined,
    note: body.note?.trim() || undefined,
    contact: body.contact?.trim() || undefined,
  });

  return NextResponse.json(
    {
      ok: true,
      message:
        "Request recorded. If a public data source exists for this asset, it becomes attestable as a source descriptor (often same-day). Tip: if it is already on DefiLlama, you can attest it now via GET /api/v1/discover then POST /api/v1/request with its spec.",
      symbol,
    },
    { headers: CORS },
  );
}
