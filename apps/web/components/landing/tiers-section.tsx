import { Reveal } from "./reveal";

// Claim taxonomy: three tier cards. Tier 3 is the plan-card-featured cobalt
// stamp, the single deliberate accent surface on the page (anti-slop rule 6).
const tiers = [
  {
    label: "Tier 1",
    kind: "DETERMINISTIC",
    truth: "Oracle math",
    types: ["YIELD_BPS", "DISTRIBUTION_PAID"],
    points: ["Truth from oracle math", "Slashing automatic at settlement"],
    highlight: false,
  },
  {
    label: "Tier 2",
    kind: "DOCUMENT",
    truth: "Cross-check",
    types: ["CASHFLOW_MATCH", "ENCUMBRANCE_ABSENT"],
    points: ["Truth from pinned documents", "Slashing via dispute vote"],
    highlight: false,
  },
  {
    label: "Tier 3",
    kind: "JUDGMENT",
    truth: "ABSTAIN",
    types: ["FAIR_VALUE"],
    points: ["SDK coerces ABSTAIN", "The contract rejects everything else"],
    highlight: true,
  },
];

const deltas = [
  {
    bombe: "Falsifiable claims only",
    others: "Attests to anything, even valuations",
  },
  {
    bombe: "Safety enforced by the contract",
    others: "App-layer rules, bypassable",
  },
  {
    bombe: "Wrong attestation → automatic slash",
    others: "No economic consequence",
  },
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function TiersSection() {
  return (
    <section className="relative py-20 lg:py-28 bg-background">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <Reveal className="mb-12 lg:mb-16">
          <span className="eyebrow block mb-6">Claim taxonomy</span>
          <h2 className="font-display balance text-4xl lg:text-[56px] leading-[1.05] text-foreground">
            Tier determines <span className="text-muted-foreground">truth.</span>
          </h2>
        </Reveal>

        {/* Tier Cards */}
        <div className="grid md:grid-cols-3 gap-3 items-stretch">
          {tiers.map((tier, i) => {
            const featured = tier.highlight;
            return (
              <Reveal key={tier.label} delay={i * 90}>
                <div
                  className={`relative h-full rounded-[20px] p-8 lg:p-10 transition-all duration-200 ${
                    featured
                      ? "bg-[#494fdf] text-white shadow-[0_16px_60px_rgba(73,79,223,0.35)]"
                      : "bg-[#16181a] border border-white/[0.08] hover:border-white/[0.16]"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-white text-[#3a40c4] text-[11px] font-mono font-medium uppercase tracking-[0.18em]">
                      Abstain enforced
                    </span>
                  )}

                  {/* Tier Header */}
                  <div className="mb-6">
                    <span
                      className={`font-mono text-xs ${featured ? "text-white/70" : "text-muted-foreground"}`}
                    >
                      {tier.label}
                    </span>
                    <h3 className="font-display text-2xl mt-2">{tier.kind}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {tier.types.map((t) => (
                        <code
                          key={t}
                          className={`font-mono text-xs px-2.5 py-1 rounded-[8px] border ${
                            featured
                              ? "border-white/30 text-white/90"
                              : "border-white/[0.12] text-muted-foreground"
                          }`}
                        >
                          {t}
                        </code>
                      ))}
                    </div>
                  </div>

                  {/* Truth source */}
                  <div
                    className={`mb-6 pb-6 border-b ${featured ? "border-white/20" : "border-white/[0.08]"}`}
                  >
                    <span className="font-display text-3xl lg:text-4xl">{tier.truth}</span>
                  </div>

                  {/* Points */}
                  <ul className="space-y-3">
                    {tier.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <CheckIcon
                          className={`w-4 h-4 mt-1 shrink-0 ${featured ? "text-white" : "text-foreground"}`}
                        />
                        <span
                          className={`text-sm leading-relaxed ${
                            featured ? "text-white/85" : "text-muted-foreground"
                          }`}
                        >
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* Delta strip */}
        <Reveal className="mt-16 lg:mt-20">
          <h3 className="font-display text-2xl lg:text-3xl text-foreground mb-6">
            How Bombe is different.
          </h3>
          <div className="rounded-[20px] bg-[#16181a] border border-white/[0.08] divide-y divide-white/[0.08] overflow-hidden">
            {deltas.map((row) => (
              <div key={row.bombe} className="grid sm:grid-cols-2">
                <div className="px-6 py-5 flex items-center gap-3">
                  <CheckIcon className="w-4 h-4 text-foreground shrink-0" />
                  <span className="text-sm text-foreground">{row.bombe}</span>
                </div>
                <div className="px-6 py-5 flex items-center gap-3 sm:border-l border-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                  <span className="text-sm text-muted-foreground/70 line-through decoration-white/20">
                    {row.others}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
