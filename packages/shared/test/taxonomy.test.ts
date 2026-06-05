import { describe, expect, it } from "vitest";
import { ClaimSchema, tierOf } from "../src/taxonomy.js";
import type { ClaimType } from "../src/taxonomy.js";

describe("tierOf", () => {
  it("maps YIELD_BPS to tier 1", () => {
    expect(tierOf("YIELD_BPS")).toBe(1);
  });

  it("maps DISTRIBUTION_PAID to tier 1", () => {
    expect(tierOf("DISTRIBUTION_PAID")).toBe(1);
  });

  it("maps CASHFLOW_MATCH to tier 2", () => {
    expect(tierOf("CASHFLOW_MATCH")).toBe(2);
  });

  it("maps ENCUMBRANCE_ABSENT to tier 2", () => {
    expect(tierOf("ENCUMBRANCE_ABSENT")).toBe(2);
  });

  it("maps FAIR_VALUE to tier 3", () => {
    expect(tierOf("FAIR_VALUE")).toBe(3);
  });

  it("covers every ClaimType (exhaustive mapping)", () => {
    const allClaimTypes: ClaimType[] = [
      "YIELD_BPS",
      "DISTRIBUTION_PAID",
      "CASHFLOW_MATCH",
      "ENCUMBRANCE_ABSENT",
      "FAIR_VALUE",
    ];
    for (const ct of allClaimTypes) {
      const tier = tierOf(ct);
      expect(tier === 1 || tier === 2 || tier === 3).toBe(true);
    }
  });
});

describe("ClaimSchema", () => {
  const validClaim = {
    id: "0xabc123",
    tier: 1 as const,
    asset: "mETH" as const,
    claimType: "YIELD_BPS" as const,
    payload: { expectedBps: 450 },
    submitter: "0xdeadbeef",
    postedAt: 1700000000,
  };

  it("parses a valid claim", () => {
    const result = ClaimSchema.safeParse(validClaim);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid asset", () => {
    const result = ClaimSchema.safeParse({ ...validClaim, asset: "INVALID_ASSET" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid claimType", () => {
    const result = ClaimSchema.safeParse({ ...validClaim, claimType: "UNKNOWN_TYPE" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field (submitter)", () => {
    const { submitter: _submitter, ...withoutSubmitter } = validClaim;
    const result = ClaimSchema.safeParse(withoutSubmitter);
    expect(result.success).toBe(false);
  });

  it("accepts all three valid assets", () => {
    const assets = ["mETH", "USDY", "PC-POOL-1"] as const;
    for (const asset of assets) {
      const result = ClaimSchema.safeParse({ ...validClaim, asset });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid claimTypes", () => {
    const types: ClaimType[] = [
      "YIELD_BPS",
      "DISTRIBUTION_PAID",
      "CASHFLOW_MATCH",
      "ENCUMBRANCE_ABSENT",
      "FAIR_VALUE",
    ];
    for (const claimType of types) {
      const result = ClaimSchema.safeParse({ ...validClaim, claimType });
      expect(result.success).toBe(true);
    }
  });
});
