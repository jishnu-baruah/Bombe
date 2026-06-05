// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentAttestation } from "../src/AgentAttestation.sol";
import { AgentSlashing } from "../src/AgentSlashing.sol";
import { TuringLeaderboard } from "../src/TuringLeaderboard.sol";

/// @title DisputesTest
/// @notice Tier-2 dispute resolution suite for AgentSlashing (PRD §6.2, T-107).
///
///         Deploys all four contracts wired with the necessary roles, posts a tier-2 claim,
///         attests (non-abstain), closes the claim, and covers all required scenarios:
///           1. openDispute happy-path + reverts.
///           2. Stake-weighted voting + AlreadyVoted + VotingClosed after warp.
///           3. resolveDispute agent-wrong: exact wei math + conservation.
///           4. resolveDispute agent-right: challenger bond split.
///           5. VotingOpen revert before window.
///           6. VoteAfterWindow revert.
///           7. Withdrawal blocked during open dispute; unblocked after resolution.
contract DisputesTest is Test {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 internal constant MIN_BOND = 0.1 ether;
    uint256 internal constant ATTEST_LOCK = 0.02 ether;
    uint256 internal constant DISPUTE_BOND = 0.05 ether;
    uint256 internal constant DISPUTE_WINDOW = 60; // demo value
    uint256 internal constant EPOCH_SECONDS = 300;

    string internal constant META_URI = "ipfs://QmAgentMeta";
    string internal constant TRACE_URI = "ipfs://QmTrace";
    bytes32 internal constant CLAIM_ID = keccak256("dispute-claim-1");
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

    // accused: bond = 0.2 ether (to test stake-weighting in votes)
    address internal accused = makeAddr("accused");
    // challenger: bond = 0.1 ether (MIN_BOND)
    address internal challenger = makeAddr("challenger");
    // voter1: bond = 0.3 ether (heavier weight)
    address internal voter1 = makeAddr("voter1");
    // voter2: bond = 0.1 ether (lighter weight)
    address internal voter2 = makeAddr("voter2");
    // peer: another non-abstain attestor, gets redistribution share
    address internal peer = makeAddr("peer");

    // -------------------------------------------------------------------------
    // Setup: deploy + wire roles
    // -------------------------------------------------------------------------

    function setUp() public {
        registry = new AgentRegistry(admin);
        attestation = new AgentAttestation(address(registry), admin, operator);
        slashing = new AgentSlashing(address(registry), address(attestation), admin, DISPUTE_WINDOW);
        leaderboard = new TuringLeaderboard(
            address(registry), address(attestation), address(slashing), admin, operator, EPOCH_SECONDS
        );

        // Wire roles.
        vm.startPrank(admin);
        registry.grantRole(registry.REPUTATION_ROLE(), address(leaderboard));
        registry.grantRole(registry.REPUTATION_ROLE(), address(slashing));
        registry.grantRole(registry.DISPUTE_ROLE(), address(slashing));
        attestation.grantRole(attestation.SETTLER_ROLE(), address(leaderboard));
        attestation.grantRole(attestation.SETTLER_ROLE(), address(slashing));
        slashing.grantRole(slashing.LEADERBOARD_ROLE(), address(leaderboard));
        vm.stopPrank();

        // Fund + register agents with DIFFERENT bonds to test stake-weighting.
        vm.deal(accused, 10 ether);
        vm.deal(challenger, 10 ether);
        vm.deal(voter1, 10 ether);
        vm.deal(voter2, 10 ether);
        vm.deal(peer, 10 ether);

        vm.prank(accused);
        registry.registerAgent{ value: 0.2 ether }(META_URI); // bond = 0.2 ether

        vm.prank(challenger);
        registry.registerAgent{ value: MIN_BOND }(META_URI); // bond = 0.1 ether

        vm.prank(voter1);
        registry.registerAgent{ value: 0.3 ether }(META_URI); // bond = 0.3 ether

        vm.prank(voter2);
        registry.registerAgent{ value: MIN_BOND }(META_URI); // bond = 0.1 ether

        vm.prank(peer);
        registry.registerAgent{ value: MIN_BOND }(META_URI); // bond = 0.1 ether
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /// @dev Post a tier-2 claim; returns immediately after posting (not yet closed).
    function _postClaim() internal {
        vm.prank(operator);
        attestation.postClaim(CLAIM_ID, 2, CLAIM_HASH, "ipfs://QmClaim");
    }

    function _closeClaim() internal {
        vm.prank(operator);
        attestation.closeClaim(CLAIM_ID);
    }

    /// @dev Have `who` attest the claim with VALID (non-abstain, stake-backed).
    function _attest(
        address who
    ) internal {
        vm.prank(who);
        attestation.attest{ value: ATTEST_LOCK }(
            CLAIM_ID, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    /// @dev Have `who` attest with ABSTAIN (no stake).
    function _attestAbstain(
        address who
    ) internal {
        vm.prank(who);
        attestation.attest{ value: 0 }(
            CLAIM_ID, AgentAttestation.Decision.ABSTAIN, 5000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );
    }

    // =========================================================================
    // 1. test_OpenDispute — happy path + reverts
    // =========================================================================

    function test_OpenDispute_HappyPath() public {
        _postClaim();
        _attest(accused);

        vm.expectEmit(true, true, true, true, address(slashing));
        emit AgentSlashing.DisputeOpened(0, CLAIM_ID, accused, challenger, DISPUTE_BOND);

        vm.prank(challenger);
        uint256 id = slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        assertEq(id, 0, "first dispute id should be 0");
        assertEq(slashing.disputeCount(), 1, "disputeCount should be 1");

        AgentSlashing.Dispute memory d = slashing.getDispute(0);
        assertEq(d.claimId, CLAIM_ID, "claimId mismatch");
        assertEq(d.accused, accused, "accused mismatch");
        assertEq(d.challenger, challenger, "challenger mismatch");
        assertEq(d.bond, DISPUTE_BOND, "bond mismatch");
        assertFalse(d.resolved, "should not be resolved");

        // Accused's bond withdrawal should now be blocked.
        assertEq(registry.pendingDisputes(accused), 1, "accused should have 1 pending dispute");
    }

    function test_RevertWhen_OpenDispute_WrongBond() public {
        _postClaim();
        _attest(accused);

        vm.expectRevert(AgentSlashing.IncorrectDisputeBond.selector);
        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND - 1 }(CLAIM_ID, accused);
    }

    function test_RevertWhen_OpenDispute_AccusedDidNotAttest() public {
        _postClaim();
        // accused has not attested — dispute should revert NotDisputable.

        vm.expectRevert(AgentSlashing.NotDisputable.selector);
        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);
    }

    function test_RevertWhen_OpenDispute_AccusedAbstained() public {
        _postClaim();
        _attestAbstain(accused); // accused attested but with ABSTAIN

        vm.expectRevert(AgentSlashing.NotDisputable.selector);
        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);
    }

    function test_RevertWhen_OpenDispute_UnregisteredChallenger() public {
        _postClaim();
        _attest(accused);

        vm.deal(stranger, 1 ether);
        vm.expectRevert(AgentSlashing.NotRegistered.selector);
        vm.prank(stranger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);
    }

    // =========================================================================
    // 2. test_Vote_StakeWeighted
    // =========================================================================

    function test_Vote_StakeWeighted() public {
        _postClaim();
        _attest(accused);

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // voter1 (0.3 ether bond) votes agent-wrong.
        vm.expectEmit(true, true, false, true, address(slashing));
        emit AgentSlashing.Voted(0, voter1, true, 0.3 ether);
        vm.prank(voter1);
        slashing.vote(0, true);

        // voter2 (0.1 ether bond) votes agent-right.
        vm.prank(voter2);
        slashing.vote(0, false);

        AgentSlashing.Dispute memory d = slashing.getDispute(0);
        assertEq(d.votesWrong, 0.3 ether, "votesWrong should equal voter1 bond");
        assertEq(d.votesRight, 0.1 ether, "votesRight should equal voter2 bond");

        // AlreadyVoted revert.
        vm.expectRevert(AgentSlashing.AlreadyVoted.selector);
        vm.prank(voter1);
        slashing.vote(0, true);
    }

    function test_RevertWhen_VoteAfterWindow() public {
        _postClaim();
        _attest(accused);

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // Warp past the dispute window.
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        vm.expectRevert(AgentSlashing.VotingClosed.selector);
        vm.prank(voter1);
        slashing.vote(0, true);
    }

    function test_RevertWhen_Vote_NotRegistered() public {
        _postClaim();
        _attest(accused);

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        vm.deal(stranger, 1 ether);
        vm.expectRevert(AgentSlashing.NotRegistered.selector);
        vm.prank(stranger);
        slashing.vote(0, true);
    }

    // =========================================================================
    // 3. test_ResolveDispute_AgentWrong — exact wei math + conservation
    // =========================================================================
    //
    //  Setup: accused (bond 0.2e) attests VALID. peer also attests VALID (so peer is "other".
    //  Votes: voter1 (0.3e) wrong, voter2 (0.1e) right → votesWrong(0.3e) > votesRight(0.1e).
    //
    //  seized = ATTEST_LOCK = 0.02 ether
    //  burnHalf = 0.02 / 2 = 0.01 ether
    //  distributeHalf = 0.02 - 0.01 = 0.01 ether
    //  challengerReward = 0.02 / 10 = 0.002 ether
    //  remainderForPeers = 0.01 - 0.002 = 0.008 ether
    //  peer share = 0.008 / 1 = 0.008 ether
    //  burnActual = burnHalf = 0.01 ether (no leftover: 0.008 evenly divides)
    //
    //  challenger gets: DISPUTE_BOND + challengerReward = 0.05 + 0.002 = 0.052 ether
    //  peer gets: 0.008 ether
    //  burned: 0.01 ether
    //
    //  Conservation: seized(0.02) == burnActual(0.01) + challengerReward(0.002) + distributed(0.008) ✓

    function test_ResolveDispute_AgentWrong() public {
        _postClaim();
        _attest(accused); // accused: VALID, stake locked
        _attest(peer); // peer: VALID, stake locked (peer is "other non-abstain attestor")
        _closeClaim();

        // Open dispute.
        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // voter1 (0.3e) votes wrong; voter2 (0.1e) votes right → wrong wins.
        vm.prank(voter1);
        slashing.vote(0, true);
        vm.prank(voter2);
        slashing.vote(0, false);

        // Warp past window.
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        int256 reputationBefore = registry.getAgent(accused).reputation;

        vm.expectEmit(true, true, false, true, address(slashing));
        emit AgentSlashing.DisputeResolved(0, accused, true, ATTEST_LOCK);

        slashing.resolveDispute(0);

        // Verify resolution state.
        AgentSlashing.Dispute memory d = slashing.getDispute(0);
        assertTrue(d.resolved, "dispute should be resolved");
        assertEq(registry.pendingDisputes(accused), 0, "dispute lock should be cleared");

        // Exact wei math (see comments above).
        uint256 seized = ATTEST_LOCK; // 0.02 ether
        uint256 burnHalf = seized / 2; // 0.01 ether
        uint256 distributeHalf = seized - burnHalf; // 0.01 ether
        uint256 challengerReward = seized / 10; // 0.002 ether
        uint256 remainderForPeers = distributeHalf - challengerReward; // 0.008 ether
        // 1 peer → share = 0.008 ether exactly (no leftover)

        assertEq(slashing.totalBurned(), burnHalf, "totalBurned should equal burnHalf");
        assertEq(
            slashing.pendingWithdrawal(challenger),
            DISPUTE_BOND + challengerReward,
            "challenger claimable: bond + 10% of seized"
        );
        assertEq(slashing.pendingWithdrawal(peer), remainderForPeers, "peer gets remainder of distributeHalf");
        assertEq(slashing.pendingWithdrawal(accused), 0, "accused gets nothing");

        // Reputation: accused −10.
        assertEq(registry.getAgent(accused).reputation, reputationBefore - 10, "accused reputation -10");

        // Conservation: seized == burn + challengerReward + distributed.
        assertEq(
            seized,
            burnHalf + challengerReward + remainderForPeers,
            "conservation: seized == burn + challengerReward + distributed"
        );

        // Verify exact wei values.
        assertEq(burnHalf, 0.01 ether, "burn = 0.01 ether");
        assertEq(challengerReward, 0.002 ether, "challengerReward = 0.002 ether");
        assertEq(remainderForPeers, 0.008 ether, "peerShare = 0.008 ether");
    }

    // =========================================================================
    // 4. test_ResolveDispute_AgentRight — challenger bond split + no slash
    // =========================================================================
    //
    //  Setup: accused attests VALID.
    //  Votes: voter1 (0.3e) right, voter2 (0.1e) wrong → votesRight >= votesWrong.
    //
    //  challenger bond = 0.05 ether
    //  accusedCredit = 0.05 / 2 = 0.025 ether
    //  burnCredit = 0.05 - 0.025 = 0.025 ether

    function test_ResolveDispute_AgentRight() public {
        _postClaim();
        _attest(accused);
        _closeClaim();

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // voter1 (0.3e) votes right; voter2 (0.1e) votes wrong → right wins.
        vm.prank(voter1);
        slashing.vote(0, false); // agent was NOT wrong
        vm.prank(voter2);
        slashing.vote(0, true); // agent was wrong

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        int256 reputationBefore = registry.getAgent(accused).reputation;

        vm.expectEmit(true, true, false, true, address(slashing));
        emit AgentSlashing.DisputeResolved(0, accused, false, 0);

        slashing.resolveDispute(0);

        // Challenger loses bond: 50% to accused, 50% burned.
        uint256 accusedCredit = DISPUTE_BOND / 2; // 0.025 ether
        uint256 burnCredit = DISPUTE_BOND - accusedCredit; // 0.025 ether

        assertEq(slashing.totalBurned(), burnCredit, "50% of challenger bond burned");
        assertEq(slashing.pendingWithdrawal(accused), accusedCredit, "accused gets 50% of challenger bond");
        assertEq(slashing.pendingWithdrawal(challenger), 0, "challenger gets nothing");

        // No slash on accused's locked stake.
        // The accused's own ATTEST_LOCK should still be locked (not seized).
        AgentAttestation.Attestation memory att = attestation.getAttestation(CLAIM_ID, accused);
        assertEq(att.lockedStake, ATTEST_LOCK, "accused locked stake should be intact");

        // No reputation change.
        assertEq(registry.getAgent(accused).reputation, reputationBefore, "accused reputation unchanged");

        // Dispute lock cleared.
        assertEq(registry.pendingDisputes(accused), 0, "dispute lock cleared");
    }

    // =========================================================================
    // 5. test_RevertWhen_ResolveBeforeWindow
    // =========================================================================

    function test_RevertWhen_ResolveBeforeWindow() public {
        _postClaim();
        _attest(accused);

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // Try to resolve immediately (window not elapsed).
        vm.expectRevert(AgentSlashing.VotingOpen.selector);
        slashing.resolveDispute(0);
    }

    // =========================================================================
    // 6. test_RevertWhen_VoteAfterWindow (redundant with vote test above, included per spec)
    // =========================================================================

    function test_RevertWhen_VoteAfterWindow_Explicit() public {
        _postClaim();
        _attest(accused);

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        vm.expectRevert(AgentSlashing.VotingClosed.selector);
        vm.prank(voter1);
        slashing.vote(0, true);
    }

    // =========================================================================
    // 7. test_WithdrawalBlockedDuringDispute — open → blocked → resolve → unblocked
    // =========================================================================

    function test_WithdrawalBlockedDuringDispute() public {
        _postClaim();
        _attest(accused);

        // Accused can withdraw before any dispute.
        // (Skip: they have stake locked in attestation; just verify dispute mechanics.)

        // Open dispute — accused withdrawal should be blocked.
        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        vm.expectRevert(AgentRegistry.DisputePending.selector);
        vm.prank(accused);
        registry.withdrawBond(MIN_BOND);

        // Resolve dispute (agent wrong so we can test unblocking).
        vm.prank(voter1);
        slashing.vote(0, true); // wrong
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        slashing.resolveDispute(0);

        // After resolution, accused's bond should be unlocked.
        // (They still have 0.2 ether in the registry bond minus slash economics apply only to
        //  the ATTEST_LOCK, not their registry bond.)
        assertEq(registry.pendingDisputes(accused), 0, "pendingDisputes cleared");
        // Accused can now attempt withdrawBond (will succeed if bond >= MIN_BOND and they have enough).
        // accused bond in registry = 0.2 ether; withdraw 0.1 ether → remains 0.1 ether = MIN_BOND.
        vm.prank(accused);
        registry.withdrawBond(MIN_BOND); // 0.2 - 0.1 = 0.1 ether remaining (= MIN_BOND) — OK
        assertEq(registry.getAgent(accused).bond, MIN_BOND, "accused bond after withdrawal");
    }

    // =========================================================================
    // 8. Conservation assertion for agent-wrong path (full accounting)
    // =========================================================================

    function test_Conservation_AgentWrong() public {
        _postClaim();
        _attest(accused);
        _attest(peer);
        _closeClaim();

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // Vote: accused wrong.
        vm.prank(voter1);
        slashing.vote(0, true);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        slashing.resolveDispute(0);

        uint256 seized = ATTEST_LOCK;
        uint256 burnHalf = seized / 2;
        uint256 distributeHalf = seized - burnHalf;
        uint256 challengerReward = seized / 10;
        uint256 remainderForPeers = distributeHalf - challengerReward;

        // Every wei of seized stake is accounted.
        assertEq(seized, burnHalf + challengerReward + remainderForPeers, "conservation: every seized wei accounted");

        // Verify the contract balance holds: totalBurned + all claimable.
        uint256 claimableChallenger = slashing.pendingWithdrawal(challenger);
        uint256 claimablePeer = slashing.pendingWithdrawal(peer);
        // Contract also holds the accused's still-locked ATTEST_LOCK (peer's lock) — no, peer's
        // stake is still in AgentAttestation (not seized). slashing holds: burn + claimable.
        // Plus: the challenger's DISPUTE_BOND arrived as msg.value on openDispute and is now
        // included in claimableChallenger (bond + reward).
        // Plus: peer's ATTEST_LOCK is still in AgentAttestation (not in slashing).
        // So slashing contract balance = totalBurned + claimableChallenger + claimablePeer.
        assertEq(
            address(slashing).balance,
            slashing.totalBurned() + claimableChallenger + claimablePeer,
            "contract balance == totalBurned + all claimable"
        );
    }

    // =========================================================================
    // 9. Tie → agent-right (benefit of the doubt, D13)
    // =========================================================================

    function test_TieResolvesAsAgentRight() public {
        _postClaim();
        _attest(accused);
        _closeClaim();

        vm.prank(challenger);
        slashing.openDispute{ value: DISPUTE_BOND }(CLAIM_ID, accused);

        // voter1 (0.3e) wrong, but also cast equally-weighted right vote via voter2 …
        // Actually to get a true tie: voter1 (0.3e) wrong, voter with 0.3e right.
        // Let's use voter1 wrong and voter1-equivalent. We'll top up voter2 to 0.3e.
        vm.prank(voter2);
        registry.topUpBond{ value: 0.2 ether }(); // voter2 now has 0.3e bond

        vm.prank(voter1);
        slashing.vote(0, true); // 0.3e wrong
        vm.prank(voter2);
        slashing.vote(0, false); // 0.3e right

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // votesWrong == votesRight → tie → agent right.
        slashing.resolveDispute(0);

        AgentSlashing.Dispute memory d = slashing.getDispute(0);
        assertTrue(d.resolved, "resolved");

        // Agent-right economics: 50% of challenger bond to accused, 50% burned.
        assertEq(slashing.pendingWithdrawal(accused), DISPUTE_BOND / 2, "accused gets 50% on tie");
        assertEq(slashing.pendingWithdrawal(challenger), 0, "challenger gets nothing on tie");
        assertEq(slashing.totalBurned(), DISPUTE_BOND - DISPUTE_BOND / 2, "half burned on tie");

        // No slash on accused's locked stake.
        assertEq(attestation.getAttestation(CLAIM_ID, accused).lockedStake, ATTEST_LOCK, "stake intact on tie");
    }

    // =========================================================================
    // 10. NotRegistered guards on AgentRegistry (T-107 spec / T-102 review)
    // =========================================================================

    function test_AdjustReputation_NotRegistered_Reverts() public {
        // Cache the role constant BEFORE vm.prank so the prank is not consumed by the view call.
        bytes32 repRole = registry.REPUTATION_ROLE();
        vm.prank(admin);
        registry.grantRole(repRole, address(this));

        vm.expectRevert(AgentRegistry.NotRegistered.selector);
        registry.adjustReputation(stranger, 5);
    }

    function test_SetDisputePending_NotRegistered_Reverts() public {
        // Cache the role constant BEFORE vm.prank so the prank is not consumed by the view call.
        bytes32 dispRole = registry.DISPUTE_ROLE();
        vm.prank(admin);
        registry.grantRole(dispRole, address(this));

        vm.expectRevert(AgentRegistry.NotRegistered.selector);
        registry.setDisputePending(stranger, true);
    }
}
