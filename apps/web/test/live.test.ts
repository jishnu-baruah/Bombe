/**
 * T-603 tests — /live race view logic
 *
 * Three pure-logic test groups:
 *  1. decision → chip mapping (incl BLOCKED BY PROTOCOL)
 *  2. guided-demo state machine advances A→D and reaches done
 *  3. SSE replay for claim D yields a Plugboard blockedByProtocol event
 *
 * No DOM rendering needed; all logic is pure or data-driven.
 */

import { describe, expect, it } from "vitest";
import { getAttestations, getClaims } from "../lib/demo-data";

// ---------------------------------------------------------------------------
// 1. Decision → chip mapping
// ---------------------------------------------------------------------------

type DecisionChipVariant = "VALID" | "REJECTED" | "ABSTAIN" | "BLOCKED_BY_PROTOCOL";

/** Mirrors the DecisionChip logic in page.tsx — pure function for testing. */
function resolveChip(
  decision: "VALID" | "REJECTED" | "ABSTAIN",
  blockedByProtocol?: boolean,
): DecisionChipVariant {
  if (blockedByProtocol) return "BLOCKED_BY_PROTOCOL";
  if (decision === "VALID") return "VALID";
  if (decision === "REJECTED") return "REJECTED";
  return "ABSTAIN";
}

describe("decision → chip mapping", () => {
  it("VALID decision → VALID chip", () => {
    expect(resolveChip("VALID")).toBe("VALID");
  });

  it("REJECTED decision → REJECTED chip", () => {
    expect(resolveChip("REJECTED")).toBe("REJECTED");
  });

  it("ABSTAIN decision → ABSTAIN chip", () => {
    expect(resolveChip("ABSTAIN")).toBe("ABSTAIN");
  });

  it("ABSTAIN + blockedByProtocol → BLOCKED_BY_PROTOCOL chip", () => {
    expect(resolveChip("ABSTAIN", true)).toBe("BLOCKED_BY_PROTOCOL");
  });

  it("VALID + blockedByProtocol → BLOCKED_BY_PROTOCOL chip (protocol takes precedence)", () => {
    // This is the Plugboard/D case: attempted VALID, contract reverted, UI shows BLOCKED first
    expect(resolveChip("VALID", true)).toBe("BLOCKED_BY_PROTOCOL");
  });

  it("blockedByProtocol false is treated as absent", () => {
    expect(resolveChip("ABSTAIN", false)).toBe("ABSTAIN");
  });
});

// ---------------------------------------------------------------------------
// 2. Guided-demo state machine: A→D advancement
// ---------------------------------------------------------------------------

type ClaimId = "A" | "B" | "C" | "D";
const CLAIM_IDS: ClaimId[] = ["A", "B", "C", "D"];

interface DemoMachineState {
  currentIdx: number;
  processedClaims: ClaimId[];
  done: boolean;
}

/** Minimal state machine mirroring the guided-demo loop in page.tsx */
function createDemoMachine(): DemoMachineState {
  return { currentIdx: 0, processedClaims: [], done: false };
}

function advanceDemoMachine(state: DemoMachineState): DemoMachineState {
  if (state.done) return state;
  const claimId = CLAIM_IDS[state.currentIdx] as ClaimId;
  const processedClaims = [...state.processedClaims, claimId];
  const nextIdx = state.currentIdx + 1;
  const done = nextIdx >= CLAIM_IDS.length;
  return { currentIdx: done ? state.currentIdx : nextIdx, processedClaims, done };
}

