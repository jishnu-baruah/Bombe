/**
 * data/document.ts — Tier-2 document verification. (docs/OPEN-SOURCE-REGISTRY.md, D22)
 *
 * The pipeline `document` step: fetch a referenced document, pin it by hashing its
 * exact bytes, extract the target figure WITH a cited source snippet, then run a
 * deterministic cross-check against the asserted value. Two extraction modes:
 *   - json-path: deterministic field read for structured documents (preferred; e.g.
 *     the US Treasury fiscaldata API). No model, fully reproducible.
 *   - llm: a model extracts the figure from unstructured text and returns a verbatim
 *     quote as the citation, so a human can re-read the cited span against the pinned
 *     document. The model never decides the verdict; it only reads.
 *
 * Honesty: the verdict is the deterministic cross-check over the extracted number; the
 * document hash + the cited quote make the extraction auditable against the exact
 * fetched bytes. An unreadable document or a missing figure ABSTAINS, never guesses.
 */

import { hashCanonical } from "@bombe/shared";
import type { Source } from "../attest.js";
import type { Trace } from "../loop.js";
import type { ClockLike } from "./types.js";

/** A reference to an external document and how to read the target figure from it. */
export interface DocumentRef {
  url: string;
  label: string;
  /** Structured read: dotted path into the parsed JSON, e.g. "data.0.avg_interest_rate_amt". */
  jsonPath?: string;
  /** Multiply the extracted raw number to normalize to bps (e.g. percent -> bps = 100). */
  scaleToBps?: number;
  /** Unstructured read: a description of the figure to extract (used by the llm mode). */
  target?: string;
}

/** What was pulled out of the document, with the citation needed to re-check it. */
export interface DocumentExtraction {
  valueBps: number;
  /** A verbatim snippet from the document supporting the value (the citation). */
  quote: string;
  method: "json-path" | "llm";
  rawValue: number | string;
}

/** The pinned, auditable evidence from one document fetch. */
export interface DocumentEvidence {
  url: string;
  label: string;
  /** keccak of the exact fetched bytes; pins the document so the citation is checkable. */
  docHash: string;
  bytes: number;
  fetchedAt: number;
  extraction: DocumentExtraction | null;
  error?: string;
}

/** Injected I/O so tests never hit the network or a live model. */
export interface DocumentDeps {
  fetchText: (url: string) => Promise<{ text: string; status: number }>;
  /** Optional model for unstructured extraction; returns the model's raw text reply. */
  extract?: (system: string, user: string) => Promise<string>;
}

/** Default text fetcher over global fetch. */
export async function defaultFetchText(url: string): Promise<{ text: string; status: number }> {
  const res = await fetch(url, { headers: { accept: "application/json, text/plain, */*" } });
  return { text: await res.text(), status: res.status };
}

/** Read a dotted path (with numeric array indices) out of a parsed object. */
function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur;
}

function toNumber(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : Number.NaN;
  return n;
}

/** Deterministic structured extraction via a JSON path. */
function extractStructured(content: string, ref: DocumentRef): DocumentExtraction | null {
  if (!ref.jsonPath) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const raw = getByPath(parsed, ref.jsonPath);
  const n = toNumber(raw);
  if (!Number.isFinite(n)) return null;
  const valueBps = n * (ref.scaleToBps ?? 1);
  return {
    valueBps,
    quote: `${ref.jsonPath} = ${JSON.stringify(raw)}`,
    method: "json-path",
    rawValue: typeof raw === "number" || typeof raw === "string" ? raw : String(raw),
  };
}

const EXTRACT_SYSTEM =
  "You read a figure out of a document. You do NOT decide any verdict. Return STRICT JSON only: " +
  '{"valuePercent": <number>, "quote": "<verbatim snippet from the document supporting it>"}. ' +
  "The quote MUST appear verbatim in the document. If the figure is absent, return " +
  '{"valuePercent": null, "quote": ""}.';

