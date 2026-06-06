"use client";

/**
 * /live, T-603 flagship race view.
 *
 * Layout: 5 columns (desktop ≥640px) / stacked tap-to-expand cards (≤380px).
 * Columns: Reflector · Rotor · Stator · Plugboard (EXTERNAL RUNTIME) · Human queue.
 *
 * Each column streams AGENT_STEP events (thought/action) ending in a decision chip:
 *   VALID green / REJECTED red / ABSTAIN amber + reason / BLOCKED BY PROTOCOL purple.
 * Footer per agent: elapsed ms + cost.
 *
 * Guided Demo button: auto-advances A→D with ~5s pauses and toast narration.
 * Manual "Next claim" control (client-gated; real operator key gating is T-606).
 *
 * SSE replay driven by /api/stream?claim=X (deterministic, sourced from demo-data.ts).
 * PRD §6.6, §6.7, DESIGN.md.
 */

// Import via alias, browser-safe (avoids Node-only @bombe/shared barrel). See next.config.ts.
import type { AgentDoneEvent, AgentStepEvent, ClaimPostedEvent, SseEvent } from "@bombe-events";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Mono } from "../../components/ui/Mono";
import { parseEvent } from "../../lib/parseEvent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClaimId = "A" | "B" | "C" | "D";
const CLAIM_IDS: ClaimId[] = ["A", "B", "C", "D"];

type AgentId = "reflector" | "rotor" | "stator" | "plugboard" | "human";

type AgentState = {
  steps: AgentStepEvent[];
  done: AgentDoneEvent | null;
  startedAt: number | null;
};

type ClaimState = {
  claim: ClaimPostedEvent | null;
  agents: Record<AgentId, AgentState>;
  humanQueuePosition: number | null;
  humanQueueEstWait: number | null;
};

type RaceState = {
  currentClaimIdx: number;
  claims: Record<ClaimId, ClaimState>;
};

type RaceAction =
  | { type: "reset_claim"; claimId: ClaimId }
  | { type: "claim_posted"; event: ClaimPostedEvent; claimId: ClaimId }
  | { type: "agent_step"; event: AgentStepEvent; claimId: ClaimId; agentId: AgentId }
  | { type: "agent_done"; event: AgentDoneEvent; claimId: ClaimId; agentId: AgentId }
  | { type: "human_queue"; claimId: ClaimId; position: number; estWait: number }
  | { type: "next_claim" };

// Toast type for narration
type Toast = { id: number; message: string };

// ---------------------------------------------------------------------------
// Agent address → agentId mapping
// ---------------------------------------------------------------------------

const ADDR_TO_AGENT: Record<string, AgentId> = {
  "0xRefl0000000000000000000000000000000000001": "reflector",
  "0xRot00000000000000000000000000000000000002": "rotor",
  "0xStat0000000000000000000000000000000000003": "stator",
  "0xPlug0000000000000000000000000000000000004": "plugboard",
  "0xHuma0000000000000000000000000000000000005": "human",
};

const AGENTS: AgentId[] = ["reflector", "rotor", "stator", "plugboard", "human"];

function emptyAgentState(): AgentState {
  return { steps: [], done: null, startedAt: null };
}

function emptyClaimState(): ClaimState {
  return {
    claim: null,
    agents: {
      reflector: emptyAgentState(),
      rotor: emptyAgentState(),
      stator: emptyAgentState(),
      plugboard: emptyAgentState(),
      human: emptyAgentState(),
    },
    humanQueuePosition: null,
    humanQueueEstWait: null,
  };
}

