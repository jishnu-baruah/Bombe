import type { HTMLAttributes } from "react";

export type CardVariant = "feature-dark" | "feature-light" | "plan" | "plan-featured";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

// DESIGN.md: rounded-lg (20px) for feature cards + plan cards; padding 32px
const variantClasses: Record<CardVariant, string> = {
  // feature-card-dark: surface-elevated on canvas-dark
  "feature-dark": "bg-[#16181a] text-[#ffffff] rounded-[20px] p-8",
  // feature-card-light: white card with hairline border on white canvas
  "feature-light": "bg-[#ffffff] text-[#191c1f] border border-[#e2e2e7] rounded-[20px] p-8",
  // plan-card: surface-elevated (same as feature-dark for this system)
  plan: "bg-[#16181a] text-[#ffffff] rounded-[20px] p-8",
  // plan-card-featured: cobalt-violet inversion — the brand stamp
  "plan-featured": "bg-[#494fdf] text-[#ffffff] rounded-[20px] p-8",
};

export function Card({ variant = "feature-dark", className = "", children, ...props }: CardProps) {
  return (
    <div className={`${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
