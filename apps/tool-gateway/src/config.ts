/**
 * config.ts — The ONLY process.env reader for @bombe/tool-gateway. (PRD §7)
 *
 * Reads:
 *   TOOL_GATEWAY_KEY  — bearer token for auth; default "dev-gateway" in mock
 *   GATEWAY_MODE      — "mock" | "live"; controls CORS; default "mock"
 *   PORT              — HTTP listen port; default 8787
 *
 * All other modules import from here — never from process.env directly.
 */

export interface GatewayConfig {
  /** Bearer token that callers must supply in Authorization header. */
  gatewayKey: string;
  /** "mock" enables CORS *, "live" disables CORS. */
  mode: "mock" | "live";
  /** HTTP listen port for the node server entry-point. */
  port: number;
}

/**
 * loadConfig — reads environment variables and returns a validated config.
 *
 * Called once at startup (and once per test suite so injected env overrides work).
 * In mock mode (MODE=mock or GATEWAY_MODE not set) no live vars are required.
 */
export function loadConfig(): GatewayConfig {
  const gatewayKey = process.env.TOOL_GATEWAY_KEY ?? "dev-gateway";
  const rawMode = process.env.GATEWAY_MODE ?? "mock";
  const mode: "mock" | "live" = rawMode === "live" ? "live" : "mock";
  const rawPort = process.env.PORT;
  const port = rawPort !== undefined ? Number(rawPort) : 8787;

  return { gatewayKey, mode, port };
}
