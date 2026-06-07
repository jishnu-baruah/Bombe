import { ATTESTATION_ADDRESS } from "@/lib/public-api";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };

/** GET /api/v1/assets — the assets Bombe attests and how to read them. */
export function GET() {
  return NextResponse.json(
    {
      chainId: 5003,
      network: "Mantle Sepolia",
      attestation: ATTESTATION_ADDRESS,
      explorer: "https://sepolia.mantlescan.xyz",
      assets: [
        {
          symbol: "mETH",
          name: "Mantle Staked ETH",
          metric: "annualized_yield_bps",
          claimIdPattern: "mETH-YYYY-MM-DD",
        },
        {
          symbol: "USDY",
          name: "Ondo US Dollar Yield",
          metric: "annualized_yield_bps",
          note: "single source, full transparency; the check does not catch issuer fraud",
          claimIdPattern: "USDY-YYYY-MM-DD",
        },
      ],
      read: "GET /api/v1/claims/{claimId}; verify with GET /api/v1/verify/{claimId}",
    },
    { headers: CORS },
  );
}
