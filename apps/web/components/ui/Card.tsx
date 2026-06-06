import type { HTMLAttributes } from "react";

export type CardVariant = "feature-dark" | "feature-light" | "plan" | "plan-featured";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

// DESIGN.md: rounded-lg (20px) for feature cards + plan cards; padding 32px
// Taste improvements: tinted shadow for depth, hover lift for interactive feel
const variantClasses: Record<CardVariant, string> = {
  // feature-card-dark: surface-elevated on canvas-dark
  "feature-dark":
    "bg-[#16181a] text-[#ffffff] rounded-[20px] p-8 border border-[rgba(255,255,255,0.05)] shadow-[0_1px_3px_rgba(0,0,0,0.6),0_8px_24px_rgba(0,0,0,0.4)] hover:border-[rgba(255,255,255,0.10)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.6),0_16px_40px_rgba(0,0,0,0.5)] transition-all duration-200",
  // feature-card-light: white card with hairline border on white canvas
  "feature-light":
    "bg-[#ffffff] text-[#191c1f] border border-[#e2e2e7] rounded-[20px] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] hover:border-[#c9c9cd] transition-all duration-200",
  // plan-card: surface-elevated
  plan: "bg-[#16181a] text-[#ffffff] rounded-[20px] p-8 border border-[rgba(255,255,255,0.05)] shadow-[0_1px_3px_rgba(0,0,0,0.6),0_8px_24px_rgba(0,0,0,0.4)] hover:border-[rgba(255,255,255,0.10)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.6),0_16px_40px_rgba(0,0,0,0.5)] transition-all duration-200",
  // plan-card-featured: cobalt-violet inversion, the brand stamp
  "plan-featured":
    "bg-[#494fdf] text-[#ffffff] rounded-[20px] p-8 shadow-[0_4px_24px_rgba(73,79,223,0.40)] hover:shadow-[0_8px_32px_rgba(73,79,223,0.55)] hover:brightness-110 transition-all duration-200",
};

export function Card({ variant = "feature-dark", className = "", children, ...props }: CardProps) {
  return (
    <div className={`${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
