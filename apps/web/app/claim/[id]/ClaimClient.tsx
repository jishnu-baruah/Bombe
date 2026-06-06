"use client";

/**
 * ClaimClient.tsx, Client rendering component for /claim/[id].
 *
 * Receives pre-fetched claim + attestation data as props from the server
 * page wrapper (app/claim/[id]/page.tsx). Handles interactive tabs,
 * step rendering, and verify-hash button.
 *
 * Extracted from page.tsx by T-J04 (live data wiring). Data shapes unchanged.
 *
 * Original: T-605
 */

import { ExplorerLink } from "@/components/ExplorerLink";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Mono } from "@/components/ui/Mono";
import {
  ALL_AGENT_IDS,
  type AgentId,
  type AttestationRecord,
  type StoredTrace,
  type TraceStep,
  getTrace,
} from "@/lib/demo-data";
import { verifyTraceHash } from "@/lib/verify-hash";
import type { Claim } from "@bombe/shared";
import Link from "next/link";
import { useState } from "react";
// Note: `use` removed, params are now pre-resolved by the server wrapper (page.tsx)

// ---------------------------------------------------------------------------
// Tier badge
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: number }) {
  const v = tier === 1 ? "tier-1" : tier === 2 ? "tier-2" : "tier-3";
  const label =
    tier === 1 ? "Tier 1 · Deterministic" : tier === 2 ? "Tier 2 · Document" : "Tier 3 · Judgment";
  return <Badge variant={v} label={label} />;
}

// ---------------------------------------------------------------------------
// Decision chip, handles BLOCKED BY PROTOCOL
// ---------------------------------------------------------------------------

function DecisionChip({
  decision,
  blockedByProtocol,
}: {
  decision: "VALID" | "REJECTED" | "ABSTAIN";
  blockedByProtocol?: boolean;
}) {
  if (blockedByProtocol) {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge variant="BLOCKED_BY_PROTOCOL" />
        <span className="text-[#8d969e] text-[13px]">then resubmitted as</span>
        <Badge variant="ABSTAIN" />
      </span>
    );
  }
  return <Badge variant={decision} />;
}

// ---------------------------------------------------------------------------
// Step renderer
// ---------------------------------------------------------------------------

function ActionBlock({ action }: { action: unknown }) {
  if (action === null || action === undefined) return null;

  if (typeof action === "object") {
    const a = action as Record<string, unknown>;
    if ("finalize" in a) {
      const fin = a.finalize as Record<string, unknown>;
      const d = String(fin.decision ?? "ABSTAIN") as "VALID" | "REJECTED" | "ABSTAIN";
      return (
        <div className="rounded-[12px] bg-[#0a0a0a] border border-[rgba(255,255,255,0.06)] p-3">
          <p className="text-[#8d969e] text-[12px] uppercase tracking-[0.24px] mb-2">Finalize</p>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={d} />
            <span className="font-mono text-[13px] text-[#8d969e]">
              {String(fin.confidenceBps ?? "")} bps
            </span>
          </div>
          <p className="text-[rgba(255,255,255,0.72)] text-[14px] leading-[1.43]">
            {String(fin.rationaleSummary ?? "")}
          </p>
        </div>
      );
    }
    if ("tool" in a) {
      return (
        <div className="rounded-[12px] bg-[#0a0a0a] border border-[rgba(255,255,255,0.06)] p-3">
          <p className="text-[#8d969e] text-[12px] uppercase tracking-[0.24px] mb-1">Tool Call</p>
          <span className="font-mono text-[13px] text-[#494fdf]">{String(a.tool)}</span>
          <pre className="mt-2 text-[12px] text-[#8d969e] whitespace-pre-wrap break-all font-mono leading-[1.4]">
            {JSON.stringify(a.input, null, 2)}
          </pre>
        </div>
      );
    }
  }

  return (
    <pre className="text-[12px] text-[#8d969e] font-mono whitespace-pre-wrap break-all">
      {JSON.stringify(action, null, 2)}
    </pre>
  );
}