function makeInitialState(): RaceState {
  return {
    currentClaimIdx: 0,
    claims: {
      A: emptyClaimState(),
      B: emptyClaimState(),
      C: emptyClaimState(),
      D: emptyClaimState(),
    },
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function raceReducer(state: RaceState, action: RaceAction): RaceState {
  switch (action.type) {
    case "reset_claim": {
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.claimId]: emptyClaimState(),
        },
      };
    }
    case "claim_posted": {
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.claimId]: {
            ...state.claims[action.claimId],
            claim: action.event,
          },
        },
      };
    }
    case "agent_step": {
      const cs = state.claims[action.claimId];
      const ag = cs.agents[action.agentId];
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.claimId]: {
            ...cs,
            agents: {
              ...cs.agents,
              [action.agentId]: {
                ...ag,
                startedAt: ag.startedAt ?? Date.now(),
                steps: [...ag.steps, action.event],
              },
            },
          },
        },
      };
    }
    case "agent_done": {
      const cs = state.claims[action.claimId];
      const ag = cs.agents[action.agentId];
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.claimId]: {
            ...cs,
            agents: {
              ...cs.agents,
              [action.agentId]: {
                ...ag,
                done: action.event,
              },
            },
          },
        },
      };
    }
    case "human_queue": {
      const cs = state.claims[action.claimId];
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.claimId]: {
            ...cs,
            humanQueuePosition: action.position,
            humanQueueEstWait: action.estWait,
          },
        },
      };
    }
    case "next_claim": {
      return {
        ...state,
        currentClaimIdx: Math.min(state.currentClaimIdx + 1, CLAIM_IDS.length - 1),
      };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Guided demo narrations per claim
// ---------------------------------------------------------------------------

const CLAIM_NARRATIONS: Record<ClaimId, string> = {
  A: "Claim A: mETH yield 34bps, all agents converge on VALID with fresh oracle data.",
  B: "Claim B: stale feed, Reflector abstains: one stale source isn't enough. Rotor commits anyway.",
  C: "Claim C: cashflow mismatch $50,000 vs $45,000, every agent rejects the claim.",
  D: "Claim D: judgment tier, SDK agents abstain. The contract just rejected an external agent's judgment attestation.",
};

// ---------------------------------------------------------------------------
// Decision chip component
// ---------------------------------------------------------------------------

function DecisionChip({ done }: { done: AgentDoneEvent }) {
  const { decision, blockedByProtocol } = done;

  if (blockedByProtocol) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="BLOCKED_BY_PROTOCOL" />
        <span className="text-[11px] text-[#7c3aed] font-mono">JudgmentTierRequiresAbstain</span>
        <Badge variant="ABSTAIN" label="ABSTAIN (resubmit)" />
      </div>
    );
  }

  if (decision === "VALID") return <Badge variant="VALID" />;
  if (decision === "REJECTED") return <Badge variant="REJECTED" />;
  // ABSTAIN
  return <Badge variant="ABSTAIN" />;
}

// ---------------------------------------------------------------------------
// Agent footer (elapsed ms + cost)
// ---------------------------------------------------------------------------

