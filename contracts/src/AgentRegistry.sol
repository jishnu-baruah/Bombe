// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentRegistry
/// @notice Registry for AI and human attestor agents in the Bombe attestation network.
///         Manages agent registration, bond accounting, reputation, and dispute locks.
///         Reputation and dispute hooks are role-gated so downstream contracts
///         (TuringLeaderboard, AgentSlashing) can be granted the relevant roles and
///         slot in without modifying this contract.
/// @dev Uses OZ AccessControl for role management and ReentrancyGuard for bond withdrawals.
///      Chain: Mantle Sepolia (chain id 5003).
contract AgentRegistry is AccessControl, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role that permits adjusting an agent's reputation score.
    ///         Granted to TuringLeaderboard / AgentSlashing when those contracts deploy.
    bytes32 public constant REPUTATION_ROLE = keccak256("REPUTATION_ROLE");

    /// @notice Role that permits incrementing/decrementing the pending-dispute counter.
    ///         Granted to AgentSlashing when that contract deploys.
    bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Minimum bond required to register or remain registered after a partial withdrawal.
    uint256 public constant MIN_BOND = 0.1 ether;

    // -------------------------------------------------------------------------
    // Storage types
    // -------------------------------------------------------------------------

    /// @notice Full agent record stored in the registry.
    struct Agent {
        address addr;
        uint256 bond;
        int256 reputation;
        bool isHuman;
        bool active;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Primary agent store keyed by agent address.
    mapping(address => Agent) private _agents;

    /// @notice Number of open disputes currently pending for each agent.
    ///         Withdrawals are blocked while this counter is > 0.
    mapping(address => uint256) public pendingDisputes;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new agent (AI or human) is registered.
    /// @param agent       The address of the newly registered agent.
    /// @param bond        The bond amount deposited on registration.
    /// @param isHuman     True when the registrant declared themselves a human attestor.
    /// @param metadataURI Off-chain URI carrying agent metadata (profile, keys, etc.).
    event AgentRegistered(address indexed agent, uint256 bond, bool isHuman, string metadataURI);

    /// @notice Emitted when an agent tops up their existing bond.
    /// @param agent   The agent address.
    /// @param amount  The additional ETH deposited.
    /// @param newBond The agent's total bond after the top-up.
    event BondToppedUp(address indexed agent, uint256 amount, uint256 newBond);

    /// @notice Emitted when an agent withdraws bond ETH.
    /// @param agent   The agent address.
    /// @param amount  The ETH amount withdrawn.
    /// @param newBond The remaining bond after withdrawal (0 on full exit).
    /// @param exited  True when this withdrawal deactivated the agent (full exit).
    event BondWithdrawn(address indexed agent, uint256 amount, uint256 newBond, bool exited);

    /// @notice Emitted when an agent's reputation is adjusted by a privileged role.
    /// @param agent          The agent address.
    /// @param delta          The signed reputation change applied.
    /// @param newReputation  The resulting reputation value.
    event ReputationAdjusted(address indexed agent, int256 delta, int256 newReputation);

    /// @notice Emitted when the pending-dispute counter for an agent changes.
    /// @param agent        The agent address.
    /// @param pendingCount The new value of the pending-dispute counter.
    event DisputePendingChanged(address indexed agent, uint256 pendingCount);

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    /// @notice msg.value is below MIN_BOND.
    error InsufficientBond();

    /// @notice Agent is already registered and active.
    error AlreadyRegistered();

    /// @notice Agent is not registered (or not active where required).
    error NotRegistered();

    /// @notice A pending dispute prevents bond withdrawal.
    error DisputePending();

    /// @notice Withdrawal would leave the bond below MIN_BOND without fully exiting.
    error BondBelowMinimum();

    /// @notice ETH transfer to the agent failed.
    error TransferFailed();

    /// @notice Decrementing the dispute counter would underflow (called more times than set).
    error DisputeCounterUnderflow();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the registry and grants DEFAULT_ADMIN_ROLE to the deployer.
    /// @param admin Address that receives DEFAULT_ADMIN_ROLE (typically a multisig or deployer EOA).
    constructor(
        address admin
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    /// @notice Register the caller as an AI agent.
    ///         The sent ETH becomes the caller's bond and must meet MIN_BOND.
    /// @param metadataURI Off-chain URI with agent profile data.
    function registerAgent(
        string calldata metadataURI
    ) external payable {
        _register(metadataURI, false);
    }

    /// @notice Register the caller as a human attestor.
    ///         Humans are first-class participants — same bond and slashing rules as AI agents.
    /// @param metadataURI Off-chain URI with human attestor profile data.
    function registerHuman(
        string calldata metadataURI
    ) external payable {
        _register(metadataURI, true);
    }

    /// @dev Shared registration logic for both agent and human paths.
    function _register(
        string calldata metadataURI,
        bool isHuman
    ) internal {
        if (msg.value < MIN_BOND) revert InsufficientBond();
        if (_agents[msg.sender].active) revert AlreadyRegistered();

        _agents[msg.sender] =
            Agent({ addr: msg.sender, bond: msg.value, reputation: 0, isHuman: isHuman, active: true });

        emit AgentRegistered(msg.sender, msg.value, isHuman, metadataURI);
    }

    // -------------------------------------------------------------------------
    // Bond management
    // -------------------------------------------------------------------------

    /// @notice Top up the caller's bond.
    ///         The caller must already be registered and active.
    function topUpBond() external payable {
        if (!_agents[msg.sender].active) revert NotRegistered();
        _agents[msg.sender].bond += msg.value;
        emit BondToppedUp(msg.sender, msg.value, _agents[msg.sender].bond);
    }

    /// @notice Withdraw `amount` ETH from the caller's bond.
    ///         Rules:
    ///           - Caller must be registered (active or previously active with leftover bond).
    ///           - Blocked while any dispute is pending.
    ///           - After withdrawal the remaining bond must be >= MIN_BOND **or** exactly 0 (full exit).
    ///           - Full exit (amount == bond) sets active = false.
    ///         Implements checks-effects-interactions with nonReentrant guard.
    /// @param amount ETH amount to withdraw.
    function withdrawBond(
        uint256 amount
    ) external nonReentrant {
        Agent storage agent = _agents[msg.sender];

        if (agent.addr == address(0)) revert NotRegistered();
        if (pendingDisputes[msg.sender] > 0) revert DisputePending();

        uint256 currentBond = agent.bond;
        uint256 remaining = currentBond - amount; // reverts on underflow (Solidity 0.8)

        // remaining must be >= MIN_BOND or exactly 0 (full exit)
        if (remaining != 0 && remaining < MIN_BOND) revert BondBelowMinimum();

        bool exited = remaining == 0;

        // effects
        agent.bond = remaining;
        if (exited) {
            agent.active = false;
        }

        emit BondWithdrawn(msg.sender, amount, remaining, exited);

        // interactions
        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // Reputation (role-gated)
    // -------------------------------------------------------------------------

    /// @notice Adjust an agent's reputation by `delta`.
    ///         Only callable by accounts holding REPUTATION_ROLE
    ///         (TuringLeaderboard, AgentSlashing).
    /// @param agent Address of the agent whose reputation changes.
    /// @param delta Signed integer change to apply (positive = reward, negative = penalty).
    function adjustReputation(
        address agent,
        int256 delta
    ) external onlyRole(REPUTATION_ROLE) {
        _agents[agent].reputation += delta;
        emit ReputationAdjusted(agent, delta, _agents[agent].reputation);
    }

    // -------------------------------------------------------------------------
    // Dispute lock (role-gated)
    // -------------------------------------------------------------------------

    /// @notice Increment or decrement the pending-dispute counter for an agent.
    ///         Called by AgentSlashing when a dispute is opened or resolved.
    ///         Withdrawals are blocked while `pendingDisputes[agent] > 0`.
    /// @param agent   Address of the agent involved in the dispute.
    /// @param pending True to increment (dispute opened), false to decrement (dispute closed).
    function setDisputePending(
        address agent,
        bool pending
    ) external onlyRole(DISPUTE_ROLE) {
        if (pending) {
            pendingDisputes[agent] += 1;
        } else {
            if (pendingDisputes[agent] == 0) revert DisputeCounterUnderflow();
            pendingDisputes[agent] -= 1;
        }
        emit DisputePendingChanged(agent, pendingDisputes[agent]);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Return the full Agent struct for `agent`.
    /// @param agent Address to query.
    /// @return The Agent struct (zero-value struct if not registered).
    function getAgent(
        address agent
    ) external view returns (Agent memory) {
        return _agents[agent];
    }

    /// @notice Returns true if `agent` is currently registered and active.
    /// @param agent Address to query.
    function isRegistered(
        address agent
    ) external view returns (bool) {
        return _agents[agent].active;
    }
}
