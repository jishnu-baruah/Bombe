"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./reveal";

// Plugboard, the independent proof. Instead of invented customer quotes:
// real protocol moments, straight from the demo fixtures. The Plugboard
// revert leads so BLOCKED BY PROTOCOL is the first thing rendered.
const moments = [
  {
    quote: "Plugboard attempts VALID on a judgment claim. The contract reverts.",
    author: "Plugboard",
    role: "External attestor",
    company: "Hermes runtime, Nous Research",
    metric: "BLOCKED BY PROTOCOL",
  },
  {
    quote: "mETH yield claimed at 34bps over 30 days. Oracle math settles it in milliseconds.",
    author: "Tier 1",
    role: "Deterministic claim",
    company: "YIELD_BPS",
    metric: "Settled by oracle math",
  },
  {
    quote: "The servicer report says 50,000. The bank statement sums to 45,000.",
    author: "Tier 2",
    role: "Document claim",
    company: "CASHFLOW_MATCH",
    metric: "REJECTED",
  },
];

export function PlugboardSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % moments.length);
        setIsAnimating(false);
      }, 250);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const activeMoment = moments[activeIndex] ?? moments[0];
  if (!activeMoment) return null;

  return (
    <section className="relative py-20 lg:py-28 bg-background">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Section Label */}
        <Reveal className="flex items-center gap-4 mb-12">
          <span className="eyebrow">Caught on-chain · Plugboard</span>
          <div className="flex-1 h-px bg-white/[0.08]" />
          <span className="font-mono text-xs text-muted-foreground tabular">
            {String(activeIndex + 1).padStart(2, "0")} / {String(moments.length).padStart(2, "0")}
          </span>
        </Reveal>

        {/* Main Quote */}
        <Reveal delay={90} className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-8">
            <blockquote
              className={`transition-all duration-250 ${
                isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}
            >
              <p className="font-display balance text-3xl md:text-4xl lg:text-[44px] leading-[1.15] text-foreground">
                &ldquo;{activeMoment.quote}&rdquo;
              </p>
            </blockquote>

            {/* Source */}
            <div
              className={`mt-12 flex items-center gap-5 transition-opacity duration-250 ${
                isAnimating ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="w-14 h-14 rounded-full bg-[#16181a] border border-white/[0.08] flex items-center justify-center">
                <span className="font-display text-xl text-foreground">
                  {activeMoment.author.charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-base font-medium text-foreground">{activeMoment.author}</p>
                <p className="text-sm text-muted-foreground">
                  {activeMoment.role}, {activeMoment.company}
                </p>
              </div>
            </div>
          </div>

          {/* Verdict Highlight */}
          <div className="lg:col-span-4 flex flex-col justify-center">
            <div
              className={`rounded-[20px] bg-[#16181a] border border-white/[0.08] p-8 transition-opacity duration-250 ${
                isAnimating ? "opacity-0" : "opacity-100"
              }`}
            >
              <span className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase block mb-4">
                Outcome
              </span>
              <p className="font-display text-2xl lg:text-3xl text-foreground">
                {activeMoment.metric}
              </p>
            </div>

            {/* Navigation Dots */}
            <div className="flex gap-2 mt-8">
              {moments.map((moment, idx) => (
                <button
                  key={moment.author}
                  type="button"
                  aria-label={`Show moment ${idx + 1}`}
                  onClick={() => {
                    setIsAnimating(true);
                    setTimeout(() => {
                      setActiveIndex(idx);
                      setIsAnimating(false);
                    }, 250);
                  }}
                  className={`h-2 rounded-full cursor-pointer transition-all duration-200 ${
                    idx === activeIndex ? "w-8 bg-foreground" : "w-2 bg-white/20 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
