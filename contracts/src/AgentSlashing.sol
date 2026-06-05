// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AgentRegistry } from "./AgentRegistry.sol";
import { AgentAttestation } from "./AgentAttestation.sol";

/// @title AgentSlashing
/// @notice Tier-1 slash economics for the Bombe attestation network (PRD §6.2, T-106).
///
///         When TuringLeaderboard settles a tier-1 claim it calls `slashTier1` once per
///         wrong attestor. This contract seizes that attestor's locked stake out of
///         AgentAttestation (via `seizeStake`, requires SETTLER_ROLE), then:
///           - burns 50% (kept permanently in this contract, accounted in `totalBurned`),
///           - redistributes the remaining 50% pro-rata (equal split) to the correct
///             attestors as **pull-payment** `claimable` balances (PRD §9).
///         The remainder from integer division is folded into the burn so the
///         conservation invariant `seized == burn + distributed` holds exactly.
///
///         Reputation deltas are applied entirely by TuringLeaderboard during settlement
///         (decision D12): this contract NEVER touches reputation, and ABSTAIN attestations
///         never enter any slash path (PRD §14.6).
///
///         `claimable` is the single withdrawal surface for the whole settlement system:
///         the Leaderboard also routes correct attestors' released own-stake through here
///         via `creditClaimable`, so every payout is withdrawn with `withdraw()`.
/// @dev Solidity ^0.8.24, OZ v5. Chain: Mantle Sepolia (chain id 5003).
contract AgentSlashing is AccessControl, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role permitted to call `slashTier1` and `creditClaimable`.
    ///         Granted exclusively to TuringLeaderboard (T-105).
    bytes32 public constant LEADERBOARD_ROLE = keccak256("LEADERBOARD_ROLE");

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice The agent registry (reputation lives here; this contract does not mutate it).
    AgentRegistry public immutable REGISTRY;

    /// @notice The attestation contract holding locked stake; source of seized funds.
    AgentAttestation public immutable ATTESTATION;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Pull-payment balances. Correct attestors withdraw redistribution + released
    ///         own-stake from here. Burned ETH is never credited to anyone.
    mapping(address => uint256) public claimable;

    /// @notice Cumulative burned ETH. Burned funds stay locked in this contract forever
    ///         (never credited to any `claimable`), which is the burn mechanism: ETH that
    ///         can never be withdrawn. Tracked here for accounting and the conservation
    ///         invariant `seized == burn + distributed`.
    uint256 public totalBurned;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted once per wrong attestor slashed in a tier-1 settlement.
    /// @param claimId      The settled claim.
    /// @param wrongAttestor The attestor whose stake was seized.
    /// @param seized       Total ETH seized from the wrong attestor (their ATTEST_LOCK).
    /// @param burn         Portion burned (kept locked forever); includes any rounding remainder.
    /// @param distribute   Portion distributed pro-rata to correct attestors.
    event Slashed(
        bytes32 indexed claimId, address indexed wrongAttestor, uint256 seized, uint256 burn, uint256 distribute
    );

    /// @notice Emitted when a correct attestor is credited a share of redistributed stake.
    /// @param claimId  The settled claim.
    /// @param attestor The correct attestor credited.
    /// @param amount   The ETH amount added to their `claimable`.
    event Redistributed(bytes32 indexed claimId, address indexed attestor, uint256 amount);

    /// @notice Emitted when the Leaderboard credits a pull-payment balance (e.g. released own-stake).
    /// @param to     The recipient credited.
    /// @param amount The ETH amount added to their `claimable`.
    event ClaimableCredited(address indexed to, uint256 amount);

    /// @notice Emitted when an account withdraws its pull-payment balance.
    /// @param to     The withdrawing account.
    /// @param amount The ETH amount withdrawn.
    event Withdrawn(address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    /// @notice A constructor address argument was the zero address.
    error ZeroAddress();

    /// @notice `withdraw` called with a zero `claimable` balance.
    error NothingToWithdraw();

    /// @notice ETH transfer to the withdrawing account failed.
    error TransferFailed();

    /// @notice `creditClaimable` called with `to == address(0)`.
    error CreditToZero();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the slashing contract.
    /// @param registryAddress    Address of the deployed AgentRegistry.
    /// @param attestationAddress Address of the deployed AgentAttestation.
    /// @param admin              Address that receives DEFAULT_ADMIN_ROLE.
    constructor(
        address registryAddress,
        address attestationAddress,
        address admin
    ) {
        if (registryAddress == address(0) || attestationAddress == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        REGISTRY = AgentRegistry(registryAddress);
        ATTESTATION = AgentAttestation(attestationAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Tier-1 slash (Leaderboard-only)
    // -------------------------------------------------------------------------

    /// @notice Seize a wrong attestor's locked stake and apply tier-1 slash economics.
    ///
    ///         Pulls the wrong attestor's `ATTEST_LOCK` out of AgentAttestation into this
    ///         contract, then:
    ///           - `burn = seized / 2`,
    ///           - `distribute = seized - burn` (the remainder goes to the distribution side,
    ///             so no wei is lost; the leftover from an odd split among correct attestors
    ///             is folded back into the burn so conservation stays exact),
    ///           - splits `distribute` equally across `correctAttestors` as `claimable`.
    ///         If `correctAttestors` is empty, the whole seized amount is burned (kept locked),
    ///         so nothing is ever lost. Reputation is handled by the Leaderboard (D12).
    ///
    ///         Conservation invariant (fuzzed in T-108): `seized == burn + distributed`.
    /// @param claimId         The claim being settled.
    /// @param wrongAttestor   The attestor whose stake is seized.
    /// @param correctAttestors The correct attestors receiving the redistribution (never ABSTAIN).
    function slashTier1(
        bytes32 claimId,
        address wrongAttestor,
        address[] calldata correctAttestors
    ) external onlyRole(LEADERBOARD_ROLE) nonReentrant {
        // Pull the wrong attestor's locked stake into this contract.
        uint256 seized = ATTESTATION.seizeStake(claimId, wrongAttestor);

        uint256 burn = seized / 2;
        uint256 distribute = seized - burn; // remainder favors distribution before any split

        uint256 n = correctAttestors.length;
        uint256 distributed;
        if (n == 0) {
            // No correct attestors: the would-be distribution is also burned (kept locked).
            burn += distribute;
            distribute = 0;
        } else {
            uint256 share = distribute / n;
            for (uint256 i = 0; i < n; i++) {
                claimable[correctAttestors[i]] += share;
                distributed += share;
                emit Redistributed(claimId, correctAttestors[i], share);
            }
            // Fold any odd-split leftover into the burn so seized == burn + distributed exactly.
            uint256 leftover = distribute - distributed;
            if (leftover != 0) burn += leftover;
            distribute = distributed;
        }

        totalBurned += burn;

        // Conservation: seized == burn + distribute (== distributed). Asserted in tests/fuzz.
        emit Slashed(claimId, wrongAttestor, seized, burn, distribute);
    }

    // -------------------------------------------------------------------------
    // Pull-payment crediting + withdrawal
    // -------------------------------------------------------------------------

    /// @notice Credit a pull-payment balance, funded by the forwarded `msg.value`.
    ///         Used by the Leaderboard to route correct attestors' released own-stake
    ///         through this contract's single `withdraw()` surface.
    /// @param to The recipient whose `claimable` increases.
    function creditClaimable(
        address to
    ) external payable onlyRole(LEADERBOARD_ROLE) {
        if (to == address(0)) revert CreditToZero();
        claimable[to] += msg.value;
        emit ClaimableCredited(to, msg.value);
    }

    /// @notice Withdraw the caller's full pull-payment balance.
    ///         Checks-effects-interactions with a reentrancy guard (PRD §9).
    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // effects
        claimable[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);

        // interactions
        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Return the pending pull-payment balance for `account`.
    /// @param account Address to query.
    function pendingWithdrawal(
        address account
    ) external view returns (uint256) {
        return claimable[account];
    }

    /// @notice Accept ETH only via `seizeStake` forwarding and `creditClaimable`.
    ///         A bare receive is required because `seizeStake` sends via a low-level call
    ///         with empty calldata.
    receive() external payable { }
}
