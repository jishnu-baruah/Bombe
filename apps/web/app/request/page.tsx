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
    <div className="bg-[#000000] text-[#ffffff] min-h-screen">
      <section className="px-6 pt-[120px] pb-[88px]">
        <div className="max-w-2xl mx-auto">
          <p className="text-[13px] text-[#494fdf] font-semibold tracking-[0.8px] uppercase mb-4">
            Request an attestation
          </p>
          <h1 className="text-[clamp(30px,5vw,46px)] font-semibold leading-[1.1] tracking-[-0.6px] mb-4 balance">
            Get your yield claim attested on-chain.
          </h1>
          <p className="text-[17px] text-[rgba(255,255,255,0.6)] leading-[1.55] mb-8 pretty">
            Compose a yield claim for a supported asset, connect your own wallet, and pay the fee
            from it. Bombe attestors check it against on-chain data and sign the verdict, which you
            can verify yourself. We never hold your funds.
          </p>

          <RequestAttestationForm />

          <p className="text-[13px] text-[#505a63] mt-8 leading-[1.6]">
            Featured assets are attested automatically. Any other RWA yield with a public data
            source is attestable too: browse{" "}
            <a
              href="https://bombe-web.vercel.app/api/v1/discover?rwaOnly=1"
              target="_blank"
              rel="noreferrer"
              className="text-[#494fdf] hover:text-[#6b70e8]"
            >
              the discovery API
            </a>{" "}
            and pass its descriptor. Already integrated? Read the{" "}
            <Link href="/integrate" className="text-[#494fdf] hover:text-[#6b70e8]">
              integration guide
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
