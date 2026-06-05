// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice PRD §6.2 canonical build interface for the YieldProof attestor.
/// @dev The real YieldProof contract is vendored as a reference submodule at
///      `contracts/lib/yieldproof`, but it uses an incompatible model: uint256
///      claimIds, a fee-based `attestToClaim`, and `struct Attestor{bool isRegistered; uint256 stake}`
///      with no `{attestor,claimId,decision,timestamp}` record.  That Hardhat project
///      cannot be imported by Foundry without significant shim work, so this PRD-spec'd
///      interface is retained as the canonical build interface per §6.2 fallback.
///      Our contracts do NOT consume YieldProof's registry directly.
interface IYieldProofAttestor {
    struct Attestation {
        address attestor;
        bytes32 claimId;
        uint8 decision;
        uint256 timestamp;
    }

    function getAttestation(
        bytes32 claimId,
        address attestor
    ) external view returns (Attestation memory);
}
