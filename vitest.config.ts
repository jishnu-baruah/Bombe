import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Root Vitest config. Uses vitest's default include glob (**/*.{test,spec}.ts)
// which discovers tests in packages/*, apps/*, and scripts/* automatically
// (node_modules excluded).
// Per-package `pnpm --filter <pkg> test` also works via each package's own
// `vitest run` script.
//
// T-701/702: scripts/**/*.test.ts added for the normalize + test-agent unit tests.
// Aliases: @bombe/shared → packages/shared/src/index.ts (workspace symlink not
// resolved by vite; explicit alias required for scripts imports).
// Note: apps/web path aliases (@, @bombe-canonical) retained for web tests.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "apps/web"),
      "@bombe-canonical": resolve(__dirname, "packages/shared/src/canonical.ts"),
      "@bombe/shared": resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
});
