import { describe, expect, it } from "vitest";
import { decideTier1, deterministicVerdict, reconcileLegs } from "./reconciler.js";

describe("reconcileLegs (cross-check, D4)", () => {
  it("agrees and averages when legs are within tolerance", () => {
    const r = reconcileLegs([34.0, 34.2, 33.9], 5);
    expect(r.agree).toBe(true);
    expect(r.reconciledValue).toBeCloseTo(34.0333, 3);
    expect(r.spreadBps).toBeCloseTo(0.3, 5);
  });

  it("disagrees and yields null when spread exceeds tolerance", () => {
    const r = reconcileLegs([34, 50], 5);
    expect(r.agree).toBe(false);
    expect(r.reconciledValue).toBeNull();
    expect(r.spreadBps).toBe(16);
  });

  it("a single leg trivially agrees with itself", () => {
    const r = reconcileLegs([42], 5);
    expect(r.agree).toBe(true);
    expect(r.reconciledValue).toBe(42);
    expect(r.spreadBps).toBe(0);
  });

  it("zero legs never agree (source failure must abstain)", () => {
    const r = reconcileLegs([], 5);
    expect(r.agree).toBe(false);
    expect(r.reconciledValue).toBeNull();
  });

  it("treats the tolerance boundary as agreement (<=)", () => {
    const r = reconcileLegs([30, 35], 5);
    expect(r.agree).toBe(true);
  });

  it("rejects a negative tolerance", () => {
    expect(() => reconcileLegs([1, 2], -1)).toThrow();
  });
});

describe("deterministicVerdict (D11)", () => {
  it("ABSTAINs when the reconciled value is null", () => {
    expect(deterministicVerdict(null, 34, 5)).toBe("ABSTAIN");
  });

  it("VALID when within tolerance of the asserted value", () => {
    expect(deterministicVerdict(34.2, 34, 5)).toBe("VALID");
  });

  it("REJECTED when outside tolerance", () => {
    expect(deterministicVerdict(50, 34, 5)).toBe("REJECTED");
  });

  it("treats the verdict tolerance boundary as VALID (<=)", () => {
    expect(deterministicVerdict(39, 34, 5)).toBe("VALID");
    expect(deterministicVerdict(39.01, 34, 5)).toBe("REJECTED");
  });
});

describe("decideTier1 (integration)", () => {
  it("agreeing legs that match the assertion -> VALID", () => {
    const d = decideTier1({
      legValues: [34.0, 34.1],
      assertedValue: 34,
      reconcileToleranceBps: 5,
      verdictToleranceBps: 5,
    });
    expect(d.verdict).toBe("VALID");
    expect(d.reconcile.agree).toBe(true);
  });

  it("disagreeing legs -> ABSTAIN regardless of the assertion", () => {
    const d = decideTier1({
      legValues: [34, 80],
      assertedValue: 34,
      reconcileToleranceBps: 5,
      verdictToleranceBps: 5,
    });
    expect(d.verdict).toBe("ABSTAIN");
    expect(d.reconcile.agree).toBe(false);
  });

  it("agreeing legs that contradict the assertion -> REJECTED", () => {
    const d = decideTier1({
      legValues: [34, 34.2],
      assertedValue: 100,
      reconcileToleranceBps: 5,
      verdictToleranceBps: 5,
    });
    expect(d.verdict).toBe("REJECTED");
  });
});
