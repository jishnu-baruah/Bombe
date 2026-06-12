/**
 * chat-tools.ts — AI SDK tool definitions for the support chatbot.
 *
 * Server-only. Each tool calls Bombe's OWN public JSON API over HTTP (against the
 * same deployment) so the chatbot is grounded in exactly what an external agent
 * would see. Nothing here invents a verdict or an asset; tools return the live API
 * payload (trimmed for token budget) and the model narrates it under the prompt's
 * honesty rules.
 *
 * The base URL is derived from the incoming request (so it works on any
 * deployment / preview) and falls back to SITE_URL, then the production origin.
 *
 * Must never be imported by a client component: it reads request internals and is
 * wired only into the streamText() call in /api/chat.
 */
import { tool } from "ai";
import { z } from "zod";

const PROD_ORIGIN = "https://bombe-web.vercel.app";
const FETCH_TIMEOUT_MS = 12_000;

/** Resolve the base origin tools should call: request origin, then SITE_URL, then prod. */
export function resolveBaseUrl(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return process.env.SITE_URL || PROD_ORIGIN;
  }
}

/** Fetch JSON from a same-deployment API path, with a bounded timeout. Never throws. */
async function getJson(
  base: string,
  path: string,
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  try {
    const r = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    let data: unknown;
    try {
      data = await r.json();
    } catch {
      data = undefined;
    }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Build the chatbot's tool set, bound to the request's base URL.
 *
 * - verifyClaim: re-derive the on-chain reasoning hash and report the verdict +
 *   tamper-evidence (match true/false), plus the verify-page and explorer links.
 * - recommendAssets: list the attestable RWA assets the API exposes (attestation
 *   coverage, not investment advice).
 * - listCapabilities: the live claim-type / tier registry, for grounding.
 */
export function buildChatTools(req: Request) {
  const base = resolveBaseUrl(req);
  const verifyPage = (q: string) => `${base}/verify?q=${encodeURIComponent(q)}`;
  const explorer = "https://sepolia.mantlescan.xyz";

  return {
    verifyClaim: tool({
      description:
        "Verify a Bombe attestation on-chain. Use when the user gives a claim ID " +
        "(for example mETH-2026-06-12 or mETH-REQ-01122a8fa5) or pastes a 0x reasoning " +
        "hash or transaction hash. Returns the on-chain verdict(s), how many attestors " +
        "signed, and whether the recomputed reasoningHash matches the on-chain value " +
        "(match true = the tamper-evident proof holds). Summarize this for a human and " +
        "give the verify-page and explorer links; never invent a verdict.",
      parameters: z.object({
        claimId: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "The claim ID, or a 0x reasoning/transaction hash the user pasted. Passed through as-is.",
          ),
      }),
      execute: async ({ claimId }) => {
        const id = claimId.trim();
        const encoded = encodeURIComponent(id);
        // The verify endpoint re-derives the hash per attestation; the claims
        // endpoint gives the tier / verdict detail. Fetch both (best-effort).
        const [verify, claim] = await Promise.all([
          getJson(base, `/api/v1/verify/${encoded}`),
          getJson(base, `/api/v1/claims/${encoded}`),
        ]);

        if (verify.status === 404 || claim.status === 404) {
          return {
            found: false,
            claimId: id,
            message: "No posted claim or matching attestation was found on-chain for that input.",
            verifyPage: verifyPage(id),
            explorer,
          };
        }
        if (!verify.ok && !claim.ok) {
          return {
            found: false,
            claimId: id,
            error: "verify_unavailable",
            message:
              "The verify endpoint could not be reached. Point the user to the verify page rather than guessing.",
            verifyPage: verifyPage(id),
            explorer,
          };
        }

        return {
          found: true,
          claimId: id,
          // The per-attestor hash re-derivation: decision, onChainReasoningHash,
          // recomputed, match, status (verified | mismatch | trace_unavailable).
          verify: verify.data,
          // Tier + attestation verdicts (decision, confidenceBps, traceURI...).
          claim: claim.ok ? claim.data : undefined,
          verifyPage: verifyPage(id),
          explorer,
        };
      },
    }),

    recommendAssets: tool({
      description:
        "List attestable RWA assets Bombe can attest, matching the user's ask. This is " +
        "an ATTESTATION-coverage recommender (what Bombe can attest for you), NOT " +
        "investment advice. Ground every recommendation only in what this returns; never " +
        "predict prices or returns. Always add a brief 'this is attestation coverage, not " +
        "financial advice' note when recommending.",
      parameters: z.object({
        query: z
          .string()
          .max(80)
          .optional()
          .describe("Free-text filter, for example a symbol or name (mETH, USDY, treasury)."),
        category: z
          .string()
          .max(60)
          .optional()
          .describe("RWA category filter, for example treasury, staking, lending."),
        minTvl: z
          .number()
          .nonnegative()
          .optional()
          .describe("Minimum TVL in USD to include a source."),
      }),
      execute: async ({ query, category, minTvl }) => {
        const params = new URLSearchParams({ rwaOnly: "1", limit: "12" });
        if (query) params.set("query", query);
        if (category) params.set("category", category);
        if (minTvl !== undefined) params.set("minTvl", String(minTvl));

        // Prefer the live discovery universe; fall back to the curated assets list.
        let res = await getJson(base, `/api/v1/discover?${params.toString()}`);
        let source = "discover";
        if (!res.ok || !res.data) {
          res = await getJson(base, "/api/v1/assets");
          source = "assets";
        }
        if (!res.ok || !res.data) {
          return {
            ok: false,
            message:
              "The asset discovery API could not be reached. Point the user to /live and /integrate rather than naming assets.",
            note: "This is attestation coverage, not financial advice.",
          };
        }

        // Trim to a short, model-friendly list. Both endpoints expose `assets`.
        const raw = (res.data as { assets?: unknown }).assets;
        const list = Array.isArray(raw) ? raw : [];
        const assets = list.slice(0, 12).map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          const sources = Array.isArray(o.sources)
            ? (o.sources as Array<Record<string, unknown>>)
                .map((s) => s.label ?? s.kind ?? s.scheme)
                .filter(Boolean)
            : undefined;
          return {
            symbol: o.symbol,
            name: o.name,
            category: o.category,
            chain: o.chain,
            grade: o.grade,
            verified: o.verified,
            sources,
          };
        });

        return {
          ok: true,
          source,
          count: assets.length,
          assets,
          note: "This is attestation coverage (what Bombe can attest), not financial advice. Do not predict prices or returns.",
        };
      },
    }),

    listCapabilities: tool({
      description:
        "Get the live capability registry: supported claim types, their tier, and " +
        "live/planned status. Use to ground answers about what Bombe can attest and what " +
        "the tiers mean. Do not promise claim types not marked live.",
      parameters: z.object({}),
      execute: async () => {
        const res = await getJson(base, "/api/v1/schema");
        if (!res.ok || !res.data) {
          return {
            ok: false,
            message:
              "The schema endpoint could not be reached. Describe tiers from general knowledge of Bombe and link /integrate.",
          };
        }
        return { ok: true, schema: res.data };
      },
    }),
  };
}
