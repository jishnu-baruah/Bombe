import { computeDocumentAttestation, defaultFetchText } from "@bombe/agent-sdk";
import type { DocumentRef } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";

const CORS = { "Access-Control-Allow-Origin": "*" };
export const maxDuration = 30;

// SSRF guard: a user-supplied docUrl is server-fetched, so block hosts that resolve
// to loopback / private / link-local space (incl. the cloud metadata endpoint at
// 169.254.169.254). Literal-IP and localhost coverage; DNS-rebinding is out of scope.
function isBlockedHost(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return true; // unparseable -> reject
  }
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))
    return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true; // this-host, loopback, private
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

// Built-in default example: the live US Treasury "average interest rate" for Treasury
// Bills (fiscaldata.treasury.gov, JSON). The endpoint is NOT limited to this; any
// document URL + jsonPath/target can be checked (see params below).
const TREASURY_BILLS: DocumentRef = {
  url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Treasury%20Bills&sort=-record_date&page[size]=1",
  label: "US Treasury Bills average interest rate (fiscaldata.treasury.gov)",
  jsonPath: "data.0.avg_interest_rate_amt",
  scaleToBps: 100,
};

/**
 * GET /api/v1/document-check
 *
 * Live Tier-2 document verification, over ANY document (not just the Treasury default):
 * fetch + pin (hash) the document, extract the figure (deterministic json-path), and
 * deterministically cross-check the asserted value within tolerance. Returns the verdict,
 * the pinned doc hash, the citation, and the provenance DAG.
 *
 * Params: assertedBps, toleranceBps, asset; and to point at your own document:
 *   docUrl, jsonPath (e.g. "data.0.rate"), scaleToBps (e.g. 100 for percent->bps), label.
 * With no docUrl it falls back to the Treasury bill rate example.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset") ?? "USDY";
  const assertedBps = Number(url.searchParams.get("assertedBps") ?? "355");
  const toleranceBps = Number(url.searchParams.get("toleranceBps") ?? "75");
  const docUrl = url.searchParams.get("docUrl");
  if (!Number.isFinite(assertedBps) || assertedBps <= 0) {
    return NextResponse.json(
      { error: "assertedBps must be a positive number" },
      { status: 400, headers: CORS },
    );
  }

  // Build the DocumentRef from params, or fall back to the Treasury example. The system
  // is not hardcoded to one document; this endpoint checks whatever you point it at.
  let document: DocumentRef = TREASURY_BILLS;
  if (docUrl) {
    if (!/^https?:\/\//.test(docUrl)) {
      return NextResponse.json(
        { error: "docUrl must be an http(s) URL" },
        { status: 400, headers: CORS },
      );
    }
    if (isBlockedHost(docUrl)) {
      return NextResponse.json(
        { error: "docUrl cannot target loopback, private, or link-local hosts" },
        { status: 400, headers: CORS },
      );
    }
    const scaleRaw = url.searchParams.get("scaleToBps");
    document = {
      url: docUrl,
      label: url.searchParams.get("label") ?? `issuer document (${new URL(docUrl).host})`,
      jsonPath: url.searchParams.get("jsonPath") ?? undefined,
      target: url.searchParams.get("target") ?? undefined,
      scaleToBps: scaleRaw ? Number(scaleRaw) : 1,
    };
  }

  try {
    const r = await computeDocumentAttestation(
      {
        claimId: `${asset}-DOC-${new Date().toISOString().slice(0, 10)}`,
        asset,
        assertedValueBps: assertedBps,
        toleranceBps,
        document,
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
        note: "Tier-2 document check: the asserted value is cross-checked against the pinned, hashed document. Deterministic verdict; re-fetch the document and recompute to verify. Pass docUrl + jsonPath to check your own document.",
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
