// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
