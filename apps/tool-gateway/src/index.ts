/**
 * index.ts — Public barrel for @bombe/tool-gateway. (T-405)
 *
 * Exports the factory and config loader so callers (tests, Plugboard, runner)
 * can create an app instance without binding to a port.
 */

export { createApp, RateLimiter } from "./app.js";
export type { AppOptions } from "./app.js";
export { loadConfig } from "./config.js";
export type { GatewayConfig } from "./config.js";
