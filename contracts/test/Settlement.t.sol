// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentAttestation } from "../src/AgentAttestation.sol";
import { AgentSlashing } from "../src/AgentSlashing.sol";
import { TuringLeaderboard } from "../src/TuringLeaderboard.sol";

/// @title SettlementTest
/// @notice Tier-1 settlement suite for TuringLeaderboard (T-105) + AgentSlashing (T-106).
///         Wires all four contracts with the correct roles, posts a tier-1 claim, has a
///         mix of attestors attest, closes the claim, settles, and verifies:
///         exact slash math, pro-rata redistribution, ABSTAIN immunity (§14.6),
///         epoch + lifetime stats (§14.7), reputation deltas, pull-payment withdrawals,
///         and the conservation invariant seized == burn + distributed.
contract SettlementTest is Test {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 internal constant MIN_BOND = 0.1 ether;
    uint256 internal constant ATTEST_LOCK = 0.02 ether;
    uint256 internal constant EPOCH_SECONDS = 300; // demo value
    string internal constant META_URI = "ipfs://QmAgentMeta";
    string internal constant TRACE_URI = "ipfs://QmTrace";

    bytes32 internal constant CLAIM_ID = keccak256("settle-claim-1");
    bytes32 internal constant CLAIM_HASH = keccak256("claimPayload");
    bytes32 internal constant SOURCES_HASH = keccak256("sources");
    bytes32 internal constant REASONING_HASH = keccak256("reasoning");

    // -------------------------------------------------------------------------
    // Contracts + actors
    // -------------------------------------------------------------------------

    AgentRegistry internal registry;
    AgentAttestation internal attestation;
    AgentSlashing internal slashing;
    TuringLeaderboard internal leaderboard;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    address internal a1 = makeAddr("a1");
    address internal a2 = makeAddr("a2");
    address internal a3 = makeAddr("a3");
    address internal a4 = makeAddr("a4");

    // -------------------------------------------------------------------------
    // Setup: deploy + wire roles
    // -------------------------------------------------------------------------

    function setUp() public {
        registry = new AgentRegistry(admin);
        attestation = new AgentAttestation(address(registry), admin, operator);
        slashing = new AgentSlashing(address(registry), address(attestation), admin);
        leaderboard = new TuringLeaderboard(
            address(registry), address(attestation), address(slashing), admin, operator, EPOCH_SECONDS
        );

        // Wire roles (mirrors the deploy script in T-109).
        vm.startPrank(admin);
        // Leaderboard mutates reputation directly (D12).
        registry.grantRole(registry.REPUTATION_ROLE(), address(leaderboard));
        // Leaderboard pulls stake out of AgentAttestation.
        attestation.grantRole(attestation.SETTLER_ROLE(), address(leaderboard));
        // Leaderboard drives AgentSlashing (slash + creditClaimable).
        slashing.grantRole(slashing.LEADERBOARD_ROLE(), address(leaderboard));
        // AgentSlashing pulls the wrong attestor's stake out of AgentAttestation.
        attestation.grantRole(attestation.SETTLER_ROLE(), address(slashing));
        vm.stopPrank();

        // Fund + register agents.
        address[4] memory agents = [a1, a2, a3, a4];
        for (uint256 i = 0; i < agents.length; i++) {
            vm.deal(agents[i], 10 ether);
            vm.prank(agents[i]);
            registry.registerAgent{ value: MIN_BOND }(META_URI);
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _postAndClose() internal {
        vm.prank(operator);
        attestation.postClaim(CLAIM_ID, 1, CLAIM_HASH, "ipfs://QmClaim");
    }

    function _close() internal {
        vm.prank(operator);
        attestation.closeClaim(CLAIM_ID);
    }

    function _attest(
        address who,
        AgentAttestation.Decision decision
    ) internal {
        uint256 stake = decision == AgentAttestation.Decision.ABSTAIN ? 0 : ATTEST_LOCK;
        vm.prank(who);
        attestation.attest{ value: stake }(CLAIM_ID, decision, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI);
    }

    function _settle(
        AgentAttestation.Decision groundTruth
    ) internal {
        vm.prank(operator);
        leaderboard.settleTier1(CLAIM_ID, groundTruth);
    }

    // =========================================================================
    // 1. test_Settle_AllCorrect
    // =========================================================================

    function test_Settle_AllCorrect() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.VALID);
        _attest(a2, AgentAttestation.Decision.VALID);
        _attest(a3, AgentAttestation.Decision.VALID);
        _close();

        _settle(AgentAttestation.Decision.VALID);

        // No burn — nobody was wrong.
        assertEq(slashing.totalBurned(), 0, "no burn expected");

        address[3] memory correct = [a1, a2, a3];
        for (uint256 i = 0; i < correct.length; i++) {
            assertEq(leaderboard.lifetimeStats(correct[i]).correct, 1, "correct++");
            assertEq(registry.getAgent(correct[i]).reputation, 1, "reputation +1");
            // Each gets exactly their own 0.02e back as claimable.
            assertEq(slashing.pendingWithdrawal(correct[i]), ATTEST_LOCK, "own stake released");
        }

        // Withdraw works for a correct attestor.
        uint256 balBefore = a1.balance;
        vm.prank(a1);
        slashing.withdraw();
        assertEq(a1.balance, balBefore + ATTEST_LOCK, "withdraw returns own stake");
        assertEq(slashing.pendingWithdrawal(a1), 0, "balance cleared");
    }

    // =========================================================================
    // 2. test_Settle_OneWrong_SlashMath — exact wei + conservation
    // =========================================================================

    function test_Settle_OneWrong_SlashMath() public {
        _postAndClose();
        // a1 wrong (REJECTED), a2 + a3 correct (VALID). Ground truth VALID.
        _attest(a1, AgentAttestation.Decision.REJECTED);
        _attest(a2, AgentAttestation.Decision.VALID);
        _attest(a3, AgentAttestation.Decision.VALID);
        _close();

        _settle(AgentAttestation.Decision.VALID);

        // Wrong attestor a1: seized = 0.02e; burn = 0.01e; distribute = 0.01e split 2 ways.
        uint256 seized = ATTEST_LOCK; // 0.02 ether
        uint256 burn = seized / 2; // 0.01 ether
        uint256 distribute = seized - burn; // 0.01 ether
        uint256 share = distribute / 2; // 0.005 ether each

        assertEq(burn, 0.01 ether, "burn should be 0.01e");
        assertEq(share, 0.005 ether, "each correct gets 0.005e redistribution");

        assertEq(slashing.totalBurned(), burn, "totalBurned == 0.01e");

        // a1 wrong: -10 reputation, wrong++/slashes++, no claimable.
        assertEq(registry.getAgent(a1).reputation, -10, "wrong reputation -10");
        assertEq(leaderboard.lifetimeStats(a1).wrong, 1, "wrong++");
        assertEq(leaderboard.lifetimeStats(a1).slashes, 1, "slashes++");
        assertEq(slashing.pendingWithdrawal(a1), 0, "wrong attestor has no claimable");

        // a2 + a3 correct: own 0.02e released + 0.005e redistribution = 0.025e each.
        uint256 expectedCorrect = ATTEST_LOCK + share; // 0.025 ether
        assertEq(expectedCorrect, 0.025 ether, "correct claimable == 0.025e");
        assertEq(slashing.pendingWithdrawal(a2), expectedCorrect, "a2 claimable");
        assertEq(slashing.pendingWithdrawal(a3), expectedCorrect, "a3 claimable");
        assertEq(registry.getAgent(a2).reputation, 1, "a2 reputation +1");
        assertEq(registry.getAgent(a3).reputation, 1, "a3 reputation +1");

        // Conservation: seized == burn + total distributed.
        uint256 totalDistributed = share * 2;
        assertEq(seized, burn + totalDistributed, "conservation: seized == burn + distributed");
    }

    // =========================================================================
    // 3. test_Settle_ProRataAcrossTwoCorrect — explicit pro-rata check
    // =========================================================================

    function test_Settle_ProRataAcrossTwoCorrect() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.REJECTED); // wrong
        _attest(a2, AgentAttestation.Decision.VALID); // correct
        _attest(a3, AgentAttestation.Decision.VALID); // correct
        _close();

        _settle(AgentAttestation.Decision.VALID);

        // The 0.01e distribute pot splits equally: 0.005e each, on top of own released stake.
        uint256 redistA2 = slashing.pendingWithdrawal(a2) - ATTEST_LOCK;
        uint256 redistA3 = slashing.pendingWithdrawal(a3) - ATTEST_LOCK;
        assertEq(redistA2, redistA3, "pro-rata: equal shares");
        assertEq(redistA2, 0.005 ether, "each share is 0.005e");
        assertEq(redistA2 + redistA3, 0.01 ether, "shares sum to the distribute pot");
    }

    // =========================================================================
    // 4. test_AbstainUnpunished (§14.6)
    // =========================================================================

    function test_AbstainUnpunished() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.REJECTED); // wrong
        _attest(a2, AgentAttestation.Decision.VALID); // correct
        _attest(a3, AgentAttestation.Decision.ABSTAIN); // abstain
        _close();

        _settle(AgentAttestation.Decision.VALID);

        // ABSTAIN attestor a3: abstained++, reputation unchanged, never slashed, no claimable.
        assertEq(leaderboard.lifetimeStats(a3).abstained, 1, "abstained++");
        assertEq(leaderboard.lifetimeStats(a3).correct, 0, "abstain is not correct");
        assertEq(leaderboard.lifetimeStats(a3).wrong, 0, "abstain is not wrong");
        assertEq(leaderboard.lifetimeStats(a3).slashes, 0, "abstain never slashed");
        assertEq(registry.getAgent(a3).reputation, 0, "abstain reputation unchanged");
        assertEq(slashing.pendingWithdrawal(a3), 0, "abstain has no claimable");

        // The single correct attestor a2 receives the WHOLE distribute pot (abstain excluded).
        assertEq(slashing.pendingWithdrawal(a2), ATTEST_LOCK + 0.01 ether, "lone correct gets full pot");
    }

    // =========================================================================
    // 5. test_Settle_RaisesStats (§14.7) — epoch + lifetime
    // =========================================================================

    function test_Settle_RaisesStats() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.VALID); // correct (raises accuracy)
        _attest(a2, AgentAttestation.Decision.ABSTAIN); // abstain (raises abstention, rep unchanged)
        _close();

        uint256 epoch = leaderboard.currentEpoch();

        _settle(AgentAttestation.Decision.VALID);

        // Epoch stats.
        assertEq(leaderboard.epochStats(a1, epoch).correct, 1, "epoch correct for a1");
        assertEq(leaderboard.epochStats(a2, epoch).abstained, 1, "epoch abstained for a2");
        // Lifetime stats mirror.
        assertEq(leaderboard.lifetimeStats(a1).correct, 1, "lifetime correct for a1");
        assertEq(leaderboard.lifetimeStats(a2).abstained, 1, "lifetime abstained for a2");
        // Abstainer's reputation unchanged (§14.7).
        assertEq(registry.getAgent(a2).reputation, 0, "abstain reputation unchanged");
        assertEq(registry.getAgent(a1).reputation, 1, "correct reputation +1");
    }

    // =========================================================================
    // 6. Reverts: not-operator, not-tier-1, already-settled, invalid ground truth, not-closed
    // =========================================================================

    function test_RevertWhen_Settle_NotOperator() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.VALID);
        _close();

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                stranger,
                leaderboard.OPERATOR_ROLE()
            )
        );
        vm.prank(stranger);
        leaderboard.settleTier1(CLAIM_ID, AgentAttestation.Decision.VALID);
    }

    function test_RevertWhen_Settle_NotTier1() public {
        // Post a tier-3 claim, abstain, close, then attempt settle.
        bytes32 t3 = keccak256("t3-claim");
        vm.prank(operator);
        attestation.postClaim(t3, 3, CLAIM_HASH, "ipfs://QmT3");
        vm.prank(a1);
        attestation.attest{ value: 0 }(
            t3, AgentAttestation.Decision.ABSTAIN, 0, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(operator);
        attestation.closeClaim(t3);

        vm.expectRevert(TuringLeaderboard.NotTier1.selector);
        vm.prank(operator);
        leaderboard.settleTier1(t3, AgentAttestation.Decision.VALID);
    }

    function test_RevertWhen_AlreadySettled() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.VALID);
        _close();
        _settle(AgentAttestation.Decision.VALID);

        vm.expectRevert(TuringLeaderboard.AlreadySettled.selector);
        vm.prank(operator);
        leaderboard.settleTier1(CLAIM_ID, AgentAttestation.Decision.VALID);
    }

    function test_RevertWhen_Settle_GroundTruthAbstain() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.VALID);
        _close();

        vm.expectRevert(TuringLeaderboard.InvalidGroundTruth.selector);
        vm.prank(operator);
        leaderboard.settleTier1(CLAIM_ID, AgentAttestation.Decision.ABSTAIN);
    }

    function test_RevertWhen_Settle_NotClosed() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.VALID);
        // not closed

        vm.expectRevert(TuringLeaderboard.ClaimNotClosed.selector);
        vm.prank(operator);
        leaderboard.settleTier1(CLAIM_ID, AgentAttestation.Decision.VALID);
    }

    function test_RevertWhen_Settle_ClaimNotFound() public {
        vm.expectRevert(TuringLeaderboard.ClaimNotFound.selector);
        vm.prank(operator);
        leaderboard.settleTier1(keccak256("ghost"), AgentAttestation.Decision.VALID);
    }

    // =========================================================================
    // 7. Pull-payment: withdraw + revert-on-nothing
    // =========================================================================

    function test_Withdraw_PullPayment() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.REJECTED); // wrong
        _attest(a2, AgentAttestation.Decision.VALID); // correct
        _close();
        _settle(AgentAttestation.Decision.VALID);

        // a2 withdraws own stake (0.02e) + half the 0.01e pot (0.01e, lone correct) = 0.03e.
        uint256 expected = ATTEST_LOCK + 0.01 ether; // lone correct gets full distribute pot
        assertEq(slashing.pendingWithdrawal(a2), expected, "claimable before withdraw");

        uint256 balBefore = a2.balance;
        vm.prank(a2);
        slashing.withdraw();
        assertEq(a2.balance, balBefore + expected, "withdraw transfers full claimable");
        assertEq(slashing.pendingWithdrawal(a2), 0, "claimable cleared after withdraw");
    }

    function test_RevertWhen_WithdrawNothing() public {
        vm.expectRevert(AgentSlashing.NothingToWithdraw.selector);
        vm.prank(stranger);
        slashing.withdraw();
    }

    // =========================================================================
    // 8. Non-fuzz conservation assertion across the contract balance.
    //    (Full testFuzz_SlashConservation is deferred to T-108.)
    // =========================================================================

    function test_Conservation_NonFuzz() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.REJECTED); // wrong
        _attest(a2, AgentAttestation.Decision.VALID); // correct
        _attest(a3, AgentAttestation.Decision.VALID); // correct
        _close();
        _settle(AgentAttestation.Decision.VALID);

        // seized from the wrong attestor.
        uint256 seized = ATTEST_LOCK;
        uint256 burn = slashing.totalBurned();
        // distributed = redistribution shares only (exclude released own-stake of correct attestors).
        uint256 distributed =
            (slashing.pendingWithdrawal(a2) - ATTEST_LOCK) + (slashing.pendingWithdrawal(a3) - ATTEST_LOCK);
        assertEq(seized, burn + distributed, "conservation: seized == burn + distributed");

        // The slashing contract still physically holds: burn (forever) + all claimable balances.
        uint256 claimableTotal = slashing.pendingWithdrawal(a2) + slashing.pendingWithdrawal(a3);
        assertEq(address(slashing).balance, burn + claimableTotal, "contract holds burn + claimable");
    }

    // =========================================================================
    // Extra: empty correct list — wrong attestor with no correct peers burns all.
    // =========================================================================

    function test_Settle_AllWrong_FullBurn() public {
        _postAndClose();
        _attest(a1, AgentAttestation.Decision.REJECTED); // wrong (ground truth VALID)
        _attest(a2, AgentAttestation.Decision.REJECTED); // wrong
        _close();
        _settle(AgentAttestation.Decision.VALID);

        // Two wrong, zero correct: each 0.02e seized is fully burned -> 0.04e burned.
        assertEq(slashing.totalBurned(), 2 * ATTEST_LOCK, "all seized stake burned when no correct peers");
        assertEq(slashing.pendingWithdrawal(a1), 0, "no claimable");
        assertEq(slashing.pendingWithdrawal(a2), 0, "no claimable");
        assertEq(registry.getAgent(a1).reputation, -10, "a1 -10");
        assertEq(registry.getAgent(a2).reputation, -10, "a2 -10");
    }
}
