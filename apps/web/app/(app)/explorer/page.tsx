/**
 * /explorer, the protocol-activity explorer (server component, read-only).
 *
 * A block-explorer-style history of recent claims and their attestations. Reads
 * the best source available now via lib/activity-cache.ts: the subgraph when
 * SUBGRAPH_URL is set, else viem getLogs over a bounded recent range, enriched
 * with the stored reasoning trace when present. No keys, no writes, no raw JSON
 * on the surface.
 *
 * Caching: Redis (short TTL) when configured, else Next.js ISR via `revalidate`.
 */

import { type ActivityClaim, explorerAddressUrl, explorerTxUrl, shortAddr } from "@/lib/activity";
import { getActivityFeed } from "@/lib/activity-cache";
import Link from "next/link";

// ISR fallback when Redis is not configured: re-render at most every 30s.
export const revalidate = 30;

export const metadata = {
  title: "Explorer | Bombe",
  description:
    "A block-explorer-style history of recent claims and on-chain attestations on the Bombe network, live on Mantle Sepolia.",
};

const DECISION_STYLE: Record<string, string> = {
  VALID: "text-[#86c95f] border-[rgba(134,201,95,0.4)] bg-[rgba(134,201,95,0.1)]",
  REJECTED: "text-[#e23b4a] border-[rgba(226,59,74,0.4)] bg-[rgba(226,59,74,0.1)]",
  ABSTAIN: "text-[#d4a017] border-[rgba(212,160,23,0.4)] bg-[rgba(212,160,23,0.1)]",
};

const DECISION_LABEL: Record<string, string> = {
  VALID: "VALID",
  REJECTED: "REJECTED",
  ABSTAIN: "ABSTAIN",
};

