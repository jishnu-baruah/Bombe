/**
 * server.ts — Node.js entry-point for @bombe/tool-gateway. (PRD §6.8, T-405)
 *
 * Reads PORT from config (default 8787), binds via @hono/node-server.
 * Kept minimal — all logic lives in app.ts.
 *
 * Run: node --import tsx/esm src/server.ts
 */

import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ config });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[tool-gateway] listening on http://localhost:${info.port} (mode: ${config.mode})`);
});
