import { keccak256, toBytes } from "viem";

/**
 * canonicalJson — deterministic JSON serialization.
 *
 * Rules (PRD §6.3):
 *   - Object keys are sorted lexicographically at every nesting level.
 *   - Arrays are preserved in their original order (array order is meaningful).
 *   - Primitives (string, number, boolean, null) are JSON-stringified as-is.
 *   - `undefined` values on object properties are dropped (same as JSON.stringify).
 *   - No `any` — recursive narrowing via `unknown`.
 *
 * Stability guarantee: two structurally-equal objects with different key
 * insertion order produce byte-identical output.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    // JSON.stringify handles Infinity/NaN → null (standard JSON behavior).
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    // Preserve array order; recursively canonicalize each element.
    const items = value.map((item: unknown) => canonicalJson(item));
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    // Sort keys lexicographically. Omit undefined values (mirrors JSON.stringify).
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs: string[] = [];
    for (const key of sortedKeys) {
      const v = obj[key];
      if (v === undefined) {
        // Drop undefined properties (consistent with JSON.stringify behavior).
        continue;
      }
      pairs.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
    }
    return `{${pairs.join(",")}}`;
  }

  // For undefined at the top level: match JSON.stringify — return "null"
  // (JSON.stringify(undefined) returns undefined, but we treat as null here
  // to keep the return type string. Document: callers should not pass
  // undefined; undefined object values are silently dropped per JSON rules.)
  if (value === undefined) {
    return "null";
  }

  // Fallback for any other exotic values (e.g. BigInt, Symbol, functions):
  // JSON.stringify would throw/drop them; we stringify to be safe.
  return JSON.stringify(value) ?? "null";
}

/**
 * hashCanonical — keccak256 of the UTF-8 bytes of canonicalJson(value).
 *
 * Uses viem's keccak256 + toBytes. Returns a 0x-prefixed 32-byte hex string
 * (66 characters total). (PRD §6.3)
 */
export function hashCanonical(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(value)));
}

/**
 * Convenience alias: hash of an agent reasoning trace.
 * reasoningHash = keccak256(canonicalJson(trace))  (PRD §6.3)
 */
export function reasoningHash(trace: unknown): `0x${string}` {
  return hashCanonical(trace);
}

/**
 * Convenience alias: hash of a sorted sources array.
 * sourcesHash = keccak256(canonicalJson(sortedSources))  (PRD §6.3)
 */
export function sourcesHash(sources: unknown): `0x${string}` {
  return hashCanonical(sources);
}
