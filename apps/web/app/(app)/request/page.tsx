/**
 * /request — self-serve issuer paid attestation (T-611/T-612).
 *
 * Thin page wrapper around the shared RequestAttestationForm (also embedded on
 * /issuers). The issuer connects their own wallet, pays the fee, and the network
 * posts + attests; posting is operator-side because postClaim is OPERATOR_ROLE-gated
 * (D18). Funds are never custodied.
 */

import Link from "next/link";
import { RequestAttestationForm } from "./RequestAttestationForm";

export default function RequestPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <section className="hero-ambient relative px-6 lg:px-12 pt-12 lg:pt-20 pb-20 lg:pb-28">
        <div className="max-w-2xl mx-auto">
          <span className="eyebrow block mb-6">Request an attestation</span>
          <h1 className="font-display balance text-[clamp(30px,5vw,46px)] leading-[1.1] text-foreground mb-4">
            Get your yield claim attested on-chain.
          </h1>
          <p className="pretty text-lg text-muted-foreground leading-relaxed mb-8">
            Compose a yield claim for a supported asset, connect your own wallet, and pay the fee
            from it. Bombe attestors check it against on-chain data and sign the verdict, which you
            can verify yourself. We never hold your funds.
          </p>

          <RequestAttestationForm />

          <p className="text-[13px] text-muted-foreground/70 mt-8 leading-[1.6]">
            Featured assets are attested automatically. Any other RWA yield with a public data
            source is attestable too: browse{" "}
            <a
              href="https://bombe-web.vercel.app/api/v1/discover?rwaOnly=1"
              target="_blank"
              rel="noreferrer"
              className="text-[#9296f5] hover:text-white transition-colors"
            >
              the discovery API
            </a>{" "}
            and pass its descriptor. Already integrated? Read the{" "}
            <Link href="/integrate" className="text-[#9296f5] hover:text-white transition-colors">
              integration guide
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
