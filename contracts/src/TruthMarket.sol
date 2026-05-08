// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TruthMarket
/// @notice Random-jury belief-resolution market.
///         Voters privately commit YES/NO beliefs with stake and conviction.
///         SpaceComputer randomness is posted by a jury committer and selects
///         the resolving jury from committed voters. The protocol does not
///         decide external truth; it settles from selected juror reveals under
///         the immutable claim/rules document stored on Swarm.
contract TruthMarket is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Constants ----------

    uint16 public constant MAX_CONVICTION_BPS = 10_000;
    uint96 public constant MAX_PROTOCOL_FEE_BPS = 1000;

    // ---------- Roles ----------

    bytes32 public constant JURY_COMMITTER_ROLE = keccak256("JURY_COMMITTER_ROLE");

    // ---------- Types ----------

    enum Phase {
        Created,
        Voting,
        Reveal,
        Resolved
    }

    enum Outcome {
        Unresolved,
        Yes,
        No,
        Invalid
    }

    struct Claim {
        bytes32 swarmDocHash;
        address creator;
        uint64 votingDeadline;
        uint64 revealDeadline;
        uint96 protocolFeeBps;
        uint32 jurySize;
        uint32 commitCount;
        Phase phase;
        Outcome outcome;
        uint96 revealedYesStake;
        uint96 revealedNoStake;
        uint96 revealedYesRisked;
        uint96 revealedNoRisked;
        uint96 totalCommittedStake;
        uint96 totalRiskedStake;
        uint96 distributablePool;
        uint256 juryYesWeight;
        uint256 juryNoWeight;
        uint256 totalYesRewardWeight;
        uint256 totalNoRewardWeight;
        uint256 randomness;
    }

    struct Commit {
        bytes32 hash;
        uint96 stake;
        uint96 riskedStake;
        uint16 convictionBps;
        uint8 revealedVote;
        bool revealed;
        bool withdrawn;
    }

    // ---------- Storage ----------

    IERC20 public immutable stakeToken;
    address public treasury;
    uint256 public nextClaimId;

    mapping(uint256 => Claim) private _claims;
    mapping(uint256 => mapping(address => Commit)) public commits;
    mapping(uint256 => address[]) private _committers;
    mapping(uint256 => address[]) private _jury;
    mapping(uint256 => mapping(address => bool)) private _isJurorMap;
    mapping(uint256 => mapping(bytes32 => bool)) private _commitHashUsed;
    mapping(uint256 => string) public juryAuditRef;

    // ---------- Events ----------

    event ClaimCreated(
        uint256 indexed id,
        address indexed creator,
        bytes32 swarmDocHash,
        uint64 votingDeadline,
        uint64 revealDeadline,
        uint32 jurySize
    );
    event VoteCommitted(
        uint256 indexed id,
        address indexed voter,
        bytes32 commitHash,
        uint96 stake,
        uint16 convictionBps,
        uint96 riskedStake
    );
    event JuryCommitted(uint256 indexed id, uint256 randomness, address[] jurors, string auditRef);
    event VoteRevealed(
        uint256 indexed id, address indexed voter, uint8 vote, uint96 stake, uint16 convictionBps, uint96 riskedStake
    );
    event Resolved(
        uint256 indexed id,
        Outcome outcome,
        uint256 winningJuryWeight,
        uint96 slashedRiskedStake,
        uint256 fee,
        uint96 distributablePool
    );
    event Withdrawn(uint256 indexed id, address indexed voter, uint256 payout);

    // ---------- Errors ----------

    error WrongPhase();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error CommitNotFound();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error InvalidReveal();
    error JuryAlreadyFulfilled();
    error NothingToWithdraw();
    error BadParams();
    error CommitHashTaken();

    // ---------- Constructor ----------

    constructor(IERC20 _stakeToken, address _treasury, address admin, address juryCommitter) {
        if (address(_stakeToken) == address(0) || _treasury == address(0)) revert BadParams();
        if (admin == address(0) || juryCommitter == address(0)) revert BadParams();
        stakeToken = _stakeToken;
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(JURY_COMMITTER_ROLE, juryCommitter);
    }

    // ---------- Phase 1: Create ----------

    /// @notice Open a belief-resolution market. `swarmDocHash` points to immutable claim/rules.
    function createClaim(
        bytes32 swarmDocHash,
        uint64 votingPeriod,
        uint64 revealPeriod,
        uint96 protocolFeeBps,
        uint32 jurySize
    ) external returns (uint256 id) {
        if (swarmDocHash == bytes32(0)) revert BadParams();
        if (votingPeriod == 0 || revealPeriod == 0) revert BadParams();
        if (protocolFeeBps > MAX_PROTOCOL_FEE_BPS) revert BadParams();
        if (jurySize == 0) revert BadParams();

        id = nextClaimId++;
        Claim storage c = _claims[id];
        c.swarmDocHash = swarmDocHash;
        c.creator = msg.sender;
        c.votingDeadline = uint64(block.timestamp) + votingPeriod;
        c.revealDeadline = c.votingDeadline + revealPeriod;
        c.protocolFeeBps = protocolFeeBps;
        c.jurySize = jurySize;
        c.phase = Phase.Voting;

        emit ClaimCreated(id, msg.sender, swarmDocHash, c.votingDeadline, c.revealDeadline, jurySize);
    }

    // ---------- Phase 2: Commit (hidden vote + stake + conviction) ----------

    /// @notice Commit a hidden YES/NO belief with stake and conviction.
    ///         commitHash = keccak256(abi.encode(vote, nonce)).
    ///         vote: 1 = YES, 2 = NO. Conviction is basis points; 10_000 = 100% at risk.
    ///         Stake, conviction, and voter are bound by contract state at commit time, so they
    ///         do not need to be inside the hash. Hash uniqueness per claim is enforced to block
    ///         a copier from mirroring another voter's commit.
    ///         The nonce MUST be a high-entropy 256-bit secret: vote space is {1,2}, so a
    ///         guessable nonce makes the hash brute-forceable.
    function commitVote(uint256 id, bytes32 commitHash, uint96 stake, uint16 convictionBps) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= c.votingDeadline) revert DeadlinePassed();
        if (stake == 0) revert BadParams();
        if (convictionBps == 0 || convictionBps > MAX_CONVICTION_BPS) revert BadParams();
        if (commitHash == bytes32(0)) revert BadParams();
        if (commits[id][msg.sender].hash != bytes32(0)) revert AlreadyCommitted();
        if (_commitHashUsed[id][commitHash]) revert CommitHashTaken();

        uint96 riskedStake = _riskedStake(stake, convictionBps);
        if (riskedStake == 0) revert BadParams();

        stakeToken.safeTransferFrom(msg.sender, address(this), stake);

        c.commitCount++;
        c.totalCommittedStake += stake;
        c.totalRiskedStake += riskedStake;
        commits[id][msg.sender] = Commit({
            hash: commitHash,
            stake: stake,
            riskedStake: riskedStake,
            convictionBps: convictionBps,
            revealedVote: 0,
            revealed: false,
            withdrawn: false
        });
        _committers[id].push(msg.sender);
        _commitHashUsed[id][commitHash] = true;

        emit VoteCommitted(id, msg.sender, commitHash, stake, convictionBps, riskedStake);
    }

    // ---------- Phase 3: Jury selection + reveal ----------

    /// @notice Advance to Reveal phase after voting deadline. Anyone may call.
    function advanceToReveal(uint256 id) external {
        Claim storage c = _claims[id];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp < c.votingDeadline) revert DeadlineNotPassed();
        c.phase = Phase.Reveal;
    }

    /// @notice Commit the SpaceComputer-derived jury selected off-chain from committed voters.
    /// @param jurors      Deterministically selected juror addresses. Each must already have a commit.
    /// @param randomness  SpaceComputer cTRNG value used to derive the selection.
    /// @param auditRef    Reference to the persisted randomness/selection artifact.
    function commitJury(uint256 id, address[] calldata jurors, uint256 randomness, string calldata auditRef)
        external
        onlyRole(JURY_COMMITTER_ROLE)
    {
        Claim storage c = _claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (c.randomness != 0) revert JuryAlreadyFulfilled();
        if (randomness == 0) revert BadParams();
        if (jurors.length == 0 || jurors.length > c.jurySize) revert BadParams();
        if (bytes(auditRef).length == 0) revert BadParams();

        c.randomness = randomness;
        juryAuditRef[id] = auditRef;

        for (uint256 i = 0; i < jurors.length; i++) {
            address j = jurors[i];
            if (commits[id][j].hash == bytes32(0)) revert BadParams();
            if (_isJurorMap[id][j]) revert BadParams();
            _jury[id].push(j);
            _isJurorMap[id][j] = true;
        }

        emit JuryCommitted(id, randomness, jurors, auditRef);
    }

    /// @notice Reveal a committed vote. Juror reveals determine outcome; every reveal settles voter exposure.
    function revealVote(uint256 id, uint8 vote, bytes32 nonce) external {
        Claim storage c = _claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp >= c.revealDeadline) revert DeadlinePassed();
        if (c.randomness == 0) revert WrongPhase();
        if (vote != 1 && vote != 2) revert InvalidReveal();

        Commit storage k = commits[id][msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.revealed) revert AlreadyRevealed();

        bytes32 expected = _commitHash(vote, nonce);
        if (expected != k.hash) revert InvalidReveal();

        k.revealed = true;
        k.revealedVote = vote;

        _recordReveal(c, k, vote, _isJurorMap[id][msg.sender]);

        emit VoteRevealed(id, msg.sender, vote, k.stake, k.convictionBps, k.riskedStake);
    }

    // ---------- Phase 4: Resolve + Withdraw ----------

    /// @notice Finalize the market from selected juror reveals. Anyone may call after revealDeadline.
    function resolve(uint256 id) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp < c.revealDeadline) revert DeadlineNotPassed();

        (Outcome outcome, uint256 winningJuryWeight) = _juryOutcome(c);
        c.outcome = outcome;
        c.phase = Phase.Resolved;

        uint96 slashedRiskedStake;
        uint256 fee;
        if (outcome != Outcome.Invalid) {
            (slashedRiskedStake, fee) = _settleSlashedPool(c, outcome);
        }

        emit Resolved(id, outcome, winningJuryWeight, slashedRiskedStake, fee, c.distributablePool);
    }

    /// @notice Withdraw final payout.
    ///         Invalid outcome: full refund.
    ///         Non-revealer or revealed loser: stake minus risked stake.
    ///         Revealed winner: full stake plus risk-weighted share of slashed pool.
    function withdraw(uint256 id) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.phase != Phase.Resolved) revert WrongPhase();
        Commit storage k = commits[id][msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.withdrawn) revert NothingToWithdraw();

        uint256 payout = _payoutFor(c, k);

        k.withdrawn = true;
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        emit Withdrawn(id, msg.sender, payout);
    }

    // ---------- Views ----------

    function getJury(uint256 id) external view returns (address[] memory) {
        return _jury[id];
    }

    function getCommitters(uint256 id) external view returns (address[] memory) {
        return _committers[id];
    }

    function commitHashOf(uint8 vote, bytes32 nonce) external pure returns (bytes32) {
        return _commitHash(vote, nonce);
    }

    function isJuror(uint256 id, address who) external view returns (bool) {
        return _isJurorMap[id][who];
    }

    function claimStatus(uint256 id)
        external
        view
        returns (Phase phase, Outcome outcome, uint96 distributablePool, uint256 randomness)
    {
        Claim storage c = _claims[id];
        return (c.phase, c.outcome, c.distributablePool, c.randomness);
    }

    function claimTotals(uint256 id)
        external
        view
        returns (
            uint96 totalCommittedStake,
            uint96 totalRiskedStake,
            uint96 revealedYesStake,
            uint96 revealedNoStake,
            uint96 revealedYesRisked,
            uint96 revealedNoRisked
        )
    {
        Claim storage c = _claims[id];
        return (
            c.totalCommittedStake,
            c.totalRiskedStake,
            c.revealedYesStake,
            c.revealedNoStake,
            c.revealedYesRisked,
            c.revealedNoRisked
        );
    }

    function claimWeights(uint256 id)
        external
        view
        returns (uint256 juryYesWeight, uint256 juryNoWeight, uint256 totalYesRewardWeight, uint256 totalNoRewardWeight)
    {
        Claim storage c = _claims[id];
        return (c.juryYesWeight, c.juryNoWeight, c.totalYesRewardWeight, c.totalNoRewardWeight);
    }

    // ---------- Internals ----------

    function _recordReveal(Claim storage c, Commit storage k, uint8 vote, bool juror) internal {
        if (vote == 1) {
            c.revealedYesStake += k.stake;
            c.revealedYesRisked += k.riskedStake;
            c.totalYesRewardWeight += k.riskedStake;
            if (juror) c.juryYesWeight += _juryWeight(k.riskedStake);
        } else {
            c.revealedNoStake += k.stake;
            c.revealedNoRisked += k.riskedStake;
            c.totalNoRewardWeight += k.riskedStake;
            if (juror) c.juryNoWeight += _juryWeight(k.riskedStake);
        }
    }

    function _juryOutcome(Claim storage c) internal view returns (Outcome outcome, uint256 winningJuryWeight) {
        if (c.juryYesWeight > c.juryNoWeight) {
            return (Outcome.Yes, c.juryYesWeight);
        }
        if (c.juryNoWeight > c.juryYesWeight) {
            return (Outcome.No, c.juryNoWeight);
        }
        return (Outcome.Invalid, 0);
    }

    function _settleSlashedPool(Claim storage c, Outcome outcome)
        internal
        returns (uint96 slashedRiskedStake, uint256 fee)
    {
        uint96 losingRisked = outcome == Outcome.Yes ? c.revealedNoRisked : c.revealedYesRisked;
        uint96 missedRisked = c.totalRiskedStake - c.revealedYesRisked - c.revealedNoRisked;
        slashedRiskedStake = losingRisked + missedRisked;

        if (slashedRiskedStake > 0) {
            fee = (uint256(slashedRiskedStake) * c.protocolFeeBps) / 10_000;
            if (fee > 0) stakeToken.safeTransfer(treasury, fee);
            // forge-lint: disable-next-line(unsafe-typecast)
            c.distributablePool = slashedRiskedStake - uint96(fee);
        }
    }

    function _payoutFor(Claim storage c, Commit storage k) internal view returns (uint256) {
        if (c.outcome == Outcome.Invalid) {
            return k.stake;
        }

        if (!k.revealed) {
            return uint256(k.stake) - k.riskedStake;
        }

        uint8 winningVote = c.outcome == Outcome.Yes ? 1 : 2;
        if (k.revealedVote != winningVote) {
            return uint256(k.stake) - k.riskedStake;
        }

        uint256 totalWinnerWeight = c.outcome == Outcome.Yes ? c.totalYesRewardWeight : c.totalNoRewardWeight;
        uint256 bonus = totalWinnerWeight == 0 ? 0 : (uint256(c.distributablePool) * k.riskedStake) / totalWinnerWeight;

        return uint256(k.stake) + bonus;
    }

    function _commitHash(uint8 vote, bytes32 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(vote, nonce));
    }

    function _riskedStake(uint96 stake, uint16 convictionBps) internal pure returns (uint96) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint96((uint256(stake) * convictionBps) / MAX_CONVICTION_BPS);
    }

    function _juryWeight(uint96 riskedStake) internal pure returns (uint256) {
        return _sqrt(riskedStake);
    }

    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    // ---------- Admin ----------

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert BadParams();
        treasury = _treasury;
    }
}
