// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AgentRegistry } from "./AgentRegistry.sol";
import { AgentAttestation } from "./AgentAttestation.sol";
import { AgentSlashing } from "./AgentSlashing.sol";

/// @title TuringLeaderboard
/// @notice Operator-driven tier-1 settlement and per-agent scoreboard (PRD §6.2, T-105).
///
///         `settleTier1` is the orchestration point for the whole economic core. Given the
///         operator-supplied ground truth for a closed tier-1 claim it walks the attestor
///         list once to classify each attestor, then settles:
///
///         Responsibility split (decision D12 — recorded in docs/DECISIONS.md):
///           - This contract applies ALL reputation deltas: +1 correct, -10 wrong, ±0 abstain.
///           - This contract releases each CORRECT attestor's own locked stake by seizing it
///             from AgentAttestation (SETTLER_ROLE) and crediting it back through
///             AgentSlashing.creditClaimable, unifying every payout under one `withdraw()`.
///           - For each WRONG attestor it calls AgentSlashing.slashTier1, which alone handles
///             the seized-stake burn/redistribute economics and does NOT touch reputation.
///           - ABSTAIN attestations hold no stake, get ±0 reputation, and are NEVER passed to
///             any slash path (PRD §14.6).
///
///         Stats are tracked per epoch (`block.timestamp / epochSeconds`) and lifetime.
/// @dev Solidity ^0.8.24, OZ v5. Chain: Mantle Sepolia (chain id 5003).
contract TuringLeaderboard is AccessControl, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role permitted to call `settleTier1`. Granted to the operator.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // -------------------------------------------------------------------------
    // Immutables / config
    // -------------------------------------------------------------------------

    /// @notice The agent registry (reputation target).
    AgentRegistry public immutable REGISTRY;

    /// @notice The attestation contract (claims, attestations, locked stake).
    AgentAttestation public immutable ATTESTATION;

    /// @notice The slashing contract (seized-stake economics + unified withdrawal surface).
    AgentSlashing public immutable SLASHING;

    /// @notice Seconds per epoch. PRD default 3600; demo deploy 300. Current epoch is
    ///         `block.timestamp / EPOCH_SECONDS`.
    uint256 public immutable EPOCH_SECONDS;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Per-agent attestation outcome tallies (epoch-scoped and lifetime).
    struct Stats {
        uint64 correct;
        uint64 wrong;
        uint64 abstained;
        uint64 slashes;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Per-agent, per-epoch stats: agent => epoch => Stats.
    mapping(address => mapping(uint256 => Stats)) private epochStatsMap;

    /// @notice Per-agent lifetime stats.
    mapping(address => Stats) private lifetimeStatsMap;

    /// @notice Settled-claim guard (settlement is one-shot per claim).
    mapping(bytes32 => bool) public settled;

    // -------------------------------------------------------------------------
    // Constants (T-016)
    // -------------------------------------------------------------------------

    /// @notice Experience cap for the trust-score formula (Part 2, T-016).
    ///         An agent with >= CAP total attestations scores the full 30 experience points.
    uint256 public constant TRUST_SCORE_EXP_CAP = 15;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a tier-1 claim is settled.
    /// @param claimId     The settled claim.
    /// @param groundTruth Operator-supplied ground-truth decision.
    /// @param correct     Number of correct attestors.
    /// @param wrong       Number of wrong attestors (each slashed).
    /// @param abstained   Number of ABSTAIN attestors (untouched).
    event Tier1Settled(
        bytes32 indexed claimId,
        AgentAttestation.Decision groundTruth,
        uint256 correct,
        uint256 wrong,
        uint256 abstained
    );

    /// @notice Emitted when the claim fee is distributed among correct attestors after settlement.
    /// @param claimId      The settled claim.
    /// @param total        Total ETH seized from the claim fee pot.
    /// @param perAttestor  ETH credited to each correct attestor (integer floor).
    /// @param correctCount Number of correct attestors that received a share.
    event ClaimFeeDistributed(bytes32 indexed claimId, uint256 total, uint256 perAttestor, uint256 correctCount);

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    /// @notice A constructor address argument was the zero address.
    error ZeroAddress();

    /// @notice `epochSeconds` constructor argument was zero.
    error ZeroEpoch();

    /// @notice The claim does not exist.
    error ClaimNotFound();

    /// @notice The claim is not yet closed; settlement happens after close.
    error ClaimNotClosed();

    /// @notice The claim is not tier 1; only tier-1 claims are settled here.
    error NotTier1();

    /// @notice Ground truth must be VALID or REJECTED — never ABSTAIN (§14.6).
    error InvalidGroundTruth();

    /// @notice The claim has already been settled.
    error AlreadySettled();

    /// @notice Direct ETH transfers are rejected; ETH may only arrive from `AgentAttestation` during settlement.
    error UnexpectedEther();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the leaderboard.
    /// @param registryAddress    Address of the deployed AgentRegistry.
    /// @param attestationAddress Address of the deployed AgentAttestation.
    /// @param slashingAddress    Address of the deployed AgentSlashing.
    /// @param admin              Address that receives DEFAULT_ADMIN_ROLE.
    /// @param operator           Address that receives OPERATOR_ROLE.
    /// @param epochSeconds       Seconds per epoch (PRD default 3600; demo 300).
    constructor(
        address registryAddress,
        address attestationAddress,
        address slashingAddress,
        address admin,
        address operator,
        uint256 epochSeconds
    ) {
        if (
            registryAddress == address(0) || attestationAddress == address(0) || slashingAddress == address(0)
                || admin == address(0) || operator == address(0)
        ) {
            revert ZeroAddress();
        }
        if (epochSeconds == 0) revert ZeroEpoch();

        REGISTRY = AgentRegistry(registryAddress);
        ATTESTATION = AgentAttestation(attestationAddress);
        SLASHING = AgentSlashing(payable(slashingAddress));
        EPOCH_SECONDS = epochSeconds;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // -------------------------------------------------------------------------
    // Settlement
    // -------------------------------------------------------------------------

    /// @notice Settle a closed tier-1 claim against operator-supplied `groundTruth`.
    ///
    ///         Pass 1 builds the correct-attestor list (decision == groundTruth, non-ABSTAIN).
    ///         Pass 2 settles each attestor:
    ///           - ABSTAIN  → abstained++, ±0 reputation, no stake movement (§14.6).
    ///           - correct  → correct++, +1 reputation, own stake released to `claimable`.
    ///           - wrong    → wrong++, slashes++, -10 reputation, AgentSlashing.slashTier1.
    ///
    /// @param claimId     The claim to settle (must exist, be closed, and be tier 1).
    /// @param groundTruth The ground-truth decision; must be VALID or REJECTED (never ABSTAIN).
    function settleTier1(
        bytes32 claimId,
        AgentAttestation.Decision groundTruth
    ) external onlyRole(OPERATOR_ROLE) nonReentrant {
        if (settled[claimId]) revert AlreadySettled();

        AgentAttestation.Claim memory claim = ATTESTATION.getClaim(claimId);
        if (!claim.posted) revert ClaimNotFound();
        if (!claim.closed) revert ClaimNotClosed();
        if (claim.tier != 1) revert NotTier1();
        // Ground truth is falsifiable: a tier-1 settlement is VALID or REJECTED, never ABSTAIN.
        if (groundTruth == AgentAttestation.Decision.ABSTAIN) revert InvalidGroundTruth();

        // Mark settled up-front (effects before any external calls): one-shot, reentrancy-safe.
        settled[claimId] = true;

        address[] memory attestors = ATTESTATION.getClaimAttestors(claimId);

        // Pass 1: collect correct attestors (decision == groundTruth, excluding ABSTAIN).
        address[] memory correctAttestors = _collectCorrect(claimId, groundTruth, attestors);

        // Pass 2: settle each attestor (reputation + stake/slash).
        (uint256 wrongCount, uint256 abstainedCount) =
            _settleAttestors(claimId, groundTruth, attestors, correctAttestors);

        // Pass 3: seize claim fee and distribute pro-rata to correct attestors (T-016).
        _distributeClaimFee(claimId, correctAttestors);

        emit Tier1Settled(claimId, groundTruth, correctAttestors.length, wrongCount, abstainedCount);
    }

    /// @dev Pass 1 — build the correct-attestor list (decision == groundTruth, non-ABSTAIN).
    function _collectCorrect(
        bytes32 claimId,
        AgentAttestation.Decision groundTruth,
        address[] memory attestors
    ) internal view returns (address[] memory correctAttestors) {
        uint256 correctCount;
        for (uint256 i = 0; i < attestors.length; i++) {
            AgentAttestation.Decision d = ATTESTATION.getAttestation(claimId, attestors[i]).decision;
            if (d != AgentAttestation.Decision.ABSTAIN && d == groundTruth) correctCount++;
        }
        correctAttestors = new address[](correctCount);
        uint256 ci;
        for (uint256 i = 0; i < attestors.length; i++) {
            AgentAttestation.Decision d = ATTESTATION.getAttestation(claimId, attestors[i]).decision;
            if (d != AgentAttestation.Decision.ABSTAIN && d == groundTruth) correctAttestors[ci++] = attestors[i];
        }
    }

    /// @dev Pass 2 — apply reputation deltas and route stake/slash for each attestor.
    /// @return wrongCount     Number of wrong attestors slashed.
    /// @return abstainedCount Number of ABSTAIN attestors (untouched).
    function _settleAttestors(
        bytes32 claimId,
        AgentAttestation.Decision groundTruth,
        address[] memory attestors,
        address[] memory correctAttestors
    ) internal returns (uint256 wrongCount, uint256 abstainedCount) {
        uint256 epoch = block.timestamp / EPOCH_SECONDS;
        for (uint256 i = 0; i < attestors.length; i++) {
            address attestor = attestors[i];
            AgentAttestation.Decision d = ATTESTATION.getAttestation(claimId, attestor).decision;

            if (d == AgentAttestation.Decision.ABSTAIN) {
                // ABSTAIN: no reputation change, no stake, never slashed (§14.6).
                _bumpAbstained(attestor, epoch);
                abstainedCount++;
            } else if (d == groundTruth) {
                // Correct: +1 reputation; release own stake back via the unified withdraw surface.
                _bumpCorrect(attestor, epoch);
                REGISTRY.adjustReputation(attestor, 1);
                uint256 released = ATTESTATION.seizeStake(claimId, attestor);
                SLASHING.creditClaimable{ value: released }(attestor);
            } else {
                // Wrong (non-abstain, decision != groundTruth): -10 reputation; slash economics.
                _bumpWrong(attestor, epoch);
                REGISTRY.adjustReputation(attestor, -10);
                SLASHING.slashTier1(claimId, attestor, correctAttestors);
                wrongCount++;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Internal stat bumps (epoch + lifetime)
    // -------------------------------------------------------------------------

    function _bumpCorrect(
        address attestor,
        uint256 epoch
    ) internal {
        epochStatsMap[attestor][epoch].correct += 1;
        lifetimeStatsMap[attestor].correct += 1;
    }

    function _bumpWrong(
        address attestor,
        uint256 epoch
    ) internal {
        epochStatsMap[attestor][epoch].wrong += 1;
        epochStatsMap[attestor][epoch].slashes += 1;
        lifetimeStatsMap[attestor].wrong += 1;
        lifetimeStatsMap[attestor].slashes += 1;
    }

    function _bumpAbstained(
        address attestor,
        uint256 epoch
    ) internal {
        epochStatsMap[attestor][epoch].abstained += 1;
        lifetimeStatsMap[attestor].abstained += 1;
    }

    // -------------------------------------------------------------------------
    // Internal: claim-fee distribution (T-016)
    // -------------------------------------------------------------------------

    /// @dev Seize the claim fee from AgentAttestation and distribute it pro-rata among
    ///      `correctAttestors` via AgentSlashing.creditClaimable (the unified withdraw surface).
    ///
    ///      Conservation invariant: feeBurned + feeDistributed == fee exactly.
    ///        - If correctCount == 0: entire fee is burned via `SLASHING.burnFee`.
    ///        - Otherwise: each correct attestor receives `fee / correctCount` wei.
    ///          The integer-division remainder is burned via `SLASHING.burnFee`.
    ///
    /// @param claimId          The settled claim whose fee to distribute.
    /// @param correctAttestors Correct (non-abstain, decision == groundTruth) attestors.
    function _distributeClaimFee(
        bytes32 claimId,
        address[] memory correctAttestors
    ) internal {
        // Seize the fee from AgentAttestation; ETH arrives in this contract via low-level call.
        uint256 fee = ATTESTATION.seizeClaimFee(claimId);

        uint256 n = correctAttestors.length;
        uint256 perAttestor;
        uint256 distributed;

        if (n == 0) {
            // Zero correct attestors — burn the entire fee.
            SLASHING.burnFee{ value: fee }();
        } else {
            perAttestor = fee / n;
            for (uint256 i = 0; i < n; i++) {
                SLASHING.creditClaimable{ value: perAttestor }(correctAttestors[i]);
                distributed += perAttestor;
            }
            uint256 remainder = fee - distributed;
            if (remainder != 0) {
                // Integer-division remainder: burn rather than strand.
                SLASHING.burnFee{ value: remainder }();
            }
        }

        emit ClaimFeeDistributed(claimId, fee, perAttestor, n);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Current epoch index derived from the chain clock.
    function currentEpoch() external view returns (uint256) {
        return block.timestamp / EPOCH_SECONDS;
    }

    /// @notice Per-agent stats for a given epoch.
    /// @param agent Address to query.
    /// @param epoch Epoch index.
    function epochStats(
        address agent,
        uint256 epoch
    ) external view returns (Stats memory) {
        return epochStatsMap[agent][epoch];
    }

    /// @notice Per-agent lifetime stats.
    /// @param agent Address to query.
    function lifetimeStats(
        address agent
    ) external view returns (Stats memory) {
        return lifetimeStatsMap[agent];
    }

    /// @notice Compute a 0–100 normalized trust score from an agent's lifetime stats (T-016).
    ///
    ///         Formula (two additive components):
    ///
    ///           accuracy_component (0–70):
    ///             = correct * 70 / (correct + wrong)      if (correct + wrong) > 0
    ///             = 0                                      if (correct + wrong) == 0
    ///             (abstentions are excluded from the denominator)
    ///
    ///           experience_component (0–30):
    ///             totalAttestations = correct + wrong + abstained
    ///             = min(totalAttestations, TRUST_SCORE_EXP_CAP) * 30 / TRUST_SCORE_EXP_CAP
    ///
    ///           trustScore = min(accuracy_component + experience_component, 100)
    ///
    ///         A brand-new agent with no history returns 0.
    ///         Mirrors YieldProof's getTrustScore() but operates on Bombe's real lifetime data.
    ///
    /// @param agent Address of the agent to score.
    /// @return score Trust score in the range [0, 100].
    function trustScore(
        address agent
    ) external view returns (uint256 score) {
        Stats memory s = lifetimeStatsMap[agent];

        // Accuracy component (0–70): abstentions excluded from denominator.
        uint256 decidedCount = uint256(s.correct) + uint256(s.wrong);
        uint256 accuracy;
        if (decidedCount > 0) {
            accuracy = (uint256(s.correct) * 70) / decidedCount;
        }

        // Experience component (0–30): cap at TRUST_SCORE_EXP_CAP total attestations.
        uint256 totalAttestations = uint256(s.correct) + uint256(s.wrong) + uint256(s.abstained);
        uint256 capped = totalAttestations < TRUST_SCORE_EXP_CAP ? totalAttestations : TRUST_SCORE_EXP_CAP;
        uint256 experience = (capped * 30) / TRUST_SCORE_EXP_CAP;

        score = accuracy + experience;
        if (score > 100) score = 100;
    }

    /// @notice Accept ETH from `AgentAttestation.seizeStake` and `AgentAttestation.seizeClaimFee`,
    ///         which forward ETH to this contract via low-level calls before it is forwarded to
    ///         AgentSlashing in the same transaction.
    ///         ETH only ever transits this contract within `settleTier1`; no balance accrues.
    ///         Only `AgentAttestation` may send ETH here, so accidental/griefing direct sends cannot be locked.
    receive() external payable {
        if (msg.sender != address(ATTESTATION)) revert UnexpectedEther();
    }
}
