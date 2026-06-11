import { CinematicHero } from "@/components/ui/cinematic-landing-hero";
import { Marquee } from "./marquee";

// Real infrastructure Bombe runs on (no fabricated customer logos).
const builtOn = ["Mantle", "Nous Hermes", "Foundry", "viem", "Next.js"];

export function HeroSection() {
  return (
    <>
      {/* GSAP-pinned cinematic hero (intro taglines → cobalt card → live-race
          mockup → CTA pullback). Copy stays honest: protocol constants only. */}
      <CinematicHero />

      {/* Built-on strip: seamless horizontal marquee, no band or border */}
      <div className="relative z-10 py-10 bg-background">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
          <div className="flex flex-col items-center gap-6">
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Built on open infrastructure
            </p>
            <Marquee duration={28} className="w-full max-w-[44rem]">
              {builtOn.map((name) => (
                <span
                  key={name}
                  className="font-display text-lg lg:text-xl text-foreground/30 whitespace-nowrap px-8 transition-colors duration-300 hover:text-foreground"
                >
                  {name}
                </span>
              ))}
            </Marquee>
          </div>
        </div>
      </div>
    </>
  );
}
