/**
 * POST /api/v1/request, self-serve issuer paid-attestation intake (T-611/T-612).
 *
 * Verifies the issuer's non-custodial payment on-chain, then acknowledges the
 * request. The live auto-post + attest path (T-612 layer 2) activates only when
 * the operator configures the posting/attestor keys + enables it; until then the
 * request is verified and recorded for operator fulfilment. No issuer funds are
 * custodied; posting is operator-side because postClaim is OPERATOR_ROLE-gated (D18).
 */

import { recordRequest } from "@/lib/db";
import { fulfillAttestation, paidFlowLive } from "@/lib/fulfill";
import { FEATURED_SYMBOLS, SCHEME_FETCHERS } from "@bombe/agent-sdk";
import type { AssetSpec, DataAsset } from "@bombe/agent-sdk";
import { NextResponse } from "next/server";
import { http, createPublicClient, parseEther } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";

// Posting + attesting are two on-chain txs; give the function room to finish.
export const maxDuration = 60;

const CORS = { "Access-Control-Allow-Origin": "*" };
const RPC_URL = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const SITE_URL = process.env.SITE_URL ?? "https://bombe-web.vercel.app";
const PAYMENT_ADDRESS = (
  process.env.PAYMENT_ADDRESS ??
  process.env.NEXT_PUBLIC_PAYMENT_ADDRESS ??
  "0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83"
).toLowerCase();
const PRICE_MNT =
  process.env.ATTEST_PRICE_MNT ?? process.env.NEXT_PUBLIC_ATTEST_PRICE_MNT ?? "0.02";
// The curated/verified featured set is auto-attested; any other asset needs an open spec.
const SUPPORTED_ASSETS = new Set(FEATURED_SYMBOLS);

// Source schemes that are actually live. custom-http (and any other stubbed fetcher)
// is excluded so an issuer can never pay for a spec that is guaranteed to fail at
// fulfilment. Derived from the SDK registry minus the known-disabled set.
const DISABLED_SCHEMES = new Set(["custom-http"]);
const ENABLED_SCHEMES = Object.keys(SCHEME_FETCHERS).filter((s) => !DISABLED_SCHEMES.has(s));
const schemeEnabled = (s: string) => ENABLED_SCHEMES.includes(s);

// Best-effort in-process dedupe of payment tx hashes (a DB-backed store is the
// durable version, gated on OP-6).
const usedTxHashes = new Set<string>();

interface RequestBody {
  asset?: string;
  claimType?: string;
  assertedBps?: number;
  windowDays?: number;
  payer?: string;
  paymentTxHash?: string;
  /**
   * Open path: an issuer-specified/discovered source spec for a non-featured asset.
   * Its `symbol` must equal `asset`. Attested but labeled unverified.
   */
  spec?: AssetSpec;
}