/** Parse the model's JSON reply for the unstructured path; salvage loosely, never throw. */
function parseExtraction(reply: string, content: string): DocumentExtraction | null {
  const valM = reply.match(/"valuePercent"\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (!valM?.[1]) return null;
  const pct = Number.parseFloat(valM[1]);
  if (!Number.isFinite(pct)) return null;
  const qM = reply.match(/"quote"\s*:\s*"([^"]*)"/);
  const quote = qM?.[1] ?? "";
  // Honesty guard: only trust a quote the model did not invent.
  const grounded = quote.length > 0 && content.includes(quote);
  return {
    valueBps: pct * 100,
    quote: grounded ? quote : "(model quote not found verbatim in document)",
    method: "llm",
    rawValue: pct,
  };
}

/** Fetch a document, pin it by hash, and extract the target figure with a citation. */
export async function fetchDocumentEvidence(
  ref: DocumentRef,
  deps: DocumentDeps,
  now: number,
): Promise<DocumentEvidence> {
  let text = "";
  let status = 0;
  try {
    const r = await deps.fetchText(ref.url);
    text = r.text;
    status = r.status;
  } catch (err) {
    return {
      url: ref.url,
      label: ref.label,
      docHash: "0x",
      bytes: 0,
      fetchedAt: now,
      extraction: null,
      error: `fetch failed: ${(err as Error).message}`,
    };
  }
  const docHash = hashCanonical({ document: text });
  const base: DocumentEvidence = {
    url: ref.url,
    label: ref.label,
    docHash,
    bytes: text.length,
    fetchedAt: now,
    extraction: null,
  };
  if (status >= 400) return { ...base, error: `document returned HTTP ${status}` };

  // Prefer deterministic structured extraction; fall back to the model for prose.
  let extraction = extractStructured(text, ref);
  if (!extraction && deps.extract) {
    try {
      const reply = await deps.extract(
        EXTRACT_SYSTEM,
        `Document:\n${text}\n\nExtract: ${ref.target ?? "the headline yield/APY percentage"}`,
      );
      extraction = parseExtraction(reply, text);
    } catch {
      extraction = null;
    }
  }
  return { ...base, extraction };
}

/** The verdict of a document cross-check. */
export interface DocumentVerdict {
  verdict: "VALID" | "REJECTED" | "ABSTAIN";
  detail: string;
}

/**
 * Deterministic cross-check: the asserted value must be within `toleranceBps` of the
 * figure extracted from the document. No extraction -> ABSTAIN (never a guess).
 */
export function crossCheckDocument(
  assertedValueBps: number,
  evidence: DocumentEvidence,
  toleranceBps: number,
): DocumentVerdict {
  if (!evidence.extraction) {
    return {
      verdict: "ABSTAIN",
      detail: evidence.error
        ? `Could not read the document (${evidence.error}); abstaining.`
        : "No figure could be extracted from the document; abstaining.",
    };
  }
  const gap = Math.abs(assertedValueBps - evidence.extraction.valueBps);
  if (gap <= toleranceBps) {
    return {
      verdict: "VALID",
      detail: `Asserted ${assertedValueBps} bps is within ${toleranceBps} bps of the document figure ${evidence.extraction.valueBps.toFixed(0)} bps (${evidence.label}).`,
    };
  }
  return {
    verdict: "REJECTED",
    detail: `Asserted ${assertedValueBps} bps differs from the document figure ${evidence.extraction.valueBps.toFixed(0)} bps by ${gap.toFixed(0)} bps (> ${toleranceBps} bps).`,
  };
}

/** A Tier-2 document-falsifiable claim to decide. */
export interface DocumentClaimInput {
  claimId: string;
  asset: string;
  /** The value the claim asserts, in bps (same unit the document is normalized to). */
  assertedValueBps: number;
  /** Max gap between the asserted value and the document figure for VALID. */
  toleranceBps: number;
  /** The document to fetch, pin, and read the figure from. */
  document: DocumentRef;
}

export interface DocumentResult {
  evidence: DocumentEvidence;
  verdict: DocumentVerdict;
  trace: Trace;
  sources: Source[];
}

