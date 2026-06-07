"use client";

/**
 * /request, self-serve issuer paid attestation (T-611).
 *
 * The issuer composes a supported-type yield claim, connects their own wallet
 * (non-custodial), and pays the fee directly from it (direct MNT transfer rail;
 * x402 is the planned fallback rail). On a confirmed payment the request is
 * submitted to /api/v1/request, which verifies the payment and (when the live
 * post path is enabled, T-612) posts + attests and returns the claim ID.
 *
 * Posting is necessarily operator-side: postClaim is OPERATOR_ROLE-gated on the
 * deployed contract (D18). We never custody issuer funds.
 */

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useState } from "react";
import { createWalletClient, custom, parseEther } from "viem";
import { mantleSepoliaTestnet } from "viem/chains";

// Minimal EIP-1193 provider shape (avoids `any`).
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
function getProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

// Defaults to the deployer/operator address (operator decision, "for now");
// override with NEXT_PUBLIC_PAYMENT_ADDRESS.
const PAYMENT_ADDRESS =
  process.env.NEXT_PUBLIC_PAYMENT_ADDRESS ?? "0xe41532F6E917e3995Bbb1c7e87A65Ff7a7957a83";
const PRICE_MNT = process.env.NEXT_PUBLIC_ATTEST_PRICE_MNT ?? "0.02";
const MANTLE_SEPOLIA_HEX = "0x138b"; // 5003

const ASSETS = [
  { id: "mETH", label: "mETH (Mantle staked ETH yield)" },
  { id: "USDY", label: "USDY (Ondo tokenized treasury yield)" },
] as const;

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected"; account: string }
  | { kind: "paying"; account: string }
  | { kind: "submitting"; account: string; txHash: string }
  | { kind: "done"; account: string; txHash: string; claimId?: string; message: string }
  | { kind: "error"; message: string };

