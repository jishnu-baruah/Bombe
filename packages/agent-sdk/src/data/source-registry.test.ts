import { describe, expect, it } from "vitest";
import { categoryOf, discoverAssets } from "./discover.js";
import {
  FEATURED,
  FEATURED_SYMBOLS,
  POOL_IDS,
  SCHEME_FETCHERS,
  resolveSpec,
} from "./source-registry.js";
import type { SourceDescriptor } from "./types.js";

const deps = {
  defiLlama: { fetchChart: async () => [] },
  fetchJson: async () => ({}),
};

describe("source registry", () => {
  it("features a large vetted set, Mantle-native first, never says 'independent'", () => {
    expect(FEATURED_SYMBOLS[0]).toBe("mETH");
    expect(FEATURED_SYMBOLS).toContain("USDY");
    expect(FEATURED.length).toBeGreaterThanOrEqual(20);
    // Mantle-native assets sort to the front: no Mantle asset appears after a non-Mantle one.
    const firstNonMantle = FEATURED.findIndex((s) => s.chain !== "Mantle");
    if (firstNonMantle >= 0) {
      expect(FEATURED.slice(firstNonMantle).some((s) => s.chain === "Mantle")).toBe(false);
    }
    for (const s of FEATURED) {
      expect(s.independenceLabel).not.toMatch(/\bindependent\b/i);
      expect(s.verified).toBe(true);
      expect(s.category).toBeTypeOf("string");
    }
  });

  it("mETH has two computation paths (two sources, two schemes)", () => {
    const meth = resolveSpec("mETH");
    expect(meth.sources).toHaveLength(2);
    expect(meth.sources.map((s) => s.scheme)).toEqual(["defillama", "mantle-meth-api"]);
  });

  it("resolveSpec passes an open AssetSpec through unchanged", () => {
    const spec = {
      symbol: "RANDOM",
      verified: false,
      sources: [
        { scheme: "defillama", ref: "x", kind: "reportedApy", legName: "l" } as SourceDescriptor,
      ],
      independenceLabel: "issuer-specified",
    };
    expect(resolveSpec(spec)).toBe(spec);
  });

  it("resolveSpec rejects an unknown bare symbol", () => {
    expect(() => resolveSpec("NOT-FEATURED")).toThrow(/unknown featured asset/i);
  });

  it("POOL_IDS exposes the featured DefiLlama pool ids", () => {
    expect(POOL_IDS.mETH).toBe("b9f2f00a-ba96-4589-a171-dde979a23d87");
    expect(POOL_IDS.USDY).toBe("b5d7a190-38d2-4fdd-8c14-1fd00c11bce1");
  });

  it("mantle-meth-api scheme parses fractional APY into bps", async () => {
    const d: SourceDescriptor = {
      scheme: "mantle-meth-api",
      ref: "https://example/api",
      kind: "reportedApy",
      legName: "mantle-meth-api",
    };
    const leg = await SCHEME_FETCHERS["mantle-meth-api"](d, 30, {
      ...deps,
      fetchJson: async () => ({ data: [{ METHtoETH: "1.09", MonthAPY: "0.0199" }] }),
    });
    expect(leg.valueBps).toBeCloseTo(199, 5); // 0.0199 -> 199 bps
    expect(leg.windowDays).toBe(30);
  });
});

describe("discoverAssets", () => {
  const pools = {
    data: [
      {
        symbol: "USDY",
        project: "ondo-yield-assets",
        chain: "Mantle",
        apy: 3.55,
        tvlUsd: 29_000_000,
        pool: "b5d7a190-38d2-4fdd-8c14-1fd00c11bce1",
      },
      {
        symbol: "BUIDL",
        project: "blackrock-buidl",
        chain: "Ethereum",
        apy: 3.5,
        tvlUsd: 800_000_000,
        pool: "buidl-pool",
      },
      {
        symbol: "SYRUPUSDT",
        project: "syrup",
        chain: "Mantle",
        apy: 8,
        tvlUsd: 90_000_000,
        pool: "syrup-pool",
      },
      {
        symbol: "JUNK",
        project: "some-degen-farm",
        chain: "Mantle",
        apy: 900,
        tvlUsd: 1_000,
        pool: "junk-pool",
      },
    ],
  };
  const fetchJson = async () => pools;

  it("categorizes RWA projects and unknowns as other", () => {
    expect(categoryOf("ondo-yield-assets")).toBe("tokenized-treasury");
    expect(categoryOf("syrup")).toBe("private-credit");
    expect(categoryOf("fluxion-network")).toBe("tokenized-equity");
    expect(categoryOf("some-degen-farm")).toBe("other");
  });

  it("filters by category", async () => {
    const credit = await discoverAssets({ category: "private-credit" }, { fetchJson });
    expect(credit.map((a) => a.symbol)).toEqual(["SYRUPUSDT"]);
  });

  it("maps pools to ready-to-attest descriptors", async () => {
    const found = await discoverAssets({}, { fetchJson });
    const buidl = found.find((a) => a.symbol === "BUIDL");
    expect(buidl?.descriptor.scheme).toBe("defillama");
    expect(buidl?.descriptor.ref).toBe("buidl-pool");
  });

  it("rwaOnly filters out non-RWA projects", async () => {
    const found = await discoverAssets({ rwaOnly: true }, { fetchJson });
    expect(found.map((a) => a.symbol)).not.toContain("JUNK");
    expect(found.map((a) => a.symbol)).toContain("USDY");
  });

  it("filters by chain and flags featured pools as verified", async () => {
    const found = await discoverAssets({ chain: "Mantle" }, { fetchJson });
    expect(found.every((a) => a.chain === "Mantle")).toBe(true);
    expect(found.find((a) => a.symbol === "USDY")?.verified).toBe(true);
  });
});
