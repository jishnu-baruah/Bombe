// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AgentRegistry } from "./AgentRegistry.sol";

/// @title AgentAttestation
/// @notice Manages claim posting and stake-backed attestations for the Bombe network.
///         Operators post claims; registered agents attest with locked stake.
///         Tier 3 (judgment) claims enforce ABSTAIN-only via `JudgmentTierRequiresAbstain`
///         — this is the flagship on-chain safety check (PRD §14.5).
///         Locked stake from VALID/REJECTED attestations accumulates in this contract until
///         settlement; releasing/forwarding is handled by TuringLeaderboard (T-105) and
///         AgentSlashing (T-106), which will be granted a role to pull funds out.
///         ABSTAIN requires msg.value == 0 and is never slashable (PRD §14.6).
/// @dev Chain: Mantle Sepolia (chain id 5003).
contract AgentAttestation is AccessControl, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role that permits posting and closing claims.
    ///         Granted to the operator address passed to the constructor.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Role that permits the settlement layer to move locked stake out of this contract.
    ///         Granted to TuringLeaderboard (T-105) and, transitively through it, the slash
    ///         economics in AgentSlashing (T-106). Holders may call `seizeStake`.
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice ETH locked per VALID or REJECTED attestation, held until settlement.
    ///         ABSTAIN locks nothing. Released by TuringLeaderboard / AgentSlashing (T-105/T-106).
    uint256 public constant ATTEST_LOCK = 0.02 ether;

    /// @notice Fee paid by the issuer on claim submission.
    ///         Held until settlement, then distributed pro-rata to correct attestors (T-016).
    uint256 public constant CLAIM_FEE = 0.01 ether;

    /// @notice Maximum number of attestors allowed per claim.
    uint8 public constant MAX_ATTESTORS = 16;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice The three possible decisions an attestor may submit.
    ///         Tier-3 claims only permit ABSTAIN; see `JudgmentTierRequiresAbstain`.
    enum Decision {
        VALID,
        REJECTED,
        ABSTAIN
    }

    /// @notice A claim registered by the operator, keyed by a bytes32 identifier.
    struct Claim {
        uint8 tier;
        bytes32 claimHash;
        string claimURI;
        bool posted;
        bool closed;
        uint8 attestorCount;
        /// @notice Issuer-paid claim fee held until settlement; zeroed by `seizeClaimFee`.
        uint256 claimFee;
    }

    /// @notice A single attestor's decision and proof data for a given claim.
    struct Attestation {
        bool exists;
        Decision decision;
        uint16 confidenceBps;
        bytes32 sourcesHash;
        bytes32 reasoningHash;
        string traceURI;
        uint256 lockedStake;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The agent registry; checked to verify `isRegistered` on every `attest` call.
    ///         Named in SCREAMING_SNAKE_CASE because Solidity immutables follow that convention.
    AgentRegistry public immutable REGISTRY;

    /// @notice Claims keyed by claim id.
    mapping(bytes32 => Claim) private _claims;

    /// @notice Attestations keyed by (claimId, attestor address).
    mapping(bytes32 => mapping(address => Attestation)) private _attestations;

    /// @notice Ordered list of attestors per claim, used during settlement iteration.
    mapping(bytes32 => address[]) private _claimAttestors;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when the operator posts a new claim.
    /// @param claimId   The unique claim identifier.
    /// @param tier      Claim tier: 1 = deterministic, 2 = document-falsifiable, 3 = judgment.
    /// @param claimHash Keccak256 hash of the canonical claim payload.
    /// @param claimURI  Off-chain URI with the full claim details.
    /// @param claimFee  ETH fee paid by the issuer, held until settlement (T-016).
    event ClaimPosted(bytes32 indexed claimId, uint8 tier, bytes32 claimHash, string claimURI, uint256 claimFee);

    /// @notice Emitted when the SETTLER_ROLE holder seizes the claim fee for distribution.
    /// @param claimId  The claim whose fee was seized.
    /// @param amount   The ETH amount transferred to the settlement layer.
    /// @param to       The recipient (TuringLeaderboard / SETTLER_ROLE holder).
    event ClaimFeeSeized(bytes32 indexed claimId, uint256 amount, address indexed to);

    /// @notice Emitted when a registered agent successfully attests to a claim.
    /// @param claimId      The claim being attested.
    /// @param attestor     The attesting agent address.
    /// @param decision     VALID, REJECTED, or ABSTAIN.
    /// @param confidenceBps Attestor-reported confidence in basis points (0–10 000).
    /// @param lockedStake  ETH locked; 0 for ABSTAIN, ATTEST_LOCK for VALID/REJECTED.
    event Attested(
        bytes32 indexed claimId, address indexed attestor, Decision decision, uint16 confidenceBps, uint256 lockedStake
    );

    /// @notice Emitted when the operator closes a claim (no further attestations accepted).
    /// @param claimId The closed claim identifier.
    event ClaimClosed(bytes32 indexed claimId);

    /// @notice Emitted when a SETTLER_ROLE holder seizes an attestation's locked stake.
    /// @param claimId  The claim whose attestation stake was seized.
    /// @param attestor The attestor whose locked stake was moved.
    /// @param amount   The ETH amount transferred out (the prior `lockedStake`).
    /// @param to       The settlement contract that received the stake (`msg.sender`).
    event StakeSeized(bytes32 indexed claimId, address indexed attestor, uint256 amount, address indexed to);

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    /// @notice Tier supplied to `postClaim` is not in {1, 2, 3}.
    error InvalidTier();

    /// @notice A claim with this id is already posted.
    error ClaimExists();

    /// @notice The claim id does not exist (not yet posted).
    error ClaimNotFound();

    /// @notice The claim has already been closed; no further attestations are accepted.
    error ClaimAlreadyClosed();

    /// @notice `msg.sender` has already attested this claim.
    error AlreadyAttested();

    /// @notice The claim already has MAX_ATTESTORS attestations.
    error TooManyAttestors();

    /// @notice `msg.sender` is not registered in the AgentRegistry.
    error NotRegistered();

    /// @notice Tier-3 (judgment) claims require Decision.ABSTAIN.
    ///         This is the on-chain enforcement of "agents never attest to judgment claims" (PRD §14.5).
    error JudgmentTierRequiresAbstain();

    /// @notice ABSTAIN decisions must be sent with msg.value == 0.
    error AbstainLocksNothing();

    /// @notice VALID or REJECTED decisions must be sent with msg.value == ATTEST_LOCK (0.02 ether).
    error IncorrectStake();

    /// @notice The registry address supplied to the constructor was the zero address.
    error ZeroRegistry();

    /// @notice `seizeStake` was called for an attestation that holds no locked stake.
    error NoStakeToSeize();

    /// @notice ETH transfer of the seized stake to the settlement contract failed.
    error SeizeTransferFailed();

    /// @notice `postClaim` was called with msg.value != CLAIM_FEE.
    error IncorrectClaimFee();

    /// @notice `seizeClaimFee` was called but the stored claim fee is already zero.
    error NoClaimFeeToSeize();

    /// @notice ETH transfer of the seized claim fee to the settlement contract failed.
    error ClaimFeeTransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the attestation contract.
    /// @param registryAddress Address of the deployed AgentRegistry.
    /// @param admin           Address that receives DEFAULT_ADMIN_ROLE (typically a multisig or EOA).
    /// @param operator        Address that receives OPERATOR_ROLE (posts and closes claims).
    constructor(
        address registryAddress,
        address admin,
        address operator
    ) {
        if (registryAddress == address(0)) revert ZeroRegistry();
        REGISTRY = AgentRegistry(registryAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // -------------------------------------------------------------------------
    // Operator: claim lifecycle
    // -------------------------------------------------------------------------

    /// @notice Post a new claim for attestors to evaluate.
    ///         The issuer must send exactly CLAIM_FEE (0.01 ether) with the call.
    ///         The fee is held in this contract until TuringLeaderboard calls `seizeClaimFee`
    ///         during settlement and distributes it to correct attestors (T-016).
    /// @param id        Unique identifier for this claim.
    /// @param tier      Must be 1, 2, or 3.
    /// @param claimHash Keccak256 hash of the canonical claim payload.
    /// @param claimURI  Off-chain URI pointing to the full claim details.
    function postClaim(
        bytes32 id,
        uint8 tier,
        bytes32 claimHash,
        string calldata claimURI
    ) external payable onlyRole(OPERATOR_ROLE) {
        if (msg.value != CLAIM_FEE) revert IncorrectClaimFee();
        if (tier < 1 || tier > 3) revert InvalidTier();
        if (_claims[id].posted) revert ClaimExists();

        _claims[id] = Claim({
            tier: tier,
            claimHash: claimHash,
            claimURI: claimURI,
            posted: true,
            closed: false,
            attestorCount: 0,
            claimFee: CLAIM_FEE
        });

        emit ClaimPosted(id, tier, claimHash, claimURI, CLAIM_FEE);
    }

    /// @notice Close a claim so that no further attestations are accepted.
    ///         Settlement of locked stakes is performed by TuringLeaderboard/AgentSlashing (T-105/T-106).
    /// @param claimId The claim to close.
    function closeClaim(
        bytes32 claimId
    ) external onlyRole(OPERATOR_ROLE) {
        Claim storage claim = _claims[claimId];
        if (!claim.posted) revert ClaimNotFound();
        if (claim.closed) revert ClaimAlreadyClosed();
        claim.closed = true;
        emit ClaimClosed(claimId);
    }

    // -------------------------------------------------------------------------
    // Attestation
    // -------------------------------------------------------------------------

    /// @notice Submit a stake-backed attestation for a posted, open claim.
    ///
    ///         Stake rules:
    ///           - ABSTAIN: `msg.value` must be 0; `lockedStake` is set to 0; never slashable.
    ///           - VALID / REJECTED: `msg.value` must equal ATTEST_LOCK (0.02 ether);
    ///             `lockedStake` is set to ATTEST_LOCK and held by this contract until settlement.
    ///
    ///         Safety: Tier-3 (judgment) claims enforce ABSTAIN-only. Any attempt to submit
    ///         VALID or REJECTED on a tier-3 claim reverts with `JudgmentTierRequiresAbstain`.
    ///
    /// @param claimId        The claim to attest.
    /// @param decision       VALID, REJECTED, or ABSTAIN.
    /// @param confidenceBps  Confidence in basis points (0–10 000).
    /// @param sourcesHash    Keccak256 of the canonical-JSON source list.
    /// @param reasoningHash  Keccak256 of the canonical-JSON reasoning trace.
    /// @param traceURI       Off-chain URI for the full reasoning trace.
    function attest(
        bytes32 claimId,
        Decision decision,
        uint16 confidenceBps,
        bytes32 sourcesHash,
        bytes32 reasoningHash,
        string calldata traceURI
    ) external payable nonReentrant {
        if (!REGISTRY.isRegistered(msg.sender)) revert NotRegistered();

        Claim storage claim = _claims[claimId];
        if (!claim.posted) revert ClaimNotFound();
        if (claim.closed) revert ClaimAlreadyClosed();
        if (_attestations[claimId][msg.sender].exists) revert AlreadyAttested();
        if (claim.attestorCount >= MAX_ATTESTORS) revert TooManyAttestors();

        // Flagship safety check (PRD §14.5): tier-3 judgment claims forbid non-ABSTAIN decisions.
        if (claim.tier == 3 && decision != Decision.ABSTAIN) revert JudgmentTierRequiresAbstain();

        // Stake accounting.
        uint256 lockedStake;
        if (decision == Decision.ABSTAIN) {
            if (msg.value != 0) revert AbstainLocksNothing();
            lockedStake = 0;
        } else {
            // VALID or REJECTED
            if (msg.value != ATTEST_LOCK) revert IncorrectStake();
            lockedStake = ATTEST_LOCK;
        }

        // Store attestation.
        _attestations[claimId][msg.sender] = Attestation({
            exists: true,
            decision: decision,
            confidenceBps: confidenceBps,
            sourcesHash: sourcesHash,
            reasoningHash: reasoningHash,
            traceURI: traceURI,
            lockedStake: lockedStake
        });

        _claimAttestors[claimId].push(msg.sender);
        claim.attestorCount += 1;

        emit Attested(claimId, msg.sender, decision, confidenceBps, lockedStake);
    }

    // -------------------------------------------------------------------------
    // Settlement hook (role-gated stake movement)
    // -------------------------------------------------------------------------

    /// @notice Move an attestation's locked stake out of this contract to the caller.
    ///         Callable only by the settlement layer (SETTLER_ROLE — TuringLeaderboard).
    ///         Used both to release a correct attestor's own stake (the Leaderboard then
    ///         credits it back as a pull payment) and to fund the slash economics for a
    ///         wrong attestor (the Leaderboard forwards the seized ETH to AgentSlashing).
    ///
    ///         Checks-effects-interactions: the stored `lockedStake` is zeroed *before*
    ///         the ETH transfer, so a re-entrant call sees no stake and reverts.
    ///         ABSTAIN attestations hold zero stake and therefore always revert here,
    ///         which keeps ABSTAIN out of every slash/settlement money path (PRD §14.6).
    /// @param claimId  The claim whose attestation stake is being seized.
    /// @param attestor The attestor whose locked stake to move.
    /// @return amount  The ETH amount transferred to `msg.sender`.
    function seizeStake(
        bytes32 claimId,
        address attestor
    ) external onlyRole(SETTLER_ROLE) nonReentrant returns (uint256 amount) {
        Attestation storage a = _attestations[claimId][attestor];
        amount = a.lockedStake;
        if (amount == 0) revert NoStakeToSeize();

        // effects: zero stake before the external transfer (CEI).
        a.lockedStake = 0;

        emit StakeSeized(claimId, attestor, amount, msg.sender);

        // interactions: forward the seized stake to the settlement contract.
        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert SeizeTransferFailed();
    }

    /// @notice Transfer the stored claim fee for `claimId` to the caller (TuringLeaderboard).
    ///         One-shot: the stored fee is zeroed before the transfer (CEI).
    ///         The Leaderboard distributes the fee pro-rata to correct attestors via
    ///         `AgentSlashing.creditClaimable` immediately after this call (T-016).
    ///
    ///         Reverts with `NoClaimFeeToSeize` if the fee was already seized (or was never set).
    ///
    /// @param claimId The claim whose fee is being seized.
    /// @return amount The ETH amount transferred to `msg.sender`.
    function seizeClaimFee(
        bytes32 claimId
    ) external onlyRole(SETTLER_ROLE) nonReentrant returns (uint256 amount) {
        Claim storage claim = _claims[claimId];
        amount = claim.claimFee;
        if (amount == 0) revert NoClaimFeeToSeize();

        // effects: zero fee before the external transfer (CEI).
        claim.claimFee = 0;

        emit ClaimFeeSeized(claimId, amount, msg.sender);

        // interactions: forward the fee to the settlement contract.
        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert ClaimFeeTransferFailed();
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Return the full Claim struct for `claimId`.
    ///         Returns a zero-value struct if the claim does not exist.
    function getClaim(
        bytes32 claimId
    ) external view returns (Claim memory) {
        return _claims[claimId];
    }

    /// @notice Return the Attestation submitted by `attestor` for `claimId`.
    ///         Returns a zero-value struct (exists == false) if no attestation was submitted.
    function getAttestation(
        bytes32 claimId,
        address attestor
    ) external view returns (Attestation memory) {
        return _attestations[claimId][attestor];
    }

    /// @notice Return the ordered list of attestor addresses for `claimId`.
    function getClaimAttestors(
        bytes32 claimId
    ) external view returns (address[] memory) {
        return _claimAttestors[claimId];
    }

    /// @notice Return the number of attestors for `claimId`.
    function attestorCount(
        bytes32 claimId
    ) external view returns (uint8) {
        return _claims[claimId].attestorCount;
    }
}
