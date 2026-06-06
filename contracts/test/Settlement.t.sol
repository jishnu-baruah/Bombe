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
    uint256 internal constant CLAIM_FEE = 0.01 ether;
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
        slashing = new AgentSlashing(address(registry), address(attestation), admin, 600);
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

        // Fund operator for CLAIM_FEE payments.
        vm.deal(operator, 10 ether);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _postAndClose() internal {
        vm.prank(operator);
        attestation.postClaim{ value: CLAIM_FEE }(CLAIM_ID, 1, CLAIM_HASH, "ipfs://QmClaim");
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

        // No slash burn — nobody was wrong.
        // CLAIM_FEE (0.01e) split 3 ways: 3_333_333_333_333_333 each; 1 wei remainder burned.
        uint256 feeShare = CLAIM_FEE / 3; // 3_333_333_333_333_333 wei
        uint256 feeRemainder = CLAIM_FEE - feeShare * 3; // 1 wei
        assertEq(slashing.totalBurned(), feeRemainder, "only fee remainder burned");

        address[3] memory correct = [a1, a2, a3];
        for (uint256 i = 0; i < correct.length; i++) {
            assertEq(leaderboard.lifetimeStats(correct[i]).correct, 1, "correct++");
            assertEq(registry.getAgent(correct[i]).reputation, 1, "reputation +1");
            // Each gets own stake back + pro-rata fee share.
            assertEq(slashing.pendingWithdrawal(correct[i]), ATTEST_LOCK + feeShare, "own stake + fee share");
        }

        // Withdraw works for a correct attestor.
        uint256 expected = ATTEST_LOCK + feeShare;
        uint256 balBefore = a1.balance;
        vm.prank(a1);
        slashing.withdraw();
        assertEq(a1.balance, balBefore + expected, "withdraw returns stake + fee share");
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
        uint256 slashBurn = seized / 2; // 0.01 ether
        uint256 distribute = seized - slashBurn; // 0.01 ether
        uint256 slashShare = distribute / 2; // 0.005 ether each

        // CLAIM_FEE (0.01e) split 2 ways = 0.005e each (exact, no remainder).
        uint256 feeShare = CLAIM_FEE / 2; // 0.005 ether
        uint256 feeRemainder = CLAIM_FEE - feeShare * 2; // 0 wei

        assertEq(slashBurn, 0.01 ether, "slash burn should be 0.01e");
        assertEq(slashShare, 0.005 ether, "each correct gets 0.005e slash redistribution");

        // totalBurned = slashBurn + feeRemainder
        assertEq(slashing.totalBurned(), slashBurn + feeRemainder, "totalBurned == slash burn + fee remainder");

        // a1 wrong: -10 reputation, wrong++/slashes++, no claimable.
        assertEq(registry.getAgent(a1).reputation, -10, "wrong reputation -10");
        assertEq(leaderboard.lifetimeStats(a1).wrong, 1, "wrong++");
        assertEq(leaderboard.lifetimeStats(a1).slashes, 1, "slashes++");
        assertEq(slashing.pendingWithdrawal(a1), 0, "wrong attestor has no claimable");

        // a2 + a3 correct: own 0.02e released + 0.005e slash redistribution + 0.005e fee share = 0.03e each.
        uint256 expectedCorrect = ATTEST_LOCK + slashShare + feeShare; // 0.03 ether
        assertEq(expectedCorrect, 0.03 ether, "correct claimable == 0.03e");
        assertEq(slashing.pendingWithdrawal(a2), expectedCorrect, "a2 claimable");
        assertEq(slashing.pendingWithdrawal(a3), expectedCorrect, "a3 claimable");
        assertEq(registry.getAgent(a2).reputation, 1, "a2 reputation +1");
        assertEq(registry.getAgent(a3).reputation, 1, "a3 reputation +1");

        // Conservation: seized (slash) == slashBurn + total slash distributed.
        uint256 totalSlashDistributed = slashShare * 2;
        assertEq(seized, slashBurn + totalSlashDistributed, "slash conservation: seized == burn + distributed");

        // Fee conservation: fee == feeShare * 2 + feeRemainder.
        assertEq(CLAIM_FEE, feeShare * 2 + feeRemainder, "fee conservation: fee == distributed + burned");
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

        // Slash redistribution: 0.01e split equally → 0.005e each.
        // Fee redistribution: 0.01e CLAIM_FEE split equally → 0.005e each (exact).
        // Total over own stake: 0.005e (slash) + 0.005e (fee) = 0.01e each.
        uint256 overStakeA2 = slashing.pendingWithdrawal(a2) - ATTEST_LOCK;
        uint256 overStakeA3 = slashing.pendingWithdrawal(a3) - ATTEST_LOCK;
        assertEq(overStakeA2, overStakeA3, "pro-rata: equal shares");
        assertEq(overStakeA2, 0.005 ether + CLAIM_FEE / 2, "each share is slash + fee portion");
        // Slash pot conservation.
        uint256 slashDistribute = ATTEST_LOCK - ATTEST_LOCK / 2; // 0.01e
        assertEq(overStakeA2 - CLAIM_FEE / 2, 0.005 ether, "slash share is 0.005e");
        assertEq((overStakeA2 - CLAIM_FEE / 2) * 2, slashDistribute, "slash shares sum to distribute pot");
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

        // The single correct attestor a2 receives: own stake + full slash distribute pot + full CLAIM_FEE.
        // slash distribute pot = 0.01e; CLAIM_FEE = 0.01e
        assertEq(
            slashing.pendingWithdrawal(a2),
            ATTEST_LOCK + 0.01 ether + CLAIM_FEE,
            "lone correct gets own stake + full slash pot + full fee"
        );
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
        attestation.postClaim{ value: CLAIM_FEE }(t3, 3, CLAIM_HASH, "ipfs://QmT3");
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

        // a2 is lone correct attestor: own stake + full slash distribute pot + full CLAIM_FEE.
        uint256 expected = ATTEST_LOCK + 0.01 ether + CLAIM_FEE;
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

        // Slash conservation: seized == slashBurn + slashDistributed.
        uint256 seized = ATTEST_LOCK;
        uint256 feeShare = CLAIM_FEE / 2; // exact for 2 correct attestors
        // Over-stake for each correct = slash redistribution share + fee share.
        uint256 overStake = slashing.pendingWithdrawal(a2) - ATTEST_LOCK;
        uint256 slashShare = overStake - feeShare;
        uint256 slashDistributed = slashShare * 2;
        uint256 slashBurn = seized / 2; // 0.01e
        assertEq(seized, slashBurn + slashDistributed, "slash conservation: seized == burn + distributed");

        // Fee conservation: CLAIM_FEE == feeDistributed + feeBurned.
        uint256 feeDistributed = feeShare * 2;
        uint256 feeBurned = CLAIM_FEE - feeDistributed; // 0 wei remainder
        assertEq(CLAIM_FEE, feeDistributed + feeBurned, "fee conservation: fee == distributed + burned");

        // totalBurned = slashBurn + feeBurned.
        assertEq(slashing.totalBurned(), slashBurn + feeBurned, "totalBurned == slashBurn + feeBurned");

        // The slashing contract holds: totalBurned (forever) + all claimable balances.
        uint256 claimableTotal = slashing.pendingWithdrawal(a2) + slashing.pendingWithdrawal(a3);
        assertEq(
            address(slashing).balance,
            slashing.totalBurned() + claimableTotal,
            "contract holds totalBurned + all claimable"
        );
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

        // Two wrong, zero correct: each 0.02e seized is fully burned + CLAIM_FEE also burned.
        // totalBurned = 2 * ATTEST_LOCK + CLAIM_FEE
        assertEq(
            slashing.totalBurned(),
            2 * ATTEST_LOCK + CLAIM_FEE,
            "all seized stake + claim fee burned when no correct peers"
        );
        assertEq(slashing.pendingWithdrawal(a1), 0, "no claimable");
        assertEq(slashing.pendingWithdrawal(a2), 0, "no claimable");
        assertEq(registry.getAgent(a1).reputation, -10, "a1 -10");
        assertEq(registry.getAgent(a2).reputation, -10, "a2 -10");
    }
}
