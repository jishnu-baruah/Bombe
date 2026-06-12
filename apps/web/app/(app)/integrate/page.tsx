import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

// Developer-facing "how easy + what you gain" page. Short code peeks only;
// the full runnable reference lives in docs/INTEGRATION.md. Static server component.

const BENEFITS = [
  {
    icon: "◷",
    title: "Nothing to run",
    body: "Reading a verdict is a few view calls. No infra, no keys, no indexer.",
  },
  {
    icon: "⛓",
    title: "Explorer-visible",
    body: "Every attestation is a Mantle transaction you can link to and audit.",
  },
  {
    icon: "✓",
    title: "Verifiable",
    body: "Re-derive the reasoning hash from the public trace and confirm it on-chain.",
  },
  {
    icon: "⊗",
    title: "Safe by contract",
    body: "Judgment claims can only abstain. The chain enforces it, not a library.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Point at the contract",
    body: "One address on Mantle Sepolia. The read path is fully permissionless.",
    code: `const ATTESTATION = "0xf2473a0a55D997233C8fBF987c197e7d2180470A";
const CHAIN_ID = 5003; // Mantle Sepolia`,
  },
  {
    n: "02",
    title: "Read the verdict",
    body: "List the attestors on a claim and read each decision and confidence.",
    code: `const attestors = await read("getClaimAttestors", [claimId]);
const a = await read("getAttestation", [claimId, attestors[0]]);
// a.decision -> VALID | REJECTED | ABSTAIN`,
  },
  {
    n: "03",
    title: "Read the trust score",
    body: "Each attestor carries a 0 to 100 accuracy score from past settlements.",
    code: `const score = await readLeaderboard("trustScore", [attestor]);
// 0..100, higher means a stronger track record`,
  },
  {
    n: "04",
    title: "Verify the trace",
    body: "Recompute the reasoning hash from the public trace and match it on-chain.",
    code: `const local = keccak256(canonicalJson(trace));
local === a.reasoningHash; // true means the verdict was not edited`,
  },
] as const;

