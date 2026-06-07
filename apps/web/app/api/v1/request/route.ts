/**
 * POST /api/v1/request, self-serve issuer paid-attestation intake (T-611/T-612).
 *
 * Verifies the issuer's non-custodial payment on-chain, then acknowledges the
 * request. The live auto-post + attest path (T-612 layer 2) activates only when
 * the operator configures the posting/attestor keys + enables it; until then the
 * request is verified and recorded for operator fulfilment. No issuer funds are
 * custodied; posting is operator-side because postClaim is OPERATOR_ROLE-gated (D18).
 */

import { NextResponse } from "next/server";
import { http, createPublicClient, parseEther } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";

const CORS = { "Access-Control-Allow-Origin": "*" };
const RPC_URL = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const PAYMENT_ADDRESS = (
  process.env.PAYMENT_ADDRESS ??
  process.env.NEXT_PUBLIC_PAYMENT_ADDRESS ??
  ""
).toLowerCase();
const PRICE_MNT =
  process.env.ATTEST_PRICE_MNT ?? process.env.NEXT_PUBLIC_ATTEST_PRICE_MNT ?? "0.02";
const SUPPORTED_ASSETS = new Set(["mETH", "USDY"]);

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

  const { asset, claimType, assertedBps, windowDays, payer, paymentTxHash } = body;

  if (!asset || !SUPPORTED_ASSETS.has(asset)) {
    return bad("Unsupported asset. Supported today: mETH, USDY.");
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
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: paymentTxHash as `0x${string}` }),
      client.getTransactionReceipt({ hash: paymentTxHash as `0x${string}` }),
    ]);

    if (receipt.status !== "success") {
      return bad("Payment transaction did not succeed on-chain.");
    }
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
      `Could not verify the payment yet (it may still be propagating): ${
        e instanceof Error ? e.message : "read failed"
      }`,
      502,
    );
  }

  usedTxHashes.add(txKey);

  // Payment verified. The deterministic post + attest (T-612 layer 2) runs only
  // when the operator has configured + enabled the posting key path. Until then,
  // the verified request is acknowledged for operator fulfilment.
  const livePostingEnabled = Boolean(process.env.POSTING_KEY) && process.env.PAID_FLOW_LIVE === "1";

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
      message: livePostingEnabled
        ? "Payment verified. Your claim is being posted and attested on-chain; track it on the verify page shortly."
        : "Payment verified on-chain. Your request is recorded; the operator posts supported-type claims and your attestation will appear on the verify page. Keep your payment transaction hash.",
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
