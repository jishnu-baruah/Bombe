import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "dark"
  | "soft"
  | "outline-light"
  | "outline-dark"
  | "pill-sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// DESIGN.md button specs: all pill-shaped (rounded-full), height 48px default
// Taste improvements: scale on hover, proper focus-visible, richer transitions
const variantClasses: Record<ButtonVariant, string> = {
  // button-primary: white CTA on dark canvas
  primary:
    "bg-[#ffffff] text-[#000000] hover:bg-[#e8e8e8] active:bg-[#c9c9cd] active:scale-[0.98] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 hover:shadow-[0_4px_16px_rgba(255,255,255,0.15)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-dark: dark CTA on light canvas
  dark: "bg-[#000000] text-[#ffffff] hover:bg-[#16181a] active:scale-[0.98] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-soft: tertiary on light canvas
  soft: "bg-[#f4f4f4] text-[#191c1f] hover:bg-[#e2e2e7] active:scale-[0.98] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-outline-light: secondary outlined on light
  "outline-light":
    "bg-[#ffffff] text-[#191c1f] border border-[#191c1f] hover:bg-[#f4f4f4] active:scale-[0.98] px-7 py-[13px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-outline-dark: secondary outlined on dark canvas
  "outline-dark":
    "bg-transparent text-[#ffffff] border border-[rgba(255,255,255,0.40)] hover:border-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,255,255,0.06)] active:scale-[0.98] active:bg-[rgba(255,255,255,0.10)] px-7 py-[13px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-pill-sm: sub-nav chips / filter pills
  "pill-sm":
    "bg-[#16181a] text-[rgba(255,255,255,0.72)] hover:bg-[#3a3d40] hover:text-[#ffffff] active:scale-[0.97] px-4 py-2 h-9 text-[14px] font-semibold leading-[1.43] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