function AgentFooter({ done }: { done: AgentDoneEvent }) {
  return (
    <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between gap-2 flex-wrap">
      <span className="text-[11px] font-mono text-[#505a63]">{done.latencyMs}ms</span>
      <span className="text-[11px] font-mono text-[#505a63]">
        {done.costUsd > 0 ? `$${done.costUsd.toFixed(4)}` : "-"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step feed (thought/action list)
// ---------------------------------------------------------------------------

function StepFeed({ steps }: { steps: AgentStepEvent[] }) {
  if (steps.length === 0) {
    return <p className="text-[#3a3d40] text-[12px] italic">Waiting for first step…</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={`${s.agentAddr}-${s.step}`} className="text-[12px]">
          <span className="text-[#494fdf] font-mono text-[11px] mr-1">#{s.step}</span>
          <span className="text-[rgba(255,255,255,0.72)]">{s.thought}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Single agent column
// ---------------------------------------------------------------------------

interface AgentColumnProps {
  agentId: AgentId;
  state: AgentState;
  isExternal?: boolean;
  humanQueuePosition?: number | null;
  humanQueueEstWait?: number | null;
  expanded: boolean;
  onToggle: () => void;
}

const AGENT_LABELS: Record<AgentId, string> = {
  reflector: "Reflector",
  rotor: "Rotor",
  stator: "Stator",
  plugboard: "Plugboard",
  human: "Human Queue",
};

function AgentColumn({
  agentId,
  state,
  isExternal,
  humanQueuePosition,
  humanQueueEstWait,
  expanded,
  onToggle,
}: AgentColumnProps) {
  const isHuman = agentId === "human";
  const label = AGENT_LABELS[agentId];
  const { steps, done } = state;

  // Status indicator
  let status: "idle" | "running" | "done" = "idle";
  if (done) status = "done";
  else if (steps.length > 0) status = "running";

  const statusDot =
    status === "done"
      ? "bg-[#428619]"
      : status === "running"
        ? "bg-[#494fdf] animate-pulse"
        : "bg-[#3a3d40]";

  return (
    <Card
      variant="feature-dark"
      className="flex flex-col gap-3 p-4 min-w-0 h-full"
      data-testid={`agent-column-${agentId}`}
    >
      {/* Column header (toggles the card body on mobile; body always visible ≥sm) */}
      <button
        type="button"
        className="flex items-center justify-between gap-2 w-full text-left bg-transparent border-0 p-0 cursor-pointer sm:cursor-default"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
          <span className="font-semibold text-[14px] truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isExternal && <Badge variant="EXTERNAL_RUNTIME" className="text-[10px]" />}
          {isHuman && <Badge variant="HUMAN" className="text-[10px]" />}
          {!isHuman && !isExternal && <Badge variant="AI" className="text-[10px]" />}
          {/* Toggle chevron on mobile */}
          <span className="sm:hidden text-[#505a63] text-[11px]">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expandable body, always visible ≥sm, toggle on mobile */}
      <div className={`${expanded ? "block" : "hidden"} sm:block flex-1 flex flex-col gap-3`}>
        {/* Human queue special rendering */}
        {isHuman ? (
          <div className="flex flex-col gap-2">
            {humanQueuePosition !== null && humanQueuePosition !== undefined ? (
              <>
                <p className="text-[12px] text-[rgba(255,255,255,0.72)]">
                  {humanQueuePosition === 0
                    ? "Human attestor is reviewing…"
                    : `Queue position: ${humanQueuePosition}`}
                </p>
                {humanQueueEstWait !== null &&
                  humanQueueEstWait !== undefined &&
                  humanQueueEstWait > 0 && (
                    <p className="text-[11px] text-[#505a63] font-mono">
                      est. {humanQueueEstWait} min
                    </p>
                  )}
              </>
            ) : (
              <p className="text-[#3a3d40] text-[12px] italic">Waiting for claim…</p>
            )}

            {done && (
              <div className="mt-2 flex flex-col gap-2">
                <DecisionChip done={done} />
                <AgentFooter done={done} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Step feed */}
            <div className="flex-1 min-h-[60px] max-h-[160px] overflow-y-auto pr-1">
              <StepFeed steps={steps} />
            </div>

            {/* Decision chip + footer */}
            {done ? (
              <div className="flex flex-col gap-2">
                <DecisionChip done={done} />
                <AgentFooter done={done} />
              </div>
            ) : (
              <div className="h-8 flex items-center">
                {steps.length > 0 && (
                  <span className="text-[11px] text-[#494fdf] font-mono animate-pulse">
                    thinking…
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Claim header card
// ---------------------------------------------------------------------------

function ClaimHeader({ claim }: { claim: ClaimPostedEvent }) {
  const tierVariant = `tier-${claim.tier}` as "tier-1" | "tier-2" | "tier-3";
  const payloadStr = JSON.stringify(claim.payload, null, 0);

  return (
    <div
      className="rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[#16181a] px-5 py-4 flex flex-wrap items-center gap-3"
      data-testid="claim-header"
    >
      <Badge variant={tierVariant} />
      <span className="font-semibold text-[14px]">{claim.claimType}</span>
      <span className="text-[#8d969e] text-[13px]">{claim.asset}</span>
      <Mono value={payloadStr} truncate showCopy={false} className="text-[11px]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------

function ToastList({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none max-w-[90vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-[#16181a] border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.9)] text-[13px] px-5 py-3 rounded-full shadow-lg animate-fade-in"
          data-testid="toast"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claim progress tabs
// ---------------------------------------------------------------------------

function ClaimTabs({
  currentIdx,
  completedIdx,
  onSelect,
}: {
  currentIdx: number;
  completedIdx: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CLAIM_IDS.map((id, i) => {
        const isActive = i === currentIdx;
        const isComplete = i <= completedIdx;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(i)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
              isActive
                ? "bg-[#494fdf] text-white"
                : isComplete
                  ? "bg-[#16181a] text-[#c9c9cd] hover:bg-[#3a3d40]"
                  : "bg-[#16181a] text-[#3a3d40] cursor-not-allowed"
            }`}
            disabled={i > completedIdx + 1 && !isActive}
            data-testid={`claim-tab-${id}`}
          >
            {id}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSE hook for a single claim replay
// ---------------------------------------------------------------------------

function useClaimStream(
  claimId: ClaimId | null,
  onEvent: (event: SseEvent) => void,
): { connected: boolean; done: boolean } {
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!claimId) return;

    setConnected(false);
    setDone(false);

    // Close any previous stream
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`/api/stream?claim=${claimId}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e: MessageEvent<string>) => {
      const result = parseEvent(e.data);
      if (result.ok) {
        onEventRef.current(result.event);
      }
    };

    es.onerror = () => {
      setConnected(false);
      setDone(true);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [claimId]);

  return { connected, done };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LivePage() {
  const [raceState, dispatch] = useReducer(raceReducer, undefined, makeInitialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounterRef = useRef(0);
  const [guidedRunning, setGuidedRunning] = useState(false);
  const [guidedDone, setGuidedDone] = useState(false);
  const [streamClaimId, setStreamClaimId] = useState<ClaimId | null>(null);
  // Track how far the user has manually unlocked
  const [unlockedIdx, setUnlockedIdx] = useState(0);
  // Expanded state for mobile (index of expanded agent column)
  const [expandedAgents, setExpandedAgents] = useState<Record<AgentId, boolean>>({
    reflector: true,
    rotor: true,
    stator: true,
    plugboard: true,
    human: true,
  });

  // currentClaimIdx is always in [0, 3], CLAIM_IDS always has 4 entries, safe non-null assertion
  const currentClaimId = CLAIM_IDS[raceState.currentClaimIdx] as ClaimId;
  const currentClaimState = raceState.claims[currentClaimId];

  // ---- Toast helpers -------------------------------------------------------

  const addToast = useCallback((message: string) => {
    const id = ++toastCounterRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // ---- SSE event handler ---------------------------------------------------

  const handleSseEvent = useCallback((event: SseEvent) => {
    const claimId = "claimId" in event ? (event.claimId as ClaimId) : null;
    if (!claimId) return;

    if (event.kind === "CLAIM_POSTED") {
      dispatch({ type: "claim_posted", event, claimId });
    } else if (event.kind === "AGENT_STEP") {
      const agentId = ADDR_TO_AGENT[event.agentAddr];
      if (agentId) {
        dispatch({ type: "agent_step", event, claimId, agentId });
      }
    } else if (event.kind === "AGENT_DONE") {
      const agentId = ADDR_TO_AGENT[event.agentAddr];
      if (agentId) {
        dispatch({ type: "agent_done", event, claimId, agentId });
      }
    } else if (event.kind === "HUMAN_QUEUE_UPDATE") {
      dispatch({
        type: "human_queue",
        claimId,
        position: event.position,
        estWait: event.estimatedWaitMin,
      });
    }
  }, []);

  // ---- Stream hook ---------------------------------------------------------

  const { done: streamDone } = useClaimStream(streamClaimId, handleSseEvent);

  // When current stream finishes in guided mode, advance to next claim
  const streamDoneRef = useRef(streamDone);
  streamDoneRef.current = streamDone;

  // ---- Start a single claim stream -----------------------------------------

  const startClaim = useCallback(
    (idx: number) => {
      const id = CLAIM_IDS[idx] as ClaimId;
      dispatch({ type: "reset_claim", claimId: id });
      setStreamClaimId(id);
      addToast(CLAIM_NARRATIONS[id]);
    },
    [addToast],
  );

  // ---- Guided Demo ---------------------------------------------------------

  const runGuidedDemo = useCallback(async () => {
    setGuidedRunning(true);
    setGuidedDone(false);
    dispatch({ type: "next_claim" }); // reset to idx 0 (no-op if already 0)

    for (let i = 0; i < CLAIM_IDS.length; i++) {
      const id = CLAIM_IDS[i] as ClaimId;
      // Set current claim index
      for (let j = raceState.currentClaimIdx; j < i; j++) {
        dispatch({ type: "next_claim" });
      }
      setUnlockedIdx(i);
      startClaim(i);
      addToast(`▶ Claim ${id}: ${CLAIM_NARRATIONS[id]}`);

      // Wait ~5s for the stream to settle (the stream itself takes ~4-5s per claim)
      await new Promise<void>((resolve) => setTimeout(resolve, 5500));
    }

    setGuidedRunning(false);
    setGuidedDone(true);
    addToast("Guided demo complete, all 4 claims A→D processed.");
  }, [startClaim, addToast, raceState.currentClaimIdx]);

  // ---- Manual "Next claim" -------------------------------------------------

  function handleNextClaim() {
    const nextIdx = raceState.currentClaimIdx + 1;
    if (nextIdx >= CLAIM_IDS.length) return;
    setUnlockedIdx(nextIdx);
    dispatch({ type: "next_claim" });
    startClaim(nextIdx);
  }

  function handleSelectClaim(idx: number) {
    if (idx > unlockedIdx + 1) return;
    if (idx > raceState.currentClaimIdx) {
      dispatch({ type: "next_claim" });
    }
    startClaim(idx);
  }

  // ---- Mobile expand toggle ------------------------------------------------

  function toggleAgent(id: AgentId) {
    setExpandedAgents((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ---- Derived --------------------------------------------------------------

  const allDone = AGENTS.every((a) => currentClaimState.agents[a].done !== null);
  const atLastClaim = raceState.currentClaimIdx >= CLAIM_IDS.length - 1;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#000000] text-[#ffffff]">
      {/* ── Hero band ── */}
      <section className="px-6 pt-[88px] pb-8 border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[#494fdf] text-[12px] font-semibold tracking-[0.8px] uppercase mb-4">
            Bombe · Live Race View
          </p>
          <h1 className="text-[clamp(36px,6vw,56px)] font-semibold leading-[1.0] tracking-[-0.5px] mb-4 balance">
            Agent Race
          </h1>
          <p className="text-[rgba(255,255,255,0.60)] text-[16px] max-w-2xl leading-[1.5] mb-6 pretty">
            Watch four attestors race on each claim, Reflector, Rotor, Stator (SDK agents),
            Plugboard (external runtime), and a Human Queue. Outcomes match §6.7 exactly.
          </p>

          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Guided Demo */}
            <Button
              variant="primary"
              onClick={() => {
                void runGuidedDemo();
              }}
              disabled={guidedRunning}
              data-testid="guided-demo-btn"
            >
              {guidedRunning ? "Running…" : guidedDone ? "Replay Demo" : "Guided Demo A→D"}
            </Button>

            {/* Manual Next claim */}
            {!guidedRunning && !atLastClaim && (
              <Button variant="outline-dark" onClick={handleNextClaim} data-testid="next-claim-btn">
                Next claim →
              </Button>
            )}

            {/* Start first claim if nothing running */}
            {!streamClaimId && !guidedRunning && (
              <Button
                variant="outline-dark"
                onClick={() => {
                  setUnlockedIdx(0);
                  startClaim(0);
                }}
                data-testid="start-btn"
              >
                Start Claim A
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Race content ── */}
      <section className="px-4 sm:px-6 py-6">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
          {/* Claim tabs */}
          <ClaimTabs
            currentIdx={raceState.currentClaimIdx}
            completedIdx={unlockedIdx}
            onSelect={handleSelectClaim}
          />

          {/* Claim header */}
          {currentClaimState.claim ? (
            <ClaimHeader claim={currentClaimState.claim} />
          ) : (
            <div
              className="rounded-[12px] border border-[rgba(255,255,255,0.06)] bg-[#16181a] px-5 py-4 text-[#3a3d40] text-[13px]"
              data-testid="claim-waiting"
            >
              {streamClaimId ? "Loading claim…" : "Press Guided Demo or Start Claim A to begin."}
            </div>
          )}

          {/* 5-column grid (desktop) / stacked (mobile) */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
            data-testid="race-grid"
          >
            {AGENTS.map((agentId) => (
              <AgentColumn
                key={agentId}
                agentId={agentId}
                state={currentClaimState.agents[agentId]}
                isExternal={agentId === "plugboard"}
                humanQueuePosition={
                  agentId === "human" ? currentClaimState.humanQueuePosition : undefined
                }
                humanQueueEstWait={
                  agentId === "human" ? currentClaimState.humanQueueEstWait : undefined
                }
                expanded={expandedAgents[agentId]}
                onToggle={() => toggleAgent(agentId)}
              />
            ))}
          </div>

          {/* All-done status */}
          {allDone && streamClaimId && (
            <div
              className="text-center text-[13px] text-[#428619] font-mono py-4"
              data-testid="claim-complete"
            >
              ✓ Claim {currentClaimId} complete
              {!atLastClaim && !guidedRunning && (
                <span className="text-[#505a63]">, click Next claim to continue</span>
              )}
            </div>
          )}

          {/* Guided demo progress */}
          {guidedDone && (
            <div
              className="text-center text-[13px] text-[rgba(255,255,255,0.72)] py-2"
              data-testid="guided-done"
            >
              Guided demo finished. All 4 claims processed per PRD §6.7.
            </div>
          )}
        </div>
      </section>

      {/* Toast notifications */}
      <ToastList toasts={toasts} />

      {/* Responsive CSS fade-in animation (inline, no external dep) */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.25s ease forwards; }
      `}</style>
    </div>
  );
}
