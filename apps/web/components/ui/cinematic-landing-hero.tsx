"use client";

import { cn } from "@/lib/utils";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type React from "react";
import { useEffect, useRef } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Intro-only cinematic hero: the blur-in taglines plus the film-grain/grid
// environment. The card, phone mockup, badges, and CTA pullback are gone;
// the same scroll vocabulary now lives in components/landing/reveal.tsx.
const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }

  .film-grain {
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50; opacity: 0.05; mix-blend-mode: overlay;
      background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
  }

  .bg-grid-theme {
      background-size: 60px 60px;
      background-image:
          linear-gradient(to right, color-mix(in srgb, var(--color-foreground) 5%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--color-foreground) 5%, transparent) 1px, transparent 1px);
      mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
      -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  }

  .text-3d-matte {
      color: var(--color-foreground);
      text-shadow:
          0 10px 30px color-mix(in srgb, var(--color-foreground) 20%, transparent),
          0 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent);
  }

  .text-silver-matte {
      background: linear-gradient(180deg, var(--color-foreground) 0%, color-mix(in srgb, var(--color-foreground) 40%, transparent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter:
          drop-shadow(0px 10px 20px color-mix(in srgb, var(--color-foreground) 15%, transparent))
          drop-shadow(0px 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent));
  }
`;

export interface CinematicHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  tagline1?: string;
  tagline2?: string;
  subline?: string;
}

export function CinematicHero({
  tagline1 = "Every claim verified,",
  tagline2 = "every verdict signed.",
  subline = "AI attestors that can't lie.",
  className,
  ...props
}: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".text-track", {
        autoAlpha: 0,
        y: 60,
        scale: 0.85,
        filter: "blur(20px)",
        rotationX: -20,
      });
      gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".text-sub", { autoAlpha: 0, y: 24 });

      // Intro: taglines materialize out of blur, second line wipes in.
      const introTl = gsap.timeline({ delay: 0.3 });
      introTl
        .to(".text-track", {
          duration: 1.8,
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          rotationX: 0,
          ease: "expo.out",
        })
        .to(
          ".text-days",
          { duration: 1.4, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" },
          "-=1.0",
        )
        .to(".text-sub", { duration: 1.0, autoAlpha: 1, y: 0, ease: "power3.out" }, "-=0.7");

      // Scroll-away: as the hero leaves the viewport the text zooms and
      // dissolves, handing off into the page (no pinning).
      gsap
        .timeline({
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 1,
          },
        })
        .to([".hero-text-wrapper", ".bg-grid-theme"], {
          scale: 1.15,
          filter: "blur(20px)",
          opacity: 0.15,
          ease: "power2.inOut",
        });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full min-h-[100svh] overflow-hidden flex items-center justify-center bg-background text-foreground antialiased",
        className,
      )}
      style={{ perspective: "1500px" }}
      {...props}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static style sheet authored in this file */}
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />
      <div
        className="bg-grid-theme absolute inset-0 z-0 pointer-events-none opacity-50"
        aria-hidden="true"
      />

      <div className="hero-text-wrapper absolute z-10 flex flex-col items-center justify-center text-center w-full px-4 will-change-transform transform-style-3d">
        <h1 className="text-track gsap-reveal text-3d-matte font-display text-5xl md:text-7xl lg:text-[6rem] leading-[1.12] tracking-tight mb-2 pb-[0.06em]">
          {tagline1}
        </h1>
        <h1 className="text-days gsap-reveal text-silver-matte font-display text-5xl md:text-7xl lg:text-[6rem] leading-[1.12] tracking-tighter pb-[0.08em]">
          {tagline2}
        </h1>
        <p className="text-sub gsap-reveal text-muted-foreground text-lg md:text-xl mt-8">
          {subline}
        </p>
      </div>
    </div>
  );
}
