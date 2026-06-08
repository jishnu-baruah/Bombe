"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Renders the LIVE attestation schema (GET /api/v1/schema) so this page can never drift
// from what the system actually does: each claim type shows its honest live/planned
// status, what is checked, and when it abstains. The tolerancesHash is shown for
// tamper-evidence (D25.7).

interface ClaimType {
  claimType: string;
  tier: 1 | 2 | 3;
  status: "live" | "planned";
  requires: string[];
  checks: string;
  returns: string;
  abstainWhen: string;
  schemes: string[];
}
interface Schema {
  version: string;
  invariant: string;
  claimTypes: ClaimType[];
  tolerancesHash: string;
  grades: { grade: string; minTvlUsd: number; note?: string }[];
  abstainReasons: Record<string, string>;
  notes: string[];
}

const BADGE: Record<string, string> = {
  live: "text-[#86c95f] border-[rgba(66,134,25,0.4)] bg-[rgba(66,134,25,0.08)]",
  planned: "text-[#c9a227] border-[rgba(176,144,0,0.4)] bg-[rgba(176,144,0,0.07)]",
};

export default function CapabilitiesPage() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/v1/schema")
      .then((r) => r.json())
      .then(setSchema)
      .catch(() => setErr(true));
  }, []);

  return (
    <div className="bg-[#000000] text-[#ffffff] min-h-screen">
      <section className="px-6 pt-[120px] pb-[64px]">
        <div className="max-w-6xl mx-auto">
          <p className="text-[13px] text-[#494fdf] font-semibold tracking-[0.8px] uppercase mb-4">
            What Bombe can attest
          </p>
          <h1 className="text-[clamp(32px,5vw,52px)] font-semibold leading-[1.06] tracking-[-0.8px] mb-6 balance">
            The capability matrix, published and honest.
          </h1>
          <p className="text-[17px] text-[rgba(255,255,255,0.62)] leading-[1.56] max-w-[46rem] mb-4 pretty">
            {schema?.invariant ??
              "Bring a falsifiable claim and a source we can recompute ourselves. No checkable source, or a judgment claim, means ABSTAIN."}
          </p>
          <p className="text-[14px] text-[rgba(255,255,255,0.45)] max-w-[46rem]">
            This page renders the live{" "}
            <a
              href="/api/v1/schema"
              target="_blank"
              rel="noreferrer"
              className="text-[#494fdf] hover:text-[#6b70e8] font-mono"
            >
              /api/v1/schema
            </a>{" "}
            so it cannot drift from what the system does.{" "}
            <span className="text-[#86c95f]">Live</span> is attestable now;{" "}
            <span className="text-[#c9a227]">planned</span> is on the roadmap.
          </p>
          {schema?.tolerancesHash && (
            <p className="text-[12px] text-[#505a63] font-mono mt-4 break-all">
              tolerancesHash {schema.tolerancesHash} (tamper-evident: the published bands hash to
              this, and the same hash appears in every reasoning trace)
            </p>
          )}
        </div>
      </section>

      <section className="px-6 pb-[72px]">
        <div className="max-w-6xl mx-auto">
          {err && (
            <p className="text-[14px] text-[#f0a0a8]">
              Could not load the schema. Try again shortly.
            </p>
          )}
          {!schema && !err && (
            <p className="text-[14px] text-[rgba(255,255,255,0.5)]">Loading the live schema…</p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {schema?.claimTypes.map((c) => (
              <div
                key={c.claimType}
                className="rounded-[18px] bg-[#16181a] border border-[rgba(255,255,255,0.06)] p-6"
              >
                <div className="flex items-center justify-between mb-3 gap-2">
                  <code className="font-mono text-[15px] text-[#ffffff]">{c.claimType}</code>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[#8d969e] font-semibold uppercase tracking-[0.5px]">
                      Tier {c.tier}
                    </span>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full border ${BADGE[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
                <dl className="space-y-2 text-[13px] leading-[1.5]">
                  <div>
                    <dt className="text-[#505a63] uppercase text-[10.5px] tracking-[0.6px] font-semibold">
                      Checks
                    </dt>
                    <dd className="text-[rgba(255,255,255,0.7)]">{c.checks}</dd>
                  </div>
                  <div>
                    <dt className="text-[#505a63] uppercase text-[10.5px] tracking-[0.6px] font-semibold">
                      Abstains when
                    </dt>
                    <dd className="text-[rgba(255,255,255,0.55)]">{c.abstainWhen}</dd>
                  </div>
                  {c.requires.length > 0 && (
                    <div>
                      <dt className="text-[#505a63] uppercase text-[10.5px] tracking-[0.6px] font-semibold">
                        You provide
                      </dt>
                      <dd className="text-[rgba(255,255,255,0.55)] font-mono text-[12px]">
                        {c.requires.join(" · ")}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>

          {schema && (
            <div className="grid md:grid-cols-2 gap-4 mt-8">
              <div className="rounded-[18px] bg-[#0f1012] border border-[rgba(255,255,255,0.06)] p-6">
                <h3 className="text-[14px] font-semibold mb-3 tracking-[-0.1px]">
                  Maturity / liquidity grades
                </h3>
                <p className="text-[12.5px] text-[rgba(255,255,255,0.5)] leading-[1.5]">
                  {schema.grades
                    .map((g) =>
                      g.minTvlUsd > 0 ? `${g.grade} (>=$${g.minTvlUsd / 1e6}M)` : g.grade,
                    )
                    .join(" · ")}
                  . A liquidity-risk signal, not a quality endorsement.
                </p>
              </div>
              <div className="rounded-[18px] bg-[#0f1012] border border-[rgba(255,255,255,0.06)] p-6">
                <h3 className="text-[14px] font-semibold mb-3 tracking-[-0.1px]">
                  ABSTAIN reasons
                </h3>
                <p className="text-[12.5px] text-[rgba(255,255,255,0.5)] leading-[1.5] font-mono">
                  {Object.keys(schema.abstainReasons).join(" · ")}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 mt-10">
            <Link
              href="/request"
              className="text-[14px] text-[#494fdf] hover:text-[#6b70e8] font-semibold"
            >
              Request an attestation →
            </Link>
            <Link
              href="/integrate"
              className="text-[14px] text-[#494fdf] hover:text-[#6b70e8] font-semibold"
            >
              Integrate (API + MCP) →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
