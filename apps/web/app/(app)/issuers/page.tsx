import { FEATURED_SYMBOLS } from "@bombe/agent-sdk";
import Link from "next/link";
import { AttestationConsole } from "./AttestationConsole";
import { RequestAssetForm } from "./RequestAssetForm";

// Round down to a clean floor for honest "N+" copy (never overstate the catalog).
const SUPPORTED_FLOOR = Math.floor(FEATURED_SYMBOLS.length / 10) * 10;

// Shared Mouli-system primitives (match components/landing/*): white-pill primary,
// hairline outline secondary, dark card. Kept inline so this page carries no
// bespoke component variants.
const BTN_PRIMARY =
  "inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-black text-base font-medium transition-all duration-150 hover:bg-white/90 active:scale-[0.98]";
const BTN_OUTLINE =
  "inline-flex items-center justify-center h-12 px-7 rounded-full border border-white/40 text-base text-foreground transition-all duration-150 hover:border-white/70 hover:bg-foreground/[0.04] active:scale-[0.98]";
const CARD =
  "rounded-[20px] bg-[#16181a] border border-white/[0.08] p-8 transition-all duration-200 hover:border-white/[0.16]";

// RWA categories the network can attest. `live` = a real source exists today (often on
// Mantle); the rest are requestable the moment a public data source exists. Honest: we
// do not render a category as live without a real source behind it.
const COVERAGE = [
  { name: "Tokenized treasuries", live: true, eg: "Ondo USDY/OUSG, BUIDL, USYC, TBILL, sDAI" },
  { name: "Liquid staking", live: true, eg: "mETH (two paths), stETH, rETH, cbETH, ETHx" },
  { name: "Liquid restaking", live: true, eg: "weETH, rsETH, ezETH" },
  { name: "Private credit / loans", live: true, eg: "Maple, Clearpool" },
  { name: "Synthetic-dollar yield", live: true, eg: "Ethena sUSDe" },
  { name: "Yield vaults / strategies", live: true, eg: "Morpho, Sky, Yearn vaults (share yield)" },
  { name: "Lending yield", live: true, eg: "Aave, Lendle on Mantle" },
  { name: "BTC yield", live: true, eg: "Lombard LBTC, Solv" },
  { name: "Tokenized equities", live: false, eg: "price claim + oracle (on request)" },
  { name: "Tokenized commodities", live: false, eg: "gold (XAUT, PAXG) on request" },
  { name: "Real estate / PE-VC", live: false, eg: "documented NAV only; appraisals abstain" },
] as const;

// Issuer-facing value page: who pays for attestations, why, and the economics.
// Static server component. Copy stays honest: archetypes are illustrative, not partners.

const ARCHETYPES = [
  {
    icon: "◈",
    title: "Tokenized yield & staking protocols",
    pain: "Prove the yield your token reports without asking holders to trust your own dashboard.",
  },
  {
    icon: "⊞",
    title: "Lenders taking RWA collateral",
    pain: "Confirm a borrower's claimed cashflows and clean title before you accept real-world collateral.",
  },
  {
    icon: "⊡",
    title: "Fund admins & auditors",
    pain: "Outsource the falsifiable slice of due diligence to a network that stakes on being right.",
  },
  {
    icon: "◇",
    title: "Allocating DAOs & treasuries",
    pain: "Get an outside, on-chain second opinion before you commit capital to an RWA position.",
  },
] as const;

const GUARANTEES = [
  {
    title: "A panel, not a single oracle",
    body: "Bombe runs several attestor agents and is open to external attestors like Plugboard, which runs on a runtime we did not write. Every verdict lands on-chain as a record anyone can audit, not one vendor's word.",
  },
  {
    title: "Economic finality",
    body: "Attestors stake on every decisive call. Wrong attestations are slashed, so the verdict carries real skin in the game.",
  },
  {
    title: "Explorer-visible",
    body: "Every attestation is a transaction on Mantle Sepolia. Anyone can see who said what, when, and with how much at stake.",
  },
  {
    title: "Verifiable reasoning",
    body: "The reasoning hash is stored on-chain. Re-derive it from the public trace and confirm the verdict was not edited after the fact.",
  },
] as const;

const ECONOMICS = [
  {
    action: "Post a claim",
    who: "Issuer",
    amount: "0.01 MNT",
    purpose: "One-time fee per claim, held until settlement.",
  },
  {
    action: "Attest VALID or REJECTED",
    who: "Attestor",
    amount: "0.02 MNT staked",
    purpose: "Locked stake, at risk if the attestation is wrong.",
  },
  {
    action: "Attestation proven correct",
    who: "Attestor",
    amount: "Earns fee share + reputation",
    purpose: "Reward for accuracy, recorded on-chain at settlement.",
  },
  {
    action: "Attestation proven wrong",
    who: "Attestor",
    amount: "Half of stake burned, half redistributed",
    purpose: "Penalty paid to the attestors who got it right.",
  },
  {
    action: "Abstain",
    who: "Attestor",
    amount: "0 MNT",
    purpose: "No stake, no reward. The only valid answer on judgment claims.",
  },
] as const;

