#!/usr/bin/env node
/**
 * Bombe MCP server, headless access to the attestor network.
 *
 * Exposes Bombe's keyless public API as MCP tools so any MCP-capable agent can
 * discover attestable assets, read a verdict, verify it (re-derive the on-chain
 * hash), and request a paid attestation, with no human in the loop. See SKILL.md.
 *
 * Run: node --import tsx packages/mcp/src/index.ts   (BOMBE_API overrides the base URL)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.BOMBE_API ?? "https://bombe-web.vercel.app";

async function getText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000) });
  return res.text();
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

const server = new McpServer({ name: "bombe", version: "0.1.0" });

server.tool(
  "bombe_list_assets",
  "List the real-world-asset yields Bombe can attest and the on-chain attestation contract.",
  {},
  async () => text(await getText("/api/v1/assets")),
);

server.tool(
  "bombe_discover_assets",
  "Discover the full open universe of attestable RWA yields (not just the curated set) as ready-to-attest source descriptors. Filter by chain, symbol query, RWA-only, or min TVL. Each result's `descriptor` can be passed as `spec` to bombe_request_attestation.",
  {
    chain: z.string().optional().describe("e.g. Mantle"),
    query: z.string().optional().describe("symbol or project substring"),
    rwaOnly: z.boolean().optional().describe("restrict to known RWA/treasury/staking issuers"),
    minTvl: z.number().optional(),
    limit: z.number().int().positive().optional(),
  },
  async ({ chain, query, rwaOnly, minTvl, limit }) => {
    const qs = new URLSearchParams();
    if (chain) qs.set("chain", chain);
    if (query) qs.set("query", query);
    if (rwaOnly) qs.set("rwaOnly", "1");
    if (typeof minTvl === "number") qs.set("minTvl", String(minTvl));
    if (typeof limit === "number") qs.set("limit", String(limit));
    return text(await getText(`/api/v1/discover?${qs.toString()}`));
  },
);

server.tool(
  "bombe_get_schema",
  "Get the attestation schema: what to submit to get any RWA claim attested, the claim-type capability matrix (what is checked, returned, and when it abstains), the per-class tolerances (with a tamper-evident hash), and the grade / abstain-reason definitions. The ecosystem-standard intake contract.",
  {},
  async () => text(await getText("/api/v1/schema")),
);

server.tool(
  "bombe_check_document",
  "Tier-2 document verification: cross-check an asserted tokenized-treasury yield (bps) against the live, hashed US Treasury bill rate. Returns the verdict, the pinned document hash, the cited figure, and the provenance. Deterministic; re-fetch the document to verify.",
  {
    asset: z.string().describe("e.g. USDY, BUIDL, OUSG"),
    assertedBps: z.number().int().positive().describe("the yield you assert, in basis points"),
    toleranceBps: z.number().int().positive().optional(),
  },
  async ({ asset, assertedBps, toleranceBps }) => {
    const qs = new URLSearchParams({ asset, assertedBps: String(assertedBps) });
    if (typeof toleranceBps === "number") qs.set("toleranceBps", String(toleranceBps));
    return text(await getText(`/api/v1/document-check?${qs.toString()}`));
  },
);

server.tool(
  "bombe_get_claim",
  "Read a claim and its on-chain attestations (decision, confidence, reasoning hash) by claim id.",
  { claimId: z.string().describe("e.g. mETH-2026-06-07") },
  async ({ claimId }) => text(await getText(`/api/v1/claims/${encodeURIComponent(claimId)}`)),
);

server.tool(
  "bombe_verify_claim",
  "Re-derive the reasoning hash from the stored trace and compare it to the on-chain value; returns verified, mismatch, or trace_unavailable per attestation.",
  { claimId: z.string() },
  async ({ claimId }) => text(await getText(`/api/v1/verify/${encodeURIComponent(claimId)}`)),
);

server.tool(
  "bombe_request_attestation",
  "Request a paid attestation of a supported yield claim. Pay the fee from your own wallet first (non-custodial), then pass the payment tx hash. Returns the on-chain claim id and verdict.",
  {
    asset: z.string().describe("a featured symbol (see bombe_list_assets) or any discovered asset"),
    assertedBps: z.number().int().positive().describe("the yield you assert, in basis points"),
    windowDays: z.number().int().positive(),
    payer: z.string().describe("the address you paid from"),
    paymentTxHash: z.string().describe("the Mantle Sepolia tx hash of your fee payment"),
  },
  async (args) => {
    const res = await fetch(`${BASE}/api/v1/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimType: "YIELD_BPS", ...args }),
      signal: AbortSignal.timeout(70_000),
    });
    return text(await res.text());
  },
);

await server.connect(new StdioServerTransport());
