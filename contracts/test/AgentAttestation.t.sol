// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentAttestation } from "../src/AgentAttestation.sol";

/// @title AgentAttestationTest
/// @notice Forge test suite for AgentAttestation (PRD §6.2, T-103, T-104).
///         Covers claim posting, attestation happy paths, all required reverts,
///         tier-3 safety enforcement (§14.5), and stake locking rules (§14.6).
contract AgentAttestationTest is Test {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 internal constant MIN_BOND = 0.1 ether;
    uint256 internal constant ATTEST_LOCK = 0.02 ether;
    string internal constant META_URI = "ipfs://QmAgentMeta";
    string internal constant TRACE_URI = "ipfs://QmTrace";

    // Fixture claim data
    bytes32 internal constant CLAIM_ID_1 = keccak256("claim-1");
    bytes32 internal constant CLAIM_ID_T3 = keccak256("claim-tier3");
    bytes32 internal constant CLAIM_HASH = keccak256("claimPayload");
    bytes32 internal constant SOURCES_HASH = keccak256("sources");
    bytes32 internal constant REASONING_HASH = keccak256("reasoning");

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    AgentRegistry internal registry;
    AgentAttestation internal attestation;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal agent1 = makeAddr("agent1");
    address internal agent2 = makeAddr("agent2");
    address internal stranger = makeAddr("stranger");

    // Role selectors cached to avoid consuming pranks on view calls.
    bytes32 internal operatorRole;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        registry = new AgentRegistry(admin);
        attestation = new AgentAttestation(address(registry), admin, operator);

        operatorRole = attestation.OPERATOR_ROLE();

        // Fund agents and register them.
        vm.deal(agent1, 10 ether);
        vm.deal(agent2, 10 ether);

        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        vm.prank(agent2);
        registry.registerAgent{ value: MIN_BOND }(META_URI);
    }

    // -------------------------------------------------------------------------
    // Helper: post a tier-1 claim as operator
    // -------------------------------------------------------------------------

    function _postClaim1() internal {
        vm.prank(operator);
        attestation.postClaim(CLAIM_ID_1, 1, CLAIM_HASH, "ipfs://QmClaim1");
    }

    function _postClaimT3() internal {
        vm.prank(operator);
        attestation.postClaim(CLAIM_ID_T3, 3, CLAIM_HASH, "ipfs://QmClaimT3");
    }

    // =========================================================================
    // 1. test_PostClaim + test_RevertWhen_PostClaim_NotOperator
    // =========================================================================

    function test_PostClaim() public {
        vm.expectEmit(true, false, false, true, address(attestation));
        emit AgentAttestation.ClaimPosted(CLAIM_ID_1, 1, CLAIM_HASH, "ipfs://QmClaim1");

        _postClaim1();

        AgentAttestation.Claim memory c = attestation.getClaim(CLAIM_ID_1);
        assertTrue(c.posted, "claim should be posted");
        assertFalse(c.closed, "claim should not be closed");
        assertEq(c.tier, 1, "tier mismatch");
        assertEq(c.claimHash, CLAIM_HASH, "claimHash mismatch");
        assertEq(c.attestorCount, 0, "attestorCount should be 0");
    }

    function test_RevertWhen_PostClaim_NotOperator() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), stranger, operatorRole
            )
        );
        vm.prank(stranger);
        attestation.postClaim(CLAIM_ID_1, 1, CLAIM_HASH, "ipfs://QmClaim1");
    }

    function test_RevertWhen_PostClaim_InvalidTier() public {
        vm.expectRevert(AgentAttestation.InvalidTier.selector);
        vm.prank(operator);
        attestation.postClaim(keccak256("bad-tier"), 0, CLAIM_HASH, "ipfs://x");

        vm.expectRevert(AgentAttestation.InvalidTier.selector);
        vm.prank(operator);
        attestation.postClaim(keccak256("bad-tier2"), 4, CLAIM_HASH, "ipfs://x");
    }

    function test_RevertWhen_PostClaim_ClaimExists() public {
        _postClaim1();

        vm.expectRevert(AgentAttestation.ClaimExists.selector);
        vm.prank(operator);
        attestation.postClaim(CLAIM_ID_1, 1, CLAIM_HASH, "ipfs://QmClaim1Again");
    }

    // =========================================================================
    // 2. test_Attest_HappyPath_Valid
    // =========================================================================

    function test_Attest_HappyPath_Valid() public {
        _postClaim1();

        uint256 contractBalanceBefore = address(attestation).balance;

        vm.expectEmit(true, true, false, true, address(attestation));
        emit AgentAttestation.Attested(CLAIM_ID_1, agent1, AgentAttestation.Decision.VALID, 9000, ATTEST_LOCK);

        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        // Verify stored attestation
        AgentAttestation.Attestation memory a = attestation.getAttestation(CLAIM_ID_1, agent1);
        assertTrue(a.exists, "attestation should exist");
        assertEq(uint8(a.decision), uint8(AgentAttestation.Decision.VALID), "decision mismatch");
        assertEq(a.confidenceBps, 9000, "confidenceBps mismatch");
        assertEq(a.sourcesHash, SOURCES_HASH, "sourcesHash mismatch");
        assertEq(a.reasoningHash, REASONING_HASH, "reasoningHash mismatch");
        assertEq(a.lockedStake, ATTEST_LOCK, "lockedStake should equal ATTEST_LOCK");

        // Stake is held by the attestation contract
        assertEq(address(attestation).balance, contractBalanceBefore + ATTEST_LOCK, "contract should hold locked stake");

        // Claim state updated
        AgentAttestation.Claim memory c = attestation.getClaim(CLAIM_ID_1);
        assertEq(c.attestorCount, 1, "attestorCount should be 1");

        // Attestor list updated
        address[] memory attestors = attestation.getClaimAttestors(CLAIM_ID_1);
        assertEq(attestors.length, 1, "should have 1 attestor");
        assertEq(attestors[0], agent1, "attestor should be agent1");

        // Count view
        assertEq(attestation.attestorCount(CLAIM_ID_1), 1, "attestorCount view mismatch");
    }

    // =========================================================================
    // 3. test_RevertWhen_DoubleAttest
    // =========================================================================

    function test_RevertWhen_DoubleAttest() public {
        _postClaim1();

        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        vm.expectRevert(AgentAttestation.AlreadyAttested.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 4. test_RevertWhen_NotRegistered
    // =========================================================================

    function test_RevertWhen_NotRegistered() public {
        _postClaim1();

        vm.deal(stranger, 1 ether);

        vm.expectRevert(AgentAttestation.NotRegistered.selector);
        vm.prank(stranger);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 5. test_RevertWhen_ClaimClosed
    // =========================================================================

    function test_RevertWhen_ClaimClosed() public {
        _postClaim1();

        vm.prank(operator);
        attestation.closeClaim(CLAIM_ID_1);

        vm.expectRevert(AgentAttestation.ClaimAlreadyClosed.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 6a. test_RevertWhen_Tier3NonAbstain + 6b. test_Tier3_AbstainAllowed
    // =========================================================================

    function test_RevertWhen_Tier3NonAbstain() public {
        _postClaimT3();

        // VALID on tier-3 reverts
        vm.expectRevert(AgentAttestation.JudgmentTierRequiresAbstain.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_T3, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        // REJECTED on tier-3 also reverts
        vm.expectRevert(AgentAttestation.JudgmentTierRequiresAbstain.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_T3, AgentAttestation.Decision.REJECTED, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    function test_Tier3_AbstainAllowed() public {
        _postClaimT3();

        vm.expectEmit(true, true, false, true, address(attestation));
        emit AgentAttestation.Attested(CLAIM_ID_T3, agent1, AgentAttestation.Decision.ABSTAIN, 0, 0);

        vm.prank(agent1);
        attestation.attest{ value: 0 }(
            CLAIM_ID_T3, AgentAttestation.Decision.ABSTAIN, 0, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        AgentAttestation.Attestation memory a = attestation.getAttestation(CLAIM_ID_T3, agent1);
        assertTrue(a.exists, "attestation should exist");
        assertEq(uint8(a.decision), uint8(AgentAttestation.Decision.ABSTAIN), "decision should be ABSTAIN");
        assertEq(a.lockedStake, 0, "ABSTAIN should have zero locked stake");
    }

    // =========================================================================
    // 7a. test_AbstainLocksNothing + 7b. test_RevertWhen_AbstainWithValue
    // =========================================================================

    function test_AbstainLocksNothing() public {
        _postClaim1();

        uint256 contractBalanceBefore = address(attestation).balance;

        vm.prank(agent1);
        attestation.attest{ value: 0 }(
            CLAIM_ID_1, AgentAttestation.Decision.ABSTAIN, 0, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        AgentAttestation.Attestation memory a = attestation.getAttestation(CLAIM_ID_1, agent1);
        assertEq(a.lockedStake, 0, "ABSTAIN lockedStake should be 0");
        assertEq(address(attestation).balance, contractBalanceBefore, "contract balance should not change for ABSTAIN");
    }

    function test_RevertWhen_AbstainWithValue() public {
        _postClaim1();

        vm.expectRevert(AgentAttestation.AbstainLocksNothing.selector);
        vm.prank(agent1);
        attestation.attest{ value: 1 }(
            CLAIM_ID_1, AgentAttestation.Decision.ABSTAIN, 0, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 8. test_RevertWhen_ValidWrongStake
    // =========================================================================

    function test_RevertWhen_ValidWrongStake() public {
        _postClaim1();

        // Under-pays
        vm.expectRevert(AgentAttestation.IncorrectStake.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK - 1 }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        // Over-pays
        vm.expectRevert(AgentAttestation.IncorrectStake.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK + 1 }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 9. test_RevertWhen_TooManyAttestors
    // =========================================================================

    function test_RevertWhen_TooManyAttestors() public {
        _postClaim1();

        uint8 maxAttestors = attestation.MAX_ATTESTORS(); // 16

        // Register and attest with MAX_ATTESTORS agents.
        for (uint256 i = 0; i < maxAttestors; i++) {
            // Derive a deterministic address from index
            address a = address(uint160(uint256(keccak256(abi.encode("attester", i)))));
            vm.deal(a, 1 ether);
            vm.prank(a);
            registry.registerAgent{ value: MIN_BOND }(META_URI);

            vm.prank(a);
            attestation.attest{ value: ATTEST_LOCK }(
                CLAIM_ID_1, AgentAttestation.Decision.VALID, 8000, SOURCES_HASH, REASONING_HASH, TRACE_URI
            );
        }

        assertEq(attestation.attestorCount(CLAIM_ID_1), maxAttestors, "should have MAX_ATTESTORS attestors");

        // 17th attestor — must revert
        address extra = address(uint160(uint256(keccak256(abi.encode("attester", maxAttestors)))));
        vm.deal(extra, 1 ether);
        vm.prank(extra);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        vm.expectRevert(AgentAttestation.TooManyAttestors.selector);
        vm.prank(extra);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 8000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 10. test_CloseClaim + test_RevertWhen_CloseClaim_NotOperator
    // =========================================================================

    function test_CloseClaim() public {
        _postClaim1();

        vm.expectEmit(true, false, false, false, address(attestation));
        emit AgentAttestation.ClaimClosed(CLAIM_ID_1);

        vm.prank(operator);
        attestation.closeClaim(CLAIM_ID_1);

        AgentAttestation.Claim memory c = attestation.getClaim(CLAIM_ID_1);
        assertTrue(c.closed, "claim should be closed");
    }

    function test_RevertWhen_CloseClaim_NotOperator() public {
        _postClaim1();

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), stranger, operatorRole
            )
        );
        vm.prank(stranger);
        attestation.closeClaim(CLAIM_ID_1);
    }

    function test_RevertWhen_CloseClaim_NotPosted() public {
        vm.expectRevert(AgentAttestation.ClaimNotFound.selector);
        vm.prank(operator);
        attestation.closeClaim(keccak256("nonexistent"));
    }

    function test_RevertWhen_CloseClaim_AlreadyClosed() public {
        _postClaim1();

        vm.prank(operator);
        attestation.closeClaim(CLAIM_ID_1);

        vm.expectRevert(AgentAttestation.ClaimAlreadyClosed.selector);
        vm.prank(operator);
        attestation.closeClaim(CLAIM_ID_1);
    }

    // =========================================================================
    // Extra: test_Attest_Rejected_HappyPath
    // =========================================================================

    function test_Attest_Rejected_HappyPath() public {
        _postClaim1();

        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.REJECTED, 7500, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        AgentAttestation.Attestation memory a = attestation.getAttestation(CLAIM_ID_1, agent1);
        assertEq(uint8(a.decision), uint8(AgentAttestation.Decision.REJECTED), "decision should be REJECTED");
        assertEq(a.lockedStake, ATTEST_LOCK, "lockedStake should equal ATTEST_LOCK");
    }

    // =========================================================================
    // Extra: test_MultipleAttestors
    // =========================================================================

    function test_MultipleAttestors() public {
        _postClaim1();

        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        vm.prank(agent2);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID_1, AgentAttestation.Decision.REJECTED, 6000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        assertEq(attestation.attestorCount(CLAIM_ID_1), 2, "should have 2 attestors");

        address[] memory attestors = attestation.getClaimAttestors(CLAIM_ID_1);
        assertEq(attestors.length, 2, "attestors list should have 2 entries");
        assertEq(attestors[0], agent1, "first attestor should be agent1");
        assertEq(attestors[1], agent2, "second attestor should be agent2");

        // Contract holds 2 × ATTEST_LOCK
        assertEq(address(attestation).balance, 2 * ATTEST_LOCK, "contract should hold 2x ATTEST_LOCK");
    }

    // =========================================================================
    // Extra: test_RevertWhen_AttestClaimNotFound
    // =========================================================================

    function test_RevertWhen_AttestClaimNotFound() public {
        vm.expectRevert(AgentAttestation.ClaimNotFound.selector);
        vm.prank(agent1);
        attestation.attest{ value: ATTEST_LOCK }(
            keccak256("nonexistent"), AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }
}
