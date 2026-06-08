import { hashCanonical } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import { CAPABILITY_REGISTRY, CLASS_TOLERANCES, schemaDocument } from "./schema.js";

describe("attestation schema (D25)", () => {
  it("publishes a stable, tamper-evident tolerances hash", () => {
    const doc = schemaDocument();
    expect(doc.tolerancesHash).toBe(hashCanonical(CLASS_TOLERANCES));
    expect(doc.tolerancesHash).toMatch(/^0x[0-9a-f]{64}$/);
    // The hash changes if a band is widened (cannot silently force a VALID).
    expect(hashCanonical({ ...CLASS_TOLERANCES, yield: { reconcileBps: 9999 } })).not.toBe(
      doc.tolerancesHash,
    );
  });

  it("marks the deterministic on-chain/doc checks live, the blocked ones planned", () => {
    const live = CAPABILITY_REGISTRY.filter((c) => c.status === "live").map((c) => c.claimType);
    expect(live).toContain("YIELD_BPS");
    expect(live).toContain("DOCUMENTED_NAV");
    expect(live).toContain("NAV_PER_SHARE"); // current-NAV: cleared (no dependency on D25.1/2/3)
    // The blocked check kinds stay planned until D25.1/D25.2/D25.3 are resolved.
    for (const ct of ["PRICE", "BACKING_RATIO", "RULE_ADHERENCE"]) {
      expect(CAPABILITY_REGISTRY.find((c) => c.claimType === ct)?.status).toBe("planned");
    }
  });

  it("PRICE requires two sources and RULE_ADHERENCE is Tier-2 (D25.1/D25.4)", () => {
    const price = CAPABILITY_REGISTRY.find((c) => c.claimType === "PRICE");
    expect(price?.requires.join(" ")).toMatch(/two sources/i);
    expect(price?.abstainWhen).toMatch(/fewer than two/i);
    expect(CAPABILITY_REGISTRY.find((c) => c.claimType === "RULE_ADHERENCE")?.tier).toBe(2);
  });

  it("BACKING_RATIO only VALID against a recognized third-party attestor (D25.2)", () => {
    const b = CAPABILITY_REGISTRY.find((c) => c.claimType === "BACKING_RATIO");
    expect(b?.requires.join(" ")).toMatch(/third-party/i);
    expect(b?.abstainWhen).toMatch(/issuer-controlled|custom-http/i);
  });

  it("does not over-claim contract-enforced abstain beyond FAIR_VALUE (D25.3)", () => {
    const fairValue = CAPABILITY_REGISTRY.find((c) => c.claimType === "FAIR_VALUE");
    expect(fairValue?.returns).toMatch(/contract-enforced/i);
    const other = CAPABILITY_REGISTRY.find((c) => c.claimType.includes("APPRAISAL"));
    expect(other?.returns).toMatch(/pending/i);
  });
});
