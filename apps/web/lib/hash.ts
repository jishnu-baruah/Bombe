/**
 * lib/hash.ts — Browser-safe hash functions (isomorphic, viem-based).
 *
 * Imports from @bombe/shared main export but intentionally uses
 * direct path resolution configured in next.config.ts to avoid pulling
 * in Node.js-only modules (fixtures.ts uses fs, event-bus.ts uses events).
 *
 * canonical.ts itself only depends on viem (fully isomorphic) — no Node builtins.
 *
 * PRD §14.4 — the browser recomputes keccak256(canonicalJson(trace)) to verify hashes.
 *
 * The webpack config in next.config.ts resolves this import to
 * packages/shared/src/canonical.ts via the @bombe-canonical alias.
 */

export { canonicalJson, hashCanonical, reasoningHash, sourcesHash } from "@bombe-canonical";
