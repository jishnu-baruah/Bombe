"use client";

import { useState } from "react";

const CATEGORIES = [
  "tokenized-treasury",
  "private-credit",
  "tokenized-equity",
  "synthetic-dollar",
  "liquid-staking",
  "liquid-restaking",
  "tokenized-commodity",
  "real-estate",
  "lending",
  "btc-yield",
  "other",
] as const;

/**
 * "Can't find your asset? Request it." Posts to /api/v1/asset-request so the operator
 * can triage a new RWA into a real source descriptor. Honest: it records the ask; it
 * does not pretend the asset is already wired.
 */
export function RequestAssetForm() {
  const [symbol, setSymbol] = useState("");
  const [category, setCategory] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setState("sending");
    try {
      const res = await fetch("/api/v1/asset-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, category, sourceUrl, note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "request failed");
      setState("done");
      setMsg(j.message ?? "Request recorded.");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-[16px] bg-[rgba(66,134,25,0.08)] border border-[rgba(66,134,25,0.3)] p-6">
        <p className="text-[15px] text-[#86c95f] font-semibold mb-1">Request recorded.</p>
        <p className="text-[14px] text-[rgba(255,255,255,0.6)] leading-[1.5]">{msg}</p>
      </div>
    );
  }

  const field =
    "w-full rounded-[10px] bg-[#0a0a0a] border border-[rgba(255,255,255,0.1)] px-4 py-3 text-[14px] text-[#ffffff] placeholder:text-[rgba(255,255,255,0.3)] focus:border-[#494fdf] outline-none";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        className={field}
        placeholder="Asset symbol (e.g. mTBILL, XAUT, a property token)"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        required
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Category (optional)</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className={field}
          placeholder="Data source URL, if you know one"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
      </div>
      <textarea
        className={field}
        placeholder="Anything else (how the yield is computed, where to verify it)"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="self-start rounded-[10px] bg-[#494fdf] hover:bg-[#5a60e8] disabled:opacity-50 px-6 py-3 text-[14px] font-semibold text-[#ffffff] transition-colors"
      >
        {state === "sending" ? "Sending…" : "Request this asset"}
      </button>
      {state === "error" && <p className="text-[13px] text-[#e0564f]">{msg}</p>}
    </form>
  );
}
