import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical } from "../src/canonical.js";

describe("canonicalJson — key-order independence", () => {
  it("produces the same string regardless of key insertion order (flat object)", () => {
    const a = canonicalJson({ a: 1, b: 2 });
    const b = canonicalJson({ b: 2, a: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2}');
  });

  it("three-key object is always sorted", () => {
    const x = canonicalJson({ z: "last", a: "first", m: "mid" });
    const y = canonicalJson({ m: "mid", z: "last", a: "first" });
    expect(x).toBe(y);
    expect(x).toBe('{"a":"first","m":"mid","z":"last"}');
  });
});

describe("canonicalJson — recursive nested sorting", () => {
  it("sorts keys at every nesting level", () => {
    const deep = canonicalJson({
      outer2: { inner2: 2, inner1: 1 },
      outer1: { z: "z", a: "a" },
    });
    expect(deep).toBe('{"outer1":{"a":"a","z":"z"},"outer2":{"inner1":1,"inner2":2}}');
  });

  it("handles three levels of nesting", () => {
    const result = canonicalJson({
      c: { b: { a: true } },
      a: { z: { y: false } },
    });
    expect(result).toBe('{"a":{"z":{"y":false}},"c":{"b":{"a":true}}}');
  });
});

describe("canonicalJson — arrays NOT reordered", () => {
  it("preserves array order for numbers", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("preserves array order for strings", () => {
    expect(canonicalJson(["z", "a", "m"])).toBe('["z","a","m"]');
  });

  it("sorts object keys inside array elements, but not the array itself", () => {
    const result = canonicalJson([
      { z: 3, a: 1 },
      { y: 2, b: 0 },
    ]);
    expect(result).toBe('[{"a":1,"z":3},{"b":0,"y":2}]');
  });
});

describe("canonicalJson — primitive handling", () => {
  it("handles null", () => {
    expect(canonicalJson(null)).toBe("null");
  });

  it("handles booleans", () => {
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
  });

  it("handles numbers", () => {
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(3.14)).toBe("3.14");
    expect(canonicalJson(0)).toBe("0");
  });

  it("handles strings", () => {
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson("")).toBe('""');
  });

  it("drops undefined object values (mirrors JSON.stringify)", () => {
    // JSON.stringify({a: undefined, b: 1}) === '{"b":1}'
    const result = canonicalJson({ a: undefined, b: 1 });
    expect(result).toBe('{"b":1}');
  });

  it("handles empty object", () => {
    expect(canonicalJson({})).toBe("{}");
  });

  it("handles empty array", () => {
    expect(canonicalJson([])).toBe("[]");
  });
});

describe("canonicalJson — nested mix (objects in arrays in objects)", () => {
  it("handles objects containing arrays containing objects", () => {
    const obj = {
      z: [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ],
      a: "top",
    };
    const result = canonicalJson(obj);
    expect(result).toBe('{"a":"top","z":[{"a":1,"b":2},{"c":3,"d":4}]}');
  });

  it("two structurally-equal nested objects with different key orders produce identical output", () => {
    const v1 = {
      claim: { tier: 1, id: "abc" },
      sources: [{ url: "http://x", ts: 100 }],
    };
    const v2 = {
      sources: [{ ts: 100, url: "http://x" }],
      claim: { id: "abc", tier: 1 },
    };
    expect(canonicalJson(v1)).toBe(canonicalJson(v2));
  });
});

describe("hashCanonical — stability and format", () => {
  it("returns a 0x-prefixed 32-byte hex (66 chars)", () => {
    const h = hashCanonical({ foo: "bar" });
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h.length).toBe(66);
  });

  it("two structurally-equal objects with different key orders produce the same hash", () => {
    const h1 = hashCanonical({ a: 1, b: 2 });
    const h2 = hashCanonical({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it("hash is deterministic across calls for the same value", () => {
    const obj = { nested: { z: 99, a: 0 }, arr: [1, 2, 3] };
    expect(hashCanonical(obj)).toBe(hashCanonical(obj));
  });

  it("hash changes when content changes", () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 2 }));
  });

  it("empty object hash is deterministic (calling twice yields the same value)", () => {
    const h1 = hashCanonical({});
    const h2 = hashCanonical({});
    expect(h1).toBe(h2);
    // Also verify the canonical form is "{}" and hash is a valid hex
    expect(canonicalJson({})).toBe("{}");
    expect(h1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("deeply-nested cross-order objects hash identically", () => {
    const trace1 = {
      steps: [{ action: "fetch", result: { status: 200, data: "ok" } }],
      meta: { agent: "Reflector", version: "1.0" },
    };
    const trace2 = {
      meta: { version: "1.0", agent: "Reflector" },
      steps: [{ result: { data: "ok", status: 200 }, action: "fetch" }],
    };
    expect(hashCanonical(trace1)).toBe(hashCanonical(trace2));
  });
});
