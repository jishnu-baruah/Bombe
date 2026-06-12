/**
 * dispute-onchain.ts — sign the real AgentSlashing.openDispute on Mantle Sepolia.
 *
 * The public dispute intake (/api/dispute) is keyless. The on-chain dispute
 * primitive is permissioned to registered attestors and bonds 0.05 MNT, so the
 * operator carries a vetted dispute on-chain through this module (server-side,
 * registered challenger key). openDispute -> vote -> resolveDispute is the real
 * PRD mechanism; this only opens the bonded dispute. Server-side only.
 */

import { AgentSlashingAbi } from "@bombe/shared";
import {
  http,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  parseEther,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";
import { getRunMode } from "./server-config";

const RPC_URL = process.env.RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const SLASHING_ADDRESS = (process.env.SLASHING_ADDRESS ??
  "0xA8630BF1710F60e716b5Ab4ecbD12FD6C04eb864") as `0x${string}`;
const DISPUTE_BOND = parseEther("0.05");
const toBytes32 = (s: string) => stringToHex(s, { size: 32 });

/** The challenger key: a registered attestor wallet, distinct from the accused. */
function challengerKey(): string | undefined {
  return process.env.CHALLENGER_KEY ?? process.env.ATTESTOR_KEY;
}

/** True only when on-chain escalation is possible (live mode + a challenger key). */
export function disputeEscalationLive(): boolean {
  return getRunMode() === "live" && Boolean(challengerKey());
}

export interface OpenDisputeResult {
  txHash: string;
  status: "success" | "reverted";
  disputeId: string | null;
  challenger: string;
}

/** Open the bonded on-chain dispute against `accused` on `claimId`. */
export async function openDisputeOnChain(
  claimId: string,
  accused: string,
): Promise<OpenDisputeResult> {
  const key = challengerKey();
  if (!key) throw new Error("No challenger key configured (CHALLENGER_KEY or ATTESTOR_KEY).");
  const account = privateKeyToAccount(key as `0x${string}`);
  if (account.address.toLowerCase() === accused.toLowerCase()) {
    throw new Error(
      "The challenger key is the accused attestor; configure a distinct CHALLENGER_KEY.",
    );
  }

  const chain = mantleSepoliaTestnet;
  const pub = createPublicClient({ chain, transport: http(RPC_URL) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });

  const hash = await wallet.sendTransaction({
    account,
    to: SLASHING_ADDRESS,
    data: encodeFunctionData({
      abi: AgentSlashingAbi,
      functionName: "openDispute",
      args: [toBytes32(claimId), accused as `0x${string}`],
    }),
    value: DISPUTE_BOND,
    chain,
  });
  const rc = await pub.waitForTransactionReceipt({ hash });

  // Decode DisputeOpened (from the slashing contract) for the on-chain disputeId.
  let disputeId: string | null = null;
  if (rc.status === "success") {
    for (const log of rc.logs) {
      if (log.address.toLowerCase() !== SLASHING_ADDRESS.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: AgentSlashingAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "DisputeOpened") {
          disputeId = String((ev.args as { disputeId?: bigint }).disputeId ?? "");
          break;
        }
      } catch {
        // not the event we want
      }
    }
  }

  return { txHash: hash, status: rc.status, disputeId, challenger: account.address };
}
