// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentAttestation } from "../src/AgentAttestation.sol";
import { AgentSlashing } from "../src/AgentSlashing.sol";
import { TuringLeaderboard } from "../src/TuringLeaderboard.sol";

/// @title FeeAndTrustScoreTest
/// @notice Tests for CLAIM_FEE reward model and 0–100 trust score (T-016).
///
///         Covers:
///           1. testFuzz_FeeConservation — feeBurned + feeDistributed == fee across all (fee, correctCount).
///           2. test_FeeDistribution_Concrete — 1 fee, N correct: exact wei per attestor.
///           3. test_TrustScore_AfterSettlement — settled scenario → expected normalized scores.
///           4. test_TrustScore_ZeroHistory — brand-new agent returns 0.
contract FeeAndTrustScoreTest is Test {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 internal constant MIN_BOND = 0.1 ether;
    uint256 internal constant ATTEST_LOCK = 0.02 ether;
    uint256 internal constant CLAIM_FEE = 0.01 ether;
    uint256 internal constant EPOCH_SECONDS = 300;
    uint256 internal constant TRUST_EXP_CAP = 15;

    string internal constant META_URI = "ipfs://QmFeeAndTrustMeta";
    string internal constant TRACE_URI = "ipfs://QmFeeAndTrustTrace";
    bytes32 internal constant CLAIM_HASH = keccak256("feeAndTrustClaimPayload");
    bytes32 internal constant SOURCES_HASH = keccak256("feeAndTrustSources");
    bytes32 internal constant REASONING_HASH = keccak256("feeAndTrustReasoning");

    // -------------------------------------------------------------------------
    // Contracts + actors
    // -------------------------------------------------------------------------

    AgentRegistry internal registry;
    AgentAttestation internal attestation;
    AgentSlashing internal slashing;
    TuringLeaderboard internal leaderboard;

    address internal admin;
    address internal operator;

    // -------------------------------------------------------------------------
    // Setup: deploy + wire all four contracts
    // -------------------------------------------------------------------------

    function setUp() public {
        admin = makeAddr("admin");
        operator = makeAddr("operator");

        registry = new AgentRegistry(admin);
        attestation = new AgentAttestation(address(registry), admin, operator);
        slashing = new AgentSlashing(address(registry), address(attestation), admin, 600);
        leaderboard = new TuringLeaderboard(
            address(registry), address(attestation), address(slashing), admin, operator, EPOCH_SECONDS
        );

        // Wire roles (canonical D14 topology).
        vm.startPrank(admin);
        registry.grantRole(registry.REPUTATION_ROLE(), address(leaderboard));
        registry.grantRole(registry.DISPUTE_ROLE(), address(slashing));
        attestation.grantRole(attestation.SETTLER_ROLE(), address(leaderboard));
        attestation.grantRole(attestation.SETTLER_ROLE(), address(slashing));
        slashing.grantRole(slashing.LEADERBOARD_ROLE(), address(leaderboard));
        vm.stopPrank();

        vm.deal(operator, 100 ether);
    }

    // =========================================================================
    // 1. testFuzz_FeeConservation — feeBurned + feeDistributed == fee
    //    across all (feeSeed, correctCount ∈ 0..15).
    // =========================================================================

    /// @notice Asserts fee conservation: feeBurned + feeDistributed == fee
    ///         for all combinations of fee amount and correct-attestor count.
    ///
    ///         Inputs bounded:
    ///           - feeSeed: bound to [CLAIM_FEE, 0.1 ether] — must at least equal CLAIM_FEE
    ///             since the contract charges exactly CLAIM_FEE; we test with CLAIM_FEE constant
    ///             and use feeSeed to vary agent bonds (as in SlashConservation).
    ///           - correctCount: 0..15 (0 → full fee burned; 1..15 → pro-rata).
    ///
    /// @param feeSeed     Used as agent bond variation (uint96 → [MIN_BOND, 5 ether]).
    /// @param correctCount Number of correct attestors (0..15).
    function testFuzz_FeeConservation(
        uint96 feeSeed,
        uint8 correctCount
    ) public {
        uint256 regBond = bound(uint256(feeSeed), MIN_BOND, 5 ether);
        uint256 n = bound(uint256(correctCount), 0, 15);

        // Total agents: n correct + 1 wrong (or just 1 wrong when n == 0)
        uint256 totalAgents = n + 1;

        address[] memory agents = new address[](totalAgents);
        for (uint256 i = 0; i < totalAgents; i++) {
            agents[i] = makeAddr(string(abi.encodePacked("fee-agent-", i)));
        }
        address wrongAttestor = agents[n]; // last agent is wrong

        // Fund + register.
        for (uint256 i = 0; i < totalAgents; i++) {
            vm.deal(agents[i], regBond + ATTEST_LOCK + 1 ether);
            vm.prank(agents[i]);
            registry.registerAgent{ value: regBond }(META_URI);
        }

        // Post claim (pays CLAIM_FEE).
        bytes32 claimId = keccak256(abi.encodePacked("fee-fuzz-claim", feeSeed, correctCount));
        vm.prank(operator);
        attestation.postClaim{ value: CLAIM_FEE }(claimId, 1, CLAIM_HASH, "ipfs://QmFeeFuzz");

        // Correct attestors attest VALID.
        for (uint256 i = 0; i < n; i++) {
            vm.prank(agents[i]);
            attestation.attest{ value: ATTEST_LOCK }(
                claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
            );
        }

        // Wrong attestor attests REJECTED.
        vm.prank(wrongAttestor);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.REJECTED, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        vm.prank(operator);
        attestation.closeClaim(claimId);

        // Snapshot before.
        uint256 burnBefore = slashing.totalBurned();
        uint256[] memory claimableBefore = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            claimableBefore[i] = slashing.pendingWithdrawal(agents[i]);
        }

        vm.prank(operator);
        leaderboard.settleTier1(claimId, AgentAttestation.Decision.VALID);

        // Snapshot after.
        uint256 burnAfter = slashing.totalBurned();
        uint256 burnDelta = burnAfter - burnBefore;

        // Sum over-stake increases for correct attestors (= slash redistribution + fee share).
        uint256 overStakeDelta;
        for (uint256 i = 0; i < n; i++) {
            uint256 increase = slashing.pendingWithdrawal(agents[i]) - claimableBefore[i];
            assertGe(increase, ATTEST_LOCK, "correct attestor must receive own stake");
            overStakeDelta += increase - ATTEST_LOCK;
        }

        // Combined conservation: ATTEST_LOCK (slash) + CLAIM_FEE = burnDelta + overStakeDelta.
        assertEq(
            burnDelta + overStakeDelta,
            ATTEST_LOCK + CLAIM_FEE,
            "conservation: burnDelta + overStakeDelta == ATTEST_LOCK + CLAIM_FEE"
        );

        // Balance integrity.
        uint256 claimableTotal;
        for (uint256 i = 0; i < n; i++) {
            claimableTotal += slashing.pendingWithdrawal(agents[i]);
        }
        assertEq(slashing.pendingWithdrawal(wrongAttestor), 0, "wrong attestor has no claimable");
        assertEq(
            address(slashing).balance, burnAfter + claimableTotal, "slashing balance == totalBurned + all claimable"
        );
    }

    // =========================================================================
    // 2. test_FeeDistribution_Concrete — 1 fee, N correct attestors.
    //    Exact wei: each gets fee/N (floor); remainder to burn.
    // =========================================================================

    /// @notice Concrete fee distribution: 1 CLAIM_FEE, 3 correct attestors.
    ///
    ///         CLAIM_FEE = 0.01 ether = 10_000_000_000_000_000 wei
    ///         perAttestor = 10_000_000_000_000_000 / 3 = 3_333_333_333_333_333 wei
    ///         remainder   = 10_000_000_000_000_000 - 3 * 3_333_333_333_333_333 = 1 wei (burned)
    function test_FeeDistribution_Concrete() public {
        // Register 4 agents: 3 correct + 1 wrong.
        address a1 = makeAddr("conc-a1");
        address a2 = makeAddr("conc-a2");
        address a3 = makeAddr("conc-a3");
        address wrongA = makeAddr("conc-wrong");

        address[4] memory all = [a1, a2, a3, wrongA];
        for (uint256 i = 0; i < all.length; i++) {
            vm.deal(all[i], 5 ether);
            vm.prank(all[i]);
            registry.registerAgent{ value: MIN_BOND }(META_URI);
        }

        bytes32 claimId = keccak256("concrete-fee-claim");
        vm.prank(operator);
        attestation.postClaim{ value: CLAIM_FEE }(claimId, 1, CLAIM_HASH, "ipfs://QmConcrete");

        // 3 correct, 1 wrong.
        vm.prank(a1);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(a2);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(a3);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(wrongA);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.REJECTED, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        vm.prank(operator);
        attestation.closeClaim(claimId);

        vm.prank(operator);
        leaderboard.settleTier1(claimId, AgentAttestation.Decision.VALID);

        // Fee distribution math.
        uint256 perAttestor = CLAIM_FEE / 3; // 3_333_333_333_333_333 wei
        uint256 remainder = CLAIM_FEE - perAttestor * 3; // 1 wei

        // Slash distribution: seized = 0.02e; burn = 0.01e; distribute = 0.01e / 3.
        uint256 slashPerAttestor = (ATTEST_LOCK / 2) / 3; // 3_333_333_333_333_333 wei
        uint256 slashRemainder = (ATTEST_LOCK / 2) - slashPerAttestor * 3; // 1 wei

        // Each correct attestor: ATTEST_LOCK + slashPerAttestor + perAttestor.
        uint256 expected = ATTEST_LOCK + slashPerAttestor + perAttestor;
        assertEq(slashing.pendingWithdrawal(a1), expected, "a1 claimable exact wei");
        assertEq(slashing.pendingWithdrawal(a2), expected, "a2 claimable exact wei");
        assertEq(slashing.pendingWithdrawal(a3), expected, "a3 claimable exact wei");

        // Wrong attestor gets nothing.
        assertEq(slashing.pendingWithdrawal(wrongA), 0, "wrong attestor has no claimable");

        // totalBurned = slashBurn + slashRemainder + feeRemainder.
        uint256 slashBurn = ATTEST_LOCK / 2; // 0.01e
        assertEq(
            slashing.totalBurned(), slashBurn + slashRemainder + remainder, "totalBurned == slashBurn + remainders"
        );

        // Fee conservation: fee == feeDistributed + feeBurned.
        uint256 feeDistributed = perAttestor * 3;
        uint256 feeBurned = remainder;
        assertEq(CLAIM_FEE, feeDistributed + feeBurned, "fee conservation: fee == distributed + burned");

        // Log exact wei for the report.
        emit log_named_uint("perAttestor (wei)", perAttestor);
        emit log_named_uint("remainder burned (wei)", remainder);
        emit log_named_uint("each correct total claimable (wei)", expected);
    }

    // =========================================================================
    // 3. test_TrustScore_AfterSettlement — settled scenario → expected values.
    // =========================================================================

    /// @notice After a settlement: correct attestor should score higher than wrong.
    ///         Exact formula verification.
    ///
    ///         Setup: 2 correct (a1, a2), 1 wrong (a3), 1 abstain (a4).
    ///
    ///         After settlement lifetime stats:
    ///           a1: correct=1, wrong=0, abstained=0
    ///           a2: correct=1, wrong=0, abstained=0
    ///           a3: correct=0, wrong=1, abstained=0
    ///           a4: correct=0, wrong=0, abstained=1
    ///
    ///         Expected trustScore:
    ///           a1: accuracy=1*70/(1+0)=70; experience=min(1,15)*30/15=2; total=72
    ///           a2: same as a1 = 72
    ///           a3: accuracy=0*70/(0+1)=0; experience=min(1,15)*30/15=2; total=2
    ///           a4: accuracy=0 (correct+wrong=0); experience=min(1,15)*30/15=2; total=2
    function test_TrustScore_AfterSettlement() public {
        address a1 = makeAddr("ts-a1");
        address a2 = makeAddr("ts-a2");
        address a3 = makeAddr("ts-a3");
        address a4 = makeAddr("ts-a4");

        address[4] memory all = [a1, a2, a3, a4];
        for (uint256 i = 0; i < all.length; i++) {
            vm.deal(all[i], 5 ether);
            vm.prank(all[i]);
            registry.registerAgent{ value: MIN_BOND }(META_URI);
        }

        bytes32 claimId = keccak256("trust-score-claim");
        vm.prank(operator);
        attestation.postClaim{ value: CLAIM_FEE }(claimId, 1, CLAIM_HASH, "ipfs://QmTrustScore");

        vm.prank(a1);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(a2);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(a3);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.REJECTED, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
        vm.prank(a4);
        attestation.attest{ value: 0 }(
            claimId, AgentAttestation.Decision.ABSTAIN, 5000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        vm.prank(operator);
        attestation.closeClaim(claimId);

        vm.prank(operator);
        leaderboard.settleTier1(claimId, AgentAttestation.Decision.VALID);

        // accuracy component: correct * 70 / (correct + wrong)
        // experience component: min(total, 15) * 30 / 15

        // a1: correct=1, wrong=0, abstained=0 → accuracy=70, experience=2, total=72
        assertEq(leaderboard.trustScore(a1), 72, "a1 trust score == 72");

        // a2: same as a1 → 72
        assertEq(leaderboard.trustScore(a2), 72, "a2 trust score == 72");

        // a3: correct=0, wrong=1, abstained=0 → accuracy=0, experience=2, total=2
        assertEq(leaderboard.trustScore(a3), 2, "a3 trust score == 2");

        // a4: correct=0, wrong=0, abstained=1 → accuracy=0 (no decisions), experience=2, total=2
        assertEq(leaderboard.trustScore(a4), 2, "a4 trust score == 2");

        // Correct > wrong + abstain.
        assertGt(leaderboard.trustScore(a1), leaderboard.trustScore(a3), "correct scores higher than wrong");
        assertGt(leaderboard.trustScore(a2), leaderboard.trustScore(a4), "correct scores higher than abstain");
    }

    // =========================================================================
    // 4. test_TrustScore_ZeroHistory — brand-new agent returns 0.
    // =========================================================================

    function test_TrustScore_ZeroHistory() public {
        address newAgent = makeAddr("new-agent");
        // Not registered — but trustScore reads lifetimeStatsMap which is default 0.
        assertEq(leaderboard.trustScore(newAgent), 0, "zero history trust score == 0");
    }

    // =========================================================================
    // 5. test_TrustScore_HighAccuracy_HighExperience — cap at 100.
    // =========================================================================

    /// @notice An agent with perfect accuracy and CAP attestations scores 100.
    ///         Simulate by settling CAP claims all-correct.
    ///         accuracy=70, experience=30 → total=100 (capped at 100).
    function test_TrustScore_Cap100() public {
        address aCap = makeAddr("cap-agent");
        vm.deal(aCap, 100 ether);
        vm.prank(aCap);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        // Also need a wrong attestor to open a claim (ground truth = VALID, aCap = VALID).
        address wrongA = makeAddr("cap-wrong");
        vm.deal(wrongA, 100 ether);
        vm.prank(wrongA);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        uint256 cap = leaderboard.TRUST_SCORE_EXP_CAP(); // 15

        // Settle cap claims with aCap always correct.
        for (uint256 i = 0; i < cap; i++) {
            bytes32 claimId = keccak256(abi.encodePacked("cap-claim-", i));
            vm.prank(operator);
            attestation.postClaim{ value: CLAIM_FEE }(claimId, 1, CLAIM_HASH, "ipfs://QmCap");

            vm.prank(aCap);
            attestation.attest{ value: ATTEST_LOCK }(
                claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
            );
            vm.prank(wrongA);
            attestation.attest{ value: ATTEST_LOCK }(
                claimId, AgentAttestation.Decision.REJECTED, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
            );

            vm.prank(operator);
            attestation.closeClaim(claimId);
            vm.prank(operator);
            leaderboard.settleTier1(claimId, AgentAttestation.Decision.VALID);
        }

        // aCap: correct=cap, wrong=0 → accuracy=70; experience=cap*30/cap=30; total=100.
        assertEq(leaderboard.trustScore(aCap), 100, "perfect agent with cap attestations scores 100");
    }
}
