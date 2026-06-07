import { hashCanonical } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import { TraceSchema } from "../loop.js";
import {
  type DocumentDeps,
  type DocumentRef,
  computeDocumentAttestation,
  crossCheckDocument,
  fetchDocumentEvidence,
} from "./document.js";

const clock = { now: () => 1_700_000_000_000 };

// A canned US-Treasury-fiscaldata-shaped response (the real shape, stubbed).
const TREASURY_JSON = JSON.stringify({
  data: [
    { record_date: "2026-05-31", security_desc: "Treasury Bills", avg_interest_rate_amt: "3.690" },
  ],
});
const treasuryRef: DocumentRef = {
  url: "https://api.fiscaldata.treasury.gov/treasury-bills",
  label: "US Treasury Bills average interest rate",
  jsonPath: "data.0.avg_interest_rate_amt",
  scaleToBps: 100,
};

function depsReturning(text: string, status = 200): DocumentDeps {
  return { fetchText: async () => ({ text, status }) };
}

describe("fetchDocumentEvidence (structured json-path)", () => {
  it("extracts the figure, normalizes to bps, and pins the doc hash", async () => {
    const ev = await fetchDocumentEvidence(treasuryRef, depsReturning(TREASURY_JSON), clock.now());
    expect(ev.extraction?.method).toBe("json-path");
    expect(ev.extraction?.valueBps).toBeCloseTo(369, 5); // 3.690% -> 369 bps
    expect(ev.docHash).toBe(hashCanonical({ document: TREASURY_JSON }));
    expect(ev.bytes).toBe(TREASURY_JSON.length);
  });

  it("returns no extraction on an HTTP error", async () => {
    const ev = await fetchDocumentEvidence(treasuryRef, depsReturning("nope", 503), clock.now());
    expect(ev.extraction).toBeNull();
    expect(ev.error).toMatch(/HTTP 503/);
  });
});

describe("fetchDocumentEvidence (llm extraction with citation grounding)", () => {
  const proseRef: DocumentRef = {
    url: "https://issuer.example/factsheet",
    label: "Issuer fact sheet",
    target: "the fund's current yield",
  };
  const doc = "The Fund's current annualized yield is 4.85% net of fees as of today.";

  it("accepts a model figure with a verbatim quote", async () => {
    const deps: DocumentDeps = {
      fetchText: async () => ({ text: doc, status: 200 }),
      extract: async () => '{"valuePercent": 4.85, "quote": "current annualized yield is 4.85%"}',
    };
    const ev = await fetchDocumentEvidence(proseRef, deps, clock.now());
    expect(ev.extraction?.method).toBe("llm");
    expect(ev.extraction?.valueBps).toBeCloseTo(485, 5);
    expect(ev.extraction?.quote).toMatch(/4\.85%/);
  });

  it("flags a hallucinated quote that is not in the document", async () => {
    const deps: DocumentDeps = {
      fetchText: async () => ({ text: doc, status: 200 }),
      extract: async () => '{"valuePercent": 9.99, "quote": "guaranteed 9.99% returns"}',
    };
    const ev = await fetchDocumentEvidence(proseRef, deps, clock.now());
    expect(ev.extraction?.quote).toMatch(/not found verbatim/i);
  });
});

describe("crossCheckDocument", () => {
  it("VALID when the asserted value is within tolerance of the document figure", async () => {
    const ev = await fetchDocumentEvidence(treasuryRef, depsReturning(TREASURY_JSON), clock.now());
    expect(crossCheckDocument(355, ev, 50).verdict).toBe("VALID"); // 355 vs 369, gap 14
  });
  it("REJECTED when it differs by more than tolerance", async () => {
    const ev = await fetchDocumentEvidence(treasuryRef, depsReturning(TREASURY_JSON), clock.now());
    expect(crossCheckDocument(900, ev, 50).verdict).toBe("REJECTED");
  });
  it("ABSTAIN when nothing could be extracted", async () => {
    const ev = await fetchDocumentEvidence(
      treasuryRef,
      depsReturning("not json", 200),
      clock.now(),
    );
    expect(crossCheckDocument(355, ev, 50).verdict).toBe("ABSTAIN");
  });
});

describe("computeDocumentAttestation", () => {
  it("produces a schema-valid trace with a document provenance DAG", async () => {
    const r = await computeDocumentAttestation(
      {
        claimId: "USDY-DOC-TEST",
        asset: "USDY",
        assertedValueBps: 355,
        toleranceBps: 50,
        document: treasuryRef,
      },
      depsReturning(TREASURY_JSON),
      clock,
      "reflector",
    );
    expect(r.verdict.verdict).toBe("VALID");
    expect(r.trace.final.decision).toBe("VALID");
    expect(r.trace.final.reasons).toContain("DOCUMENT_CROSSCHECK");
    expect(() => TraceSchema.parse(r.trace)).not.toThrow();
    const docNode = r.trace.provenance?.nodes.find((n) => n.id === "document");
    expect(docNode?.ref).toBe(treasuryRef.url);
    // Hash is stable + recomputable from the trace.
    expect(hashCanonical(r.trace)).toBe(hashCanonical(r.trace));
  });

  it("abstains and stays schema-valid when the document is unreadable", async () => {
    const r = await computeDocumentAttestation(
      {
        claimId: "USDY-DOC-FAIL",
        asset: "USDY",
        assertedValueBps: 355,
        toleranceBps: 50,
        document: treasuryRef,
      },
      { fetchText: async () => ({ text: "<html>down</html>", status: 500 }) },
      clock,
      "reflector",
    );
    expect(r.verdict.verdict).toBe("ABSTAIN");
    expect(() => TraceSchema.parse(r.trace)).not.toThrow();
  });
});
