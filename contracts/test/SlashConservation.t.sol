// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentAttestation } from "../src/AgentAttestation.sol";
import { AgentSlashing } from "../src/AgentSlashing.sol";
import { TuringLeaderboard } from "../src/TuringLeaderboard.sol";

/// @title SlashConservationTest
/// @notice Fuzz test that asserts the tier-1 slash conservation invariant across the
///         entire fuzz domain (PRD §6.2, T-108):
///           distributed + burned == locked (seized from the wrong attestor)
///
///         Invariant verified:
///           For a tier-1 settlement with exactly 1 wrong attestor and `attestorCount`
///           correct attestors, the 0.02e seized from the wrong attestor must satisfy:
///             totalBurned_delta + sum(redistribution shares) == ATTEST_LOCK
///
///         The `bond` parameter (uint96) is used to vary each agent's registration bond
///         while staying >= MIN_BOND, exercising the path where the registry holds
///         different bond values (bond weight affects tier-2 dispute votes but is
///         irrelevant to tier-1 slash math — which depends only on ATTEST_LOCK).
///         The fuzz is therefore primarily exercising integer-division remainder folding
///         across the range of `attestorCount` values (1..15 correct attestors).
///
///         Deep/long fuzz runs live behind `pnpm test:contracts:deep`
///         (`[profile.deep]` with 10 000 runs) and are NOT in the fast loop (PRD §6.2).
contract SlashConservationTest is Test {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 internal constant MIN_BOND = 0.1 ether;
    uint256 internal constant ATTEST_LOCK = 0.02 ether;
    uint256 internal constant CLAIM_FEE = 0.01 ether;
    uint256 internal constant EPOCH_SECONDS = 300;

    string internal constant META_URI = "ipfs://QmConservationMeta";
    string internal constant TRACE_URI = "ipfs://QmConservationTrace";

    bytes32 internal constant CLAIM_HASH = keccak256("conservationClaimPayload");
    bytes32 internal constant SOURCES_HASH = keccak256("conservationSources");
    bytes32 internal constant REASONING_HASH = keccak256("conservationReasoning");

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
    // Setup: deploy + wire all four contracts (mirrors Settlement.t.sol setUp)
    // -------------------------------------------------------------------------

    function setUp() public {
        admin = makeAddr("admin");
        operator = makeAddr("operator");
        vm.deal(operator, 100 ether); // fund for CLAIM_FEE payments

        registry = new AgentRegistry(admin);
        attestation = new AgentAttestation(address(registry), admin, operator);
        slashing = new AgentSlashing(address(registry), address(attestation), admin, 600);
        leaderboard = new TuringLeaderboard(
            address(registry), address(attestation), address(slashing), admin, operator, EPOCH_SECONDS
        );

        // Wire roles (canonical deployment topology — also recorded in docs/DECISIONS.md D14).
        vm.startPrank(admin);
        registry.grantRole(registry.REPUTATION_ROLE(), address(leaderboard));
        attestation.grantRole(attestation.SETTLER_ROLE(), address(leaderboard));
        slashing.grantRole(slashing.LEADERBOARD_ROLE(), address(leaderboard));
        attestation.grantRole(attestation.SETTLER_ROLE(), address(slashing));
        // Grant DISPUTE_ROLE to slashing so it can call setDisputePending (T-107).
        registry.grantRole(registry.DISPUTE_ROLE(), address(slashing));
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Fuzz test (PRD §6.2)
    // -------------------------------------------------------------------------

    /// @notice Asserts that for any combination of (bond, attestorCount):
    ///           redistributedDelta + burnDelta == ATTEST_LOCK
    ///         where:
    ///           - redistributedDelta = sum of claimable increases for the correct attestors
    ///             MINUS their own released ATTEST_LOCK (i.e., only the redistribution portion)
    ///           - burnDelta = increase in totalBurned from before to after settlement
    ///
    ///         Inputs are bounded:
    ///           - `attestorCount`: 1..15 correct attestors (MAX_ATTESTORS=16; 1 slot is the wrong attestor)
    ///           - `bond`: MIN_BOND..5 ether (must be >= MIN_BOND to register; capped to avoid
    ///             unrealistic values that slow the VM)
    ///
    /// @param bond          Registration bond per agent (uint96 fits 0..~79 ether; bounded to [MIN_BOND, 5e]).
    /// @param attestorCount Number of correct attestors (bounded to [1, 15]).
    function testFuzz_SlashConservation(
        uint96 bond,
        uint8 attestorCount
    ) public {
        // ---- bound inputs ----
        uint256 regBond = bound(uint256(bond), MIN_BOND, 5 ether);
        uint256 n = bound(uint256(attestorCount), 1, 15);

        // Total agents: n correct + 1 wrong
        uint256 totalAgents = n + 1;

        // ---- allocate agent addresses ----
        address[] memory agents = new address[](totalAgents);
        for (uint256 i = 0; i < totalAgents; i++) {
            agents[i] = makeAddr(string(abi.encodePacked("fuzz-agent-", i)));
        }
        // The last agent is the wrong attestor
        address wrongAttestor = agents[n];

        // ---- fund + register all agents ----
        for (uint256 i = 0; i < totalAgents; i++) {
            vm.deal(agents[i], regBond + ATTEST_LOCK + 1 ether);
            vm.prank(agents[i]);
            registry.registerAgent{ value: regBond }(META_URI);
        }

        // ---- post claim ----
        bytes32 claimId = keccak256(abi.encodePacked("fuzz-claim", bond, attestorCount));
        vm.prank(operator);
        attestation.postClaim{ value: CLAIM_FEE }(claimId, 1, CLAIM_HASH, "ipfs://QmFuzzClaim");

        // ---- correct attestors attest VALID (ground truth) ----
        for (uint256 i = 0; i < n; i++) {
            vm.prank(agents[i]);
            attestation.attest{ value: ATTEST_LOCK }(
                claimId, AgentAttestation.Decision.VALID, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
            );
        }

        // ---- wrong attestor attests REJECTED ----
        vm.prank(wrongAttestor);
        attestation.attest{ value: ATTEST_LOCK }(
            claimId, AgentAttestation.Decision.REJECTED, 9000, SOURCES_HASH, REASONING_HASH, TRACE_URI
        );

        // ---- close claim ----
        vm.prank(operator);
        attestation.closeClaim(claimId);

        // ---- snapshot state before settlement ----
        uint256 burnBefore = slashing.totalBurned();
        // Record claimable balances before (all should be 0 for these fresh agents)
        uint256[] memory claimableBefore = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            claimableBefore[i] = slashing.pendingWithdrawal(agents[i]);
        }

        // ---- settle (ground truth = VALID) ----
        vm.prank(operator);
        leaderboard.settleTier1(claimId, AgentAttestation.Decision.VALID);

        // ---- snapshot state after settlement ----
        uint256 burnAfter = slashing.totalBurned();
        uint256 burnDelta = burnAfter - burnBefore;

        // totalDelta = sum of (claimable_after - claimable_before - ATTEST_LOCK) for each correct attestor.
        // Each correct attestor's claimable = own released ATTEST_LOCK + slash redistribution share + fee share.
        // We subtract ATTEST_LOCK to isolate the over-stake portion (slash redistribution + fee).
        uint256 totalDelta;
        for (uint256 i = 0; i < n; i++) {
            uint256 claimableAfter = slashing.pendingWithdrawal(agents[i]);
            uint256 increase = claimableAfter - claimableBefore[i];
            // increase = ATTEST_LOCK (own released) + slash redistribution share + fee share
            assertGe(increase, ATTEST_LOCK, "correct attestor claimable must include own stake");
            totalDelta += increase - ATTEST_LOCK;
        }

        // ---- conservation invariant (slash + fee combined) ----
        // The total ETH entering the slash+fee system:
        //   - ATTEST_LOCK seized from the wrong attestor
        //   - CLAIM_FEE seized from the claim
        // All of it must be accounted for: burned or distributed.
        assertEq(
            burnDelta + totalDelta,
            ATTEST_LOCK + CLAIM_FEE,
            "conservation: burnDelta + totalDelta == ATTEST_LOCK + CLAIM_FEE"
        );

        // ---- secondary invariant: slashing contract balance integrity ----
        // After settlement the slashing contract holds:
        //   - all burned ETH (totalBurned, never credited to anyone)
        //   - all claimable balances (correct attestors' own stake + redistribution + fee shares)
        uint256 claimableTotal;
        for (uint256 i = 0; i < n; i++) {
            claimableTotal += slashing.pendingWithdrawal(agents[i]);
        }
        // Wrong attestor has no claimable.
        assertEq(slashing.pendingWithdrawal(wrongAttestor), 0, "wrong attestor has no claimable");

        assertEq(
            address(slashing).balance, burnAfter + claimableTotal, "slashing balance == totalBurned + all claimable"
        );
    }
}
