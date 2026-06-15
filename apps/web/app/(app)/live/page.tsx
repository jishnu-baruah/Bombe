"use client";

/**
 * /live — "Split stage" race view, redesigned for human comprehension.
 *
 * A theater layout: ONE claim on screen at a time, auto-advancing A→D.
 *   LEFT panel  = THE CLAIM, stated as a plain-English question + the real
 *                 numbers in human terms + a words-not-enums tier chip.
 *   RIGHT panel = THE PANEL of attestors, each a row that reacts live:
 *                 Checking… → a plain result word + a colored dot + a one-line
 *                 plain reason.
 *   BELOW       = a bold verdict banner stating the outcome AND what it proves.
 *
 * The technical detail (real step trace, hashes, raw values) lives behind a
 * single "See the on-chain reasoning" expander per claim, hidden by default.
 *
 * Data flow is unchanged from the original: SSE replay via /api/stream?claim=X,
 * a useReducer event store, the A→D guided auto-advance with pauses, and the
 * five-attestor set (Reflector, Rotor, Stator, Plugboard, Human Queue).
 * AgentStepEvent / AgentDoneEvent / HUMAN_QUEUE_UPDATE are consumed exactly as
 * before — only the PRESENTATION changed.
 *
 * Client component: must NOT import the @bombe/agent-sdk barrel.
 * PRD §6.6, §6.7, DESIGN.md.
 */

import { parseEvent } from "@/lib/parseEvent";
// Import via alias, browser-safe (avoids Node-only @bombe/shared barrel). See next.config.ts.
import type { AgentDoneEvent, AgentStepEvent, ClaimPostedEvent, SseEvent } from "@bombe-events";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

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
  | { type: "set_claim"; idx: number };

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

// Panel order: SDK agents first, the external attestor, then the human.
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
// Reducer (data plumbing preserved 1:1 with the original)
// ---------------------------------------------------------------------------

