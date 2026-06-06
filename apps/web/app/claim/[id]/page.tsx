/**
 * /claim/[id] — Server component wrapper.
 *
 * Resolves params, fetches claim + attestation data server-side via data-source.ts
 * (which selects demo-data or live-data based on MODE env), then renders the
 * client component (ClaimClient.tsx) with pre-fetched data as props.
 *
 * MODE=mock → demo-data fixtures (no network).
 * MODE=live → viem reads from deployed Mantle Sepolia contracts (T-J04).
 *
 * On RPC error the live getters return undefined/[] and the page renders
 * gracefully (claim-not-found / no-attestations state, never crashes).
 *
 * T-J04 — live on-chain data layer.
 */

import { getAttestations, getClaim } from "@/lib/data-source";
import ClaimPage from "./ClaimClient";

export const revalidate = 30; // Next.js ISR: re-fetch every 30s in live mode

export default async function ClaimServerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [claim, attestations] = await Promise.all([getClaim(id), getAttestations(id)]);

  return <ClaimPage id={id} claim={claim} attestations={attestations} />;
}
