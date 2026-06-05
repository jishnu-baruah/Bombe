// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AgentRegistry } from "./AgentRegistry.sol";
import { AgentAttestation } from "./AgentAttestation.sol";

/// @title AgentSlashing
/// @notice Tier-1 slash economics + Tier-2 dispute resolution for the Bombe attestation network
///         (PRD §6.2, T-106, T-107).
///
///         **Tier 1** — when TuringLeaderboard settles a tier-1 claim it calls `slashTier1` once
///         per wrong attestor. This contract seizes that attestor's locked stake out of
///         AgentAttestation (via `seizeStake`, requires SETTLER_ROLE), then:
///           - burns 50% (kept permanently in this contract, accounted in `totalBurned`),
///           - redistributes the remaining 50% pro-rata (equal split) to the correct
///             attestors as **pull-payment** `claimable` balances (PRD §9).
///         The remainder from integer division is folded into the burn so the
///         conservation invariant `seized == burn + distributed` holds exactly.
///
///         **Tier 2** — any registered agent may challenge a non-abstain attestation by calling
///         `openDispute`, locking `DISPUTE_BOND` (0.05 ether). Registered attestors vote with
///         stake weight; after the dispute window expires `resolveDispute` applies economics:
///           - agent wrong: Tier-1 slash economics on the accused's locked stake; challenger
///             receives bond back + 10% of seized stake; rest pro-rata to other attestors.
///           - agent right (or tie): challenger loses half their bond (50% to accused, 50%
///             burned); accused is unaffected. Tie → agent right (benefit of doubt, D13).
///
///         Reputation deltas are applied entirely by TuringLeaderboard during tier-1 settlement
///         (decision D12). For tier-2 disputes this contract applies −10 to the accused on
///         agent-wrong verdicts via REPUTATION_ROLE.
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
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Bond required to open a tier-2 dispute (PRD §6.2).
    uint256 public constant DISPUTE_BOND = 0.05 ether;

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice The agent registry (bond weights, dispute locks, reputation for tier-2 verdicts).
    AgentRegistry public immutable REGISTRY;

    /// @notice The attestation contract holding locked stake; source of seized funds.
    AgentAttestation public immutable ATTESTATION;

    /// @notice Dispute voting window in seconds (immutable). PRD default 600, demo 60.
    uint256 public immutable DISPUTE_WINDOW_SECONDS;

    // -------------------------------------------------------------------------
    // Dispute types
    // -------------------------------------------------------------------------

    /// @notice A single tier-2 dispute record.
    struct Dispute {
        bytes32 claimId;
        address accused;
        address challenger;
        uint256 bond;
        uint64 openedAt;
        uint256 votesWrong;
        uint256 votesRight;
        bool resolved;
    }

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

    /// @notice All tier-2 disputes, keyed by auto-incremented disputeId.
    mapping(uint256 => Dispute) public disputes;

    /// @notice Monotonically incrementing dispute counter. Equals the number of disputes opened.
    uint256 public disputeCount;

    /// @notice Per-dispute voting guard: disputeId => voter => voted.
    mapping(uint256 => mapping(address => bool)) public hasVoted;

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

    /// @notice Emitted when a new tier-2 dispute is opened.
    /// @param disputeId The unique dispute identifier (0-indexed).
    /// @param claimId   The disputed claim.
    /// @param accused   The accused attestor.
    /// @param challenger The party that opened the dispute.
    /// @param bond      The dispute bond locked (always DISPUTE_BOND).
    event DisputeOpened(
        uint256 indexed disputeId, bytes32 indexed claimId, address indexed accused, address challenger, uint256 bond
    );

    /// @notice Emitted when a registered attestor casts a vote on a dispute.
    /// @param disputeId    The dispute being voted on.
    /// @param voter        The voting agent address.
    /// @param agentWasWrong True when the voter believes the accused was wrong.
    /// @param weight       The vote weight (voter's current bond at vote time).
    event Voted(uint256 indexed disputeId, address indexed voter, bool agentWasWrong, uint256 weight);

    /// @notice Emitted when a tier-2 dispute is resolved.
    /// @param disputeId    The resolved dispute.
    /// @param accused      The accused attestor.
    /// @param agentWasWrong True when the verdict is agent-wrong (votesWrong > votesRight).
    /// @param slashAmount  The ETH seized from the accused (0 when agent-right).
    event DisputeResolved(uint256 indexed disputeId, address indexed accused, bool agentWasWrong, uint256 slashAmount);

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

    /// @notice `openDispute` called with msg.value != DISPUTE_BOND.
    error IncorrectDisputeBond();

    /// @notice The accused did not attest the claim with a non-abstain decision; not disputable.
    error NotDisputable();

    /// @notice The caller is not a registered attestor.
    error NotRegistered();

    /// @notice The dispute id does not exist.
    error DisputeNotFound();

    /// @notice `vote` called after the dispute voting window has closed.
    error VotingClosed();

    /// @notice `vote` called by an address that has already voted on this dispute.
    error AlreadyVoted();

    /// @notice `resolveDispute` called before the voting window has elapsed.
    error VotingOpen();

    /// @notice `resolveDispute` (or `vote`) called on an already-resolved dispute.
    error DisputeAlreadyResolved();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the slashing contract.
    /// @param registryAddress      Address of the deployed AgentRegistry.
    /// @param attestationAddress   Address of the deployed AgentAttestation.
    /// @param admin                Address that receives DEFAULT_ADMIN_ROLE.
    /// @param disputeWindowSeconds Voting window length in seconds (PRD default 600, demo 60).
    constructor(
        address registryAddress,
        address attestationAddress,
        address admin,
        uint256 disputeWindowSeconds
    ) {
        if (registryAddress == address(0) || attestationAddress == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        REGISTRY = AgentRegistry(registryAddress);
        ATTESTATION = AgentAttestation(attestationAddress);
        DISPUTE_WINDOW_SECONDS = disputeWindowSeconds;
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
        uint256 seized = ATTESTATION.seizeStake(claimId, wrongAttestor);
        (uint256 burn, uint256 distributed) = _burnAndRedistribute(claimId, seized, correctAttestors);
        emit Slashed(claimId, wrongAttestor, seized, burn, distributed);
    }

    // -------------------------------------------------------------------------
    // Tier-2 dispute flow
    // -------------------------------------------------------------------------

    /// @notice Open a dispute against `accused` for their attestation on `claimId`.
    ///
    ///         Requirements:
    ///         - `msg.value == DISPUTE_BOND` (0.05 ether).
    ///         - The accused must have attested the claim with a non-ABSTAIN decision.
    ///         - The challenger must be a registered attestor.
    ///
    ///         Increments the accused's pending-dispute counter in the registry
    ///         (blocks their bond withdrawal until resolved).
    ///
    /// @param claimId  The claim whose attestation is being challenged.
    /// @param accused  The attestor being challenged.
    /// @return disputeId The id of the newly opened dispute (0-indexed).
    function openDispute(
        bytes32 claimId,
        address accused
    ) external payable nonReentrant returns (uint256 disputeId) {
        if (msg.value != DISPUTE_BOND) revert IncorrectDisputeBond();
        if (!REGISTRY.isRegistered(msg.sender)) revert NotRegistered();

        // Accused must have a non-abstain attestation.
        AgentAttestation.Attestation memory att = ATTESTATION.getAttestation(claimId, accused);
        if (!att.exists || att.decision == AgentAttestation.Decision.ABSTAIN) revert NotDisputable();

        disputeId = disputeCount++;
        disputes[disputeId] = Dispute({
            claimId: claimId,
            accused: accused,
            challenger: msg.sender,
            bond: msg.value,
            openedAt: uint64(block.timestamp),
            votesWrong: 0,
            votesRight: 0,
            resolved: false
        });

        // Lock the accused's bond withdrawal for the duration of the dispute.
        REGISTRY.setDisputePending(accused, true);

        emit DisputeOpened(disputeId, claimId, accused, msg.sender, msg.value);
    }

    /// @notice Cast a stake-weighted vote on an open dispute.
    ///
    ///         Requirements:
    ///         - Dispute exists and is not resolved.
    ///         - Voting window has not elapsed (`block.timestamp <= openedAt + DISPUTE_WINDOW_SECONDS`).
    ///         - Voter must be a registered attestor.
    ///         - One vote per address per dispute.
    ///
    ///         Vote weight equals the voter's current bond in the registry at vote time.
    ///
    /// @param disputeId     The dispute to vote on.
    /// @param agentWasWrong True if the voter believes the accused attested incorrectly.
    function vote(
        uint256 disputeId,
        bool agentWasWrong
    ) external nonReentrant {
        if (disputeId >= disputeCount) revert DisputeNotFound();
        Dispute storage d = disputes[disputeId];
        if (d.resolved) revert DisputeAlreadyResolved();
        if (block.timestamp > d.openedAt + DISPUTE_WINDOW_SECONDS) revert VotingClosed();
        if (!REGISTRY.isRegistered(msg.sender)) revert NotRegistered();
        if (hasVoted[disputeId][msg.sender]) revert AlreadyVoted();

        uint256 weight = REGISTRY.getAgent(msg.sender).bond;
        hasVoted[disputeId][msg.sender] = true;

        if (agentWasWrong) {
            d.votesWrong += weight;
        } else {
            d.votesRight += weight;
        }

        emit Voted(disputeId, msg.sender, agentWasWrong, weight);
    }

    /// @notice Resolve a dispute after the voting window has elapsed.
    ///
    ///         Requirements:
    ///         - Dispute exists and is not resolved.
    ///         - Voting window has elapsed (`block.timestamp > openedAt + DISPUTE_WINDOW_SECONDS`).
    ///
    ///         **Agent wrong** (`votesWrong > votesRight`):
    ///           Seize the accused's locked stake. Split (D13):
    ///             - 50% burned.
    ///             - From the remaining 50%: 10%-of-seized to challenger (pull-payment).
    ///             - Remainder of the 50% distributed pro-rata to other non-abstain, non-accused
    ///               attestors of the same claim; if none, folds to burn.
    ///           Challenger also gets their DISPUTE_BOND back.
    ///           Accused reputation −10.
    ///
    ///         **Agent right** (`votesRight >= votesWrong`, including tie — D13):
    ///           Challenger bond 50% to accused (pull-payment), 50% burned.
    ///           No slash, no reputation change.
    ///
    /// @param disputeId The dispute to resolve.
    function resolveDispute(
        uint256 disputeId
    ) external nonReentrant {
        if (disputeId >= disputeCount) revert DisputeNotFound();
        Dispute storage d = disputes[disputeId];
        if (d.resolved) revert DisputeAlreadyResolved();
        if (block.timestamp <= d.openedAt + DISPUTE_WINDOW_SECONDS) revert VotingOpen();

        // Mark resolved before any external calls (CEI).
        d.resolved = true;

        address accused = d.accused;
        address challenger = d.challenger;
        bytes32 claimId = d.claimId;
        uint256 bond = d.bond;

        // Unlock the accused's bond withdrawal.
        REGISTRY.setDisputePending(accused, false);

        bool agentWrong = d.votesWrong > d.votesRight;
        uint256 slashAmount;

        if (agentWrong) {
            // ---------------------------------------------------------------
            // Agent-wrong path: seize accused's locked stake.
            // Split (D13): 50% burn, from remaining 50%: 10%-of-seized to challenger,
            // rest pro-rata to other non-abstain attestors of the claim (excluding accused).
            // Challenger also gets DISPUTE_BOND back.
            // ---------------------------------------------------------------
            slashAmount = ATTESTATION.seizeStake(claimId, accused);

            uint256 burnHalf = slashAmount / 2;
            uint256 distributeHalf = slashAmount - burnHalf;

            // Challenger reward = 10% of seized, capped to distributeHalf to maintain conservation.
            uint256 challengerReward = slashAmount / 10;
            if (challengerReward > distributeHalf) challengerReward = distributeHalf;

            uint256 remainderForPeers = distributeHalf - challengerReward;

            // Build the list of other non-abstain attestors (excluding accused).
            address[] memory peers = _collectPeers(claimId, accused);

            uint256 distributed;
            uint256 burnActual = burnHalf;

            if (peers.length == 0 || remainderForPeers == 0) {
                // No peers: fold remainder into burn.
                burnActual += remainderForPeers;
                remainderForPeers = 0;
            } else {
                uint256 share = remainderForPeers / peers.length;
                uint256 totalShared;
                for (uint256 i = 0; i < peers.length; i++) {
                    claimable[peers[i]] += share;
                    totalShared += share;
                    emit Redistributed(claimId, peers[i], share);
                }
                // Fold any odd-split leftover into burn.
                uint256 leftover = remainderForPeers - totalShared;
                if (leftover != 0) burnActual += leftover;
                distributed = totalShared;
            }

            totalBurned += burnActual;

            // Challenger gets bond back + reward.
            claimable[challenger] += bond + challengerReward;
            emit ClaimableCredited(challenger, bond + challengerReward);

            // Accused: reputation −10.
            REGISTRY.adjustReputation(accused, -10);

            // Conservation: slashAmount == burnActual + challengerReward + distributed.
            // (challengerReward came from distributeHalf = slashAmount - burnHalf, so
            //  burnActual + challengerReward + distributed == slashAmount exactly.)

            emit DisputeResolved(disputeId, accused, true, slashAmount);
        } else {
            // ---------------------------------------------------------------
            // Agent-right path (including tie → benefit of doubt, D13):
            // Challenger bond: 50% to accused, 50% burned.
            // ---------------------------------------------------------------
            uint256 accusedCredit = bond / 2;
            uint256 burnCredit = bond - accusedCredit; // absorbs rounding wei

            claimable[accused] += accusedCredit;
            totalBurned += burnCredit;

            emit ClaimableCredited(accused, accusedCredit);
            emit DisputeResolved(disputeId, accused, false, 0);
        }
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

    /// @notice Return the full Dispute struct for `disputeId`.
    /// @param disputeId The dispute id to query.
    function getDispute(
        uint256 disputeId
    ) external view returns (Dispute memory) {
        return disputes[disputeId];
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Shared burn-and-redistribute kernel used by both tier-1 and tier-2 agent-wrong paths.
    ///      Burns 50% of `seized`, distributes the remaining 50% equally among `recipients`.
    ///      If `recipients` is empty, the distribution half is also burned.
    ///      Odd-split remainder folds into burn so `seized == burn + distributed` exactly.
    /// @return burn        Actual ETH burned.
    /// @return distributed Actual ETH distributed.
    function _burnAndRedistribute(
        bytes32 claimId,
        uint256 seized,
        address[] memory recipients
    ) internal returns (uint256 burn, uint256 distributed) {
        burn = seized / 2;
        uint256 distribute = seized - burn;

        uint256 n = recipients.length;
        if (n == 0) {
            burn += distribute;
            distribute = 0;
        } else {
            uint256 share = distribute / n;
            for (uint256 i = 0; i < n; i++) {
                claimable[recipients[i]] += share;
                distributed += share;
                emit Redistributed(claimId, recipients[i], share);
            }
            uint256 leftover = distribute - distributed;
            if (leftover != 0) burn += leftover;
        }
        totalBurned += burn;
    }

    /// @dev Collect all non-abstain attestors of `claimId` except `accused`.
    ///      Used as the "other attestors" in tier-2 agent-wrong redistribution.
    function _collectPeers(
        bytes32 claimId,
        address accused
    ) internal view returns (address[] memory peers) {
        address[] memory all = ATTESTATION.getClaimAttestors(claimId);
        uint256 count;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i] != accused) {
                AgentAttestation.Attestation memory a = ATTESTATION.getAttestation(claimId, all[i]);
                if (a.exists && a.decision != AgentAttestation.Decision.ABSTAIN) count++;
            }
        }
        peers = new address[](count);
        uint256 idx;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i] != accused) {
                AgentAttestation.Attestation memory a = ATTESTATION.getAttestation(claimId, all[i]);
                if (a.exists && a.decision != AgentAttestation.Decision.ABSTAIN) peers[idx++] = all[i];
            }
        }
    }

    /// @notice Accept ETH only via `seizeStake` forwarding, `creditClaimable`, and dispute bonds.
    ///         A bare receive is required because `seizeStake` sends via a low-level call
    ///         with empty calldata.
    receive() external payable { }
}