function DecisionChip({ decision }: { decision: string | null }) {
  if (!decision) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 text-[12px] font-semibold rounded-full border text-muted-foreground border-white/[0.14]">
        pending
      </span>
    );
  }
  const style =
    DECISION_STYLE[decision] ?? "text-muted-foreground border-white/[0.2] bg-transparent";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[12px] font-semibold rounded-full border tabular ${style}`}
    >
      {DECISION_LABEL[decision] ?? decision}
    </span>
  );
}

function relativeTime(unixSeconds: number | null): string {
  if (!unixSeconds) return "·";
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TierBadge({ tier }: { tier: number }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border border-white/[0.12] text-muted-foreground">
      Tier {tier || "?"}
    </span>
  );
}

function ClaimRow({ claim }: { claim: ActivityClaim }) {
  const verifyHref = `/verify?q=${encodeURIComponent(claim.claimId)}`;
  const attestor = claim.attestations[0]?.attestor ?? null;
  const attestorCount = claim.attestations.length;
  const headlineTx = claim.attestations[0]?.txHash ?? claim.postTxHash;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_0.7fr_1fr_0.9fr_1fr_0.7fr] gap-2 md:gap-4 px-5 md:px-6 py-4 md:py-4 border-b border-white/[0.06] text-sm items-center hover:bg-white/[0.02] transition-colors">
      {/* Claim id + tier */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={verifyHref}
            className="font-mono text-[13px] text-foreground hover:text-[#9296f5] transition-colors truncate"
            title={claim.claimId}
          >
            {claim.claimId}
          </Link>
          <TierBadge tier={claim.tier} />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
          {claim.source}
        </span>
      </div>

      {/* Claim type */}
      <div className="text-muted-foreground text-[13px]">
        {claim.claimType ? (
          <span className="font-mono text-[12px]">{claim.claimType}</span>
        ) : (
          <span className="text-muted-foreground/50">·</span>
        )}
        {claim.asset ? (
          <span className="block font-mono text-[11px] text-[#9296f5] mt-0.5">{claim.asset}</span>
        ) : null}
      </div>

      {/* Decision */}
      <div>
        <DecisionChip decision={claim.decision} />
      </div>

      {/* Attestor */}
      <div className="text-[13px]">
        {attestor ? (
          <a
            href={explorerAddressUrl(attestor)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {shortAddr(attestor)}
          </a>
        ) : (
          <span className="text-muted-foreground/50">·</span>
        )}
        {attestorCount > 1 ? (
          <span className="block text-[11px] text-muted-foreground/60 mt-0.5">
            +{attestorCount - 1} more
          </span>
        ) : null}
      </div>

      {/* On-chain tx */}
      <div className="text-[13px]">
        {headlineTx ? (
          <a
            href={explorerTxUrl(headlineTx)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-[#9296f5] hover:text-white transition-colors"
          >
            {shortAddr(headlineTx)} ↗
          </a>
        ) : (
          <span className="text-muted-foreground/50">·</span>
        )}
      </div>

      {/* Time + verify/trace links */}
      <div className="text-right md:text-left">
        <span className="block text-[12px] text-muted-foreground tabular">
          {relativeTime(claim.timestamp)}
        </span>
        <Link
          href={verifyHref}
          className="inline-block text-[11px] text-muted-foreground/70 hover:text-[#9296f5] transition-colors mt-0.5"
        >
          Verify & trace →
        </Link>
      </div>
    </div>
  );
}

const DECISION_FILTERS = [
  { label: "All", value: null },
  { label: "Valid", value: "VALID" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Abstain", value: "ABSTAIN" },
  { label: "Pending", value: "PENDING" },
] as const;

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ decision?: string }>;
}) {
  const { decision: decisionFilter } = await searchParams;
  let feed: Awaited<ReturnType<typeof getActivityFeed>> | null = null;
  let errored = false;
  try {
    feed = await getActivityFeed(40);
  } catch {
    errored = true;
  }

  const allClaims = feed?.claims ?? [];
  const claims = decisionFilter
    ? allClaims.filter((c) =>
        decisionFilter === "PENDING" ? c.decision === null : c.decision === decisionFilter,
      )
    : allClaims;
  const hasRows = claims.length > 0;
  const filteredOut = !hasRows && allClaims.length > 0;

  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="hero-ambient relative px-6 lg:px-12 pt-12 lg:pt-20 pb-12 lg:pb-16">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-5">Protocol activity</span>
          <h1 className="font-display balance text-[clamp(40px,7vw,76px)] leading-[1.03] text-foreground mb-6">
            Every claim, every attestation, <span className="text-[#9296f5]">on the record.</span>
          </h1>
          <p className="pretty text-lg text-muted-foreground leading-relaxed max-w-[44rem]">
            A live history of what the network has checked. Each row is a claim and the on-chain
            attestations it drew, with the verdict, the attestor, and a link to the transaction on
            Mantle Sepolia. Decisive verdicts are computed deterministically from the evidence;
            judgment claims abstain.
          </p>
        </div>
      </section>

      {/* Table */}
      <section className="px-6 lg:px-12 pb-24 lg:pb-32">
        <div className="max-w-[1200px] mx-auto">
          {/* Source + count line */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <span className="eyebrow">Recent activity</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
              {claims.length} claim{claims.length === 1 ? "" : "s"}
              {feed?.source === "subgraph" ? " · indexed" : " · live read"}
            </span>
          </div>

          {/* Decision filter tabs */}
          <div className="flex flex-wrap gap-2 mb-5">
            {DECISION_FILTERS.map((f) => {
              const active = (f.value ?? null) === (decisionFilter ?? null);
              const href = f.value ? `/explorer?decision=${f.value}` : "/explorer";
              return (
                <Link
                  key={f.label}
                  href={href}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                    active
                      ? "bg-white text-black border-white"
                      : "border-white/[0.12] text-muted-foreground hover:text-foreground hover:border-white/30"
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>

          <div className="rounded-[20px] bg-[#16181a] border border-white/[0.08] overflow-hidden">
            {/* Header row (desktop) */}
            <div className="hidden md:grid grid-cols-[1.5fr_0.7fr_1fr_0.9fr_1fr_0.7fr] gap-4 px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
              {["Claim", "Type", "Decision", "Attestor", "Transaction", "When"].map((h) => (
                <span
                  key={h}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </div>

            {errored ? (
              <div className="px-6 py-16 text-center">
                <p className="text-base text-foreground mb-2">Could not load the activity feed.</p>
                <p className="text-sm text-muted-foreground max-w-[34rem] mx-auto">
                  The public RPC may be rate-limited right now. The feed refreshes automatically;
                  try again in a moment, or look up a specific claim on{" "}
                  <Link
                    href="/verify"
                    className="text-[#9296f5] hover:text-white transition-colors"
                  >
                    Verify
                  </Link>
                  .
                </p>
              </div>
            ) : hasRows ? (
              claims.map((claim) => <ClaimRow key={claim.claimIdHex} claim={claim} />)
            ) : (
              <div className="px-6 py-16 text-center">
                <p className="text-base text-foreground mb-2">
                  {filteredOut ? "No claims match this filter." : "No recent activity in range."}
                </p>
                <p className="text-sm text-muted-foreground max-w-[34rem] mx-auto">
                  {filteredOut
                    ? "Try a different filter above, or "
                    : "No claims were posted in the bounded recent window read here. New activity appears within a block or two; you can also "}
                  verify a known claim on{" "}
                  <Link
                    href="/verify"
                    className="text-[#9296f5] hover:text-white transition-colors"
                  >
                    Verify
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>

          {/* Honest range disclosure */}
          {feed?.bounded && feed.source === "chain" ? (
            <p className="text-[12px] text-muted-foreground/60 leading-relaxed mt-4 max-w-[44rem]">
              This view reads contract event logs over a bounded recent block range on the public
              Mantle Sepolia RPC. Older history beyond that window is not shown here; the indexed
              path (a subgraph) lifts that bound when configured.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