export default function IntegratePage() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="hero-ambient relative px-6 lg:px-12 pt-12 lg:pt-20 pb-20 lg:pb-24">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">Integrate</span>
          <h1 className="font-display balance text-[clamp(40px,7vw,80px)] leading-[1.04] text-foreground mb-8">
            Four steps. Read it, verify it, trust it.
          </h1>
          <p className="pretty text-lg text-muted-foreground leading-relaxed max-w-[40rem] mb-10">
            Consuming an attestation is a handful of read calls against one contract. No service to
            run, no account to create. Here is the whole shape of it before you open the full guide.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/issuers">
              <Button variant="outline-dark">Why issuers use Bombe →</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits strip */}
      <section className="px-6 lg:px-12 pb-6">
        <div className="max-w-[1200px] mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="rounded-[16px] bg-[#16181a] border border-white/[0.08] p-5 transition-all duration-200 hover:border-white/[0.16]"
            >
              <div className="text-[22px] mb-3 text-[#494fdf]">{b.icon}</div>
              <h3 className="font-display text-base text-foreground mb-1.5">{b.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-[1.5]">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 mt-10 border-t border-white/[0.08] bg-band">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">The read path</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-12">
            Permissionless, today.
          </h2>

          <div className="flex flex-col gap-6">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-center rounded-[20px] bg-[#16181a] border border-white/[0.08] p-6 md:p-8 transition-all duration-200 hover:border-white/[0.16]"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono text-[14px] text-[#9296f5] tabular">{s.n}</span>
                    <h3 className="font-display text-xl text-foreground">{s.title}</h3>
                  </div>
                  <p className="pretty text-[15px] text-muted-foreground leading-relaxed max-w-[28rem]">
                    {s.body}
                  </p>
                </div>
                <pre className="rounded-[12px] bg-[#0a0a0a] border border-white/[0.08] p-4 overflow-x-auto text-[12.5px] leading-[1.6] text-muted-foreground font-mono">
                  <code>{s.code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Headless agent access */}
      <section className="px-6 lg:px-12 py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">For agents</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            Headless, end to end.
          </h2>
          <p className="pretty text-base text-muted-foreground leading-relaxed max-w-[40rem] mb-8">
            An AI agent can use Bombe with no human: discover assets, read a verdict, verify it, and
            even pay for a new attestation, over a keyless JSON API or an MCP server. The
            integration contract is in{" "}
            <a
              href="https://github.com/jishnu-baruah/Bombe/blob/main/SKILL.md"
              target="_blank"
              rel="noreferrer"
              className="text-[#9296f5] hover:text-white transition-colors"
            >
              SKILL.md
            </a>
            ; the MCP server is{" "}
            <code className="font-mono text-xs px-2.5 py-1 rounded-[8px] border border-white/[0.12] text-muted-foreground">
              @bombe/mcp
            </code>
            .
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                t: "bombe_get_schema",
                b: "What to submit + what is checked per claim type (the standard).",
              },
              {
                t: "bombe_list_assets",
                b: "The curated, verified RWA yields + the contract.",
              },
              {
                t: "bombe_discover_assets",
                b: "Enumerate the full open universe of attestable yields, any chain.",
              },
              { t: "bombe_get_claim", b: "Read a claim and its on-chain verdicts." },
              { t: "bombe_verify_claim", b: "Re-derive the reasoning hash and compare to chain." },
              {
                t: "bombe_check_nav",
                b: "Cross-check a vault NAV read straight off the chain (ERC-4626).",
              },
              {
                t: "bombe_check_document",
                b: "Cross-check a figure against a pinned, hashed document.",
              },
              {
                t: "bombe_request_attestation",
                b: "Pay from your wallet, get an attestation back.",
              },
            ].map((x) => (
              <div
                key={x.t}
                className="rounded-[16px] bg-[#16181a] border border-white/[0.08] p-5 transition-all duration-200 hover:border-white/[0.16]"
              >
                <code className="font-mono text-[13px] text-foreground">{x.t}</code>
                <p className="text-[13px] text-muted-foreground leading-[1.5] mt-2">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Real, auditable reasoning */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08] bg-band">
        <div className="max-w-[1200px] mx-auto">
          <span className="eyebrow block mb-6">Real reasoning, deterministic verdict</span>
          <h2 className="font-display balance text-4xl lg:text-5xl leading-[1.1] text-foreground mb-4">
            A real model explains; the math decides.
          </h2>
          <p className="pretty text-base text-muted-foreground leading-relaxed max-w-[40rem] mb-8">
            Each attestation carries a genuine, model-authored train of thought that reasons over
            the real fetched evidence and cites each source by link, so it is auditable. The verdict
            itself is not the model&apos;s opinion: it is a deterministic reconciliation you can
            rerun, and the whole trace is hashed on-chain. Pay to attest your own supported yield at{" "}
            <Link href="/request" className="text-[#9296f5] hover:text-white transition-colors">
              /request
            </Link>
            , then check any verdict at{" "}
            <Link href="/verify" className="text-[#9296f5] hover:text-white transition-colors">
              /verify
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Honest note on posting */}
      <section className="px-6 lg:px-12 py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto">
          <div className="rounded-[20px] border border-[rgba(73,79,223,0.25)] bg-[rgba(73,79,223,0.06)] p-8 max-w-[44rem]">
            <span className="eyebrow block mb-3">Posting a claim</span>
            <p className="pretty text-base text-muted-foreground leading-relaxed">
              Reading and verifying are open to anyone. To get a new attestation you pay the fee
              from your own wallet at{" "}
              <Link href="/request" className="text-[#9296f5] hover:text-white transition-colors">
                /request
              </Link>{" "}
              and the network posts the claim and attests it for you (the contract only accepts
              posts from an authorized role, so the protocol key does the posting; your funds are
              never custodied). Supported claim types are auto-attested; others are queued. A fully
              permissionless submit path is on the roadmap.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-12 py-20 lg:py-28 border-t border-white/[0.08] bg-band">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-[36rem]">
            <h2 className="font-display balance text-[clamp(32px,5vw,56px)] leading-[1.05] text-foreground mb-6">
              See the whole thing.
            </h2>
            <p className="pretty text-lg text-muted-foreground leading-relaxed mb-10 max-w-[34rem]">
              The full guide has the exact signatures, the live addresses, and an end-to-end example
              you can run against Mantle Sepolia.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="https://github.com/jishnu-baruah/Bombe/blob/main/docs/INTEGRATION.md"
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="primary">Open the full guide →</Button>
              </a>
              <Link href="/live">
                <Button variant="outline-dark">Watch a live attestation</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
