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
                  href="/issuers"
                  className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-white/40 text-base text-foreground cursor-pointer transition-all duration-150 hover:border-white/70 hover:bg-foreground/[0.04] active:scale-[0.98]"
                >
                  Get an attestation
                </Link>
              </div>

              <p className="font-mono text-xs text-muted-foreground mt-10">
                Testnet only · no real economic value
              </p>
            </div>

            {/* Right: interactive 3D robot on its own stage (lg+ only).
                The Spline free-tier "Built with Spline" badge is painted onto the
                WebGL canvas itself (a runtime overlay pass at ~20px from the canvas
                bottom-right), so no CSS/DOM rule can remove it. We cover it with an
                opaque block pinned to the CANVAS corner (not the card corner): the
                stage is vertically centered and shorter than the card, so a
                card-anchored cover would miss the badge. The cover is a sibling of
                .scene-blend (outside its mask) so it stays fully opaque, and it
                matches the card background so there is no visible seam. */}
            <div className="relative hidden lg:block h-[520px]">
              <div className="scene-blend absolute inset-0">
                <InteractiveRobotSpline scene={ROBOT_SCENE_URL} className="absolute inset-0" />
              </div>
              {/* Same box that was verified to fully cover the canvas-baked Spline
                  badge, but rendered as an intentional Bombe brand chip (card style,
                  on-brand) so it reads as deliberate scene branding, not a patch. */}
              <div className="absolute bottom-2 right-2 z-20 flex h-[52px] w-[190px] items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#16181a] shadow-[0_8px_24px_rgba(0,0,0,0.45)] pointer-events-none">
                <img src="/brand/bombe-monogram-gradient.svg" alt="" className="h-5 w-5" />
                <img src="/brand/bombe-wordmark-gradient.svg" alt="" className="h-4 w-auto" />
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
