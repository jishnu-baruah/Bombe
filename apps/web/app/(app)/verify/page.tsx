/**
 * /verify, public lookup page (T-610).
 *
 * Paste a claim ID, a reasoning hash (0x, 32 bytes), or a tx hash and get the
 * on-chain proof: the verdict, the attestors, the reasoning hash, and explorer
 * links. Read-only, no keys; resolves server-side via lib/public-api.ts.
 */

import { GLOSSARY, Gloss } from "@/components/ui/Gloss";
import { type LookupResult, explorerAddressUrl, lookup } from "@/lib/public-api";
import Link from "next/link";

export const revalidate = 30;

const DECISION_STYLE: Record<string, string> = {
  VALID: "text-[#3fb950] border-[rgba(63,185,80,0.4)] bg-[rgba(63,185,80,0.1)]",
  REJECTED: "text-[#e23b4a] border-[rgba(226,59,74,0.4)] bg-[rgba(226,59,74,0.1)]",
  ABSTAIN: "text-[#d4a017] border-[rgba(212,160,23,0.4)] bg-[rgba(212,160,23,0.1)]",
};

function DecisionChip({ decision }: { decision: string }) {
  const style =
    DECISION_STYLE[decision] ?? "text-[#8d969e] border-[rgba(255,255,255,0.2)] bg-transparent";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[12px] font-semibold rounded-full border tabular ${style}`}
    >
      {decision}
    </span>
  );
}

function ClaimProof({ result }: { result: LookupResult }) {
  const claim = result.claim;
  if (!claim) return null;
  return (
    <div className="rounded-[20px] bg-[#16181a] border border-white/[0.08] overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.08] flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-[12px] text-muted-foreground font-semibold tracking-[0.8px] uppercase mb-1">
            {result.kind === "reasoningHash" ? "Reasoning hash matched" : "Claim"}
          </p>
          <p className="text-[18px] font-semibold tracking-[-0.3px] font-mono break-all">
            {claim.claimId}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-[#0a0a0a] border border-white/[0.08]">
            Tier {claim.tier || "?"}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#0a0a0a] border border-white/[0.08]">
            {claim.closed ? "closed" : "open"}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#0a0a0a] border border-white/[0.08]">
            {claim.attestorCount} attestor{claim.attestorCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {claim.attestations.length === 0 ? (
        <p className="px-6 py-6 text-[14px] text-muted-foreground">
          This claim is posted on-chain but has no attestations yet.
        </p>
      ) : (
        <ul className="divide-y divide-[rgba(255,255,255,0.05)]">
          {claim.attestations.map((a) => {
            const highlighted = result.matchedAttestor?.toLowerCase() === a.attestor.toLowerCase();
            return (
              <li
                key={a.attestor}
                className={`px-6 py-5 ${highlighted ? "bg-[rgba(73,79,223,0.06)]" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <DecisionChip decision={a.decision} />
                  <span className="text-[13px] text-muted-foreground tabular">
                    confidence {a.confidenceBps} bps
                  </span>
                  <a
                    href={explorerAddressUrl(a.attestor)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-[#9296f5] hover:text-white font-mono transition-colors"
                  >
                    {a.attestor.slice(0, 10)}…{a.attestor.slice(-6)} →
                  </a>
                </div>
                <dl className="grid sm:grid-cols-[140px_1fr] gap-y-1.5 gap-x-4 text-[13px]">
                  <dt className="text-muted-foreground">
                    <Gloss def={GLOSSARY.reasoningHash}>reasoning hash</Gloss>
                  </dt>
                  <dd className="font-mono text-muted-foreground break-all">{a.reasoningHash}</dd>
                  <dt className="text-muted-foreground">
                    <Gloss def={GLOSSARY.sourcesHash}>sources hash</Gloss>
                  </dt>
                  <dd className="font-mono text-muted-foreground break-all">{a.sourcesHash}</dd>
                  <dt className="text-muted-foreground">trace</dt>
                  <dd className="font-mono text-muted-foreground break-all">
                    {a.traceURI || "(not stored yet)"}
                  </dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-6 py-4 border-t border-white/[0.08] bg-white/[0.02] flex flex-wrap gap-4 text-[13px]">
        <Link
          href={`/claim/${encodeURIComponent(claim.claimId)}`}
          className="text-[#9296f5] hover:text-white transition-colors"
        >
          Open the full trace view →
        </Link>
        <a
          href={`/api/v1/verify/${encodeURIComponent(claim.claimId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#9296f5] hover:text-white transition-colors"
        >
          Re-derive the hash via the API →
        </a>
      </div>
    </div>
  );
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const result = q ? await lookup(q) : null;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <section className="hero-ambient relative px-6 lg:px-12 pt-12 lg:pt-20 pb-20 lg:pb-28">
        <div className="max-w-3xl mx-auto">
          <span className="eyebrow block mb-6">Verify</span>
          <h1 className="font-display balance text-4xl lg:text-[56px] leading-[1.05] text-foreground mb-4">
            Don&apos;t trust. Verify.
          </h1>
          <p className="pretty text-lg text-muted-foreground leading-relaxed mb-8 max-w-[36rem]">
            Paste a claim ID, a reasoning hash, or a transaction hash. Get the verdict and its
            on-chain proof, straight from the contract on Mantle Sepolia. No account, no keys.
          </p>

          <form method="get" className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="mETH-2026-06-07  or  0x… hash  or  tx hash"
              aria-label="Claim ID, reasoning hash, or transaction hash"
              className="flex-1 px-4 py-3 rounded-full bg-[#16181a] border border-white/[0.08] text-[15px] text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:border-[#494fdf] transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 text-[15px] font-medium bg-white text-black rounded-full hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              Verify
            </button>
          </form>

          <p className="text-[13px] text-muted-foreground mb-10">
            Reasoning-hash lookup scans the recent claim set; if a hash is not found there it is
            shown as a transaction on the explorer.
          </p>

          {result && !result.found && (
            <div className="rounded-[16px] border border-white/[0.08] bg-[#16181a] px-6 py-5 text-[14px] text-muted-foreground">
              {result.message ?? "Nothing found for that input."}
            </div>
          )}

          {result?.found && result.kind === "txHash" && (
            <div className="rounded-[16px] border border-white/[0.08] bg-[#16181a] px-6 py-5">
              <p className="text-[14px] text-muted-foreground mb-3">{result.message}</p>
              <a
                href={result.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] text-[#9296f5] hover:text-white font-medium transition-colors"
              >
                View transaction on Mantle explorer →
              </a>
            </div>
          )}

          {result?.found && result.claim && <ClaimProof result={result} />}
        </div>
      </section>
    </div>
  );
}
