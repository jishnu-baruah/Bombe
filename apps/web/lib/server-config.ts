/**
 * server-config.ts — server-only config module.
 *
 * Reads OPERATOR_KEY from the environment (default "dev-operator" in mock mode).
 * This is the ONLY place that touches process.env for operator credentials.
 * PRD §9, §15.4 — reading process.env.*KEY* outside the seams/config module is forbidden.
 *
 * NOTE: This file may only be imported from server-side code (API routes, server components).
 * Do not import it from client components.
 */

/** The operator key used to gate all /api/operator/* endpoints. */
export function getOperatorKey(): string {
  return process.env.OPERATOR_KEY ?? "dev-operator";
}

/** The current run mode: "mock" (default) or "live". */
export function getRunMode(): "mock" | "live" {
  const mode = process.env.MODE;
  if (mode === "live") return "live";
  return "mock";
}

/**
 * Validates the x-operator-key header against the configured OPERATOR_KEY.
 * Returns true if the header matches.
 */
export function validateOperatorKey(headers: Headers): boolean {
  const provided = headers.get("x-operator-key");
  if (provided === null) return false;
  return provided === getOperatorKey();
}
