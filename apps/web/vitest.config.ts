import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "@bombe-canonical": resolve(__dirname, "../../packages/shared/src/canonical.ts"),
      "@bombe-events": resolve(__dirname, "../../packages/shared/src/events.ts"),
    },
  },
});
