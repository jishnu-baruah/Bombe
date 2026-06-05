import { defineConfig } from "vitest/config";

// Root Vitest config. Uses vitest's default include glob (**/*.{test,spec}.ts)
// which discovers tests in packages/* automatically (node_modules excluded).
// Per-package `pnpm --filter <pkg> test` also works via each package's own
// `vitest run` script. The formal harness (T-7xx) will add reporters/workspace
// config when it lands in M6.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
