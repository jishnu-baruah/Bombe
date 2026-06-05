/**
 * tools/doc-history.ts — Document reading and attestation history tools.
 * (PRD §6.3, T-212)
 *
 * Implements two tools:
 *
 * read_document
 *   Reads a document fixture (servicer report / bank statement).
 *   For claim C (CASHFLOW_MATCH):
 *     - servicer report: { cashflowTotal: 50000 }
 *     - bank statement:  { lineItemsTotal: 45000 }
 *   The mismatch (50000 vs 45000) is exposed in the returned fields so
 *   the loop can detect it and produce REJECTED decisions for claim C.
 *   The result value includes the document's fields + docVersion (from fixture).
 *
 * cross_check_history
 *   "Queries Postgres attestation history — persistent memory lives in the
 *    DB, not the context window." (PRD §6.3)
 *
 *   SEAM DESIGN NOTE:
 *     The real DB does not exist yet (T-401). This tool accepts a HistorySource
 *     injected via ToolDeps. Tests inject a MockHistorySource; the runner (T-403)
 *     wires the real Postgres-backed implementation. The tool itself is agnostic
 *     to the underlying store — it only calls historySource.priorAttestations().
 */

import { loadDocument } from "@bombe/shared";
import { z } from "zod";
import { ToolResultSchema } from "./types.js";
import type { Tool, ToolDeps, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_HIGH = 9500;

// ---------------------------------------------------------------------------
// read_document
// ---------------------------------------------------------------------------

const ReadDocumentInputSchema = z.object({
  docRef: z.string().min(1),
  version: z.string().min(1).default("v1"),
});

/**
 * read_document — reads a document fixture (servicer report, bank statement).
 *
 * Input:  { docRef: string; version?: string }
 *         e.g. { docRef: "pc-pool-1-servicer" }
 *              { docRef: "pc-pool-1-statement", version: "v1" }
 *
 * Output: ToolResult where value = {
 *           docRef, docType, docVersion, fields
 *         }
 *
 * Claim C — CASHFLOW_MATCH mismatch exposure:
 *   servicer report → fields.cashflowTotal  = 50000
 *   bank statement  → fields.lineItemsTotal = 45000
 *   Calling this tool for both docRefs exposes the mismatch.
 *   The loop computes the delta via compute_expected and produces REJECTED.
 */
const readDocumentTool: Tool = {
  name: "read_document",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const { docRef, version } = ReadDocumentInputSchema.parse(input);
    const doc = loadDocument(docRef, version, deps.fixturesRoot);

    const result = ToolResultSchema.parse({
      value: {
        docRef: doc.docRef,
        docType: doc.docType,
        docVersion: doc.version,
        fields: doc.fields,
      },
      source: `fixture:${version}/${docRef}`,
      fetchedAt: deps.clock.now(),
      confidence: CONFIDENCE_HIGH,
    });

    return result;
  },
};

// ---------------------------------------------------------------------------
// cross_check_history
// ---------------------------------------------------------------------------

const CrossCheckHistoryInputSchema = z.object({
  claimRef: z.string().min(1),
});

/**
 * cross_check_history — queries prior attestation history for a claim.
 *
 * Input:  { claimRef: string }
 *         e.g. { claimRef: "claim-A" }
 *
 * Output: ToolResult where value = {
 *           claimRef,
 *           priorAttestations: Array<{ agent, decision, confidenceBps }>
 *         }
 *
 * SEAM DESIGN NOTE:
 *   Persistent memory lives in the DB, not the context window (PRD §6.3).
 *   This tool is backed by ToolDeps.historySource — a HistorySource interface.
 *   Tests inject MockHistorySource (deterministic in-memory map).
 *   The runner (T-403) injects PgliteHistorySource (real Postgres/pglite).
 *   The tool itself contains no persistence logic — only the boundary call.
 */
const crossCheckHistoryTool: Tool = {
  name: "cross_check_history",

  async run(input: unknown, deps: ToolDeps): Promise<ToolResult> {
    const { claimRef } = CrossCheckHistoryInputSchema.parse(input);
    const priorAttestations = await deps.historySource.priorAttestations(claimRef);

    const result = ToolResultSchema.parse({
      value: {
        claimRef,
        priorAttestations,
      },
      source: "attestation-history",
      fetchedAt: deps.clock.now(),
      confidence: CONFIDENCE_HIGH,
    });

    return result;
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { readDocumentTool, crossCheckHistoryTool };
