// T-603 — /live race view (full implementation)
// Stub for T-601 app shell. Full race view with 5-column layout,
// agent-step streaming, and guided demo lands in T-603.

export default function LivePage() {
  return (
    <div className="min-h-screen px-6 py-[88px]">
      <div className="max-w-6xl mx-auto">
        <p className="text-[#8d969e] text-[13px] font-mono mb-4">T-603 — /live race view</p>
        <h1 className="text-[48px] font-semibold leading-[1.0] tracking-[-0.48px]">Live Race</h1>
        <p className="text-[rgba(255,255,255,0.72)] mt-4 text-[16px]">
          Full race view coming in T-603. The /api/stream SSE endpoint is live now.
        </p>
      </div>
    </div>
  );
}
