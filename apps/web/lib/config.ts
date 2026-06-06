// Server-only config module — the SOLE place that reads process.env in apps/web.
// (PRD §15.4 guardrails: never read process.env.*KEY* outside the config module)
//
// Client-accessible values must use the NEXT_PUBLIC_ prefix and be read from
// ExplorerLink.tsx / other components via process.env["NEXT_PUBLIC_*"] directly
// (Next.js inlines NEXT_PUBLIC_ vars at build time — that is the documented pattern).

export const config = {
  /** "mock" | "live" — fixed at boot, never changed at runtime (PRD §2 non-goal). */
  mode: (process.env.APP_MODE ?? "mock") as "mock" | "live",
  /** Operator key for protected API routes. */
  operatorKey: process.env.OPERATOR_KEY ?? "",
} as const;