function raceReducer(state: RaceState, action: RaceAction): RaceState {
  switch (action.type) {
    case "reset_claim": {
      return {
        ...state,
        claims: { ...state.claims, [action.claimId]: emptyClaimState() },
      };
    }
    case "claim_posted": {
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.claimId]: { ...state.claims[action.claimId], claim: action.event },
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
            agents: { ...cs.agents, [action.agentId]: { ...ag, done: action.event } },
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
    case "set_claim": {
      return {
        ...state,
        currentClaimIdx: Math.max(0, Math.min(action.idx, CLAIM_IDS.length - 1)),
      };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Curated plain-language story per claim (A→D teaching arc).
//
// Every number below is drawn DIRECTLY from fixtures/demo-data.json:
//   A — claim A payload (mETH, expectedBps 34, period "30d-fresh"); traces show
//       two computation paths reconciling to a 0 bps delta within ±2 bps.
//   B — claim B payload (mETH, expectedBps 34, period "30d-stale"); the value
//       matches but the single source is stale, so the panel splits.
//   C — claim C trace observations: servicer report 50,000 USD vs bank
//       statement 45,000 USD, a 5,000 USD mismatch.
//   D — claim D payload (FAIR_VALUE, estimatedValue 4,200,000 USD); Plugboard's
//       trace shows the contract revert JudgmentTierRequiresAbstain.
//
// `narration` is the short aria-live / status-strip line. No raw enums, no JSON.
// ---------------------------------------------------------------------------

type ClaimCopy = {
  question: string;
  sentences: string[];
  tierChip: string;
  narration: string;
};

const CLAIM_COPY: Record<ClaimId, ClaimCopy> = {
  A: {
    question: "Does mETH's reported yield actually check out?",
    sentences: [
      "The issuer claims mETH returned 34 basis points (0.34%) over a 30-day window.",
      "Two separate computation paths over the same ground truth both land on 34 bps, a 0 bps difference, well inside the ±2 bps tolerance.",
    ],
    tierChip: "Deterministic fact",
    narration: "Claim A: a clean yield claim. Every attestor agrees the number checks out.",
  },
  B: {
    question: "The number matches, but is the source fresh enough to trust?",
    sentences: [
      "The same mETH claim of 34 bps over a 30-day window, but this time the only feed available is stale.",
      "The figure still matches, so the panel splits on purpose: the cautious attestors hold back, the bolder one commits.",
    ],
    tierChip: "Deterministic fact",
    narration:
      "Claim B: the number matches but the source is stale. The panel disagrees by design.",
  },
  C: {
    question: "Do the two documents actually agree on the cash that moved?",
    sentences: [
      "The servicer report for pool PC-POOL-1 says 50,000 USD of cashflow for the month.",
      "The bank statement for the same month adds up to 45,000 USD, a 5,000 USD gap. The documents do not agree.",
    ],
    tierChip: "Checkable against documents",
    narration: "Claim C: the two documents disagree by 5,000 USD. Every attestor rejects it.",
  },
  D: {
    question: "Is this asset really worth 4.2 million dollars?",
    sentences: [
      "The claim asks the network to attest a fair value of 4,200,000 USD for pool PC-POOL-1.",
      "Fair value is a judgment, not a fact anyone can falsify, so it can only ever be an opinion.",
    ],
    tierChip: "Judgment, opinion only",
    narration:
      "Claim D: a judgment claim. The contract itself blocks an attestation, even from an outside attestor.",
  },
};

// ---------------------------------------------------------------------------
// Per-claim verdict banner: the outcome AND what it proves.
// ---------------------------------------------------------------------------

type VerdictTone = "valid" | "rejected" | "split" | "blocked";

type Verdict = {
  tone: VerdictTone;
  headline: string;
  proves: string;
};

const VERDICT: Record<ClaimId, Verdict> = {
  A: {
    tone: "valid",
    headline: "Attested true. The yield is real.",
    proves:
      "When the evidence is clean and reproducible, the whole panel converges on the same answer.",
  },
  B: {
    tone: "split",
    headline: "A split panel, by design. Not an error.",
    proves:
      "Bombe is a panel, not one oracle. Cautious attestors abstain on a stale source while a bolder one commits, and the disagreement is recorded in the open for anyone to weigh.",
  },
  C: {
    tone: "rejected",
    headline: "Rejected. The documents do not match.",
    proves: "A falsifiable claim that fails the check is rejected, unanimously and on the record.",
  },
  D: {
    tone: "blocked",
    headline: "The contract blocked the attestation itself.",
    proves:
      "The Bombe agents abstain on judgment. When an outside attestor we did not write tried to attest anyway, the contract reverted it. Safety lives at the contract layer, not in any one agent's good behavior.",
  },
};

// ---------------------------------------------------------------------------
// Plain-language status vocabulary (replaces JSON / raw enums).
// ---------------------------------------------------------------------------

type PlainStatus = {
  word: string;
  dot: string;
  text: string;
  glyph: string;
};

function plainStatus(done: AgentDoneEvent | null): PlainStatus | null {
  if (!done) return null;
  if (done.blockedByProtocol) {
    return { word: "Blocked", dot: "#a78bfa", text: "#c4b5fd", glyph: "⊘" };
  }
  switch (done.decision) {
    case "VALID":
      return { word: "Agrees", dot: "#86c95f", text: "#86c95f", glyph: "✓" };
    case "REJECTED":
      return { word: "Rejects", dot: "#e23b4a", text: "#f08591", glyph: "✗" };
    default:
      return { word: "Abstains", dot: "#d4a017", text: "#d4a017", glyph: "○" };
  }
}

// One-line plain-English reason per (claim, agent), grounded in the real trace.
// We never surface the raw rationaleSummary (it carries enums / the word
// "independent"); these are honest human paraphrases of the same evidence.
const AGENT_REASON: Record<ClaimId, Partial<Record<AgentId, string>>> = {
  A: {
    reflector: "Cross-checked two paths, both fresh, both say 34 bps.",
    rotor: "Oracle is fresh and the math matches. Confident yes.",
    stator: "Fresh feed shows 34 bps. Matches the claim.",
    plugboard: "Outside runtime fetched the yield and got 34 bps too.",
    human: "Reviewed the evidence and agrees.",
  },
  B: {
    reflector: "Only one source and it is stale, so it won't commit.",
    rotor: "The value matches, so it commits despite the staleness.",
    stator: "A single stale feed is too thin to stand behind.",
    plugboard: "Stale, but the number checks, so it commits.",
    human: "Not enough fresh evidence to sign off.",
  },
  C: {
    reflector: "Report says 50,000, statement says 45,000. Mismatch.",
    rotor: "The two documents disagree by 5,000 USD.",
    stator: "Cross-referenced both docs, they do not match.",
    plugboard: "Outside runtime found the same 5,000 USD gap.",
    human: "Confirmed the documents conflict.",
  },
  D: {
    reflector: "Fair value is an opinion, so it won't attest.",
    rotor: "No falsifiable fact here, so it abstains.",
    stator: "A valuation cannot be proven, so it abstains.",
    plugboard: "Tried to attest, the contract reverted it, then abstained.",
    human: "Judgment call, not something to attest.",
  },
};

// ---------------------------------------------------------------------------
// Attestor identity (name + role + kind label, plain words).
// ---------------------------------------------------------------------------

type AgentKind = "sdk" | "external" | "human";

const AGENT_META: Record<AgentId, { name: string; role: string; kind: AgentKind }> = {
  reflector: { name: "Reflector", role: "Cautious SDK agent", kind: "sdk" },
  rotor: { name: "Rotor", role: "Decisive SDK agent", kind: "sdk" },
  stator: { name: "Stator", role: "Lean SDK agent", kind: "sdk" },
  plugboard: { name: "Plugboard", role: "External attestor we did not write", kind: "external" },
  human: { name: "Human Queue", role: "A person reviewing", kind: "human" },
};

const KIND_LABEL: Record<AgentKind, string> = {
  sdk: "SDK agent",
  external: "External attestor",
  human: "Human",
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function KindChip({ kind }: { kind: AgentKind }) {
  const color =
    kind === "external" ? "#c4b5fd" : kind === "human" ? "#00c89a" : "var(--muted-foreground)";
  const bg =
    kind === "external"
      ? "rgba(124,58,237,0.12)"
      : kind === "human"
        ? "rgba(0,168,126,0.12)"
        : "rgba(255,255,255,0.06)";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] flex-shrink-0"
      style={{ color, backgroundColor: bg }}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Progress rail (Claim 1..4)
// ---------------------------------------------------------------------------

function ProgressRail({
  currentIdx,
  unlockedIdx,
  onSelect,
}: {
  currentIdx: number;
  unlockedIdx: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3" aria-label="Claim progress">
      {CLAIM_IDS.map((id, i) => {
        const isActive = i === currentIdx;
        const isUnlocked = i <= unlockedIdx;
        const reachable = i <= unlockedIdx + 1;
        return (
          <button
            key={id}
            type="button"
            disabled={!reachable}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
            className={`group flex-1 flex flex-col gap-2 text-left transition-opacity ${
              reachable ? "cursor-pointer" : "cursor-not-allowed opacity-40"
            }`}
            data-testid={`rail-step-${id}`}
          >
            <span
              className={`h-1.5 w-full rounded-full transition-colors ${
                isActive ? "bg-[#494fdf]" : isUnlocked ? "bg-white/40" : "bg-white/[0.10]"
              }`}
            />
            <span
              className={`text-[11px] font-mono uppercase tracking-[0.16em] ${
                isActive ? "text-foreground" : "text-muted-foreground/70"
              }`}
            >
              Claim {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LEFT: the claim, as a plain-English question.
// ---------------------------------------------------------------------------

function ClaimStage({ claimId, posted }: { claimId: ClaimId; posted: boolean }) {
  const copy = CLAIM_COPY[claimId];
  return (
    <div className="flex flex-col gap-7" data-testid="claim-stage">
      <div className="flex items-center gap-3">
        <span className="eyebrow">The claim</span>
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
          style={{ backgroundColor: "rgba(73,79,223,0.12)", color: "#9296f5" }}
        >
          {copy.tierChip}
        </span>
      </div>

      <h2
        className="font-display balance text-[clamp(28px,4vw,46px)] leading-[1.06] text-foreground"
        data-testid="claim-question"
      >
        {posted ? copy.question : "Loading the claim…"}
      </h2>

      {posted && (
        <div className="flex flex-col gap-4 max-w-[34rem]">
          {copy.sentences.map((s) => (
            <p key={s} className="pretty text-[17px] leading-relaxed text-muted-foreground">
              {s}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIGHT: the panel — one reactive row per attestor.
// ---------------------------------------------------------------------------

function AttestorRow({
  claimId,
  agentId,
  state,
  humanQueuePosition,
}: {
  claimId: ClaimId;
  agentId: AgentId;
  state: AgentState;
  humanQueuePosition: number | null;
}) {
  const meta = AGENT_META[agentId];
  const status = plainStatus(state.done);
  const checking = !state.done && (state.steps.length > 0 || humanQueuePosition !== null);
  const reason = state.done ? AGENT_REASON[claimId][agentId] : null;

  return (
    <div
      className="flex items-start gap-4 rounded-[16px] border border-white/[0.08] bg-[#16181a] px-5 py-4 transition-colors"
      data-testid={`attestor-row-${agentId}`}
    >
      {/* Status dot */}
      <span className="mt-1.5 flex-shrink-0" aria-hidden="true">
        {status ? (
          <span
            className="block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: status.dot }}
          />
        ) : checking ? (
          <span className="block w-2.5 h-2.5 rounded-full bg-[#494fdf] animate-pulse" />
        ) : (
          <span className="block w-2.5 h-2.5 rounded-full bg-white/15" />
        )}
      </span>

      {/* Identity + reason */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-semibold text-[15px] text-foreground">{meta.name}</span>
          <KindChip kind={meta.kind} />
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">{meta.role}</p>

        {reason && <p className="text-[14.5px] text-foreground/90 leading-snug mt-2">{reason}</p>}
      </div>

      {/* Result word */}
      <div className="flex-shrink-0 text-right min-w-[88px]" data-testid={`status-${agentId}`}>
        {status ? (
          <span
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold"
            style={{ color: status.text }}
          >
            {status.word}
            <span aria-hidden="true">{status.glyph}</span>
          </span>
        ) : checking ? (
          <span className="text-[14px] text-[#9296f5] animate-pulse">Checking…</span>
        ) : (
          <span className="text-[13px] text-muted-foreground/70">Waiting</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict banner.
// ---------------------------------------------------------------------------

const VERDICT_STYLE: Record<VerdictTone, { border: string; bg: string; accent: string }> = {
  valid: { border: "rgba(134,201,95,0.30)", bg: "rgba(134,201,95,0.06)", accent: "#86c95f" },
  rejected: { border: "rgba(226,59,74,0.30)", bg: "rgba(226,59,74,0.06)", accent: "#f08591" },
  split: { border: "rgba(73,79,223,0.32)", bg: "rgba(73,79,223,0.07)", accent: "#9296f5" },
  blocked: { border: "rgba(167,139,250,0.34)", bg: "rgba(124,58,237,0.07)", accent: "#c4b5fd" },
};

function VerdictBanner({ claimId }: { claimId: ClaimId }) {
  const v = VERDICT[claimId];
  const s = VERDICT_STYLE[v.tone];
  return (
    <div
      className="rounded-[20px] border px-7 py-7 lg:px-9 lg:py-8"
      style={{ borderColor: s.border, backgroundColor: s.bg }}
      data-testid="verdict-banner"
    >
      <span
        className="font-mono text-[11px] uppercase tracking-[0.2em]"
        style={{ color: s.accent }}
      >
        The verdict
      </span>
      <h3 className="font-display text-[clamp(22px,3vw,32px)] leading-[1.12] text-foreground mt-3 mb-3 balance">
        {v.headline}
      </h3>
      <p className="pretty text-[15.5px] leading-relaxed text-muted-foreground max-w-[52rem]">
        {v.proves}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "See the on-chain reasoning" expander (the technical detail, hidden by default).
// ---------------------------------------------------------------------------

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

function TechnicalDetail({
  claim,
  agents,
}: {
  claim: ClaimPostedEvent | null;
  agents: Record<AgentId, AgentState>;
}) {
  const [open, setOpen] = useState(false);
  if (!claim) return null;

  return (
    <div className="rounded-[16px] border border-white/[0.08] bg-[#0d0e0f]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left cursor-pointer"
        data-testid="tech-toggle"
      >
        <span className="text-[14px] font-medium text-foreground">See the on-chain reasoning</span>
        <span className="text-muted-foreground/70 text-[12px] font-mono">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="px-6 pb-6 flex flex-col gap-6 border-t border-white/[0.06] pt-5">
          {/* Raw claim payload */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mb-2">
              Claim payload
            </p>
            <pre className="text-[12px] font-mono text-[#9296f5] whitespace-pre-wrap break-all leading-relaxed">
              tier {claim.tier} · {claim.claimType} · {claim.asset}
              {"\n"}
              {JSON.stringify(claim.payload, null, 2)}
            </pre>
          </div>

          {/* Per-agent traces + hashes */}
          {AGENTS.map((agentId) => {
            const a = agents[agentId];
            if (!a.done && a.steps.length === 0) return null;
            return (
              <div key={agentId} className="border-t border-white/[0.06] pt-4">
                <p className="font-mono text-[11px] text-foreground mb-2">
                  {AGENT_META[agentId].name}
                </p>
                {a.steps.length > 0 && (
                  <ol className="flex flex-col gap-1.5 mb-3">
                    {a.steps.map((s) => (
                      <li
                        key={`${s.agentAddr}-${s.step}`}
                        className="text-[12px] text-muted-foreground"
                      >
                        <span className="text-[#9296f5] font-mono mr-1.5">#{s.step}</span>
                        {s.thought}
                      </li>
                    ))}
                  </ol>
                )}
                {a.done && (
                  <div className="flex flex-col gap-1 text-[11px] font-mono text-muted-foreground/70">
                    <span>
                      decision: <span className="text-foreground">{a.done.decision}</span>
                      {a.done.blockedByProtocol ? " (blocked by protocol)" : ""}
                    </span>
                    <span>confidence: {(a.done.confidenceBps / 100).toFixed(0)}%</span>
                    <span className="break-all">reasoningHash: {a.done.reasoningHash}</span>
                    <span>
                      {a.done.latencyMs} ms ·{" "}
                      {a.done.costUsd > 0 ? `$${a.done.costUsd.toFixed(4)}` : "no model cost"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            This is a recorded walkthrough, replayed so you can follow each behavior end to end. The
            verdict is computed from the evidence; the model only narrates. The hashes shown here
            are from the demo trace. For live attestations you can re-derive and check on-chain
            yourself, use the Verify page with a real claim id.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSE hook for a single claim replay (unchanged behavior).
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
  const [guidedRunning, setGuidedRunning] = useState(false);
  const [guidedDone, setGuidedDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [streamClaimId, setStreamClaimId] = useState<ClaimId | null>(null);
  const [unlockedIdx, setUnlockedIdx] = useState(0);
  const [statusLine, setStatusLine] = useState<string>("");

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Keep the active claim in view: when the walkthrough starts or advances to a
  // new claim, scroll the split stage into view so the viewer never sits on the
  // header while the panel reacts below the fold. scroll-mt clears the fixed nav.
  const stageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (streamClaimId === null) return;
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [streamClaimId]);

  const currentClaimId = CLAIM_IDS[raceState.currentClaimIdx] as ClaimId;
  const currentClaimState = raceState.claims[currentClaimId];

  // ---- SSE event handler (unchanged routing) -------------------------------

  const handleSseEvent = useCallback((event: SseEvent) => {
    const claimId = "claimId" in event ? (event.claimId as ClaimId) : null;
    if (!claimId) return;

    if (event.kind === "CLAIM_POSTED") {
      dispatch({ type: "claim_posted", event, claimId });
    } else if (event.kind === "AGENT_STEP") {
      const agentId = ADDR_TO_AGENT[event.agentAddr];
      if (agentId) dispatch({ type: "agent_step", event, claimId, agentId });
    } else if (event.kind === "AGENT_DONE") {
      const agentId = ADDR_TO_AGENT[event.agentAddr];
      if (agentId) dispatch({ type: "agent_done", event, claimId, agentId });
    } else if (event.kind === "HUMAN_QUEUE_UPDATE") {
      dispatch({
        type: "human_queue",
        claimId,
        position: event.position,
        estWait: event.estimatedWaitMin,
      });
    }
  }, []);

  useClaimStream(streamClaimId, handleSseEvent);

  // ---- Start a single claim stream -----------------------------------------

  const startClaim = useCallback((idx: number) => {
    const id = CLAIM_IDS[idx] as ClaimId;
    dispatch({ type: "reset_claim", claimId: id });
    dispatch({ type: "set_claim", idx });
    setStreamClaimId(id);
    setStatusLine(CLAIM_COPY[id].narration);
  }, []);

  // ---- Guided demo: auto-advance A→D with pauses (pausable) -----------------

  const runGuidedDemo = useCallback(async () => {
    setGuidedRunning(true);
    setGuidedDone(false);
    setPaused(false);

    for (let i = 0; i < CLAIM_IDS.length; i++) {
      setUnlockedIdx((prev) => Math.max(prev, i));
      startClaim(i);

      // Wait ~10s per claim so a viewer can read the question, watch the panel
      // react, and absorb the verdict before it advances. Honors pause without skipping.
      let waited = 0;
      const tick = 250;
      const target = 10000;
      while (waited < target || pausedRef.current) {
        await new Promise<void>((resolve) => setTimeout(resolve, tick));
        if (!pausedRef.current) waited += tick;
      }
    }

    setGuidedRunning(false);
    setGuidedDone(true);
    setStatusLine("Walkthrough complete. All four claims A through D have been judged.");
  }, [startClaim]);

  // ---- Manual controls -----------------------------------------------------

  function handleNextClaim() {
    const nextIdx = raceState.currentClaimIdx + 1;
    if (nextIdx >= CLAIM_IDS.length) return;
    setUnlockedIdx((prev) => Math.max(prev, nextIdx));
    startClaim(nextIdx);
  }

  function handlePrevClaim() {
    const prevIdx = raceState.currentClaimIdx - 1;
    if (prevIdx < 0) return;
    startClaim(prevIdx);
  }

  function handleSelectClaim(idx: number) {
    if (idx > unlockedIdx + 1) return;
    setUnlockedIdx((prev) => Math.max(prev, idx));
    startClaim(idx);
  }

  // ---- Derived -------------------------------------------------------------

  const claimPosted = currentClaimState.claim !== null;
  const allDone = AGENTS.every((a) => currentClaimState.agents[a].done !== null);
  const atFirstClaim = raceState.currentClaimIdx <= 0;
  const atLastClaim = raceState.currentClaimIdx >= CLAIM_IDS.length - 1;
  const started = streamClaimId !== null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header band ── */}
      <section className="hero-ambient relative px-6 lg:px-12 pt-12 lg:pt-16 pb-8 border-b border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-7">
          <div>
            <span className="eyebrow block mb-5">Bombe · Live walkthrough</span>
            <h1 className="font-display balance text-[clamp(34px,5.5vw,54px)] leading-[1.02] text-foreground mb-4">
              Watch a panel judge a claim.
            </h1>
            <p className="pretty text-base text-muted-foreground max-w-2xl leading-relaxed">
              Four claims, one at a time. For each, a panel of attestors decides whether it holds
              up, and you see exactly why. No jargon required.
            </p>
          </div>

          {/* Progress rail */}
          <ProgressRail
            currentIdx={raceState.currentClaimIdx}
            unlockedIdx={unlockedIdx}
            onSelect={handleSelectClaim}
          />

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={() => {
                  void runGuidedDemo();
                }}
                className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-black text-base font-medium transition-all duration-150 hover:bg-white/90 active:scale-[0.98] cursor-pointer"
                data-testid="start-btn"
              >
                Start the walkthrough →
              </button>
            ) : (
              <>
                {guidedRunning ? (
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-black text-base font-medium transition-all duration-150 hover:bg-white/90 active:scale-[0.98] cursor-pointer"
                    data-testid="pause-btn"
                  >
                    {paused ? "Resume" : "Pause"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void runGuidedDemo();
                    }}
                    className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-black text-base font-medium transition-all duration-150 hover:bg-white/90 active:scale-[0.98] cursor-pointer"
                    data-testid="guided-demo-btn"
                  >
                    {guidedDone ? "Replay walkthrough" : "Auto-play A→D"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrevClaim}
                  disabled={atFirstClaim || guidedRunning}
                  className="inline-flex items-center justify-center h-12 px-6 rounded-full border border-white/40 text-base text-foreground transition-all duration-150 hover:border-white/70 hover:bg-foreground/[0.04] active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="prev-claim-btn"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleNextClaim}
                  disabled={atLastClaim || guidedRunning}
                  className="inline-flex items-center justify-center h-12 px-6 rounded-full border border-white/40 text-base text-foreground transition-all duration-150 hover:border-white/70 hover:bg-foreground/[0.04] active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="next-claim-btn"
                >
                  Next claim →
                </button>
              </>
            )}
          </div>

          {/* Status line (announced for screen readers) */}
          <p
            aria-live="polite"
            className="text-[13px] text-muted-foreground/70 min-h-[1.2em]"
            data-testid="status-line"
          >
            {statusLine}
          </p>
        </div>
      </section>

      {/* ── Split stage ── */}
      <section ref={stageRef} className="scroll-mt-28 px-6 lg:px-12 py-10 lg:py-14">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-8">
          {!started ? (
            <div
              className="rounded-[20px] border border-white/[0.08] bg-[#16181a] px-8 py-16 text-center"
              data-testid="idle-prompt"
            >
              <p className="text-muted-foreground text-[16px]">
                Press <span className="text-foreground">Start the walkthrough</span> to watch the
                panel judge the first claim.
              </p>
              <p className="text-muted-foreground/70 text-[14px] mt-4 max-w-xl mx-auto leading-relaxed">
                You will see four claims judged in turn: a clean yes, a split panel, a rejection,
                and a claim the contract refused to let anyone attest.
              </p>
            </div>
          ) : (
            <>
              <div className="grid lg:grid-cols-[1fr_1.05fr] gap-8 lg:gap-12 items-start">
                {/* LEFT: the claim */}
                <div className="lg:sticky lg:top-10">
                  <ClaimStage claimId={currentClaimId} posted={claimPosted} />
                </div>

                {/* RIGHT: the panel */}
                <div className="flex flex-col gap-4" data-testid="the-panel">
                  <span className="eyebrow block">The panel</span>
                  {AGENTS.map((agentId) => (
                    <AttestorRow
                      key={agentId}
                      claimId={currentClaimId}
                      agentId={agentId}
                      state={currentClaimState.agents[agentId]}
                      humanQueuePosition={
                        agentId === "human" ? currentClaimState.humanQueuePosition : null
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Verdict banner — appears once the panel has finished */}
              {allDone && <VerdictBanner claimId={currentClaimId} />}

              {/* On-chain reasoning expander */}
              <TechnicalDetail claim={currentClaimState.claim} agents={currentClaimState.agents} />

              {/* End-of-walkthrough note */}
              {guidedDone && atLastClaim && (
                <p
                  className="text-center text-[14px] text-muted-foreground py-2"
                  data-testid="guided-done"
                >
                  That is the whole arc: a clean yes, a split panel, a rejection, and a claim the
                  contract refused to let anyone attest.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
