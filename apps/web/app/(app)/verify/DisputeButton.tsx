"use client";

import { useState } from "react";

/**
 * DisputeButton — keyless public dispute intake on /verify.
 *
 * Files a dispute against one attestor's verdict on a claim (POST /api/dispute).
 * The intake is recorded "under review"; an operator escalates a vetted dispute
 * to the real on-chain AgentSlashing.openDispute (bonded, registered-attestor
 * voted). No wallet needed to file.
 */
export function DisputeButton({ claimId, accused }: { claimId: string; accused: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit() {
    if (reason.trim().length < 10) {
      setState("error");
      setMsg("Please explain why the verdict is wrong (at least 10 characters).");
      return;
    }
    setState("sending");
    setMsg("");
    try {
      const r = await fetch("/api/dispute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, accused, reason, contact: contact || undefined }),
      });
      const j = await r.json();
      if (!r.ok) {
        setState("error");
        setMsg(j.error ?? "Could not file the dispute.");
        return;
      }
      setState("done");
      setMsg(j.message ?? "Dispute recorded and under review.");
    } catch {
      setState("error");
      setMsg("Network error filing the dispute.");
    }
  }

  if (state === "done") {
    return <p className="text-[12px] text-[#7ee08a] mt-2 leading-[1.5] max-w-[28rem]">✓ {msg}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-muted-foreground/70 hover:text-[#e0564f] transition-colors mt-1"
      >
        Dispute this verdict
      </button>
    );
  }

  return (
    <div className="w-full max-w-[28rem] rounded-[12px] border border-white/[0.08] bg-[#0a0a0a] p-4 mt-2">
      <p className="text-[12px] text-muted-foreground mb-3 leading-[1.5]">
        Why is this verdict wrong? A vetted dispute is carried on-chain as a bonded AgentSlashing
        challenge that registered attestors vote on.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Explain the discrepancy, citing the data…"
        className="w-full px-3 py-2 rounded-[10px] bg-[#16181a] border border-white/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[#494fdf] transition-colors resize-y"
      />
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="Contact (optional, for follow-up)"
        className="w-full mt-2 px-3 py-2 rounded-[10px] bg-[#16181a] border border-white/[0.08] text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[#494fdf] transition-colors"
      />
      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={state === "sending"}
          className="rounded-full bg-[#e0564f] hover:bg-[#e8675f] disabled:opacity-50 px-4 py-1.5 text-[13px] font-medium text-white transition-colors active:scale-[0.98]"
        >
          {state === "sending" ? "Filing…" : "File dispute"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          cancel
        </button>
      </div>
      {state === "error" && <p className="text-[12px] text-[#e0564f] mt-2">{msg}</p>}
    </div>
  );
}
