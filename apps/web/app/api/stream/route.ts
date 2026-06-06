import type { SseEvent } from "@bombe/shared";
import type { NextRequest } from "next/server";

// Deterministic demo SSE sequence for T-601.
// Real runner wiring (DB-backed live event feed) lands in T-603/operator.
// Events match the PRD §6.7 demo sequence (Claim A: mETH YIELD_BPS).

const DEMO_EVENTS: SseEvent[] = [
  {
    kind: "CLAIM_POSTED",
    claimId: "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    tier: 1,
    asset: "mETH",
    claimType: "YIELD_BPS",
    payload: { yieldBps: 34, period: "30d" },
    postedAt: Date.now(),
  },
  {
    kind: "AGENT_STEP",
    claimId: "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    agentAddr: "0xReflector000000000000000000000000000000001",
    step: 1,
    thought: "Fetching mETH yield oracle to compare against claim of 34bps over 30d",
    action: { tool: "fetch_meth_yield", params: { period: "30d" } },
    ts: Date.now() + 100,
  },
  {
    kind: "AGENT_DONE",
    claimId: "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    agentAddr: "0xReflector000000000000000000000000000000001",
    isHuman: false,
    decision: "VALID",
    confidenceBps: 9200,
    latencyMs: 1240,
    costUsd: 0.0018,
    reasoningHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000001",
  },
  {
    kind: "AGENT_DONE",
    claimId: "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    agentAddr: "0xRotor0000000000000000000000000000000002",
    isHuman: false,
    decision: "VALID",
    confidenceBps: 8800,
    latencyMs: 890,
    costUsd: 0.0012,
    reasoningHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000002",
  },
  {
    kind: "AGENT_DONE",
    claimId: "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    agentAddr: "0xStator000000000000000000000000000000003",
    isHuman: false,
    decision: "ABSTAIN",
    confidenceBps: 0,
    latencyMs: 610,
    costUsd: 0.0006,
    reasoningHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000003",
  },
  {
    kind: "EPOCH_SETTLED",
    epoch: 1,
    highlights: [
      "Claim A settled — Reflector + Rotor VALID rewarded",
      "Stator ABSTAIN — no penalty (abstentions are never slashable)",
    ],
  },
];

function encodeEvent(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (const event of DEMO_EVENTS) {
        controller.enqueue(encoder.encode(encodeEvent(event)));
        // Stagger events so client receives them as a stream
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
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