function confidenceFor(verdict: DocumentVerdict["verdict"]): number {
  return verdict === "ABSTAIN" ? 0 : 10_000;
}

/**
 * computeDocumentAttestation — the Tier-2 path: fetch + pin + extract-with-citation +
 * deterministic cross-check, packaged as a hashable trace with a provenance DAG
 * (document -> extraction -> cross-check -> verdict). A verifier confirms the docHash
 * against the real document, re-reads the cited quote, and reruns the comparison.
 */
export async function computeDocumentAttestation(
  input: DocumentClaimInput,
  deps: DocumentDeps,
  clock: ClockLike,
  agentId: string,
): Promise<DocumentResult> {
  const evidence = await fetchDocumentEvidence(input.document, deps, clock.now());
  const verdict = crossCheckDocument(input.assertedValueBps, evidence, input.toleranceBps);

  const ex = evidence.extraction;
  const reasons = ["DOCUMENT_CROSSCHECK"];
  if (ex) reasons.push(`EXTRACTION(${ex.method})`);
  if (verdict.verdict === "ABSTAIN") reasons.push("DOCUMENT_UNREADABLE");

  const nodes: NonNullable<Trace["provenance"]>["nodes"] = [
    {
      id: "document",
      type: "source",
      label: evidence.label,
      ref: evidence.url,
      value: { docHash: evidence.docHash, bytes: evidence.bytes },
    },
  ];
  const edges: NonNullable<Trace["provenance"]>["edges"] = [];
  if (ex) {
    nodes.push({
      id: "extraction",
      type: "evidence",
      label: `${ex.valueBps.toFixed(0)} bps (${ex.method})`,
      value: { valueBps: ex.valueBps, quote: ex.quote, method: ex.method, rawValue: ex.rawValue },
    });
    edges.push({ from: "document", to: "extraction" });
    edges.push({ from: "extraction", to: "crosscheck" });
  } else {
    edges.push({ from: "document", to: "crosscheck" });
  }
  nodes.push({
    id: "crosscheck",
    type: "reconcile",
    label: "deterministic cross-check",
    value: { assertedValueBps: input.assertedValueBps, toleranceBps: input.toleranceBps },
  });
  nodes.push({
    id: "verdict",
    type: "verdict",
    label: verdict.verdict,
    value: { detail: verdict.detail },
  });
  edges.push({ from: "crosscheck", to: "verdict" });

  const trace: Trace = {
    traceVersion: "1.0",
    agentId,
    claimId: input.claimId,
    steps: [
      {
        step: 0,
        thought: `Fetch and pin the referenced document (${evidence.label}), then extract the figure with a citation.`,
        action: {
          tool: "fetchDocumentEvidence",
          input: { url: input.document.url, jsonPath: input.document.jsonPath },
        },
        observation: {
          docHash: evidence.docHash,
          bytes: evidence.bytes,
          extraction: ex ? { valueBps: ex.valueBps, quote: ex.quote, method: ex.method } : null,
          error: evidence.error ?? null,
        },
        ts: evidence.fetchedAt,
      },
      {
        step: 1,
        thought:
          "Cross-check the asserted value against the document figure within tolerance. The verdict is deterministic; the model (if used) only read the figure.",
        action: {
          crossCheck: {
            assertedValueBps: input.assertedValueBps,
            toleranceBps: input.toleranceBps,
          },
        },
        observation: { verdict: verdict.verdict, detail: verdict.detail },
        ts: clock.now(),
      },
    ],
    final: {
      decision: verdict.verdict,
      confidenceBps: confidenceFor(verdict.verdict),
      rationaleSummary: verdict.detail,
      reasons,
    },
    provenance: { nodes, edges },
  };

  const sources: Source[] = [
    {
      name: evidence.label,
      value: { valueBps: ex?.valueBps ?? null, docHash: evidence.docHash },
      source: evidence.url,
      fetchedAt: evidence.fetchedAt,
      confidence: ex ? 10_000 : 0,
    },
  ];

  return { evidence, verdict, trace, sources };
}