function ObservationBlock({ obs }: { obs: unknown }) {
  if (obs === null || obs === undefined) return null;

  if (typeof obs === "object") {
    const o = obs as Record<string, unknown>;
    if ("contractRevert" in o) {
      return (
        <div className="rounded-[12px] bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] p-3">
          <p className="text-[#7c3aed] text-[12px] font-semibold uppercase mb-1">Contract Revert</p>
          <p className="font-mono text-[13px] text-[#c9c9cd]">{String(o.error ?? "")}</p>
          <p className="text-[rgba(255,255,255,0.72)] text-[13px] mt-1">
            {String(o.message ?? "")}
          </p>
        </div>
      );
    }
    if ("error" in o) {
      return (
        <div className="rounded-[12px] bg-[rgba(226,59,74,0.08)] border border-[rgba(226,59,74,0.2)] p-3">
          <p className="text-[#e23b4a] text-[12px] font-semibold uppercase mb-1">Error</p>
          <p className="font-mono text-[13px] text-[#c9c9cd]">{String(o.error)}</p>
          {o.reason !== undefined && (
            <p className="text-[rgba(255,255,255,0.72)] text-[13px] mt-1">{String(o.reason)}</p>
          )}
        </div>
      );
    }
  }

  return (
    <pre className="text-[12px] text-[#8d969e] font-mono whitespace-pre-wrap break-all rounded-[8px] bg-[#0a0a0a] p-3">
      {JSON.stringify(obs, null, 2)}
    </pre>
  );
}

