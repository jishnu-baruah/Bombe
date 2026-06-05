// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentAttestation } from "../src/AgentAttestation.sol";
import { AgentSlashing } from "../src/AgentSlashing.sol";
import { TuringLeaderboard } from "../src/TuringLeaderboard.sol";

/// @title Deploy
/// @notice Deploys all four Bombe contracts and wires the canonical role topology.
///
///         Deploy order:
///           1. AgentRegistry(admin)
///           2. AgentAttestation(registry, admin, admin)
///           3. AgentSlashing(registry, attestation, admin, disputeWindowSeconds)
///           4. TuringLeaderboard(registry, attestation, slashing, admin, admin, epochSeconds)
///
///         Roles wired (canonical deployment topology — D14 in docs/DECISIONS.md):
///           registry.REPUTATION_ROLE    → leaderboard
///           registry.DISPUTE_ROLE       → slashing
///           attestation.SETTLER_ROLE    → leaderboard
///           attestation.SETTLER_ROLE    → slashing
///           slashing.LEADERBOARD_ROLE   → leaderboard
///           attestation.OPERATOR_ROLE   → admin  (already granted in constructor)
///           leaderboard.OPERATOR_ROLE   → admin  (already granted in constructor)
///
///         Timing defaults (env-driven, demo values per PRD §6.2 §7):
///           DEMO_EPOCH_SECONDS          default 300  (1 hr default: 3600)
///           DEMO_DISPUTE_WINDOW_SECONDS default 60   (production default: 600)
///
///         The deployer / admin = the broadcasting address (from the active private key
///         or the Foundry `--sender` flag). For a live Anvil run this is Anvil account #0.
///
/// @dev Run with:
///        forge script script/Deploy.s.sol               (dry-run, no broadcast)
///        forge script script/Deploy.s.sol --broadcast   (requires RPC_URL + private key)
contract Deploy is Script {
    function run() external {
        // ---- Timing params (env-driven with demo defaults) ----
        uint256 epochSeconds = vm.envOr("DEMO_EPOCH_SECONDS", uint256(300));
        uint256 disputeWindowSeconds = vm.envOr("DEMO_DISPUTE_WINDOW_SECONDS", uint256(60));

        // ---- Deployer = broadcaster ----
        vm.startBroadcast();
        address admin = msg.sender;

        // ---- 1. AgentRegistry ----
        AgentRegistry registry = new AgentRegistry(admin);
        console2.log("AgentRegistry:    ", address(registry));

        // ---- 2. AgentAttestation ----
        // Constructor: (registryAddress, admin, operator)
        // admin receives DEFAULT_ADMIN_ROLE; operator receives OPERATOR_ROLE.
        // We grant both to the deployer so the operator console works from the same key.
        AgentAttestation attestation = new AgentAttestation(address(registry), admin, admin);
        console2.log("AgentAttestation: ", address(attestation));

        // ---- 3. AgentSlashing ----
        // Constructor: (registryAddress, attestationAddress, admin, disputeWindowSeconds)
        AgentSlashing slashing = new AgentSlashing(address(registry), address(attestation), admin, disputeWindowSeconds);
        console2.log("AgentSlashing:    ", address(slashing));

        // ---- 4. TuringLeaderboard ----
        // Constructor: (registryAddress, attestationAddress, slashingAddress, admin, operator, epochSeconds)
        TuringLeaderboard leaderboard = new TuringLeaderboard(
            address(registry), address(attestation), address(slashing), admin, admin, epochSeconds
        );
        console2.log("TuringLeaderboard:", address(leaderboard));

        // ---- Wire roles (D14 canonical topology) ----

        // Leaderboard mutates reputation for correct/wrong attestors.
        registry.grantRole(registry.REPUTATION_ROLE(), address(leaderboard));

        // Slashing sets dispute-pending flags on the registry.
        registry.grantRole(registry.DISPUTE_ROLE(), address(slashing));

        // Slashing applies the −10 reputation penalty to a losing accused in resolveDispute
        // (agent-wrong path). Without this grant, tier-2 agent-wrong resolutions revert.
        registry.grantRole(registry.REPUTATION_ROLE(), address(slashing));

        // Leaderboard may seize stake from AgentAttestation (for correct + wrong paths).
        attestation.grantRole(attestation.SETTLER_ROLE(), address(leaderboard));

        // Slashing may seize stake from AgentAttestation (slashTier1 path).
        attestation.grantRole(attestation.SETTLER_ROLE(), address(slashing));

        // Leaderboard drives AgentSlashing (slashTier1 + creditClaimable).
        slashing.grantRole(slashing.LEADERBOARD_ROLE(), address(leaderboard));

        // Note: OPERATOR_ROLE on AgentAttestation and TuringLeaderboard is already granted
        // to `admin` in their respective constructors (operator == admin here). No extra
        // grantRole calls are needed for those; they would revert on a double-grant in OZ v5
        // only if the role weren't idempotent — grantRole IS idempotent in OZ AccessControl
        // so it's safe, but we omit the redundant calls for clarity.

        vm.stopBroadcast();

        // ---- Summary ----
        console2.log("---");
        console2.log("epochSeconds:          ", epochSeconds);
        console2.log("disputeWindowSeconds:  ", disputeWindowSeconds);
        console2.log("admin/operator:        ", admin);
    }
}
