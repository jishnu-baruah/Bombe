"use client";

import { useState } from "react";
import { RequestAttestationForm } from "../request/RequestAttestationForm";

// The on-platform attestation console: pick what you want attested and do it here.
// Yield is the paid, on-chain-posted attestation. Vault NAV and Document are live,
// free verification checks (on-chain read / pinned document) that return a verdict +
// the evidence, honestly distinguished from the paid posted flow.

type Mode = "yield" | "nav" | "document";

const TABS: { id: Mode; label: string; sub: string }[] = [
  { id: "yield", label: "Yield", sub: "paid, posted on-chain" },
  { id: "nav", label: "Vault NAV", sub: "on-chain read" },
  { id: "document", label: "Document", sub: "vs US Treasury rate" },
];

const field =
  "w-full px-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[rgba(255,255,255,0.1)] text-[15px] text-[#ffffff] placeholder:text-[#505a63] focus:outline-none focus:border-[#494fdf]";
const labelCls = "block text-[13px] text-[rgba(255,255,255,0.72)] mb-1.5";

function Verdict({ verdict, detail, extra }: { verdict: string; detail: string; extra?: string }) {
  const color =
    verdict === "VALID"
      ? "border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.06)] text-[#7ee08a]"
      : verdict === "REJECTED"
        ? "border-[rgba(226,59,74,0.3)] bg-[rgba(226,59,74,0.08)] text-[#f0a0a8]"
        : "border-[rgba(176,144,0,0.3)] bg-[rgba(176,144,0,0.07)] text-[#c9a227]";
  return (
    <div className={`mt-5 rounded-[14px] border px-5 py-4 ${color}`}>
      <p className="text-[14px] font-semibold mb-1">{verdict}</p>
      <p className="text-[13px] text-[rgba(255,255,255,0.65)] leading-[1.5]">{detail}</p>
      {extra && (
        <p className="text-[12px] text-[rgba(255,255,255,0.45)] font-mono break-all mt-2">
          {extra}
        </p>
      )}
    </div>
  );
}

function NavCheckForm() {
  const [chain, setChain] = useState("Ethereum");
  const [contract, setContract] = useState("");
  const [assertedNav, setAssertedNav] = useState("");
  const [tol, setTol] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ verdict: string; detail: string; extra?: string } | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setErr("");
    setRes(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(contract) || !(Number(assertedNav) > 0)) {
      setErr("Enter a vault address and a positive asserted NAV.");
      return;
    }
    setBusy(true);
    try {
      const q = new URLSearchParams({ chain, contract, assertedNav, tolerancePct: tol });
      const j = await (await fetch(`/api/v1/nav-check?${q}`)).json();
      if (j.error) throw new Error(j.error);
      setRes({
        verdict: j.verdict,
        detail: j.detail,
        extra: j.onchain ? `on-chain ${j.onchain.method} = ${j.onchain.assetsPerShare}` : undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-[14px] text-[rgba(255,255,255,0.55)] leading-[1.5] mb-5">
        Read an ERC-4626 vault&apos;s share price straight off the chain and cross-check an asserted
        NAV. Independent of any aggregator, the evidence is the chain itself. Free, live.
      </p>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label>
          <span className={labelCls}>Chain</span>
          <select className={field} value={chain} onChange={(e) => setChain(e.target.value)}>
            <option>Ethereum</option>
            <option>Mantle</option>
            <option>Base</option>
            <option>Arbitrum</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Asserted NAV (assets per share)</span>
          <input
            className={field}
            value={assertedNav}
            onChange={(e) => setAssertedNav(e.target.value)}
            placeholder="e.g. 1.1766"
            inputMode="decimal"
          />
        </label>
      </div>
      <label className="block mb-4">
        <span className={labelCls}>Vault contract</span>
        <input
          className={`${field} font-mono text-[13px]`}
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          placeholder="0x83F20F44975D03b1b09e64809B757c47f942BEeA (sDAI)"
        />
      </label>
      <div className="flex items-end gap-3">
        <label className="w-28">
          <span className={labelCls}>Tolerance %</span>
          <input
            className={field}
            value={tol}
            onChange={(e) => setTol(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-[10px] bg-[#494fdf] hover:bg-[#5a60e8] disabled:opacity-50 px-6 py-2.5 text-[14px] font-semibold text-[#ffffff] transition-colors"
        >
          {busy ? "Reading chain…" : "Check NAV on-chain"}
        </button>
      </div>
      {err && <p className="text-[13px] text-[#e0564f] mt-3">{err}</p>}
      {res && <Verdict {...res} />}
    </div>
  );
}

function DocCheckForm() {
  const [asset, setAsset] = useState("USDY");
  const [bps, setBps] = useState("355");
  const [tol, setTol] = useState("75");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ verdict: string; detail: string; extra?: string } | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setErr("");
    setRes(null);
    if (!(Number(bps) > 0)) {
      setErr("Enter a positive asserted yield in bps.");
      return;
    }
    setBusy(true);
    try {
      const q = new URLSearchParams({ asset, assertedBps: bps, toleranceBps: tol });
      const j = await (await fetch(`/api/v1/document-check?${q}`)).json();
      if (j.error) throw new Error(j.error);
      setRes({
        verdict: j.verdict,
        detail: j.detail,
        extra: j.document?.docHash ? `docHash ${j.document.docHash}` : undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-[14px] text-[rgba(255,255,255,0.55)] leading-[1.5] mb-5">
        Cross-check a tokenized-treasury yield against the live, hashed US Treasury bill rate
        (fiscaldata.treasury.gov). The document is pinned by hash and the figure is cited. Free,
        live.
      </p>
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <label>
          <span className={labelCls}>Asset</span>
          <input
            className={field}
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="USDY"
          />
        </label>
        <label>
          <span className={labelCls}>Asserted yield (bps)</span>
          <input
            className={field}
            value={bps}
            onChange={(e) => setBps(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          <span className={labelCls}>Tolerance (bps)</span>
          <input
            className={field}
            value={tol}
            onChange={(e) => setTol(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-[10px] bg-[#494fdf] hover:bg-[#5a60e8] disabled:opacity-50 px-6 py-2.5 text-[14px] font-semibold text-[#ffffff] transition-colors"
      >
        {busy ? "Fetching document…" : "Cross-check vs Treasury rate"}
      </button>
      {err && <p className="text-[13px] text-[#e0564f] mt-3">{err}</p>}
      {res && <Verdict {...res} />}
    </div>
  );
}

export function AttestationConsole() {
  const [mode, setMode] = useState<Mode>("yield");
  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`px-4 py-2 rounded-[12px] text-left transition-colors border ${
              mode === t.id
                ? "bg-[#16181a] border-[rgba(73,79,223,0.4)] text-[#ffffff]"
                : "bg-transparent border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.55)] hover:text-[#ffffff]"
            }`}
          >
            <span className="block text-[14px] font-semibold">{t.label}</span>
            <span className="block text-[11px] text-[rgba(255,255,255,0.4)]">{t.sub}</span>
          </button>
        ))}
      </div>
      {mode === "yield" && <RequestAttestationForm />}
      {mode === "nav" && <NavCheckForm />}
      {mode === "document" && <DocCheckForm />}
    </div>
  );
}
