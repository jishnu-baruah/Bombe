import { computeDocumentAttestation, defaultFetchText } from "@bombe/agent-sdk";
import type { DocumentRef } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };
export const maxDuration = 30;

// The authoritative reference document for tokenized-treasury yield: the live US
// Treasury "average interest rate" for Treasury Bills (fiscaldata.treasury.gov, JSON).
const TREASURY_BILLS: DocumentRef = {
  url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Treasury%20Bills&sort=-record_date&page[size]=1",
  label: "US Treasury Bills average interest rate (fiscaldata.treasury.gov)",
  jsonPath: "data.0.avg_interest_rate_amt",
  scaleToBps: 100,
};

/**
 * GET /api/v1/document-check?asset=USDY&assertedBps=355&toleranceBps=75
 *
 * A live Tier-2 document verification: fetch + pin (hash) the authoritative US Treasury
 * bill rate, extract the figure (deterministic json-path, cited), and deterministically
 * cross-check the asserted tokenized-treasury yield against it within tolerance. Returns
 * the verdict, the pinned doc hash, the citation, and the provenance DAG. No model, no
 * on-chain post; this is the verifiable document check itself. (D22)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset") ?? "USDY";
  const assertedBps = Number(url.searchParams.get("assertedBps") ?? "355");
  const toleranceBps = Number(url.searchParams.get("toleranceBps") ?? "75");
  if (!Number.isFinite(assertedBps) || assertedBps <= 0) {
    return NextResponse.json(
      { error: "assertedBps must be a positive number" },
      { status: 400, headers: CORS },
    );
  }

  try {
    const r = await computeDocumentAttestation(
      {
        claimId: `${asset}-DOC-${new Date().toISOString().slice(0, 10)}`,
        asset,
        assertedValueBps: assertedBps,
        toleranceBps,
        document: TREASURY_BILLS,
      },
      { fetchText: defaultFetchText },
      { now: () => Date.now() },
      "reflector",
    );
    return NextResponse.json(
      {
        asset,
        assertedBps,
        toleranceBps,
        verdict: r.verdict.verdict,
        detail: r.verdict.detail,
        document: {
          label: r.evidence.label,
          url: r.evidence.url,
          docHash: r.evidence.docHash,
          extracted: r.evidence.extraction,
        },
        provenance: r.trace.provenance,
        note: "Tier-2 document check: the asserted yield is cross-checked against the live, hashed US Treasury bill rate. Deterministic verdict; re-fetch the document and recompute to verify.",
      },
      { headers: CORS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "document_check_failed", detail: (err as Error).message },
      { status: 502, headers: CORS },
    );
  }
}
