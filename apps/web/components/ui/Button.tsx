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
const variantClasses: Record<ButtonVariant, string> = {
  // button-primary: white CTA on dark canvas
  primary:
    "bg-[#ffffff] text-[#000000] hover:bg-[#c9c9cd] active:bg-[#c9c9cd] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-colors",
  // button-dark: dark CTA on light canvas
  dark: "bg-[#000000] text-[#ffffff] hover:bg-[#16181a] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-colors",
  // button-soft: tertiary on light canvas
  soft: "bg-[#f4f4f4] text-[#191c1f] hover:bg-[#e2e2e7] px-7 py-[14px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-colors",
  // button-outline-light: secondary outlined on light
  "outline-light":
    "bg-[#ffffff] text-[#191c1f] border border-[#191c1f] hover:bg-[#f4f4f4] px-7 py-[13px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-colors",
  // button-outline-dark: secondary outlined on dark canvas
  "outline-dark":
    "bg-[#000000] text-[#ffffff] border border-[#ffffff] hover:bg-[#16181a] px-7 py-[13px] h-12 text-[16px] font-semibold leading-[1.5] tracking-[0.24px] rounded-full transition-colors",
  // button-pill-sm: sub-nav chips / filter pills
  "pill-sm":
    "bg-[#f4f4f4] text-[#191c1f] hover:bg-[#e2e2e7] px-4 py-2 h-9 text-[14px] font-semibold leading-[1.43] rounded-full transition-colors",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
