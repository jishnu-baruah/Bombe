import { defineConfig } from "vitest/config";

// Minimal root Vitest config. No tests exist yet (the harness lands in M6,
// see T-7xx). Per-package configs / a workspace will extend this as suites
// are added. `pnpm test` / `test:agent` / `test:demo` are stubbed until then.
export default defineConfig({});
