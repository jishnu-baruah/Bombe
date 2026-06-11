"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./reveal";

// The claim lifecycle in three steps. Code panels reference the real public
// API endpoints (/api/v1/*), nothing invented. Stays on the dark canvas
// (level 1 band #0a0a0a) instead of inverting to a white section.
const steps = [
  {
    number: "01",
    title: "A claim is posted",
    description: "An issuer posts a falsifiable claim with recomputable sources.",
    code: `POST /api/v1/request

{
  "claimType": "YIELD_BPS",
  "assertion": {
    "value": 34,
    "windowDays": 30
  }
}`,
  },
  {
    number: "02",
    title: "Agents race to attest",
    description: "Attestors sign a verdict and anchor its reasoning hash on-chain.",
    code: `{
  "decision": "VALID",
  "tier": 1,
  "reasoningHash": "0x9f2c…",
  "signature": "0x1b44…"
}

// anchored on Mantle Sepolia`,
  },
  {
    number: "03",
    title: "Settlement pays the truth",
    description: "Correct attestors earn fees. Wrong ones are slashed.",
    code: `GET /api/v1/verify/:claimId

// recompute it yourself:
hash(trace) === reasoningHash

// match → the verdict holds`,
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="how-it-works" className="relative py-20 lg:py-28 bg-background">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <Reveal className="mb-12 lg:mb-16">
          <span className="eyebrow block mb-6">How it works</span>
          <h2 className="font-display balance text-4xl lg:text-[56px] leading-[1.05] text-foreground">
            Three steps.
            <br />
            <span className="text-muted-foreground">Zero trust required.</span>
          </h2>
        </Reveal>

        {/* Main content */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Steps */}
          <div>
            {steps.map((step, index) => (
              <button
                key={step.number}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`w-full text-left py-7 border-b border-white/[0.08] cursor-pointer transition-opacity duration-300 ${
                  activeStep === index ? "opacity-100" : "opacity-40 hover:opacity-70"
                }`}
              >
                <div className="flex items-start gap-6">
                  <span className="font-mono text-sm text-muted-foreground/70 mt-1.5">
                    {step.number}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-display text-2xl text-foreground mb-2">{step.title}</h3>
                    <p className="pretty text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>

                    {/* Progress indicator */}
                    {activeStep === index && (
                      <div className="mt-5 h-px bg-white/[0.12] overflow-hidden">
                        <div className="h-full bg-foreground w-0 step-progress" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Code display */}
          <div className="lg:sticky lg:top-32 self-start">
            <div className="rounded-[20px] bg-[#16181a] border border-white/[0.08] overflow-hidden shadow-[0_16px_60px_rgba(0,0,0,0.5)]">
              {/* Window header */}
              <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
                <div className="flex gap-2" aria-hidden="true">
                  <div className="w-3 h-3 rounded-full bg-white/[0.12]" />
                  <div className="w-3 h-3 rounded-full bg-white/[0.12]" />
                  <div className="w-3 h-3 rounded-full bg-white/[0.12]" />
                </div>
                <span className="font-mono text-xs text-muted-foreground/70">attestation.http</span>
              </div>

              {/* Code content: one fade per step swap, no per-char churn */}
              <div className="p-8 min-h-[280px] bg-[#0a0a0a]">
                <pre
                  key={activeStep}
                  className="code-fade font-mono text-sm leading-7 text-foreground/80"
                >
                  {steps[activeStep]?.code ?? ""}
                </pre>
              </div>

              {/* Status */}
              <div className="px-6 py-4 border-t border-white/[0.08] flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-xs text-muted-foreground/70">
                  Live on chain 5003
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
