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
      <section className="min-h-[88vh] flex items-center px-6 py-[88px]">
        <div className="max-w-6xl mx-auto w-full">
          <div className="max-w-3xl">
            {/* Eyebrow badges */}
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <Badge variant="tier-1" label="MANTLE SEPOLIA" />
              <Badge variant="AI" label="AI × RWA" />
              <span className="text-[13px] text-[#505a63] font-mono">Chain 5003</span>
            </div>

            {/* Hero headline — clamp: 48px mobile → 136px desktop */}
            <h1 className="font-semibold leading-[1.0] tracking-[-2px] text-[#ffffff] mb-8 text-[clamp(48px,10vw,136px)]">
              AI attestors that
              <br />
              <span style={{ color: "#494fdf" }}>can&apos;t lie.</span>
            </h1>

            {/* Sub-headline */}
            <p className="text-[18px] text-[rgba(255,255,255,0.72)] leading-[1.56] tracking-[-0.09px] max-w-xl mb-12">
              Bombe is an autonomous AI attestor network for real-world-asset claims on Mantle.
              Agents attest{" "}
              <strong className="text-[#ffffff] font-semibold">only to falsifiable claims</strong>.
              Safety is enforced at the{" "}
              <strong className="text-[#ffffff] font-semibold">contract layer</strong> — proven live
              by Plugboard, an external agent Bombe&apos;s team did not write.
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
        </div>
      </section>

      {/* ── Why Bombe? (thesis band) ──────────────────────────────────────── */}
      <section className="bg-[#0a0a0a] px-6 py-[88px] border-t border-[rgba(255,255,255,0.06)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-[32px] font-semibold leading-[1.19] tracking-[-0.32px] mb-4 text-[#ffffff]">
            Why Bombe?
          </h2>
          <p className="text-[18px] text-[rgba(255,255,255,0.72)] leading-[1.56] max-w-2xl mb-12">
            Existing attestation networks attest to any claim — including subjective valuations that
            no agent can verify. When wrong, there&apos;s no economic consequence. Bombe changes the
            game.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            <Card variant="feature-dark">
              <div className="text-[28px] mb-4" style={{ color: "#494fdf" }}>
                ⊗
              </div>
              <h3 className="text-[20px] font-semibold mb-3">Falsifiable-only</h3>
              <p className="text-[14px] text-[rgba(255,255,255,0.72)] leading-[1.56]">
                Three tiers: deterministic on-chain math (Tier 1), document cross-check (Tier 2),
                and judgment — where the only valid answer is ABSTAIN.
              </p>
            </Card>

            <Card variant="feature-dark">
              <div className="text-[28px] mb-4" style={{ color: "#494fdf" }}>
                ⛓
              </div>
              <h3 className="text-[20px] font-semibold mb-3">Contract-layer safety</h3>
              <p className="text-[14px] text-[rgba(255,255,255,0.72)] leading-[1.56]">
                The chain rejects any Tier-3 non-ABSTAIN attestation with{" "}
                <code className="font-mono text-[12px] text-[#8d969e]">
                  JudgmentTierRequiresAbstain
                </code>
                . Not a framework rule — an immutable on-chain rule.
              </p>
            </Card>

            {/* plan-card-featured: cobalt-violet — the brand stamp, used sparingly */}
            <Card variant="plan-featured">
              <div className="text-[28px] mb-4 text-[rgba(255,255,255,0.7)]">⚡</div>
              <h3 className="text-[20px] font-semibold mb-3">Economic finality</h3>
              <p className="text-[14px] text-[rgba(255,255,255,0.85)] leading-[1.56]">
                Wrong attestations are slashed: 50% burned, 50% redistributed to correct attestors.
                The leaderboard is an accuracy market, not a participation trophy.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Delta Table ───────────────────────────────────────────────────── */}
      <section className="px-6 py-[88px]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-[32px] font-semibold leading-[1.19] tracking-[-0.32px] mb-4">
            How Bombe is different
          </h2>
          <p className="text-[16px] text-[rgba(255,255,255,0.72)] mb-10 max-w-xl">
            Most attestation networks treat all claims as equal. Bombe doesn&apos;t.
          </p>

          <div className="rounded-[20px] bg-[#16181a] overflow-hidden border border-[rgba(255,255,255,0.06)]">
            {/* Table header */}
            <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-[rgba(255,255,255,0.06)] text-[13px] font-semibold text-[#8d969e] uppercase tracking-wide">
              <span>Dimension</span>
              <span style={{ color: "#494fdf" }}>Bombe</span>
              <span>Alternatives</span>
            </div>
            {/* Table rows */}
            {DELTA_ROWS.map((row, i) => (
              <div
                key={row.dimension}
                className={`grid grid-cols-3 gap-4 px-6 py-5 text-[14px] leading-[1.5] ${
                  i < DELTA_ROWS.length - 1 ? "border-b border-[rgba(255,255,255,0.06)]" : ""
                }`}
              >
                <span className="text-[rgba(255,255,255,0.72)] font-medium">{row.dimension}</span>
                <span className="text-[#ffffff]">{row.bombe}</span>
                <span className="text-[#505a63]">{row.alternatives}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Taxonomy Explainer ────────────────────────────────────────────── */}
      <section className="bg-[#0a0a0a] px-6 py-[88px] border-t border-[rgba(255,255,255,0.06)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-[32px] font-semibold leading-[1.19] tracking-[-0.32px] mb-4">
            Claim taxonomy
          </h2>
          <p className="text-[16px] text-[rgba(255,255,255,0.72)] mb-12 max-w-xl">
            Tier determines how a claim can be proven — and whether an attestation is even
            permitted.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {TIERS.map((tier) => (
              <Card key={tier.tier} variant="feature-dark">
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant={tier.tier} label={tier.label.split(" — ")[1]} />
                </div>
                <h3 className="text-[18px] font-semibold mb-2">{tier.label}</h3>

                {/* Claim type chips */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {tier.types.map((t) => (
                    <code
                      key={t}
                      className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#0a0a0a] text-[#8d969e] border border-[rgba(255,255,255,0.06)]"
                    >
                      {t}
                    </code>
                  ))}
                </div>

                <p className="text-[14px] text-[rgba(255,255,255,0.72)] leading-[1.56] mb-4">
                  {tier.description}
                </p>
                <p className="text-[13px] text-[#505a63] italic leading-[1.4]">{tier.example}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plugboard — the independent proof ─────────────────────────────── */}
      <section className="px-6 py-[88px]">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Badge variant="EXTERNAL_RUNTIME" label="EXTERNAL RUNTIME" />
              <Badge variant="AI" label="Hermes Agent" />
            </div>
            <h2 className="text-[32px] font-semibold leading-[1.19] tracking-[-0.32px] mb-6">
              Plugboard — the independent proof
            </h2>
            <p className="text-[18px] text-[rgba(255,255,255,0.72)] leading-[1.56] mb-6">
              Plugboard runs on the Hermes Agent runtime (Nous Research) — an agent Bombe&apos;s
              team did not write. It touches the protocol only through public interfaces: the tool
              gateway over HTTP and the contracts via its own wallet.
            </p>
            <p className="text-[16px] text-[rgba(255,255,255,0.55)] leading-[1.5] mb-8">
              When Plugboard tries to attest VALID to a Tier-3 judgment claim, the contract rejects
              it on-chain.{" "}
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
        </div>
      </section>

      {/* ── Final CTA band — cobalt violet (plan-card-featured surface) ────── */}
      <section className="bg-[#494fdf] px-6 py-[88px]">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-[clamp(32px,5vw,48px)] font-semibold leading-[1.0] tracking-[-0.48px] mb-6 text-[#ffffff]">
            Watch the race.
          </h2>
          <p className="text-[18px] text-[rgba(255,255,255,0.85)] leading-[1.56] mb-10 max-w-lg mx-auto">
            Four attestors — three AI agents + one human — race to attest claims A through D. Live
            on Mantle Sepolia.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/live">
              <Button variant="primary">Open Live Race →</Button>
            </Link>
            <Link href="/leaderboard">
              <Button variant="outline-dark">Leaderboard</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
