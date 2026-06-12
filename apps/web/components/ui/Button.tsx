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
  // button-primary: white pill CTA on dark canvas (Mouli)
  primary:
    "bg-white text-black hover:bg-white/90 active:scale-[0.98] px-7 h-12 text-base font-medium leading-[1.5] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-dark: dark CTA on light canvas
  dark: "bg-[#000000] text-[#ffffff] hover:bg-[#16181a] active:scale-[0.98] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-soft: subtle tertiary on dark canvas (Mouli)
  soft: "bg-foreground/[0.04] text-foreground border border-white/[0.08] hover:bg-foreground/[0.08] hover:border-white/[0.16] active:scale-[0.98] px-7 h-12 text-base font-medium leading-[1.5] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-outline-light: secondary outlined on light
  "outline-light":
    "bg-[#ffffff] text-[#191c1f] border border-[#191c1f] hover:bg-[#f4f4f4] active:scale-[0.98] px-7 py-[13px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-outline-dark: outline pill on dark canvas (Mouli)
  "outline-dark":
    "bg-transparent text-foreground border border-white/40 hover:border-white/70 hover:bg-foreground/[0.04] active:scale-[0.98] px-7 h-12 text-base font-medium leading-[1.5] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
  // button-pill-sm: sub-nav chips / filter pills
  "pill-sm":
    "bg-[#16181a] text-muted-foreground hover:bg-[#3a3d40] hover:text-foreground active:scale-[0.97] px-4 py-2 h-9 text-[14px] font-semibold leading-[1.43] rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]",
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