export default function RequestPage() {
  const [asset, setAsset] = useState<string>("mETH");
  const [assertedBps, setAssertedBps] = useState<string>("");
  const [windowDays, setWindowDays] = useState<string>("30");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const account =
    status.kind === "connected" ||
    status.kind === "paying" ||
    status.kind === "submitting" ||
    status.kind === "done"
      ? status.account
      : null;

  const valid =
    /^\d+$/.test(assertedBps) &&
    Number(assertedBps) > 0 &&
    /^\d+$/.test(windowDays) &&
    Number(windowDays) > 0;

  async function connect() {
    const provider = getProvider();
    if (!provider) {
      setStatus({
        kind: "error",
        message:
          "No wallet detected. Install a Mantle-compatible wallet (e.g. MetaMask) and retry.",
      });
      return;
    }
    setStatus({ kind: "connecting" });
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const acct = accounts[0];
      if (!acct) throw new Error("No account returned");
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MANTLE_SEPOLIA_HEX }],
        });
      } catch {
        // chain not added / switch declined; payment will still validate the chain
      }
      setStatus({ kind: "connected", account: acct });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Wallet connection failed.",
      });
    }
  }

  async function payAndSubmit() {
    const provider = getProvider();
    if (!provider || !account) return;
    if (!PAYMENT_ADDRESS) {
      setStatus({
        kind: "error",
        message:
          "Payments are not yet enabled (no receiving address configured). Check back shortly.",
      });
      return;
    }
    setStatus({ kind: "paying", account });
    try {
      const walletClient = createWalletClient({
        account: account as `0x${string}`,
        chain: mantleSepoliaTestnet,
        transport: custom(provider),
      });
      const txHash = await walletClient.sendTransaction({
        to: PAYMENT_ADDRESS as `0x${string}`,
        value: parseEther(PRICE_MNT),
      });

      setStatus({ kind: "submitting", account, txHash });
      const res = await fetch("/api/v1/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset,
          claimType: "YIELD_BPS",
          assertedBps: Number(assertedBps),
          windowDays: Number(windowDays),
          payer: account,
          paymentTxHash: txHash,
        }),
      });
      const data = (await res.json()) as { claimId?: string; message?: string; error?: string };
      if (!res.ok) {
        setStatus({
          kind: "done",
          account,
          txHash,
          message:
            data.error ??
            "Payment sent. We could not auto-confirm the request; the operator will fulfill it. Keep your transaction hash.",
        });
        return;
      }
      setStatus({
        kind: "done",
        account,
        txHash,
        claimId: data.claimId,
        message: data.message ?? "Payment received. Your claim is being attested on-chain.",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Payment failed or was rejected.",
      });
    }
  }

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

          <div className="rounded-[20px] bg-[#16181a] border border-[rgba(255,255,255,0.06)] p-6 mb-6">
            <label className="block mb-4">
              <span className="block text-[13px] text-[rgba(255,255,255,0.72)] mb-1.5">Asset</span>
              <select
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[rgba(255,255,255,0.1)] text-[15px] text-[#ffffff] focus:outline-none focus:border-[#494fdf]"
              >
                {ASSETS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid sm:grid-cols-2 gap-4 mb-2">
              <label className="block">
                <span className="block text-[13px] text-[rgba(255,255,255,0.72)] mb-1.5">
                  Asserted yield (bps)
                </span>
                <input
                  inputMode="numeric"
                  value={assertedBps}
                  onChange={(e) => setAssertedBps(e.target.value)}
                  placeholder="e.g. 355"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[rgba(255,255,255,0.1)] text-[15px] text-[#ffffff] font-mono placeholder:text-[#505a63] focus:outline-none focus:border-[#494fdf]"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-[rgba(255,255,255,0.72)] mb-1.5">
                  Window (days)
                </span>
                <input
                  inputMode="numeric"
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[rgba(255,255,255,0.1)] text-[15px] text-[#ffffff] font-mono placeholder:text-[#505a63] focus:outline-none focus:border-[#494fdf]"
                />
              </label>
            </div>
            <p className="text-[12px] text-[#505a63] mt-2">
              The window is always shown with the verdict; a short window is never described as a
              30-day yield.
            </p>
          </div>

          {/* On-chain payload preview */}
          <div className="rounded-[16px] bg-[#0f1012] border border-[rgba(255,255,255,0.06)] p-5 mb-6">
            <p className="text-[11px] text-[#505a63] font-mono uppercase tracking-[0.5px] mb-2">
              what gets posted on-chain
            </p>
            <pre className="text-[12px] text-[#8d969e] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(
                {
                  asset,
                  claimType: "YIELD_BPS",
                  assertedBps: assertedBps ? Number(assertedBps) : null,
                  windowDays: windowDays ? Number(windowDays) : null,
                },
                null,
                2,
              )}
            </pre>
            <p className="text-[13px] text-[rgba(255,255,255,0.6)] mt-3">
              Fee: <span className="font-mono text-[#ffffff]">{PRICE_MNT} MNT</span> paid from your
              wallet. Posting is done by the protocol operator key (the contract only accepts posts
              from an authorized role); you receive the on-chain attestation back.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {!account ? (
              <Button variant="primary" onClick={connect} disabled={status.kind === "connecting"}>
                {status.kind === "connecting" ? "Connecting…" : "Connect wallet"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={payAndSubmit}
                disabled={!valid || status.kind === "paying" || status.kind === "submitting"}
              >
                {status.kind === "paying"
                  ? "Confirm in wallet…"
                  : status.kind === "submitting"
                    ? "Submitting…"
                    : `Pay ${PRICE_MNT} MNT and request`}
              </Button>
            )}
            {account && (
              <span className="text-[13px] text-[rgba(255,255,255,0.5)] font-mono">
                {account.slice(0, 8)}…{account.slice(-6)} connected
              </span>
            )}
          </div>

          {/* Status surface */}
          {status.kind === "error" && (
            <div className="mt-6 rounded-[14px] border border-[rgba(226,59,74,0.3)] bg-[rgba(226,59,74,0.08)] px-5 py-4 text-[14px] text-[#f0a0a8]">
              {status.message}
            </div>
          )}
          {status.kind === "done" && (
            <div className="mt-6 rounded-[14px] border border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.06)] px-5 py-4">
              <p className="text-[14px] text-[#7ee08a] mb-2">{status.message}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.6)] font-mono break-all mb-2">
                payment tx: {status.txHash}
              </p>
              {status.claimId && (
                <Link
                  href={`/verify?q=${encodeURIComponent(status.claimId)}`}
                  className="text-[13px] text-[#494fdf] hover:text-[#6b70e8]"
                >
                  Track and verify your attestation →
                </Link>
              )}
            </div>
          )}

          <p className="text-[13px] text-[#505a63] mt-8 leading-[1.6]">
            Supported today: mETH and USDY yield, the claims Bombe can falsifiably verify against a
            wired data source. Other assets need an adapter; that open onboarding is on the roadmap.
            Already integrated? Read the{" "}
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
