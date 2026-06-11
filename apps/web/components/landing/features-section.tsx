import { Reveal } from "./reveal";

// Why Bombe, as an asymmetric bento (anti-slop rule 1: no symmetric
// equal-card grids). Static SVG glyphs, no looping micro-animations.

const iconPaths: Record<string, React.ReactNode> = {
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  slash: (
    <>
      <path d="M12 3v18" />
      <path d="M17 6a4 4 0 0 0-4-2h-2a4 4 0 0 0 0 8h2a4 4 0 0 1 0 8h-2a4 4 0 0 1-4-2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.5 11.5 2 2 3.5-4" />
    </>
  ),
  plug: (
    <>
      <path d="M9 7V3" />
      <path d="M15 7V3" />
      <path d="M7 7h10v4a5 5 0 0 1-10 0V7Z" />
      <path d="M12 16v5" />
    </>
  ),
};

const features = [
  {
    number: "01",
    title: "Falsifiable-only",
    description: "Math and document cross-checks only. Judgment gets one answer: ABSTAIN.",
    icon: "check",
    wide: true,
  },
  {
    number: "02",
    title: "Economic finality",
    description: "Wrong attestations are slashed: 50% burned, 50% to the correct.",
    icon: "slash",
    wide: false,
  },
  {
    number: "03",
    title: "Contract-layer safety",
    description: "The chain itself rejects forbidden attestations.",
    icon: "shield",
    wide: false,
  },
  {
    number: "04",
    title: "Open to external agents",
    description: "Plugboard, an attestor we didn't write, joined over public APIs alone.",
    icon: "plug",
    wide: true,
  },
];

function FeatureIcon({ name }: { name: string }) {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-20 lg:py-28 bg-background">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <Reveal className="mb-12 lg:mb-16">
          <span className="eyebrow block mb-6">Why Bombe</span>
          <h2 className="font-display balance text-4xl lg:text-[56px] leading-[1.05] text-foreground">
            Everything provable.
            <br />
            <span className="text-muted-foreground">Nothing guessed.</span>
          </h2>
        </Reveal>

        {/* Asymmetric bento: 7/5 then 5/7 */}
        <div className="grid lg:grid-cols-12 gap-3">
          {features.map((feature, i) => (
            <Reveal
              key={feature.number}
              delay={i * 90}
              className={feature.wide ? "lg:col-span-7" : "lg:col-span-5"}
            >
              <div className="h-full rounded-[20px] bg-[#16181a] border border-white/[0.08] p-8 lg:p-10 transition-all duration-200 hover:border-white/[0.16] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between mb-8">
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-[12px] bg-[#0a0a0a] border border-white/[0.08] text-foreground">
                    <FeatureIcon name={feature.icon} />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {feature.number}
                  </span>
                </div>
                <h3 className="font-display text-2xl text-foreground mb-3">{feature.title}</h3>
                <p className="pretty text-base text-muted-foreground leading-relaxed max-w-[34rem]">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
