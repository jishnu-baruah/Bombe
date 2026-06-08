import { describe, expect, it } from "vitest";
import { TraceSchema } from "../loop.js";
import { type NavDeps, type NavRead, computeNavAttestation, crossCheckNav } from "./nav.js";

const clock = { now: () => 1_700_000_000_000 };
const read = (v: number): NavRead => ({
  assetsPerShare: v,
  method: "convertToAssets",
  decimals: 18,
  raw: String(BigInt(Math.round(v * 1e18))),
});
const depsReturning = (v: number): NavDeps => ({ readErc4626: async () => read(v) });
const depsThrowing = (): NavDeps => ({
  readErc4626: async () => {
    throw new Error("not a vault");
  },
});

describe("crossCheckNav", () => {
  it("VALID within tolerance", () => {
    expect(crossCheckNav(1.05, read(1.0503), 0.5).verdict).toBe("VALID"); // ~0.03% gap
  });
  it("REJECTED beyond tolerance", () => {
    expect(crossCheckNav(1.2, read(1.05), 0.5).verdict).toBe("REJECTED");
  });
  it("ABSTAIN when unreadable", () => {
    expect(crossCheckNav(1.05, null, 0.5, "not a vault").verdict).toBe("ABSTAIN");
  });
});

describe("computeNavAttestation", () => {
  it("reads the vault, cross-checks, and emits a schema-valid trace with provenance", async () => {
    const r = await computeNavAttestation(
      {
        claimId: "NAV-TEST",
        asset: "0xVault",
        assertedNav: 1.05,
        tolerancePct: 0.5,
        ref: { chain: "Ethereum", contract: "0xVault", label: "Test vault" },
      },
      depsReturning(1.0501),
      clock,
      "reflector",
    );
    expect(r.verdict.verdict).toBe("VALID");
    expect(r.trace.final.reasons).toContain("ONCHAIN_NAV_CROSSCHECK");
    const readNode = r.trace.provenance?.nodes.find((n) => n.id === "read");
    expect(readNode?.type).toBe("evidence");
    expect(() => TraceSchema.parse(r.trace)).not.toThrow();
  });

  it("abstains + stays schema-valid when the contract is not a vault", async () => {
    const r = await computeNavAttestation(
      {
        claimId: "NAV-FAIL",
        asset: "0xNotVault",
        assertedNav: 1.05,
        tolerancePct: 0.5,
        ref: { chain: "Ethereum", contract: "0xNotVault", label: "Not a vault" },
      },
      depsThrowing(),
      clock,
      "reflector",
    );
    expect(r.verdict.verdict).toBe("ABSTAIN");
    expect(r.trace.final.reasons).toContain("VAULT_UNREADABLE");
    expect(() => TraceSchema.parse(r.trace)).not.toThrow();
  });
});
