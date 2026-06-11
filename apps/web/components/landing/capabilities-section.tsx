import { Marquee } from "./marquee";
import { Reveal } from "./reveal";

// Capability matrix as two horizontal marquee rows (edge-faded, pause on
// hover, reduced-motion aware). Cards come from the SDK registry (passed by
// the server page) so the landing cannot over-claim.
export interface CapabilityCard {
  claimType: string;
  tier: number;
  status: "live" | "planned";
}

function CapChip({ cap }: { cap: CapabilityCard }) {
  const live = cap.status === "live";
  return (
    <div
      className={`shrink-0 rounded-[20px] border px-6 py-5 transition-all duration-200 ${
        live
          ? "bg-[#16181a] border-white/[0.08] hover:border-white/[0.16]"
          : "bg-transparent border-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`font-mono text-base whitespace-nowrap ${
            live ? "text-foreground" : "text-muted-foreground/70"
          }`}
        >
          {cap.claimType}
        </span>
        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap ${
            live ? "bg-green-500/10 text-green-400" : "bg-white/[0.04] text-muted-foreground/70"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-green-500" : "bg-white/30"}`} />
          {live ? "live" : "planned"}
        </span>
      </div>
      <div className="text-sm text-muted-foreground mt-2">Tier {cap.tier}</div>
    </div>
  );
}

export function CapabilitiesSection({ caps }: { caps: CapabilityCard[] }) {
  const liveCount = caps.filter((c) => c.status === "live").length;

  return (
    <section id="capabilities" className="relative py-20 lg:py-28 bg-background overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <Reveal className="max-w-[44rem] mb-12 lg:mb-16">
          <span className="eyebrow block mb-6">What we can attest</span>
          <h2 className="font-display balance text-4xl lg:text-[56px] leading-[1.05] text-foreground mb-5">
            {liveCount} claim types live.
            <br />
            <span className="text-muted-foreground">The rest, planned.</span>
          </h2>
          <p className="text-base text-muted-foreground">
            Full matrix at{" "}
            <a
              href="/api/v1/schema"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-foreground underline underline-offset-4 cursor-pointer transition-colors duration-150 hover:text-muted-foreground"
            >
              /api/v1/schema
            </a>
            .
          </p>
        </Reveal>
      </div>

      {/* Horizontal scrolling rows, full bleed */}
      <Reveal>
        <div className="space-y-4">
          <Marquee duration={45}>
            {caps.map((cap) => (
              <CapChip key={cap.claimType} cap={cap} />
            ))}
          </Marquee>
          <Marquee duration={38} reverse>
            {[...caps].reverse().map((cap) => (
              <CapChip key={`${cap.claimType}-r`} cap={cap} />
            ))}
          </Marquee>
        </div>
      </Reveal>
    </section>
  );
}
