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
    asset: z.enum(["mETH", "USDY"]),
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