function StepCard({ step, index }: { step: TraceStep; index: number }) {
  return (
    <div className="border-l-2 border-[rgba(255,255,255,0.12)] pl-4 py-2">
      <p className="text-[#8d969e] text-[12px] font-mono uppercase mb-2">Step {index}</p>
      {/* Thought */}
      <div className="mb-3">
        <p className="text-[11px] text-[#505a63] uppercase tracking-[0.24px] mb-1">Thought</p>
        <p className="text-[rgba(255,255,255,0.72)] text-[14px] leading-[1.43] italic">
          &ldquo;{step.thought}&rdquo;
        </p>
      </div>
      {/* Action */}
      <div className="mb-3">
        <p className="text-[11px] text-[#505a63] uppercase tracking-[0.24px] mb-1">Action</p>
        <ActionBlock action={step.action} />
      </div>
      {/* Observation */}
      {step.observation !== null && step.observation !== undefined && (
        <div>
          <p className="text-[11px] text-[#505a63] uppercase tracking-[0.24px] mb-1">Observation</p>
          <ObservationBlock obs={step.observation} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision block
// ---------------------------------------------------------------------------

function DecisionBlock({
  attestation,
  trace,
}: {
  attestation: AttestationRecord;
  trace: StoredTrace;
}) {
  return (
    <Card variant="feature-dark" className="p-6 mt-6">
      <p className="text-[#8d969e] text-[12px] uppercase tracking-[0.24px] mb-4">Final Decision</p>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <DecisionChip
          decision={trace.final.decision}
          blockedByProtocol={attestation.blockedByProtocol}
        />
        <span className="font-mono text-[14px] text-[#8d969e]">
          {trace.final.confidenceBps} bps confidence
        </span>
      </div>
      <p className="text-[rgba(255,255,255,0.72)] text-[15px] leading-[1.5] mb-4">
        {trace.final.rationaleSummary}
      </p>
      {trace.final.reasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trace.final.reasons.map((r) => (
            <span
              key={r}
              className="font-mono text-[12px] text-[#b09000] bg-[rgba(176,144,0,0.08)] px-2 py-1 rounded-[8px]"
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// On-chain record block
// ---------------------------------------------------------------------------

function OnChainRecord({
  attestation,
  trace,
}: {
  attestation: AttestationRecord;
  trace: StoredTrace;
}) {
  return (
    <Card variant="feature-dark" className="p-6 mt-4">
      <p className="text-[#8d969e] text-[12px] uppercase tracking-[0.24px] mb-4">On-Chain Record</p>
      <div className="space-y-3">
        <div>
          <p className="text-[#505a63] text-[12px] mb-1">reasoningHash</p>
          <Mono value={attestation.reasoningHash} truncate truncateChars={10} />
        </div>
        <div>
          <p className="text-[#505a63] text-[12px] mb-1">sourcesHash</p>
          <Mono value={attestation.sourcesHash} truncate truncateChars={10} />
        </div>
        <div>
          <p className="text-[#505a63] text-[12px] mb-1">traceURI</p>
          <Mono value={attestation.traceURI} />
        </div>
        <div>
          <p className="text-[#505a63] text-[12px] mb-1">txHash</p>
          <ExplorerLink type="tx" value={attestation.txHash} />
        </div>
        {attestation.skillHash !== null && (
          <div>
            <p className="text-[#505a63] text-[12px] mb-1">
              skill_hash <span className="text-[#3a3d40] text-[11px]">(epoch-0)</span>
            </p>
            <Mono value={attestation.skillHash} truncate truncateChars={10} />
          </div>
        )}
      </div>
      {/* Epoch-snapshot diff placeholder for Plugboard */}
      {attestation.agentId === "plugboard" && attestation.skillHash !== null && (
        <div className="mt-4 rounded-[12px] border border-[rgba(255,255,255,0.06)] bg-[#0a0a0a] p-4">
          <p className="text-[#8d969e] text-[12px] uppercase tracking-[0.24px] mb-2">
            Epoch Snapshot Diff
          </p>
          <p className="text-[#505a63] text-[13px] italic">
            Epoch snapshot diff not yet available. skill_hash above is the current epoch-0 anchor.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Verify-hash button
// ---------------------------------------------------------------------------

type VerifyState = "idle" | "match" | "mismatch";

function VerifyHashButton({ trace }: { trace: StoredTrace }) {
  const [state, setState] = useState<VerifyState>("idle");

  function handleVerify() {
    const result = verifyTraceHash(trace);
    setState(result);
  }

  return (
    <div className="flex items-center gap-3 mt-4">
      <button
        type="button"
        onClick={handleVerify}
        className="inline-flex items-center gap-2 bg-[#16181a] border border-[rgba(255,255,255,0.12)] text-[#ffffff] text-[14px] font-semibold px-4 py-2 rounded-full hover:bg-[#1f2226] transition-colors cursor-pointer"
      >
        <span>Verify Hash</span>
        <span className="font-mono text-[12px] text-[#8d969e]">
          keccak256(canonicalJson(trace))
        </span>
      </button>
      {state === "match" && (
        <span className="text-[#428619] font-semibold text-[14px] flex items-center gap-1">
          ✓ match
        </span>
      )}
      {state === "mismatch" && (
        <span className="text-[#e23b4a] font-semibold text-[14px] flex items-center gap-1">
          ✗ mismatch
        </span>
      )}
      {state !== "idle" && (
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-[#505a63] text-[12px] hover:text-[#8d969e] cursor-pointer"
        >
          reset
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent tab panel
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<AgentId, string> = {
  reflector: "Reflector",
  rotor: "Rotor",
  stator: "Stator",
  plugboard: "Plugboard",
  human: "Human",
};

function AgentPanel({
  agentId,
  claimId,
  attestations,
}: {
  agentId: AgentId;
  claimId: string;
  attestations: AttestationRecord[];
}) {
  const trace = getTrace(claimId, agentId);
  const attestation = attestations.find((a) => a.agentId === agentId);

  if (!trace || !attestation) {
    return (
      <div className="py-8 text-[#505a63] text-[14px]">
        No trace data available for {agentId} on claim {claimId}.
      </div>
    );
  }

  return (
    <div>
      {/* Step list */}
      {trace.steps.length > 0 ? (
        <div className="space-y-4 mb-6">
          {(trace.steps as TraceStep[]).map((step, i) => (
            <StepCard key={`step-${i}-${step.thought.slice(0, 16)}`} step={step} index={i} />
          ))}
        </div>
      ) : (
        <div className="py-4 text-[#505a63] text-[14px]">
          {agentId === "human"
            ? "Human decisions do not have trace steps."
            : "No trace steps recorded (agent abstained immediately or had empty script)."}
        </div>
      )}

      {/* Decision block */}
      <DecisionBlock attestation={attestation} trace={trace} />

      {/* On-chain record */}
      <OnChainRecord attestation={attestation} trace={trace} />

      {/* Verify-hash button (PRD §14.4) */}
      <VerifyHashButton trace={trace} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent tabs
// ---------------------------------------------------------------------------

function AgentTabs({
  claimId,
  attestations,
}: {
  claimId: string;
  attestations: AttestationRecord[];
}) {
  const [activeAgent, setActiveAgent] = useState<AgentId>(ALL_AGENT_IDS[0]);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-[rgba(255,255,255,0.06)] pb-4">
        {ALL_AGENT_IDS.map((agentId) => {
          const att = attestations.find((a) => a.agentId === agentId);
          const isActive = activeAgent === agentId;
          const decision = att?.decision;

          return (
            <button
              key={agentId}
              type="button"
              onClick={() => setActiveAgent(agentId)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-semibold transition-colors cursor-pointer ${
                isActive
                  ? "bg-[#494fdf] text-[#ffffff]"
                  : "bg-[#16181a] text-[#8d969e] hover:text-[#ffffff] hover:bg-[#1f2226]"
              }`}
            >
              {AGENT_LABELS[agentId]}
              {decision !== undefined && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      decision === "VALID"
                        ? "#428619"
                        : decision === "REJECTED"
                          ? "#e23b4a"
                          : decision === "ABSTAIN"
                            ? "#b09000"
                            : "#8d969e",
                  }}
                  aria-label={decision}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <AgentPanel agentId={activeAgent} claimId={claimId} attestations={attestations} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claim header
// ---------------------------------------------------------------------------

function ClaimHeader({ id, claim }: { id: string; claim: Claim | undefined }) {
  if (!claim) {
    return (
      <div className="px-6 py-[88px]">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#e23b4a] text-[16px]">Claim &ldquo;{id}&rdquo; not found.</p>
          <Link href="/leaderboard" className="text-[#376cd5] hover:underline mt-4 block">
            ← Back to Leaderboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="px-6 py-[88px] border-b border-[rgba(255,255,255,0.06)]">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/leaderboard"
          className="text-[#505a63] hover:text-[#ffffff] text-[14px] mb-6 block transition-colors"
        >
          ← Leaderboard
        </Link>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="font-mono text-[#494fdf] text-[14px]">Claim</span>
          <h1 className="text-[48px] sm:text-[80px] font-semibold leading-[1.0] tracking-[-0.48px]">
            {claim.id}
          </h1>
          <TierBadge tier={claim.tier} />
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-[14px]">
          <span className="text-[#8d969e]">
            Asset: <span className="text-[#ffffff] font-semibold">{claim.asset}</span>
          </span>
          <span className="text-[#8d969e]">
            Type: <span className="text-[#ffffff] font-mono text-[13px]">{claim.claimType}</span>
          </span>
          <span className="text-[#8d969e]">
            Submitter: <Mono value={String(claim.submitter)} truncate truncateChars={6} showCopy />
          </span>
        </div>
        {/* Payload */}
        <div className="mt-4">
          <p className="text-[#505a63] text-[12px] uppercase tracking-[0.24px] mb-2">Payload</p>
          <pre className="font-mono text-[13px] text-[#8d969e] bg-[#16181a] rounded-[12px] p-4 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(claim.payload, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClaimPage({
  id,
  claim,
  attestations,
}: {
  id: string;
  claim: import("@bombe/shared").Claim | undefined;
  attestations: AttestationRecord[];
}) {
  return (
    <div className="min-h-screen bg-[#000000] text-[#ffffff]">
      <ClaimHeader id={id} claim={claim} />

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {attestations.length === 0 ? (
            <div className="text-[#505a63] text-[16px] py-8">
              No attestations found for claim &ldquo;{id}&rdquo;.
            </div>
          ) : (
            <AgentTabs claimId={id} attestations={attestations} />
          )}
        </div>
      </section>
    </div>
  );
}
