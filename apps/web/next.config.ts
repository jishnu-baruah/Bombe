import { resolve } from "node:path";
import type { NextConfig } from "next";

type WebpackConfig = {
  resolve?: {
    alias?: Record<string, string>;
    extensionAlias?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// Using --webpack flag (not Turbopack) because Turbopack does not yet support
// extensionAlias resolution needed for workspace packages that use ESM Node16
// import style (.ts files imported with .js extension).
const nextConfig: NextConfig = {
  // Transpile @bombe/shared so Next.js/webpack can process its TypeScript source.
  transpilePackages: ["@bombe/shared"],

  webpack: (config: WebpackConfig): WebpackConfig => {
    // Teach webpack to resolve .js extension imports as .ts
    // (workspace packages use ESM Node16 convention: import './foo.js' → foo.ts)
    const existingAlias = config.resolve?.extensionAlias ?? {};
    const existingJs = existingAlias[".js"] ?? [];

    // @bombe-canonical — a direct alias to the canonical module source.
    // This lets lib/hash.ts import only canonical.ts (viem-only, browser-safe)
    // without pulling in the full @bombe/shared barrel which includes Node.js modules
    // (fixtures.ts → fs, event-bus.ts → events).
    const existingAliasPaths = config.resolve?.alias ?? {};

    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...existingAliasPaths,
          "@bombe-canonical": resolve(__dirname, "../../packages/shared/src/canonical.ts"),
        },
        extensionAlias: {
          ...existingAlias,
          ".js": [...new Set([...existingJs, ".ts", ".tsx", ".js"])],
        },
      },
    };
  },
};

export default nextConfig;
