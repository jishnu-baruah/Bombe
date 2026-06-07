import { ATTESTATION_ADDRESS } from "@/lib/public-api";
import { FEATURED } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

/** GET /api/v1/assets — the curated/verified assets Bombe attests and how to read them. */
export function GET() {
  return NextResponse.json(
    {
      chainId: 5003,
      network: "Mantle Sepolia",
      attestation: ATTESTATION_ADDRESS,
      explorer: "https://sepolia.mantlescan.xyz",
      // The curated, verified showcase. The full attestable universe is open:
      // GET /api/v1/discover enumerates it, and any descriptor can be attested.
      assets: FEATURED.map((s) => ({
        symbol: s.symbol,
        name: s.name ?? s.symbol,
        chain: s.chain,
        metric: "annualized_yield_bps",
        sources: s.sources.map((src) => ({ scheme: src.scheme, kind: src.kind, label: src.label })),
        note: s.independenceLabel,
        verified: s.verified,
        claimIdPattern: `${s.symbol}-YYYY-MM-DD`,
      })),
      discover: "GET /api/v1/discover?rwaOnly=1 — the full attestable universe (open)",
      read: "GET /api/v1/claims/{claimId}; verify with GET /api/v1/verify/{claimId}",
    },
    { headers: CORS },
  );
}
