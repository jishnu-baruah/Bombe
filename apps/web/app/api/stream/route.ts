/**
 * /api/stream — SSE replay of the A→D demo sequence.
 *
 * Enhanced for T-603: emits CLAIM_POSTED → per-agent AGENT_STEP sequence
 * → AGENT_DONE (with blockedByProtocol for Plugboard/D) → HUMAN_QUEUE_UPDATE
 * sourced deterministically from lib/demo-data.ts (fixtures).
 *
 * Query params:
 *   ?claim=A|B|C|D    — stream just one claim (used by guided-demo per-claim fetches)
 *   (no param)        — stream all claims A→D in sequence with inter-claim gap
 *
 * Timing is deterministic: no wall-clock jitter, pure sequential delays.
 * PRD §6.6, §6.7
 */

import type { SseEvent } from "@bombe/shared";
import type { NextRequest } from "next/server";
import { getAttestations, getClaims, getTrace } from "../../../lib/demo-data";

// ---------------------------------------------------------------------------
// Agent address map (matches fixtures/demo-data.json agentAddress fields)
// ---------------------------------------------------------------------------

const AGENT_ADDR: Record<string, string> = {
  reflector: "0xRefl0000000000000000000000000000000000001",
  rotor: "0xRot00000000000000000000000000000000000002",
  stator: "0xStat0000000000000000000000000000000000003",
  plugboard: "0xPlug0000000000000000000000000000000000004",
  human: "0xHuma0000000000000000000000000000000000005",
};

// Agent order for streaming (PRD §6.7 — all concurrently, but we stagger for UX)
const AGENT_ORDER = ["reflector", "rotor", "stator", "plugboard", "human"] as const;

// ---------------------------------------------------------------------------
// Build SSE event sequence for a single claim
// ---------------------------------------------------------------------------

function buildClaimEvents(claimId: string): SseEvent[] {
  const claims = getClaims();
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) return [];

  const events: SseEvent[] = [];

  // 1. CLAIM_POSTED
  events.push({
    kind: "CLAIM_POSTED",
    claimId,
    tier: claim.tier as 1 | 2 | 3,
    asset: claim.asset,
    claimType: claim.claimType as
      | "YIELD_BPS"
      | "DISTRIBUTION_PAID"
      | "CASHFLOW_MATCH"
      | "ENCUMBRANCE_ABSENT"
      | "FAIR_VALUE",
    payload: claim.payload as Record<string, unknown>,
    postedAt: claim.postedAt,
  });

  // 2. HUMAN_QUEUE_UPDATE — human joins the queue
  events.push({
    kind: "HUMAN_QUEUE_UPDATE",
    claimId,
    position: 1,
    estimatedWaitMin: 12,
  });

  // 3. Per-agent: AGENT_STEP* + AGENT_DONE
  const attestations = getAttestations(claimId);

  for (const agentId of AGENT_ORDER) {
    const attest = attestations.find((a) => a.agentId === agentId);
    if (!attest) continue;

    const addr = AGENT_ADDR[agentId] ?? attest.agentAddress;
    const trace = getTrace(claimId, agentId);

    // Emit each step as AGENT_STEP
    if (trace && trace.steps.length > 0) {
      for (const step of trace.steps) {
        events.push({
          kind: "AGENT_STEP",
          claimId,
          agentAddr: addr,
          step: step.step,
          thought: step.thought,
          action: step.action,
          ts: step.ts,
        });
      }
    } else if (agentId !== "human") {
      // Agents with no steps get a minimal thinking step
      events.push({
        kind: "AGENT_STEP",
        claimId,
        agentAddr: addr,
        step: 0,
        thought: `${capitalize(agentId)}: evaluating claim ${claimId}…`,
        action: { tool: "evaluate" },
        ts: Date.now(),
      });
    }

    // Emit AGENT_DONE
    const doneEvent: SseEvent = {
      kind: "AGENT_DONE",
      claimId,
      agentAddr: addr,
      isHuman: attest.isHuman,
      decision: attest.decision as "VALID" | "REJECTED" | "ABSTAIN",
      confidenceBps: attest.confidenceBps,
      latencyMs: attest.latencyMs,
      costUsd: attest.costUsd,
      reasoningHash: attest.reasoningHash,
      ...(attest.blockedByProtocol ? { blockedByProtocol: true as const } : {}),
    };
    events.push(doneEvent);
  }

  // 4. HUMAN_QUEUE_UPDATE — human finishes (position 0)
  events.push({
    kind: "HUMAN_QUEUE_UPDATE",
    claimId,
    position: 0,
    estimatedWaitMin: 0,
  });

  return events;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function encodeEvent(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const url = new URL(req.url);
  const claimParam = url.searchParams.get("claim");

  // Which claims to stream
  const claimIds =
    claimParam && ["A", "B", "C", "D"].includes(claimParam) ? [claimParam] : ["A", "B", "C", "D"];

  const stream = new ReadableStream({
    async start(controller) {
      for (const claimId of claimIds) {
        const events = buildClaimEvents(claimId);

        for (const event of events) {
          controller.enqueue(encoder.encode(encodeEvent(event)));
          // Stagger events so the panel visibly "thinks" rather than snapping to a
          // finished state. 450ms keeps the heaviest claim (~17 events ~= 7.6s) well
          // inside the client's 10s per-claim window so the verdict is never cut off.
          await new Promise<void>((resolve) => setTimeout(resolve, 450));
        }

        // Gap between claims (only when streaming multiple claims without guided-demo)
        if (claimIds.length > 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 800));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
