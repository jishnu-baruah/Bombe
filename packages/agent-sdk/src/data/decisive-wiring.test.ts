import type { Claim } from "@bombe/shared";
import { hashCanonical } from "@bombe/shared";
import { describe, expect, it } from "vitest";
import {
  InMemoryAttestationRepository,
  MockBlobSeam,
  MockClockSeam,
  MockWalletSeam,
  buildAndSubmitAttestation,
} from "../index.js";
import { computeDecisiveAttestation } from "./decisive-path.js";
import { StubDataSource } from "./mock-source.js";

describe("decisive path -> attestation builder wiring", () => {
  it("produces a matching reasoning hash, a receipt, and a persisted row", async () => {
    const clock = new MockClockSeam();
    const ds = StubDataSource.fromValues("mETH", [34, 34.2], { windowDays: 30 });

    const { trace, sources, decision } = await computeDecisiveAttestation(
      {
        claimId: "METH-WIRE",
        asset: "mETH",
        assertedValueBps: 34,
        reconcileToleranceBps: 5,
        verdictToleranceBps: 5,
        requestedWindowDays: 30,
      },
      ds,
      clock,
      "reflector",
    );
    expect(decision.verdict).toBe("VALID");

    const claim: Claim = {
      id: "METH-WIRE",
      tier: 1,
      asset: "mETH",
      claimType: "YIELD_BPS",
      payload: { assertedValueBps: 34, windowDays: 30, metric: "annualized_yield_bps" },
      submitter: "0x000000000000000000000000000000000000dEaD",
      postedAt: 0,
    };

    const repo = new InMemoryAttestationRepository();
    const { payload, receipt, row } = await buildAndSubmitAttestation({
      agentId: "reflector",
      agentAddr: "0xagent",
      isHuman: false,
      claim,
      trace,
      sources,
      costUsd: 0,
      postedAtMs: 0,
      deps: { wallet: new MockWalletSeam(), blob: new MockBlobSeam(), clock, repo },
    });

    expect(receipt.txHash).toMatch(/^0x/);
    expect(payload.decision).toBe("VALID");
    expect(payload.tier).toBe(1);
    // The hash the builder put on-chain equals a fresh recompute of the trace.
    expect(payload.reasoningHash).toBe(hashCanonical(trace));
    expect(row.txHash).toBe(receipt.txHash);
    expect(repo.rows).toHaveLength(1);
  });

  it("a disagreement abstains and locks no stake intent (decision ABSTAIN)", async () => {
    const clock = new MockClockSeam();
    const ds = StubDataSource.fromValues("mETH", [34, 90], { windowDays: 7 });
    const { trace, decision } = await computeDecisiveAttestation(
      {
        claimId: "METH-DIS",
        asset: "mETH",
        assertedValueBps: 34,
        reconcileToleranceBps: 5,
        verdictToleranceBps: 5,
        requestedWindowDays: 7,
      },
      ds,
      clock,
      "reflector",
    );
    expect(decision.verdict).toBe("ABSTAIN");
    expect(trace.final.decision).toBe("ABSTAIN");
  });
});
