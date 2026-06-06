"use client";
/**
 * /operator, Operator Console
 *
 * Gated by an OPERATOR_KEY stored in localStorage. Shows a key entry form
 * when no key is present; once entered, renders the full operator console
 * with forms for every operator API endpoint.
 *
 * PRD §6.6, /operator page; §9, operator-key gating.
 * DESIGN.md, dark canvas, surface-elevated cards, pill buttons.
 */

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Decision = "VALID" | "REJECTED" | "ABSTAIN";
type ClaimType =
  | "YIELD_BPS"
  | "DISTRIBUTION_PAID"
  | "CASHFLOW_MATCH"
  | "ENCUMBRANCE_ABSENT"
  | "FAIR_VALUE";

interface AckResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function callOperatorApi(
  operatorKey: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<AckResult> {
  const res = await fetch(`/api/operator/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-operator-key": operatorKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as AckResult;
  return data;
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="feature-dark" className="mb-6">
      <h2 className="text-[20px] font-semibold leading-[1.4] mb-4 text-[#ffffff]">{title}</h2>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Field + feedback helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps generic children which include the control */}
      <label className="block text-[13px] text-[rgba(255,255,255,0.72)] mb-1">
        {label}
        <div className="mt-1">{children}</div>
      </label>
    </div>
  );
}

const INPUT_CLS =
  "w-full bg-[#0a0a0a] text-[#ffffff] border border-[rgba(255,255,255,0.12)] rounded-[12px] px-4 py-[14px] text-[16px] leading-[1.5] tracking-[0.24px] focus:outline-none focus:border-[#494fdf] placeholder:text-[rgba(255,255,255,0.30)] h-14";

const SELECT_CLS =
  "w-full bg-[#0a0a0a] text-[#ffffff] border border-[rgba(255,255,255,0.12)] rounded-[12px] px-4 py-[14px] text-[16px] leading-[1.5] h-14 focus:outline-none focus:border-[#494fdf]";

function AckBox({ result }: { result: AckResult | null }) {
  if (result === null) return null;
  const isOk = result.ok === true;
  return (
    <div
      className={`mt-3 p-3 rounded-[12px] text-[13px] font-mono break-all ${
        isOk
          ? "bg-[rgba(0,168,126,0.12)] text-[#00a87e] border border-[rgba(0,168,126,0.24)]"
          : "bg-[rgba(226,59,74,0.12)] text-[#e23b4a] border border-[rgba(226,59,74,0.24)]"
      }`}
    >
      {JSON.stringify(result, null, 2)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seed Claim Form
// ---------------------------------------------------------------------------

function SeedClaimForm({ operatorKey }: { operatorKey: string }) {
  const [claimId, setClaimId] = useState("A");
  const [claimType, setClaimType] = useState<ClaimType>("YIELD_BPS");
  const [asset, setAsset] = useState("mETH");
  const [payloadRaw, setPayloadRaw] = useState('{"yieldBps": 450}');
  const [result, setResult] = useState<AckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      setResult({ ok: false, error: "Invalid JSON in payload field" });
      setLoading(false);
      return;
    }
    const ack = await callOperatorApi(operatorKey, "seed-claim", {
      claimId,
      claimType,
      asset,
      payload,
    });
    setResult(ack);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Claim ID">
          <input
            className={INPUT_CLS}
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            placeholder="A"
            required
          />
        </Field>
        <Field label="Claim Type">
          <select
            className={SELECT_CLS}
            value={claimType}
            onChange={(e) => setClaimType(e.target.value as ClaimType)}
          >
            <option value="YIELD_BPS">YIELD_BPS</option>
            <option value="DISTRIBUTION_PAID">DISTRIBUTION_PAID</option>
            <option value="CASHFLOW_MATCH">CASHFLOW_MATCH</option>
            <option value="ENCUMBRANCE_ABSENT">ENCUMBRANCE_ABSENT</option>
            <option value="FAIR_VALUE">FAIR_VALUE</option>
          </select>
        </Field>
        <Field label="Asset">
          <input
            className={INPUT_CLS}
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="mETH"
            required
          />
        </Field>
        <Field label="Payload (JSON)">
          <input
            className={INPUT_CLS}
            value={payloadRaw}
            onChange={(e) => setPayloadRaw(e.target.value)}
            placeholder='{"yieldBps": 450}'
            required
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={loading} className="mt-2">
        {loading ? "Seeding…" : "Seed Claim"}
      </Button>
      <AckBox result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Advance Form
// ---------------------------------------------------------------------------

function AdvanceForm({ operatorKey }: { operatorKey: string }) {
  const [result, setResult] = useState<AckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const ack = await callOperatorApi(operatorKey, "advance");
    setResult(ack);
    setLoading(false);
  };

  return (
    <div>
      <p className="text-[14px] text-[rgba(255,255,255,0.72)] mb-3">
        Advances the demo state machine to the next claim in the A→D sequence.
      </p>
      <Button variant="primary" onClick={handleClick} disabled={loading}>
        {loading ? "Advancing…" : "Advance Demo"}
      </Button>
      <AckBox result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settle Form
// ---------------------------------------------------------------------------

function SettleForm({ operatorKey }: { operatorKey: string }) {
  const [claimId, setClaimId] = useState("A");
  const [groundTruth, setGroundTruth] = useState<Decision>("VALID");
  const [result, setResult] = useState<AckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ack = await callOperatorApi(operatorKey, "settle", { claimId, groundTruth });
    setResult(ack);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Claim ID">
          <input
            className={INPUT_CLS}
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            placeholder="A"
            required
          />
        </Field>
        <Field label="Ground Truth">
          <select
            className={SELECT_CLS}
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value as Decision)}
          >
            <option value="VALID">VALID</option>
            <option value="REJECTED">REJECTED</option>
            <option value="ABSTAIN">ABSTAIN</option>
          </select>
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={loading} className="mt-2">
        {loading ? "Settling…" : "Settle Claim"}
      </Button>
      <AckBox result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Register Agent Form
// ---------------------------------------------------------------------------

function RegisterAgentForm({ operatorKey }: { operatorKey: string }) {
  const [name, setName] = useState("");
  const [model, setModel] = useState("claude-3-5-sonnet");
  const [isHuman, setIsHuman] = useState(false);
  const [bondWei, setBondWei] = useState("1000000000000000000");
  const [result, setResult] = useState<AckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ack = await callOperatorApi(operatorKey, "register-agent", {
      name,
      model,
      isHuman,
      bondWei,
    });
    setResult(ack);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Agent Name">
          <input
            className={INPUT_CLS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-agent"
            required
          />
        </Field>
        <Field label="Model">
          <input
            className={INPUT_CLS}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="claude-3-5-sonnet"
            required
          />
        </Field>
        <Field label="Bond (Wei)">
          <input
            className={INPUT_CLS}
            value={bondWei}
            onChange={(e) => setBondWei(e.target.value)}
            placeholder="1000000000000000000"
            required
          />
        </Field>
        <Field label="Human Attestor?">
          <div className="flex items-center h-14 gap-3">
            <input
              type="checkbox"
              id="isHuman"
              checked={isHuman}
              onChange={(e) => setIsHuman(e.target.checked)}
              className="w-4 h-4 accent-[#494fdf]"
            />
            <label htmlFor="isHuman" className="text-[16px] text-[rgba(255,255,255,0.72)]">
              Register as human attestor
            </label>
          </div>
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={loading} className="mt-2">
        {loading ? "Registering…" : "Register Agent"}
      </Button>
      <AckBox result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Human Attest Form
// ---------------------------------------------------------------------------

function HumanAttestForm({ operatorKey }: { operatorKey: string }) {
  const [claimId, setClaimId] = useState("A");
  const [decision, setDecision] = useState<Decision>("VALID");
  const [confidenceBps, setConfidenceBps] = useState("8500");
  const [result, setResult] = useState<AckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const bps = Number.parseInt(confidenceBps, 10);
    const ack = await callOperatorApi(operatorKey, "human-attest", {
      claimId,
      decision,
      confidenceBps: bps,
    });
    setResult(ack);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className="text-[14px] text-[rgba(255,255,255,0.72)] mb-3">
        Submit a human attestation. Confidence 0–10000 bps (100% = 10000).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Claim ID">
          <select
            className={SELECT_CLS}
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
          >
            <option value="A">A, YIELD_BPS (clean)</option>
            <option value="B">B, YIELD_BPS (stale)</option>
            <option value="C">C, CASHFLOW_MATCH (mismatch)</option>
            <option value="D">D, FAIR_VALUE (judgment)</option>
          </select>
        </Field>
        <Field label="Decision">
          <select
            className={SELECT_CLS}
            value={decision}
            onChange={(e) => setDecision(e.target.value as Decision)}
          >
            <option value="VALID">VALID</option>
            <option value="REJECTED">REJECTED</option>
            <option value="ABSTAIN">ABSTAIN</option>
          </select>
        </Field>
        <Field label="Confidence (bps, 0–10000)">
          <input
            className={INPUT_CLS}
            type="number"
            min="0"
            max="10000"
            value={confidenceBps}
            onChange={(e) => setConfidenceBps(e.target.value)}
            required
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={loading} className="mt-2">
        {loading ? "Attesting…" : "Attest as Human"}
      </Button>
      <AckBox result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Plugboard Control
// ---------------------------------------------------------------------------

function PlugboardControl({ operatorKey }: { operatorKey: string }) {
  const [freezeResult, setFreezeResult] = useState<AckResult | null>(null);
  const [unfreezeResult, setUnfreezeResult] = useState<AckResult | null>(null);
  const [loading, setLoading] = useState<"freeze" | "unfreeze" | null>(null);

  const handleFreeze = async () => {
    setLoading("freeze");
    const ack = await callOperatorApi(operatorKey, "freeze-plugboard");
    setFreezeResult(ack);
    setLoading(null);
  };

  const handleUnfreeze = async () => {
    setLoading("unfreeze");
    const ack = await callOperatorApi(operatorKey, "unfreeze-plugboard");
    setUnfreezeResult(ack);
    setLoading(null);
  };

  return (
    <div>
      <p className="text-[14px] text-[rgba(255,255,255,0.72)] mb-4">
        Freeze snapshots the Plugboard skill file and blocks further writes until unfrozen. Used
        before epoch settlement to pin the active skill hash.
      </p>
      <div className="flex gap-3 flex-wrap">
        <Button variant="outline-dark" onClick={handleFreeze} disabled={loading !== null}>
          {loading === "freeze" ? "Freezing…" : "Freeze Plugboard"}
        </Button>
        <Button variant="outline-dark" onClick={handleUnfreeze} disabled={loading !== null}>
          {loading === "unfreeze" ? "Unfreezing…" : "Unfreeze Plugboard"}
        </Button>
      </div>
      <AckBox result={freezeResult} />
      <AckBox result={unfreezeResult} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key Entry Gate
// ---------------------------------------------------------------------------

function KeyEntry({ onKey }: { onKey: (key: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim().length === 0) {
      setError("Key cannot be empty.");
      return;
    }
    onKey(value.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-[28rem]">
        <p className="text-[#8d969e] text-[13px] font-mono mb-4 text-center">
          /operator, access control
        </p>
        <h1 className="text-[40px] font-semibold leading-[1.2] tracking-[-0.4px] text-center mb-2">
          Operator Console
        </h1>
        <p className="text-[rgba(255,255,255,0.72)] text-[16px] text-center mb-8">
          Enter your operator key to continue.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className={INPUT_CLS}
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="Operator key"
            autoComplete="current-password"
          />
          {error && <p className="text-[#e23b4a] text-[13px] mt-2">{error}</p>}
          <Button type="submit" variant="primary" className="w-full mt-4">
            Unlock Console
          </Button>
        </form>
        <p className="text-[#8d969e] text-[13px] mt-6 text-center">
          Default in mock mode:{" "}
          <span className="font-mono text-[rgba(255,255,255,0.72)]">dev-operator</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STORAGE_KEY = "bombe-operator-key";

export default function OperatorPage() {
  const [operatorKey, setOperatorKey] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setOperatorKey(stored);
  }, []);

  const handleKey = (key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setOperatorKey(key);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setOperatorKey(null);
  };

  // Avoid hydration mismatch, only render gated content after mount
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-[rgba(255,255,255,0.30)] text-[14px]">Loading…</span>
      </div>
    );
  }

  if (operatorKey === null) {
    return <KeyEntry onKey={handleKey} />;
  }

  return (
    <div className="min-h-screen px-6 py-[88px]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <p className="text-[#8d969e] text-[13px] font-mono mb-2">/operator</p>
            <h1 className="text-[48px] font-semibold leading-[1.21] tracking-[-0.48px]">
              Operator Console
            </h1>
            <p className="text-[rgba(255,255,255,0.72)] mt-2 text-[16px]">
              Gated API actions for seeding claims, advancing demo, settling, and attesting.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/operator/health">
              <Button variant="outline-dark">Health Dashboard</Button>
            </Link>
            <Button
              variant="soft"
              onClick={handleLogout}
              className="!bg-[#16181a] !text-[rgba(255,255,255,0.72)] hover:!text-[#ffffff]"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Key indicator */}
        <div className="mb-8 px-4 py-3 rounded-[12px] bg-[rgba(73,79,223,0.10)] border border-[rgba(73,79,223,0.24)] flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#494fdf] inline-block" />
          <span className="text-[14px] text-[rgba(255,255,255,0.72)]">
            Authenticated as operator{" "}
            <span className="font-mono text-[#ffffff]">
              {operatorKey.slice(0, 4)}
              {"*".repeat(Math.max(0, operatorKey.length - 4))}
            </span>
          </span>
        </div>

        {/* Forms */}
        <SectionCard title="Seed Claim">
          <SeedClaimForm operatorKey={operatorKey} />
        </SectionCard>

        <SectionCard title="Advance Demo">
          <AdvanceForm operatorKey={operatorKey} />
        </SectionCard>

        <SectionCard title="Settle Claim">
          <SettleForm operatorKey={operatorKey} />
        </SectionCard>

        <SectionCard title="Register Agent">
          <RegisterAgentForm operatorKey={operatorKey} />
        </SectionCard>

        <SectionCard title="Attest as Human">
          <HumanAttestForm operatorKey={operatorKey} />
        </SectionCard>

        <SectionCard title="Plugboard Control">
          <PlugboardControl operatorKey={operatorKey} />
        </SectionCard>
      </div>
    </div>
  );
}
