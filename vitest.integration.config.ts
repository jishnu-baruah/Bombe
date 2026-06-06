import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * vitest.integration.config.ts — Config for the anvil integration test suite.
 *
 * T-406: The demo-integration test requires a live anvil process and is
 * intentionally excluded from the fast `pnpm run ci` suite (vitest.config.ts).
 *
 * Run with: pnpm test:integration
 * This requires anvil to be installed (foundry 1.5.1+).
 */
export default defineConfig({
  test: {
    include: ["scripts/test/demo-integration.test.ts"],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@bombe/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@bombe/agent-sdk": resolve(__dirname, "packages/agent-sdk/src/index.ts"),
      "@bombe/agent-reference": resolve(__dirname, "packages/agent-reference/src/index.ts"),
      "@bombe/db": resolve(__dirname, "packages/db/src/index.ts"),
      "@bombe/indexer": resolve(__dirname, "apps/indexer/src/index.ts"),
    },
  },
});