/** Shallow validation of an issuer-supplied open AssetSpec. */
function validSpec(spec: unknown, asset: string): spec is AssetSpec {
  if (!spec || typeof spec !== "object") return false;
  const s = spec as Partial<AssetSpec>;
  return (
    s.symbol === asset &&
    Array.isArray(s.sources) &&
    s.sources.length > 0 &&
    s.sources.every(
      (src) => src && typeof src.ref === "string" && typeof src.scheme === "string",
    ) &&
    typeof s.independenceLabel === "string"
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}

export async function POST(req: Request) {
  if (!PAYMENT_ADDRESS) {
    return bad("Paid requests are not enabled yet (no receiving address configured).", 503);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return bad("Invalid JSON body.");
  }

  const { asset, claimType, assertedBps, windowDays, payer, paymentTxHash, spec } = body;

  if (!asset) {
    return bad("asset is required.");
  }
  // Featured assets resolve automatically; a non-featured asset is allowed only with
  // a valid open `spec` describing its sources (attested but labeled unverified).
  const isFeatured = SUPPORTED_ASSETS.has(asset);
  let openSpec: AssetSpec | undefined;
  if (!isFeatured) {
    if (!validSpec(spec, asset)) {
      return bad(
        "Unsupported asset. Use a featured symbol (GET /api/v1/assets) or include a valid `spec` for any other asset (GET /api/v1/discover).",
      );
    }
    // Reject specs whose sources use a scheme that is not live yet, before the
    // payment is consumed, so an issuer never pays for a guaranteed-to-fail spec.
    const offending = spec.sources.find((src) => !schemeEnabled(src.scheme));
    if (offending) {
      return bad(
        `Source scheme "${offending.scheme}" is not enabled yet. Supported schemes: ${ENABLED_SCHEMES.join(", ")}.`,
      );
    }
    openSpec = spec;
  }
  if (claimType !== "YIELD_BPS") {
    return bad("Unsupported claim type. Self-serve supports YIELD_BPS today.");
  }
  if (!Number.isInteger(assertedBps) || (assertedBps as number) <= 0) {
    return bad("assertedBps must be a positive integer.");
  }
  if (!Number.isInteger(windowDays) || (windowDays as number) <= 0) {
    return bad("windowDays must be a positive integer.");
  }
  if (!payer || !/^0x[0-9a-fA-F]{40}$/.test(payer)) {
    return bad("payer must be a 20-byte address.");
  }
  if (!paymentTxHash || !/^0x[0-9a-fA-F]{64}$/.test(paymentTxHash)) {
    return bad("paymentTxHash must be a 32-byte transaction hash.");
  }

  const txKey = paymentTxHash.toLowerCase();
  if (usedTxHashes.has(txKey)) {
    return bad("This payment has already been used for a request.", 409);
  }

  // Verify the payment on-chain.
  const client = createPublicClient({
    chain: mantleSepoliaTestnet,
    transport: http(RPC_URL, { timeout: 15_000 }),
  });

  try {
    // Wait for the tx to be mined and the receipt to reach our RPC. A one-shot
    // read raced users who submit right after paying (the "receipt could not be
    // found" failure), even though their payment was valid. Bounded so we stay
    // well within maxDuration.
    const receipt = await client.waitForTransactionReceipt({
      hash: paymentTxHash as `0x${string}`,
      timeout: 30_000,
      pollingInterval: 2_000,
    });

    if (receipt.status !== "success") {
      return bad("Payment transaction did not succeed on-chain.");
    }
    const tx = await client.getTransaction({ hash: paymentTxHash as `0x${string}` });
    if ((tx.to ?? "").toLowerCase() !== PAYMENT_ADDRESS) {
      return bad("Payment was not sent to the expected receiving address.");
    }
    if (tx.from.toLowerCase() !== payer.toLowerCase()) {
      return bad("Payment sender does not match the declared payer.");
    }
    if (tx.value < parseEther(PRICE_MNT)) {
      return bad(`Payment is below the required fee of ${PRICE_MNT} MNT.`);
    }
  } catch (e) {
    return bad(
      `Could not confirm the payment in time (the network may be slow): ${
        e instanceof Error ? e.message : "read failed"
      }. Your payment is safe and was not used; keep the transaction hash and submit it again in a few seconds.`,
      502,
    );
  }

  // Durable dedupe + record in Neon (survives serverless cold starts); the
  // in-memory set is the fallback when the DB is not configured.
  const isNew = await recordRequest({
    paymentTxHash,
    payer,
    asset,
    claimType: "YIELD_BPS",
    assertedBps: assertedBps as number,
    windowDays: windowDays as number,
  });
  if (!isNew) {
    return bad("This payment has already been used for a request.", 409);
  }
  usedTxHashes.add(txKey);

  // Payment verified. If the live post path is enabled, post + attest now and
  // return the claim; otherwise acknowledge for operator fulfilment.
  if (paidFlowLive()) {
    const claimId = `${asset}-REQ-${paymentTxHash.slice(2, 12)}`;
    try {
      const result = await fulfillAttestation({
        claimId,
        asset: asset as DataAsset,
        assertedBps: assertedBps as number,
        windowDays: windowDays as number,
        spec: openSpec,
      });
      return NextResponse.json(
        {
          ok: true,
          fulfilled: true,
          claimId: result.claimId,
          decision: result.decision,
          reasoningHash: result.reasoningHash,
          verifyUrl: `${SITE_URL}/verify?q=${encodeURIComponent(result.claimId)}`,
          message: `Attested ${result.decision} on-chain. You can verify it yourself.`,
        },
        { headers: CORS },
      );
    } catch (e) {
      // 202 Accepted: the payment is verified + recorded, but automatic posting
      // failed and the claim needs operator fulfilment. 200 would wrongly read as
      // fully done; 202 signals "accepted, processing pending".
      return NextResponse.json(
        {
          ok: true,
          fulfilled: false,
          message:
            "Payment verified and recorded. Automatic posting hit an error; the operator will fulfil it. Keep your payment transaction hash.",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 202, headers: CORS },
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      verified: true,
      asset,
      claimType,
      assertedBps,
      windowDays,
      payer,
      paymentTxHash,
      message:
        "Payment verified on-chain. Your request is recorded; the operator posts supported-type claims and your attestation will appear on the verify page. Keep your payment transaction hash.",
    },
    { headers: CORS },
  );
}

export function GET() {
  return NextResponse.json(
    {
      service: "Bombe self-serve attestation request",
      method: "POST",
      supportedAssets: [...SUPPORTED_ASSETS],
      claimType: "YIELD_BPS",
      priceMnt: PRICE_MNT,
      note: "Non-custodial: pay from your own wallet to the receiving address, then POST the payment tx hash with your claim details.",
    },
    { headers: CORS },
  );
}
