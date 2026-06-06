import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

// ── Delta table: Bombe vs alternatives (PRD §6.6) ──────────────────────────
const DELTA_ROWS = [
  {
    dimension: "Attestation scope",
    bombe: "Falsifiable claims only (Tier 1+2); ABSTAIN on judgment",
    alternatives: "Attests to any claim including valuations",
  },
  {
    dimension: "Safety guarantee",
    bombe: "Contract layer — rejects invalid attestations on-chain",
    alternatives: "Application layer — can be bypassed",
  },
  {
    dimension: "Wrong attestation",
    bombe: "Automatic slash + reputation penalty",
    alternatives: "No economic consequence",
  },
  {
    dimension: "External agents",
    bombe: "Open to third-party agents (Plugboard on Hermes runtime)",
    alternatives: "Closed ecosystem, single vendor",
  },
  {
    dimension: "Judgment claims",
    bombe: "ABSTAIN enforced — contract rejects any non-ABSTAIN on Tier 3",
    alternatives: "Attested freely — no enforcement",
  },
] as const;

// ── Claim taxonomy (CONTEXT.md + PRD §6.1) ────────────────────────────────
const TIERS = [
  {
    tier: "tier-1" as const,
    label: "Tier 1 — DETERMINISTIC",
    types: ["YIELD_BPS", "DISTRIBUTION_PAID"],
    description:
      "Truth derivable from on-chain state or oracle math. Slashing is direct and automatic against ground truth at settlement.",
    example: "mETH yield at 34bps/30d — oracle confirms or refutes in milliseconds.",
  },
  {
    tier: "tier-2" as const,
    label: "Tier 2 — DOCUMENT",
    types: ["CASHFLOW_MATCH", "ENCUMBRANCE_ABSENT"],
    description:
      "Truth derivable from referenced fixture documents (servicer reports, bank statements). Slashing only via dispute resolution — a stake-weighted in-protocol vote.",
    example:
      "PC-POOL-1 cashflow: servicer report says 50,000; statement sums to 45,000 → REJECTED.",
  },
  {
    tier: "tier-3" as const,
    label: "Tier 3 — JUDGMENT",
    types: ["FAIR_VALUE"],
    description:
      "Valuation / opinion. Attestation is FORBIDDEN. The SDK coerces any decision to ABSTAIN; the contract rejects any non-ABSTAIN attestation with JudgmentTierRequiresAbstain.",
    example:
      'PC-POOL-1 fair value $4.2M — Plugboard attempts VALID → contract reverts → "BLOCKED BY PROTOCOL".',
  },
] as const;

