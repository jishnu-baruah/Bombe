const SITE_URL = "https://bombe-web.vercel.app";
const GITHUB_URL = "https://github.com/jishnu-baruah/Bombe";

/**
 * GET /llms.txt, the agent-facing summary of Bombe (the emerging llms.txt convention).
 *
 * A concise, markdown-formatted map of the keyless JSON API and the MCP server so any
 * AI agent can discover the capability schema, read and verify an attestation, and
 * request one, with no human in the loop. Plain text, no auth.
 */
const BODY = `# Bombe

> Bombe is an autonomous AI attestor network for real-world-asset (RWA) yield claims on Mantle Sepolia (chain id 5003). Agents attest only to falsifiable claims (Tier 1 deterministic, Tier 2 document-falsifiable). Judgment claims (Tier 3) are never attested; they abstain, and the contract enforces it. Safety lives at the contract layer.

The API is keyless and read-mostly. Every verdict is recomputable: the reasoning hash on-chain re-derives from the stored trace. Start at the capability schema, then read or verify a claim.

## Capability schema

- [Capability schema](${SITE_URL}/api/v1/schema): the live registry of claim types, what each one checks, the per-class tolerances (with a tamper-evident hash), and the ABSTAIN reason codes. The ecosystem-standard intake contract. Read this first.

## Keyless JSON API

- [List assets](${SITE_URL}/api/v1/assets): the curated, verified RWA yields Bombe attests, plus the on-chain attestation contract address and explorer.
- [Discover assets](${SITE_URL}/api/v1/discover): the full open universe of attestable RWA yields as ready-to-attest source descriptors. Filter by chain, symbol query, RWA-only, or min TVL.
- [NAV check](${SITE_URL}/api/v1/nav-check): read an ERC-4626 vault share price on-chain and deterministically cross-check an asserted NAV.
- [Document check](${SITE_URL}/api/v1/document-check): Tier-2 cross-check of an asserted tokenized-treasury yield (bps) against the live, hashed US Treasury bill rate.
- [Read a claim](${SITE_URL}/api/v1/claims/{claimId}): a claim and its on-chain attestations (decision, confidence, reasoning hash). Example claimId: mETH-2026-06-07.
- [Verify a claim](${SITE_URL}/api/v1/verify/{claimId}): re-derive the reasoning hash from the stored trace and compare it to the on-chain value. Returns verified, mismatch, or trace_unavailable per attestation.
- [Request an attestation](${SITE_URL}/api/v1/request): POST a supported yield claim. Non-custodial: pay the fee from your own wallet first, then pass the Mantle Sepolia payment tx hash. Returns the on-chain claim id and verdict.

## How to verify a claim

1. GET ${SITE_URL}/api/v1/claims/{claimId} to read the on-chain reasoningHash.
2. GET ${SITE_URL}/api/v1/verify/{claimId} to re-derive the hash from the stored trace and compare. A "verified" status means the published reasoning matches what was attested on-chain.

## How to request an attestation

1. GET ${SITE_URL}/api/v1/schema to confirm the claim type is status "live" and see the required fields.
2. Pay the fee from your own wallet on Mantle Sepolia (non-custodial).
3. POST to ${SITE_URL}/api/v1/request with claimType, asset, assertedBps, windowDays, payer, and paymentTxHash. The verdict and on-chain claim id come back in the response.

## MCP server

- [@bombe/mcp](${GITHUB_URL}/tree/main/packages/mcp): a Model Context Protocol server (stdio transport) exposing the same capabilities as MCP tools, so an MCP-capable agent can use Bombe headlessly. Tools: bombe_list_assets, bombe_discover_assets, bombe_get_schema, bombe_check_nav, bombe_check_document, bombe_get_claim, bombe_verify_claim, bombe_request_attestation. Run: node --import tsx packages/mcp/src/index.ts (BOMBE_API overrides the base URL).

## Links

- [Live site](${SITE_URL})
- [Integration guide](${SITE_URL}/integrate)
- [Verify console](${SITE_URL}/verify)
- [GitHub](${GITHUB_URL})
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}
