import { describe, expect, it } from "vitest";
import { decodeClaimId, explorerAddressUrl, explorerTxUrl, shortAddr } from "../lib/activity";
import { toBytes32 } from "../lib/public-api";

describe("activity helpers", () => {
  it("decodes a UTF-8 string claim id back from bytes32", () => {
    const hex = toBytes32("mETH-2026-06-12");
    expect(decodeClaimId(hex)).toBe("mETH-2026-06-12");
  });

  it("decodes the short demo claim ids", () => {
    expect(decodeClaimId(toBytes32("A"))).toBe("A");
    expect(decodeClaimId(toBytes32("USDY-2026-06-01"))).toBe("USDY-2026-06-01");
  });

  it("returns the hex when the bytes32 is not printable ASCII (a keccak id)", () => {
    const keccakLike = `0x${"ab".repeat(32)}`;
    expect(decodeClaimId(keccakLike)).toBe(keccakLike);
  });

  it("shortens an address to head…tail", () => {
    const addr = "0xf2473a0a55D997233C8fBF987c197e7d2180470A";
    const short = shortAddr(addr);
    expect(short).toMatch(/^0xf247/);
    expect(short).toContain("…");
    expect(short.endsWith("470A")).toBe(true);
  });

  it("leaves a too-short string untouched", () => {
    expect(shortAddr("0x12")).toBe("0x12");
  });

  it("builds Mantlescan explorer links", () => {
    expect(explorerTxUrl("0xabc")).toBe("https://sepolia.mantlescan.xyz/tx/0xabc");
    expect(explorerAddressUrl("0xdef")).toBe("https://sepolia.mantlescan.xyz/address/0xdef");
  });
});
