import { RWA_CATEGORIES, discoverAssets } from "@bombe/agent-sdk";
import type { RwaCategory } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

// Cache discovery briefly; the universe changes slowly and the upstream list is large.
export const revalidate = 300;

/**
 * GET /api/v1/discover — enumerate the live RWA-yield universe as ready-to-attest
 * source descriptors. The network can attest any of these; the curated/verified
 * subset is flagged. (docs/OPEN-SOURCE-REGISTRY.md)
 *
 * Query params: chain, query, minTvl, rwaOnly=1, limit (default 50).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = url.searchParams.get("chain") ?? undefined;
  const query = url.searchParams.get("query") ?? undefined;
  const minTvl = url.searchParams.get("minTvl");
  const limitRaw = url.searchParams.get("limit");
  const rwaOnly = url.searchParams.get("rwaOnly") === "1";
  const category = (url.searchParams.get("category") as RwaCategory | null) ?? undefined;

  try {
    const assets = await discoverAssets({
      chain,
      query,
      rwaOnly,
      category,
      minTvlUsd: minTvl ? Number(minTvl) : undefined,
      limit: limitRaw ? Math.min(Number(limitRaw), 200) : 50,
    });
    // Count live coverage per category so the UI can show what is attestable now and
    // what is "request it" (a category we support but has no live source in this result).
    const byCategory: Record<string, number> = {};
    for (const a of assets) byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
    return NextResponse.json(
      {
        chainId: 5003,
        network: "Mantle Sepolia",
        count: assets.length,
        categories: RWA_CATEGORIES,
        liveByCategory: byCategory,
        note: "Any descriptor below can be attested via POST /api/v1/request with its `spec`. `verified:true` is the curated showcase. A category with no live source is requestable via POST /api/v1/asset-request.",
        assets,
      },
      { headers: CORS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "discovery_unavailable", detail: (err as Error).message },
      { status: 502, headers: CORS },
    );
  }
}
