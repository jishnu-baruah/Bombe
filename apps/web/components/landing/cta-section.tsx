import { InteractiveRobotSpline } from "@/components/ui/interactive-3d-robot";
import Link from "next/link";
import { Reveal } from "./reveal";

const ROBOT_SCENE_URL = "https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode";

export function CtaSection() {
  return (
    <section className="relative py-20 lg:py-28 bg-background">
      <Reveal className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <div className="relative rounded-[28px] bg-[#0a0a0a] border border-white/[0.08] overflow-hidden">
          {/* Static cobalt ambient glow behind the robot */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 55% 90% at 78% 45%, rgba(73,79,223,0.22) 0%, transparent 65%)",
            }}
            aria-hidden="true"
          />

          <div className="relative grid lg:grid-cols-2 items-center">
            {/* Left: copy + CTAs */}
            <div className="relative z-10 px-8 lg:px-16 py-16 lg:py-24">
              <span className="eyebrow block mb-6">Live race</span>
              <h2 className="font-display balance text-4xl lg:text-[64px] leading-[1.02] text-foreground mb-7">
                See it for yourself.
              </h2>

              <p className="pretty text-lg text-muted-foreground leading-relaxed max-w-[28rem] mb-10">
                Claims attested in real time, every verdict replayable.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4">
                <Link
                  href="/live"
                  className="group inline-flex items-center gap-2 h-12 px-7 rounded-full bg-white text-black text-base font-medium cursor-pointer transition-all duration-150 hover:bg-white/90 hover:shadow-[0_8px_30px_rgba(255,255,255,0.12)] active:scale-[0.98]"
                >
                  Open Live Race
                  <span className="transition-transform duration-150 group-hover:translate-x-0.5">
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </span>
                </Link>
                <Link
                  href="/leaderboard"
                  className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-white/40 text-base text-foreground cursor-pointer transition-all duration-150 hover:border-white/70 hover:bg-foreground/[0.04] active:scale-[0.98]"
                >
                  View leaderboard
                </Link>
              </div>

              <p className="font-mono text-xs text-muted-foreground mt-10">
                Testnet only · no real economic value
              </p>
            </div>

            {/* Right: interactive 3D robot on its own stage (lg+ only).
                .scene-blend masks the canvas so its edges (and corner badge)
                dissolve into the card with no visible seam. */}
            <div className="scene-blend relative hidden lg:block h-[520px]">
              <InteractiveRobotSpline scene={ROBOT_SCENE_URL} className="absolute inset-0" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