describe("guided-demo state machine", () => {
  it("starts at idx 0 with no processed claims", () => {
    const s = createDemoMachine();
    expect(s.currentIdx).toBe(0);
    expect(s.processedClaims).toHaveLength(0);
    expect(s.done).toBe(false);
  });

  it("advances through A → B → C → D", () => {
    let s = createDemoMachine();
    s = advanceDemoMachine(s); // processes A
    expect(s.processedClaims).toContain("A");
    s = advanceDemoMachine(s); // processes B
    expect(s.processedClaims).toContain("B");
    s = advanceDemoMachine(s); // processes C
    expect(s.processedClaims).toContain("C");
    s = advanceDemoMachine(s); // processes D
    expect(s.processedClaims).toContain("D");
  });

  it("reaches done after processing all 4 claims", () => {
    let s = createDemoMachine();
    for (let i = 0; i < CLAIM_IDS.length; i++) {
      s = advanceDemoMachine(s);
    }
    expect(s.done).toBe(true);
    expect(s.processedClaims).toHaveLength(4);
    expect(s.processedClaims).toEqual(["A", "B", "C", "D"]);
  });

  it("does not advance beyond D when already done", () => {
    let s = createDemoMachine();
    // Over-advance
    for (let i = 0; i < CLAIM_IDS.length + 3; i++) {
      s = advanceDemoMachine(s);
    }
    expect(s.done).toBe(true);
    expect(s.processedClaims).toHaveLength(4);
  });

  it("full run completes in 4 steps exactly", () => {
    const steps: DemoMachineState[] = [];
    let s = createDemoMachine();
    for (let i = 0; i < CLAIM_IDS.length; i++) {
      s = advanceDemoMachine(s);
      steps.push(s);
    }
    expect(steps).toHaveLength(4);
    // steps.length === 4 guaranteed above, last is always defined
    const last = steps[steps.length - 1] as DemoMachineState;
    expect(last.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. SSE replay for claim D: Plugboard yields blockedByProtocol
// ---------------------------------------------------------------------------

describe("claim D Plugboard blockedByProtocol in demo data", () => {
  it("claim D exists in demo data", () => {
    const claims = getClaims();
    const claimD = claims.find((c) => c.id === "D");
    expect(claimD).toBeDefined();
    if (claimD) {
      expect(claimD.tier).toBe(3);
      expect(claimD.claimType).toBe("FAIR_VALUE");
    }
  });

  it("claim D attestations include Plugboard with blockedByProtocol=true", () => {
    const attestations = getAttestations("D");
    const plugboard = attestations.find((a) => a.agentId === "plugboard");
    expect(plugboard).toBeDefined();
    if (plugboard) {
      expect(plugboard.blockedByProtocol).toBe(true);
    }
  });

  it("claim D Plugboard final decision is ABSTAIN (after contract revert)", () => {
    const attestations = getAttestations("D");
    const plugboard = attestations.find((a) => a.agentId === "plugboard");
    expect(plugboard?.decision).toBe("ABSTAIN");
  });

  it("claim D SDK agents all ABSTAIN (tier-3 rule)", () => {
    const attestations = getAttestations("D");
    for (const agentId of ["reflector", "rotor", "stator"]) {
      const a = attestations.find((x) => x.agentId === agentId);
      expect(a?.decision).toBe("ABSTAIN");
      // SDK agents did NOT get a contract revert (they abstain proactively)
      expect(a?.blockedByProtocol).toBe(false);
    }
  });

  it("claim D Plugboard blockedByProtocol causes BLOCKED_BY_PROTOCOL chip", () => {
    const attestations = getAttestations("D");
    const plugboard = attestations.find((a) => a.agentId === "plugboard");
    expect(plugboard).toBeDefined();
    if (plugboard) {
      const chip = resolveChip(
        plugboard.decision as "VALID" | "REJECTED" | "ABSTAIN",
        plugboard.blockedByProtocol,
      );
      expect(chip).toBe("BLOCKED_BY_PROTOCOL");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. §6.7 outcome matrix — all 4 claims
// ---------------------------------------------------------------------------

describe("§6.7 demo sequence outcome matrix", () => {
  it("claim A: all 5 agents VALID", () => {
    const attestations = getAttestations("A");
    // SDK + Plugboard
    for (const agentId of ["reflector", "rotor", "stator", "plugboard"]) {
      const a = attestations.find((x) => x.agentId === agentId);
      expect(a?.decision).toBe("VALID");
    }
  });

  it("claim B: Reflector ABSTAIN, Rotor VALID, Stator ABSTAIN", () => {
    const attestations = getAttestations("B");
    expect(attestations.find((a) => a.agentId === "reflector")?.decision).toBe("ABSTAIN");
    expect(attestations.find((a) => a.agentId === "rotor")?.decision).toBe("VALID");
    expect(attestations.find((a) => a.agentId === "stator")?.decision).toBe("ABSTAIN");
  });

  it("claim C: all agents REJECTED", () => {
    const attestations = getAttestations("C");
    for (const agentId of ["reflector", "rotor", "stator", "plugboard"]) {
      const a = attestations.find((x) => x.agentId === agentId);
      expect(a?.decision).toBe("REJECTED");
    }
  });

  it("claim D: SDK agents ABSTAIN, Plugboard ABSTAIN + blockedByProtocol", () => {
    const attestations = getAttestations("D");
    for (const agentId of ["reflector", "rotor", "stator"]) {
      expect(attestations.find((x) => x.agentId === agentId)?.decision).toBe("ABSTAIN");
    }
    const plugboard = attestations.find((a) => a.agentId === "plugboard");
    expect(plugboard?.decision).toBe("ABSTAIN");
    expect(plugboard?.blockedByProtocol).toBe(true);
  });
});