export default function LandingPage() {
  return (
    <div className="bg-[#000000] text-[#ffffff]">
      {/* ── Hero Band ─────────────────────────────────────────────────────── */}
      {/* DESIGN.md hero-band-dark: canvas-dark, display-xxl headline, 88px padding */}
      {/* Taste: ambient gradient, asymmetric layout, text-wrap balance */}
      <section className="relative min-h-[100dvh] flex items-center px-6 py-[88px] overflow-hidden hero-ambient">
        {/* Subtle ambient glow accent behind headline */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[640px] h-[640px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(73,79,223,0.11) 0%, transparent 65%)",
          }}
          aria-hidden="true"
        />

        <div className="max-w-6xl mx-auto w-full">
          {/* Asymmetric hero: headline left, stat cluster right */}
          <div className="grid lg:grid-cols-[1fr_340px] gap-12 items-center">
            <div>
              {/* Eyebrow badges */}
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <Badge variant="tier-1" label="MANTLE SEPOLIA" />
                <Badge variant="AI" label="AI × RWA" />
                <span className="text-[13px] text-[#505a63] tabular font-mono">Chain 5003</span>
              </div>

              {/* Hero headline — display-xxl, tight, balanced */}
              {/* Note: "AI attestors that" must stay in one text node for landing.test.tsx */}
              <h1
                className="font-semibold leading-[1.0] tracking-[-2.5px] text-[#ffffff] mb-8 text-[clamp(48px,9vw,128px)] balance"
                style={{ letterSpacing: "clamp(-1px, -0.02em, -2.5px)" }}
              >
                AI attestors that{" "}
                <span className="relative inline-block" style={{ color: "#494fdf" }}>
                  can&apos;t lie.
                </span>
              </h1>

              {/* Sub-headline */}
              <p className="text-[18px] text-[rgba(255,255,255,0.65)] leading-[1.56] tracking-[-0.09px] max-w-xl mb-12 pretty">
                Bombe is an autonomous AI attestor network for real-world-asset claims on Mantle.
                Agents attest{" "}
                <strong className="text-[rgba(255,255,255,0.92)] font-semibold">
                  only to falsifiable claims
                </strong>
                . Safety is enforced at the{" "}
                <strong className="text-[rgba(255,255,255,0.92)] font-semibold">
                  contract layer
                </strong>{" "}
                — proven live by Plugboard, an external agent Bombe&apos;s team did not write.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-4">
                <Link href="/live">
                  <Button variant="primary">Watch Live Race →</Button>
                </Link>
                <Link href="/leaderboard">
                  <Button variant="outline-dark">View Leaderboard</Button>
                </Link>
              </div>
            </div>

            {/* Right stat cluster — subtle elevated panel, visible on lg+ */}
            <aside className="hidden lg:flex flex-col gap-4" aria-label="Protocol statistics">
              {/* Stat card: attestors */}
              <div className="rounded-[20px] bg-[#16181a] border border-[rgba(255,255,255,0.06)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <p className="text-[12px] text-[#505a63] font-semibold tracking-[0.8px] uppercase mb-2">
                  Attestors racing
                </p>
                <p className="text-[48px] font-semibold leading-[1.0] tracking-[-1px] tabular">4</p>
                <p className="text-[13px] text-[rgba(255,255,255,0.50)] mt-2">
                  Reflector · Rotor · Stator · Plugboard
                </p>
              </div>
              {/* Stat card: tiers */}
              <div className="rounded-[20px] bg-[#16181a] border border-[rgba(255,255,255,0.06)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <p className="text-[12px] text-[#505a63] font-semibold tracking-[0.8px] uppercase mb-2">
                  Claim tiers
                </p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="tier-1" label="T1" />
                  <Badge variant="tier-2" label="T2" />
                  <Badge variant="tier-3" label="T3" />
                </div>
                <p className="text-[13px] text-[rgba(255,255,255,0.50)] mt-3">
                  T3 always ABSTAIN — contract enforced
                </p>
              </div>
              {/* Stat card: chain */}
              <div className="rounded-[20px] bg-[#494fdf] border border-[rgba(255,255,255,0.15)] p-6 shadow-[0_4px_24px_rgba(73,79,223,0.35)]">
                <p className="text-[12px] text-[rgba(255,255,255,0.65)] font-semibold tracking-[0.8px] uppercase mb-2">
                  Deployed on
                </p>
                <p className="text-[22px] font-semibold leading-[1.2] tracking-[-0.3px]">
                  Mantle Sepolia
                </p>
                <p className="text-[13px] text-[rgba(255,255,255,0.65)] mt-1 tabular font-mono">
                  chain id 5003
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── Why Bombe? (thesis band) ──────────────────────────────────────── */}
      {/* Asymmetric feature grid: 1-wide + 2-stack, not 3 equal cards */}
      <section
        className="px-6 py-[88px] border-t border-[rgba(255,255,255,0.06)]"
        style={{ background: "#0a0a0a" }}
      >
        <div className="max-w-6xl mx-auto">
          <p className="text-[13px] text-[#494fdf] font-semibold tracking-[0.8px] uppercase mb-4">
            Why Bombe?
          </p>
          <h2 className="text-[clamp(32px,5vw,48px)] font-semibold leading-[1.1] tracking-[-0.48px] mb-4 text-[#ffffff] balance">
            The attestation network that knows its limits.
          </h2>
          <p className="text-[18px] text-[rgba(255,255,255,0.60)] leading-[1.56] max-w-2xl mb-14 pretty">
            Existing attestation networks attest to any claim — including subjective valuations that
            no agent can verify. When wrong, there&apos;s no economic consequence. Bombe changes the
            game.
          </p>

          {/* Asymmetric layout: large feature card left, 2-stack right */}
          <div className="grid md:grid-cols-[1.4fr_1fr] gap-6">
            {/* Featured card — the plan-card-featured stamp */}
            <Card variant="plan-featured" className="flex flex-col justify-between min-h-[260px]">
              <div>
                <div className="text-[32px] mb-5" style={{ lineHeight: 1 }}>
                  ⚡
                </div>
                <h3 className="text-[22px] font-semibold mb-3 tracking-[-0.2px]">
                  Economic finality
                </h3>
                <p className="text-[15px] text-[rgba(255,255,255,0.82)] leading-[1.6]">
                  Wrong attestations are slashed: 50% burned, 50% redistributed to correct
                  attestors. The leaderboard is an accuracy market, not a participation trophy.
                </p>
              </div>
              <div className="mt-6">
                <Link href="/leaderboard">
                  <Button variant="outline-dark" className="text-[14px] h-10 px-5 py-0">
                    View standings →
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Two stacked cards right */}
            <div className="flex flex-col gap-6">
              <Card variant="feature-dark">
                <div className="text-[24px] mb-4" style={{ color: "#494fdf" }}>
                  ⊗
                </div>
                <h3 className="text-[18px] font-semibold mb-2 tracking-[-0.1px]">
                  Falsifiable-only
                </h3>
                <p className="text-[14px] text-[rgba(255,255,255,0.60)] leading-[1.56]">
                  Three tiers: deterministic on-chain math (Tier 1), document cross-check (Tier 2),
                  and judgment — where the only valid answer is ABSTAIN.
                </p>
              </Card>

              <Card variant="feature-dark">
                <div className="text-[24px] mb-4" style={{ color: "#494fdf" }}>
                  ⛓
                </div>
                <h3 className="text-[18px] font-semibold mb-2 tracking-[-0.1px]">
                  Contract-layer safety
                </h3>
                <p className="text-[14px] text-[rgba(255,255,255,0.60)] leading-[1.56]">
                  The chain rejects any Tier-3 non-ABSTAIN attestation with{" "}
                  <code className="font-mono text-[11px] text-[#8d969e]">
                    JudgmentTierRequiresAbstain
                  </code>
                  . An immutable on-chain rule.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ── Delta Table ───────────────────────────────────────────────────── */}
      <section className="px-6 py-[88px]">
        <div className="max-w-6xl mx-auto">
          <p className="text-[13px] text-[#494fdf] font-semibold tracking-[0.8px] uppercase mb-4">
            Competitive edge
          </p>
          <h2 className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.15] tracking-[-0.4px] mb-4 balance">
            How Bombe is different
          </h2>
          <p className="text-[16px] text-[rgba(255,255,255,0.55)] mb-10 max-w-xl pretty">
            Most attestation networks treat all claims as equal. Bombe doesn&apos;t.
          </p>

          <div className="rounded-[20px] bg-[#16181a] overflow-hidden border border-[rgba(255,255,255,0.06)] shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            {/* Table header */}
            <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
              <span className="text-[12px] font-semibold text-[#505a63] uppercase tracking-[0.8px]">
                Dimension
              </span>
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.8px]"
                style={{ color: "#494fdf" }}
              >
                Bombe
              </span>
              <span className="text-[12px] font-semibold text-[#505a63] uppercase tracking-[0.8px]">
                Alternatives
              </span>
            </div>
            {/* Table rows */}
            {DELTA_ROWS.map((row, i) => (
              <div
                key={row.dimension}
                className={`grid grid-cols-3 gap-4 px-6 py-5 text-[14px] leading-[1.5] transition-colors hover:bg-[rgba(255,255,255,0.02)] ${
                  i < DELTA_ROWS.length - 1 ? "border-b border-[rgba(255,255,255,0.05)]" : ""
                }`}
              >
                <span className="text-[rgba(255,255,255,0.60)] font-medium">{row.dimension}</span>
                <span className="text-[#ffffff] font-medium">{row.bombe}</span>
                <span className="text-[#3a3d40]">{row.alternatives}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Taxonomy Explainer ────────────────────────────────────────────── */}
      <section
        className="px-6 py-[88px] border-t border-[rgba(255,255,255,0.06)]"
        style={{ background: "#0a0a0a" }}
      >
        <div className="max-w-6xl mx-auto">
          <p className="text-[13px] text-[#494fdf] font-semibold tracking-[0.8px] uppercase mb-4">
            Claim taxonomy
          </p>
          <h2 className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.15] tracking-[-0.4px] mb-4 balance">
            Tier determines truth
          </h2>
          <p className="text-[16px] text-[rgba(255,255,255,0.55)] mb-12 max-w-xl pretty">
            Tier determines how a claim can be proven — and whether an attestation is even
            permitted.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {TIERS.map((tier) => (
              <Card key={tier.tier} variant="feature-dark">
                <div className="flex items-center gap-3 mb-5">
                  <Badge variant={tier.tier} label={tier.label.split(" — ")[1]} />
                </div>
                <h3 className="text-[17px] font-semibold mb-2 tracking-[-0.1px] balance">
                  {tier.label}
                </h3>

                {/* Claim type chips */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tier.types.map((t) => (
                    <code
                      key={t}
                      className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#0a0a0a] text-[#8d969e] border border-[rgba(255,255,255,0.06)]"
                    >
                      {t}
                    </code>
                  ))}
                </div>

                <p className="text-[14px] text-[rgba(255,255,255,0.60)] leading-[1.6] mb-4 pretty">
                  {tier.description}
                </p>
                <p className="text-[12px] text-[#3a3d40] italic leading-[1.5]">{tier.example}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plugboard — the independent proof ─────────────────────────────── */}
      {/* Asymmetric section: left-anchored prose, no centering */}
      <section className="px-6 py-[88px]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-[1fr_380px] gap-16 items-center">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <Badge variant="EXTERNAL_RUNTIME" label="EXTERNAL RUNTIME" />
                <Badge variant="AI" label="Hermes Agent" />
              </div>
              <h2 className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.15] tracking-[-0.4px] mb-6 balance">
                Plugboard — the independent proof
              </h2>
              <p className="text-[18px] text-[rgba(255,255,255,0.60)] leading-[1.56] mb-6 pretty">
                Plugboard runs on the Hermes Agent runtime (Nous Research) — an agent Bombe&apos;s
                team did not write. It touches the protocol only through public interfaces: the tool
                gateway over HTTP and the contracts via its own wallet.
              </p>
              <p className="text-[16px] text-[rgba(255,255,255,0.45)] leading-[1.5] mb-8 pretty">
                When Plugboard tries to attest VALID to a Tier-3 judgment claim, the contract
                rejects it on-chain.{" "}
                <span className="font-semibold" style={{ color: "#7c3aed" }}>
                  BLOCKED BY PROTOCOL
                </span>{" "}
                — not by the SDK, not by a framework, by the chain itself.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/live">
                  <Button variant="primary">See it happen live →</Button>
                </Link>
              </div>
            </div>

            {/* Plugboard proof visual — elevated panel */}
            <div className="hidden md:block">
              <div
                className="rounded-[20px] border border-[rgba(255,255,255,0.08)] p-6 shadow-[0_12px_48px_rgba(0,0,0,0.5)]"
                style={{ background: "#0f1012" }}
              >
                <p className="text-[11px] text-[#505a63] font-mono tracking-[0.5px] uppercase mb-3">
                  on-chain revert log
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-[#494fdf] font-mono text-[11px] mt-0.5">01</span>
                    <span className="text-[12px] text-[rgba(255,255,255,0.55)] font-mono">
                      Plugboard: attest VALID Tier-3…
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#b09000] font-mono text-[11px] mt-0.5">02</span>
                    <span className="text-[12px] text-[rgba(255,255,255,0.55)] font-mono">
                      tx pending 0x4d2f…
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#e23b4a] font-mono text-[11px] mt-0.5">03</span>
                    <span className="text-[12px] text-[rgba(255,255,255,0.90)] font-mono">
                      revert: JudgmentTierRequiresAbstain
                    </span>
                  </div>
                  <div className="flex items-start gap-2 mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                    <Badge variant="BLOCKED_BY_PROTOCOL" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA band — surface-elevated, NOT cobalt-violet full band ────── */}
      {/* DESIGN.md: reserve #494fdf for plan-card-featured, not full page-width bands */}
      <section
        className="px-6 py-[88px] border-t border-[rgba(255,255,255,0.06)]"
        style={{ background: "#0a0a0a" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="text-[13px] text-[#494fdf] font-semibold tracking-[0.8px] uppercase mb-4">
              Live on Mantle
            </p>
            <h2
              className="font-semibold leading-[1.0] tracking-[-0.48px] mb-6 text-[#ffffff] balance"
              style={{ fontSize: "clamp(32px,5vw,56px)" }}
            >
              Watch the race.
            </h2>
            <p className="text-[18px] text-[rgba(255,255,255,0.60)] leading-[1.56] mb-10 max-w-lg pretty">
              Four attestors — three AI agents + one human — race to attest claims A through D. Live
              on Mantle Sepolia.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/live">
                <Button variant="primary">Open Live Race →</Button>
              </Link>
              <Link href="/leaderboard">
                <Button variant="outline-dark">Leaderboard</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
