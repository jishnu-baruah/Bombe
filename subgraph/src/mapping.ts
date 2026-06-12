// Bombe subgraph mappings: turn AgentAttestation events into Claim/Attestation
// entities. Generated types (Claim, Attestation, the event classes) come from
// `graph codegen` reading schema.graphql + the ABI; run codegen before build.
//
// Decision enum mirrors the contract: 0 = VALID, 1 = REJECTED, 2 = ABSTAIN.

import { BigInt } from "@graphprotocol/graph-ts";
import { Attested, ClaimClosed, ClaimPosted } from "../generated/AgentAttestation/AgentAttestation";
import { Attestation, Claim } from "../generated/schema";

function decisionLabel(d: i32): string {
  if (d === 0) return "VALID";
  if (d === 1) return "REJECTED";
  if (d === 2) return "ABSTAIN";
  return "UNKNOWN";
}

export function handleClaimPosted(event: ClaimPosted): void {
  const id = event.params.claimId.toHexString();
  let claim = Claim.load(id);
  if (claim == null) {
    claim = new Claim(id);
  }
  claim.tier = event.params.tier;
  claim.claimHash = event.params.claimHash;
  claim.claimURI = event.params.claimURI;
  claim.claimFee = event.params.claimFee;
  claim.closed = false;
  claim.postTxHash = event.transaction.hash;
  claim.postedAt = event.block.timestamp;
  claim.postedAtBlock = event.block.number;
  claim.save();
}

export function handleAttested(event: Attested): void {
  const claimId = event.params.claimId.toHexString();

  // Ensure a Claim row exists even if the post log is outside the start range.
  let claim = Claim.load(claimId);
  if (claim == null) {
    claim = new Claim(claimId);
    claim.tier = 0;
    claim.closed = false;
    claim.postedAt = event.block.timestamp;
    claim.postedAtBlock = event.block.number;
    claim.save();
  }

  const attestor = event.params.attestor;
  const id = claimId + "-" + attestor.toHexString();
  let att = Attestation.load(id);
  if (att == null) {
    att = new Attestation(id);
  }
  att.claim = claimId;
  att.attestor = attestor;
  att.decision = decisionLabel(event.params.decision);
  att.confidenceBps = event.params.confidenceBps;
  att.lockedStake = event.params.lockedStake;
  att.txHash = event.transaction.hash;
  att.attestedAt = event.block.timestamp;
  att.attestedAtBlock = event.block.number;
  att.save();
}

export function handleClaimClosed(event: ClaimClosed): void {
  const id = event.params.claimId.toHexString();
  const claim = Claim.load(id);
  if (claim == null) return;
  claim.closed = true;
  claim.save();
}

// Silence the unused-import lint in environments without codegen run yet.
const _keepBigInt = BigInt.fromI32(0);
