// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";

/// @title DeployMainnet
/// @notice COMPILE-ONLY in this phase. Mainnet deployment is gated to July 2026,
///         after the public Sepolia streak validates the loop (BOMBE-V2-PRD D8).
///         Deploying an empty mainnet registry early would be signaling theater
///         (D10), so this script refuses to run: it checks for Mantle mainnet, an
///         explicit enable flag, and then reverts, so it can never deploy by
///         accident. The real deployment wiring lives in Deploy.s.sol and will be
///         promoted here at mainnet launch.
contract DeployMainnet is Script {
    uint256 internal constant MANTLE_MAINNET = 5000;

    function run() external view {
        require(block.chainid == MANTLE_MAINNET, "DeployMainnet: Mantle mainnet (5000) only");
        require(
            vm.envOr("MAINNET_DEPLOY_ENABLED", uint256(0)) == 1,
            "DeployMainnet: gated to July 2026 (post-streak); not enabled"
        );
        revert("DeployMainnet: promote Deploy.s.sol wiring at mainnet launch");
    }
}