const TIERS = [
  {
    label: "Tier 1",
    verdict: "Attested",
    accent: "text-[#86c95f]",
    body: "Deterministic truth from on-chain state or oracle math.",
  },
  {
    label: "Tier 2",
    verdict: "Attested",
    accent: "text-[#86c95f]",
    body: "Truth checkable against referenced documents and statements.",
  },
  {
    label: "Tier 3",
    verdict: "Abstain only",
    accent: "text-[#d4a017]",
    body: "Valuations and opinions. Contract-enforced abstention, never an attestation.",
  },
] as const;

export default function IssuersPage() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="hero-ambient relative px-6 lg:px-12 pt-12 lg:pt-20 pb-20 lg:pb-24">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-5">For issuers</span>
          <h1 className="font-display balance text-[clamp(40px,7vw,88px)] leading-[1.02] text-foreground mb-8">
            Turn <span className="text-[#9296f5]">&ldquo;trust me&rdquo;</span> into{" "}
            <span className="text-[#9296f5]">&ldquo;verify it on-chain.&rdquo;</span>
          </h1>
          <p className="pretty text-lg text-muted-foreground leading-relaxed max-w-[42rem] mb-10">
            If your product reports a number that someone has to take on faith, Bombe lets an
            outside, stake-backed network attest to it. Connect your wallet, pay the fee, and get a
            verifiable on-chain attestation back: a model-written, source-cited reasoning narrative
            anyone can recheck, and a verdict computed deterministically from the evidence, not from
            the model&apos;s opinion. Your counterparties get a result they can verify on Mantle
            Sepolia, not a logo on a slide.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="#get-attestation" className={BTN_PRIMARY}>
              Request an attestation →
            </Link>
            <Link href="/integrate" className={BTN_OUTLINE}>
              See how to integrate →
            </Link>
          </div>
        </div>
      </section>

      {/* Pay and get your attestation (embedded, non-custodial) */}
      <section
        id="get-attestation"
        className="scroll-mt-28 px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]"
      >
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">Get your attestation</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            Do it right here, on the platform.
          </h2>
          <p className="pretty text-base text-muted-foreground leading-relaxed mb-10 max-w-[46rem]">
            Pick what you want checked. <span className="text-foreground">Yield</span> is a paid
            attestation posted on-chain from your own wallet.{" "}
            <span className="text-foreground">Vault NAV</span> reads an ERC-4626 share price
            straight off the chain, and <span className="text-foreground">Document</span>{" "}
            cross-checks a yield against the live, hashed US Treasury rate, both free and live. Each
            returns a verdict you can verify; judgment claims abstain. We never hold your funds.
          </p>
          <AttestationConsole />
        </div>
      </section>

      {/* Who pays & why */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">Who pays & why</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            The buyer is whoever has to be believed.
          </h2>
          <p className="pretty text-base text-muted-foreground leading-relaxed mb-12 max-w-[42rem]">
            These are illustrative profiles, not customers or partners. Each shares one problem: a
            claim that matters to other people, for which an on-chain, falsifiable check is
            possible.
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            {ARCHETYPES.map((a) => (
              <div key={a.title} className={CARD}>
                <div className="text-2xl mb-4 text-[#9296f5]">{a.icon}</div>
                <h3 className="font-display text-xl text-foreground mb-2">{a.title}</h3>
                <p className="pretty text-sm text-muted-foreground leading-relaxed">{a.pain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">What you get</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-12">
            A verdict that defends itself.
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {GUARANTEES.map((g) => (
              <div key={g.title} className={CARD}>
                <h3 className="font-display text-xl text-foreground mb-2">{g.title}</h3>
                <p className="pretty text-sm text-muted-foreground leading-relaxed">{g.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Economics */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">The economics</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            Small fee in. Real stake behind the answer.
          </h2>
          <p className="pretty text-base text-muted-foreground leading-relaxed mb-10 max-w-[42rem]">
            You pay once to post a claim. Attestors put up more than they can earn on a single call,
            so being right is the only profitable strategy.
          </p>

          <div className="rounded-[20px] bg-[#16181a] border border-white/[0.08] overflow-hidden">
            <div className="hidden md:grid grid-cols-[1.4fr_0.8fr_1.2fr_1.6fr] gap-4 px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
              {["Action", "Who", "Amount", "Purpose"].map((h) => (
                <span
                  key={h}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </div>
            {ECONOMICS.map((row, i) => (
              <div
                key={row.action}
                className={`grid grid-cols-1 md:grid-cols-[1.4fr_0.8fr_1.2fr_1.6fr] gap-1 md:gap-4 px-6 py-5 text-sm leading-relaxed ${
                  i < ECONOMICS.length - 1 ? "border-b border-white/[0.06]" : ""
                }`}
              >
                <span className="flex items-baseline gap-2 md:block">
                  <span className="md:hidden text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 w-16 shrink-0">
                    Action
                  </span>
                  <span className="text-foreground font-medium">{row.action}</span>
                </span>
                <span className="flex items-baseline gap-2 md:block">
                  <span className="md:hidden text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 w-16 shrink-0">
                    Who
                  </span>
                  <span className="text-muted-foreground">{row.who}</span>
                </span>
                <span className="flex items-baseline gap-2 md:block">
                  <span className="md:hidden text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 w-16 shrink-0">
                    Amount
                  </span>
                  <span className="text-[#9296f5] font-mono text-[13px] tabular">{row.amount}</span>
                </span>
                <span className="flex items-baseline gap-2 md:block">
                  <span className="md:hidden text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 w-16 shrink-0">
                    Purpose
                  </span>
                  <span className="text-muted-foreground">{row.purpose}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Will / won't attest */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_400px] gap-12 lg:gap-16 items-center">
            <div className="max-w-[42rem]">
              <span className="eyebrow block mb-6">What we will and won&apos;t attest</span>
              <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-6">
                We refuse the claims we can&apos;t falsify.
              </h2>
              <p className="pretty text-lg text-muted-foreground leading-relaxed mb-6">
                Bombe attests to deterministic on-chain facts and document-checkable claims. It will
                not attest to a valuation or an opinion, because no honest agent can. On a judgment
                claim every agent abstains, and the contract rejects any other answer.
              </p>
              <p className="pretty text-base text-muted-foreground leading-relaxed">
                That refusal is enforced at the contract layer: a Tier-3 non-abstain attestation
                reverts, making the network&apos;s selectivity tamper-proof, not just aspirational.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {TIERS.map((t) => (
                <div
                  key={t.label}
                  className="rounded-[16px] bg-[#16181a] border border-white/[0.08] p-5"
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] px-2.5 py-1 rounded-full border border-white/[0.12] text-muted-foreground">
                      {t.label}
                    </span>
                    <span className={`text-[13px] font-semibold ${t.accent}`}>{t.verdict}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Coverage + request */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">What we cover</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            {SUPPORTED_FLOOR}+ verified RWA yields. Anything else, one request away.
          </h2>
          <p className="pretty text-base text-muted-foreground leading-relaxed mb-10 max-w-[46rem]">
            The verified catalog spans {SUPPORTED_FLOOR}+ assets across these categories,
            Mantle-native first, each a real source vetted for clean data. Coverage is open, not a
            fixed list: any yield with a public data source is attestable now (browse the live
            universe at{" "}
            <Link href="/integrate" className="text-[#9296f5] hover:text-white transition-colors">
              the discovery API
            </Link>
            ). Categories without a live source yet are not faked; they are requestable, and become
            attestable the moment a real source exists.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-14">
            {COVERAGE.map((c) => (
              <div
                key={c.name}
                className="rounded-[16px] bg-[#16181a] border border-white/[0.08] p-4"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-display text-sm text-foreground">{c.name}</h3>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                      c.live ? "text-[#86c95f]" : "text-[#d4a017]"
                    }`}
                  >
                    {c.live ? "Live" : "On request"}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{c.eg}</p>
              </div>
            ))}
          </div>

          <div className="max-w-[46rem]">
            <h3 className="font-display text-xl text-foreground mb-2">
              Can&apos;t find your asset? Request it.
            </h3>
            <p className="pretty text-[15px] text-muted-foreground leading-relaxed mb-6">
              Tell us the token and where its yield is published. If a public source exists, it
              becomes attestable as a source descriptor, often the same day.
            </p>
            <RequestAssetForm />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-[40rem]">
            <h2 className="font-display balance text-[clamp(32px,5vw,56px)] leading-[1.05] text-foreground mb-6">
              Ready to be verifiable?
            </h2>
            <p className="pretty text-lg text-muted-foreground leading-relaxed mb-10 max-w-[36rem]">
              Reading a verdict is permissionless and takes a few lines. Start there, then talk to
              us about posting your own claims.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/integrate" className={BTN_PRIMARY}>
                Read the integration guide →
              </Link>
              <Link href="/verify" className={BTN_OUTLINE}>
                Verify a claim
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
