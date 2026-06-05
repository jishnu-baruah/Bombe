// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";

/// @title AgentRegistryTest
/// @notice Forge test suite for AgentRegistry (PRD §6.2, T-102).
contract AgentRegistryTest is Test {
    // -------------------------------------------------------------------------
    // Helpers / constants
    // -------------------------------------------------------------------------

    AgentRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal agent1 = makeAddr("agent1");
    address internal agent2 = makeAddr("agent2");
    address internal slasher = makeAddr("slasher");
    address internal leaderboard = makeAddr("leaderboard");

    uint256 internal constant MIN_BOND = 0.1 ether;
    string internal constant META_URI = "ipfs://QmAgentMeta";

    // Role constants cached at test level — avoids calling registry.XXX_ROLE() inside a
    // vm.prank window, which would consume the prank on the view call instead of the intended
    // mutating call.
    bytes32 internal reputationRole;
    bytes32 internal disputeRole;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        registry = new AgentRegistry(admin);

        // Cache roles immediately after deployment (no prank active here).
        reputationRole = registry.REPUTATION_ROLE();
        disputeRole = registry.DISPUTE_ROLE();

        // Fund test addresses
        vm.deal(agent1, 10 ether);
        vm.deal(agent2, 10 ether);
        vm.deal(slasher, 1 ether);
    }

    // -------------------------------------------------------------------------
    // 1. test_RegisterAgent_HappyPath
    // -------------------------------------------------------------------------

    function test_RegisterAgent_HappyPath() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.AgentRegistered(agent1, MIN_BOND, false, META_URI);

        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        AgentRegistry.Agent memory a = registry.getAgent(agent1);
        assertEq(a.addr, agent1, "addr mismatch");
        assertEq(a.bond, MIN_BOND, "bond mismatch");
        assertEq(a.reputation, 0, "reputation should be 0");
        assertFalse(a.isHuman, "should not be human");
        assertTrue(a.active, "should be active");
        assertTrue(registry.isRegistered(agent1), "isRegistered should be true");
    }

    // -------------------------------------------------------------------------
    // 2. test_RegisterAgent_RevertBelowMinBond
    // -------------------------------------------------------------------------

    function test_RegisterAgent_RevertBelowMinBond() public {
        vm.expectRevert(AgentRegistry.InsufficientBond.selector);
        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND - 1 }(META_URI);
    }

    // -------------------------------------------------------------------------
    // 3. test_RegisterHuman
    // -------------------------------------------------------------------------

    function test_RegisterHuman() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.AgentRegistered(agent2, MIN_BOND, true, META_URI);

        vm.prank(agent2);
        registry.registerHuman{ value: MIN_BOND }(META_URI);

        AgentRegistry.Agent memory a = registry.getAgent(agent2);
        assertTrue(a.isHuman, "should be human");
        assertTrue(a.active, "should be active");
        assertEq(a.bond, MIN_BOND, "bond mismatch");
    }

    // -------------------------------------------------------------------------
    // 4. test_RevertWhen_AlreadyRegistered
    // -------------------------------------------------------------------------

    function test_RevertWhen_AlreadyRegistered() public {
        vm.startPrank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        registry.registerAgent{ value: MIN_BOND }(META_URI);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // 5. test_TopUpBond
    // -------------------------------------------------------------------------

    function test_TopUpBond() public {
        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        uint256 topUpAmount = 0.5 ether;
        uint256 expectedBond = MIN_BOND + topUpAmount;

        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.BondToppedUp(agent1, topUpAmount, expectedBond);

        vm.prank(agent1);
        registry.topUpBond{ value: topUpAmount }();

        AgentRegistry.Agent memory a = registry.getAgent(agent1);
        assertEq(a.bond, expectedBond, "bond after top-up mismatch");
    }

    // -------------------------------------------------------------------------
    // 6a. test_WithdrawBond_PartialKeepsAboveMin
    // -------------------------------------------------------------------------

    function test_WithdrawBond_PartialKeepsAboveMin() public {
        uint256 initialBond = 1 ether;
        vm.prank(agent1);
        registry.registerAgent{ value: initialBond }(META_URI);

        // Withdraw so that remaining = 0.5 ether (above MIN_BOND)
        uint256 withdrawAmount = 0.5 ether;
        uint256 expectedRemaining = initialBond - withdrawAmount;

        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.BondWithdrawn(agent1, withdrawAmount, expectedRemaining, false);

        uint256 balanceBefore = agent1.balance;
        vm.prank(agent1);
        registry.withdrawBond(withdrawAmount);
        uint256 balanceAfter = agent1.balance;

        AgentRegistry.Agent memory a = registry.getAgent(agent1);
        assertEq(a.bond, expectedRemaining, "bond after partial withdrawal mismatch");
        assertTrue(a.active, "should still be active after partial withdrawal");
        assertEq(balanceAfter - balanceBefore, withdrawAmount, "ETH not transferred correctly");
    }

    // -------------------------------------------------------------------------
    // 6b. test_WithdrawBond_FullExit
    // -------------------------------------------------------------------------

    function test_WithdrawBond_FullExit() public {
        uint256 initialBond = MIN_BOND;
        vm.prank(agent1);
        registry.registerAgent{ value: initialBond }(META_URI);

        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.BondWithdrawn(agent1, initialBond, 0, true);

        vm.prank(agent1);
        registry.withdrawBond(initialBond);

        AgentRegistry.Agent memory a = registry.getAgent(agent1);
        assertEq(a.bond, 0, "bond should be 0 after full exit");
        assertFalse(a.active, "should be inactive after full exit");
        assertFalse(registry.isRegistered(agent1), "isRegistered should be false after exit");
    }

    // -------------------------------------------------------------------------
    // 7. test_RevertWhen_WithdrawLeavesBelowMin
    // -------------------------------------------------------------------------

    function test_RevertWhen_WithdrawLeavesBelowMin() public {
        uint256 initialBond = 1 ether;
        vm.prank(agent1);
        registry.registerAgent{ value: initialBond }(META_URI);

        // Withdraw such that remaining = MIN_BOND / 2 (below MIN_BOND, not zero)
        uint256 withdrawAmount = initialBond - (MIN_BOND / 2);

        vm.expectRevert(AgentRegistry.BondBelowMinimum.selector);
        vm.prank(agent1);
        registry.withdrawBond(withdrawAmount);
    }

    // -------------------------------------------------------------------------
    // 8. test_RevertWhen_WithdrawDuringDispute
    // -------------------------------------------------------------------------

    function test_RevertWhen_WithdrawDuringDispute() public {
        // Register agent
        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        // Grant DISPUTE_ROLE to slasher (use cached role to avoid consuming the prank)
        vm.prank(admin);
        registry.grantRole(disputeRole, slasher);

        // Open a dispute
        vm.prank(slasher);
        registry.setDisputePending(agent1, true);
        assertEq(registry.pendingDisputes(agent1), 1, "pendingDisputes should be 1");

        // Attempt withdrawal — should revert
        vm.expectRevert(AgentRegistry.DisputePending.selector);
        vm.prank(agent1);
        registry.withdrawBond(MIN_BOND);
    }

    // -------------------------------------------------------------------------
    // 9. test_AdjustReputation_OnlyRole
    // -------------------------------------------------------------------------

    function test_AdjustReputation_OnlyRole() public {
        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        // Without role — should revert with OZ AccessControl error.
        // vm.expectRevert must come before vm.prank so the prank is consumed
        // by the actual mutating call, not by the cheatcode invocation.
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), leaderboard, reputationRole
            )
        );
        vm.prank(leaderboard);
        registry.adjustReputation(agent1, 10);

        // Grant role then try again — should succeed
        vm.prank(admin);
        registry.grantRole(reputationRole, leaderboard);

        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.ReputationAdjusted(agent1, 10, 10);

        vm.prank(leaderboard);
        registry.adjustReputation(agent1, 10);

        AgentRegistry.Agent memory a = registry.getAgent(agent1);
        assertEq(a.reputation, 10, "reputation mismatch after role-gated adjust");
    }

    // -------------------------------------------------------------------------
    // 10. test_AdjustReputation_DeltaMath
    // -------------------------------------------------------------------------

    function test_AdjustReputation_DeltaMath() public {
        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        // Grant role (use cached role constant to avoid prank consumption on view call)
        vm.prank(admin);
        registry.grantRole(reputationRole, leaderboard);

        // Positive delta
        vm.prank(leaderboard);
        registry.adjustReputation(agent1, 5);
        assertEq(registry.getAgent(agent1).reputation, 5, "after +5");

        // Another positive delta
        vm.prank(leaderboard);
        registry.adjustReputation(agent1, 3);
        assertEq(registry.getAgent(agent1).reputation, 8, "after +3");

        // Negative delta
        vm.prank(leaderboard);
        registry.adjustReputation(agent1, -10);
        assertEq(registry.getAgent(agent1).reputation, -2, "after -10");

        // Back to zero
        vm.prank(leaderboard);
        registry.adjustReputation(agent1, 2);
        assertEq(registry.getAgent(agent1).reputation, 0, "after +2 back to 0");
    }

    // -------------------------------------------------------------------------
    // 11. test_SetDisputePending_IncrementDecrement
    // -------------------------------------------------------------------------

    function test_SetDisputePending_IncrementDecrement() public {
        vm.prank(agent1);
        registry.registerAgent{ value: MIN_BOND }(META_URI);

        vm.prank(admin);
        registry.grantRole(disputeRole, slasher);

        vm.startPrank(slasher);

        // Open two disputes
        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.DisputePendingChanged(agent1, 1);
        registry.setDisputePending(agent1, true);

        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.DisputePendingChanged(agent1, 2);
        registry.setDisputePending(agent1, true);

        assertEq(registry.pendingDisputes(agent1), 2, "should have 2 pending disputes");

        // Close one
        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentRegistry.DisputePendingChanged(agent1, 1);
        registry.setDisputePending(agent1, false);

        assertEq(registry.pendingDisputes(agent1), 1, "should have 1 pending dispute");

        // Close last
        registry.setDisputePending(agent1, false);
        assertEq(registry.pendingDisputes(agent1), 0, "should have 0 pending disputes");

        // Underflow guard
        vm.expectRevert(AgentRegistry.DisputeCounterUnderflow.selector);
        registry.setDisputePending(agent1, false);

        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // 12. test_TopUpBond_RevertNotRegistered
    // -------------------------------------------------------------------------

    function test_TopUpBond_RevertNotRegistered() public {
        vm.expectRevert(AgentRegistry.NotRegistered.selector);
        vm.prank(agent1);
        registry.topUpBond{ value: MIN_BOND }();
    }
}
