"use client";

import { SUPPORTED_NAV_CHAINS } from "@bombe/agent-sdk";
import { useEffect, useState } from "react";
import { RequestAttestationForm } from "../request/RequestAttestationForm";

// The on-platform attestation console. Nothing is hardcoded to a single asset/source:
// the available modes + their live/planned status come from the live /api/v1/schema, the
// NAV chains come from the SDK's supported set, and the Document mode points at any
// document URL (the US Treasury rate is just a one-click preset). Yield is the paid,
// on-chain-posted attestation; NAV and Document are live, free verification checks.

type Mode = "yield" | "nav" | "document";

// Map each console mode to the schema claimType it exercises (for the live status badge).
const MODE_CLAIM: Record<Mode, string> = {
  yield: "YIELD_BPS",
  nav: "NAV_PER_SHARE",
  document: "DOCUMENTED_NAV",
};
const MODE_META: { id: Mode; label: string; sub: string }[] = [
  { id: "yield", label: "Yield", sub: "paid, posted on-chain" },
  { id: "nav", label: "Vault NAV", sub: "on-chain read" },
  { id: "document", label: "Document", sub: "any pinned document" },
];

interface SchemaClaim {
  claimType: string;
  status: "live" | "planned";
}

const field =
  "w-full px-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[rgba(255,255,255,0.1)] text-[15px] text-[#ffffff] placeholder:text-[#505a63] focus:outline-none focus:border-[#494fdf]";
const labelCls = "block text-[13px] text-[rgba(255,255,255,0.72)] mb-1.5";
const btn =
  "rounded-[10px] bg-[#494fdf] hover:bg-[#5a60e8] disabled:opacity-50 px-6 py-2.5 text-[14px] font-semibold text-[#ffffff] transition-colors";

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
  const chains = SUPPORTED_NAV_CHAINS.length ? SUPPORTED_NAV_CHAINS : ["Ethereum"];
  const [chain, setChain] = useState(chains[0]);
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
      const q = new URLSearchParams({
        chain: chain ?? "Ethereum",
        contract,
        assertedNav,
        tolerancePct: tol,
      });
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
            {chains.map((c) => (
              <option key={c}>{c}</option>
            ))}
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
          placeholder="0x… your ERC-4626 vault"
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
        <button type="button" onClick={run} disabled={busy} className={btn}>
          {busy ? "Reading chain…" : "Check NAV on-chain"}
        </button>
      </div>
      {err && <p className="text-[13px] text-[#e0564f] mt-3">{err}</p>}
      {res && <Verdict {...res} />}
    </div>
  );
}

function DocCheckForm() {
  const [asset, setAsset] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [scaleToBps, setScale] = useState("1");
  const [bps, setBps] = useState("");
  const [tol, setTol] = useState("75");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ verdict: string; detail: string; extra?: string } | null>(null);
  const [err, setErr] = useState("");

  function treasuryPreset() {
    setAsset("USDY");
    setDocUrl(
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Treasury%20Bills&sort=-record_date&page[size]=1",
    );
    setJsonPath("data.0.avg_interest_rate_amt");
    setScale("100");
    setBps("355");
  }

  async function run() {
    setErr("");
    setRes(null);
    if (!(Number(bps) > 0)) {
      setErr("Enter a positive asserted value (bps).");
      return;
    }
    setBusy(true);
    try {
      const q = new URLSearchParams({ assertedBps: bps, toleranceBps: tol });
      if (asset) q.set("asset", asset);
      if (docUrl) {
        q.set("docUrl", docUrl);
        if (jsonPath) q.set("jsonPath", jsonPath);
        if (scaleToBps) q.set("scaleToBps", scaleToBps);
      }
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
      <p className="text-[14px] text-[rgba(255,255,255,0.55)] leading-[1.5] mb-2">
        Point at any document. We pin it by hash, extract the cited figure at your JSON path, and
        deterministically cross-check the asserted value. Free, live.
      </p>
      <button
        type="button"
        onClick={treasuryPreset}
        className="text-[12px] text-[#494fdf] hover:text-[#6b70e8] mb-5"
      >
        Use the US Treasury bill rate as a preset →
      </button>
      <label className="block mb-4">
        <span className={labelCls}>Document URL</span>
        <input
          className={`${field} font-mono text-[12.5px]`}
          value={docUrl}
          onChange={(e) => setDocUrl(e.target.value)}
          placeholder="https://issuer.example/reserves.json"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label>
          <span className={labelCls}>JSON path to the figure</span>
          <input
            className={`${field} font-mono text-[13px]`}
            value={jsonPath}
            onChange={(e) => setJsonPath(e.target.value)}
            placeholder="data.0.rate"
          />
        </label>
        <label>
          <span className={labelCls}>Scale to bps (e.g. 100 for %)</span>
          <input
            className={field}
            value={scaleToBps}
            onChange={(e) => setScale(e.target.value)}
            inputMode="decimal"
          />
        </label>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <label>
          <span className={labelCls}>Asset (label)</span>
          <input
            className={field}
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="your token"
          />
        </label>
        <label>
          <span className={labelCls}>Asserted value (bps)</span>
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
      <button type="button" onClick={run} disabled={busy} className={btn}>
        {busy ? "Fetching document…" : "Pin + cross-check the document"}
      </button>
      {err && <p className="text-[13px] text-[#e0564f] mt-3">{err}</p>}
      {res && <Verdict {...res} />}
    </div>
  );
}

export function AttestationConsole() {
  const [mode, setMode] = useState<Mode>("yield");
  const [claims, setClaims] = useState<SchemaClaim[]>([]);

  // Drive the tabs' live status + the "more planned" note from the live schema.
  useEffect(() => {
    fetch("/api/v1/schema")
      .then((r) => r.json())
      .then((j: { claimTypes?: SchemaClaim[] }) => setClaims(j.claimTypes ?? []))
      .catch(() => {});
  }, []);

  const statusOf = (m: Mode) => claims.find((c) => c.claimType === MODE_CLAIM[m])?.status;
  const consoleClaimTypes = new Set(Object.values(MODE_CLAIM));
  const morePlanned = claims.filter(
    (c) => c.status === "planned" && !consoleClaimTypes.has(c.claimType),
  );

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap gap-2 mb-6">
        {MODE_META.map((t) => {
          const st = statusOf(t.id);
          return (
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
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                {t.label}
                {st === "live" && <span className="w-1.5 h-1.5 rounded-full bg-[#86c95f]" />}
              </span>
              <span className="block text-[11px] text-[rgba(255,255,255,0.4)]">{t.sub}</span>
            </button>
          );
        })}
      </div>
      {mode === "yield" && <RequestAttestationForm />}
      {mode === "nav" && <NavCheckForm />}
      {mode === "document" && <DocCheckForm />}
      {morePlanned.length > 0 && (
        <p className="text-[12px] text-[rgba(255,255,255,0.4)] mt-6">
          {morePlanned.length} more claim type{morePlanned.length > 1 ? "s" : ""} planned (
          {morePlanned.map((c) => c.claimType).join(", ")}). They appear here automatically when
          they go live. See the full matrix on the home page.
        </p>
      )}
    </div>
  );
}
