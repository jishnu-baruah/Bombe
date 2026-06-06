/**
 * scripts/test/abi-bridge.test.ts — Unit tests for the ABI bridge. (T-406)
 *
 * Tests that the generated ABI JSON files parse correctly and that the
 * TypeScript exports compile + work as expected. No anvil required — these
 * run in the fast CI suite.
 */

import {
  AgentAttestationAbi,
  AgentRegistryAbi,
  AgentSlashingAbi,
  TuringLeaderboardAbi,
} from "@bombe/shared";
import { describe, expect, it } from "vitest";

describe("ABI bridge (T-406)", () => {
  it("AgentRegistryAbi is a non-empty array", () => {
    expect(Array.isArray(AgentRegistryAbi)).toBe(true);
    expect(AgentRegistryAbi.length).toBeGreaterThan(0);
  });

  it("AgentAttestationAbi contains the attest function", () => {
    const attest = AgentAttestationAbi.find(
      (e) => "name" in e && e.name === "attest" && "type" in e && e.type === "function",
    );
    expect(attest).toBeDefined();
  });

  it("AgentAttestationAbi contains the postClaim function", () => {
    const postClaim = AgentAttestationAbi.find(
      (e) => "name" in e && e.name === "postClaim" && "type" in e && e.type === "function",
    );
    expect(postClaim).toBeDefined();
  });

  it("AgentAttestationAbi contains ClaimPosted and Attested events", () => {
    const claimPosted = AgentAttestationAbi.find(
      (e) => "name" in e && e.name === "ClaimPosted" && "type" in e && e.type === "event",
    );
    const attested = AgentAttestationAbi.find(
      (e) => "name" in e && e.name === "Attested" && "type" in e && e.type === "event",
    );
    expect(claimPosted).toBeDefined();
    expect(attested).toBeDefined();
  });

  it("AgentRegistryAbi contains registerAgent and registerHuman", () => {
    const registerAgent = AgentRegistryAbi.find(
      (e) => "name" in e && e.name === "registerAgent" && "type" in e && e.type === "function",
    );
    const registerHuman = AgentRegistryAbi.find(
      (e) => "name" in e && e.name === "registerHuman" && "type" in e && e.type === "function",
    );
    expect(registerAgent).toBeDefined();
    expect(registerHuman).toBeDefined();
  });

  it("AgentSlashingAbi is a non-empty array", () => {
    expect(Array.isArray(AgentSlashingAbi)).toBe(true);
    expect(AgentSlashingAbi.length).toBeGreaterThan(0);
  });

  it("TuringLeaderboardAbi is a non-empty array", () => {
    expect(Array.isArray(TuringLeaderboardAbi)).toBe(true);
    expect(TuringLeaderboardAbi.length).toBeGreaterThan(0);
  });

  it("viem encodeFunctionData works with AgentAttestationAbi for attest()", async () => {
    const { encodeFunctionData } = await import("viem");

    // If this compiles and runs without error, the ABI is viem-compatible.
    const data = encodeFunctionData({
      abi: AgentAttestationAbi,
      functionName: "attest",
      args: [
        `0x${"41".padEnd(64, "0")}` as `0x${string}`, // bytes32 claimId
        0, // decision VALID
        8000, // confidenceBps
        `0x${"aa".repeat(32)}` as `0x${string}`, // sourcesHash
        `0x${"bb".repeat(32)}` as `0x${string}`, // reasoningHash
        "mock://trace/A/reflector", // traceURI
      ],
    });

    expect(data).toMatch(/^0x/);
    expect(data.length).toBeGreaterThan(10);
  });

  it("viem encodeFunctionData works with AgentRegistryAbi for registerAgent()", async () => {
    const { encodeFunctionData } = await import("viem");

    const data = encodeFunctionData({
      abi: AgentRegistryAbi,
      functionName: "registerAgent",
      args: ["https://bombe.example/agent"],
    });

    expect(data).toMatch(/^0x/);
    expect(data.length).toBeGreaterThan(10);
  });
});
