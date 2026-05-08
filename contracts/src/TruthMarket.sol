// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TruthMarket
/// @notice Single-market random-jury belief-resolution contract. The market parameters are
///         locked at deployment (no separate setup tx); admins are hardcoded as constants.
///         Voters privately commit YES/NO beliefs with stake and conviction. After the
///         voting deadline, the jury committer posts SpaceComputer cTRNG randomness plus
///         an audit hash. The contract uses that randomness to draw the resolving jury
///         on-chain via Fisher-Yates from the set of committed voters.
contract TruthMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Static admins (replace before deployment) ----------

    /// @dev Replace with the production admin address before deployment.
    address public constant ADMIN = 0x000000000000000000000000000000000000a001;
    /// @dev Replace with the production jury-committer address before deployment.
    address public constant JURY_COMMITTER = 0x000000000000000000000000000000000000A002;

    // ---------- Constants ----------

    uint16 public constant MAX_CONVICTION_BPS = 10_000;
    uint96 public constant MAX_PROTOCOL_FEE_BPS = 1000;

    // ---------- Types ----------

    enum Phase {
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

    struct Commit {
        bytes32 hash;
        uint96 stake;
        uint96 riskedStake;
        uint16 convictionBps;
        uint8 revealedVote;
        bool revealed;
        bool withdrawn;
    }

    // ---------- Immutable deployment config ----------

    IERC20 public immutable stakeToken;
    bytes32 public immutable ipfsHash;
    uint64 public immutable votingDeadline;
    uint64 public immutable juryCommitDeadline;
    uint64 public immutable revealDeadline;
    uint96 public immutable protocolFeeBps;
    uint32 public immutable jurySize;
    uint32 public immutable minCommits;
    uint32 public immutable minRevealedJurors;

    // ---------- Mutable state ----------

    address public treasury;
    Phase public phase;
    Outcome public outcome;
    uint32 public commitCount;
    uint32 public revealedJurorCount;
    uint96 public totalCommittedStake;
    uint96 public totalRiskedStake;
    uint96 public revealedYesStake;
    uint96 public revealedNoStake;
    uint96 public revealedYesRisked;
    uint96 public revealedNoRisked;
    uint96 public distributablePool;
    uint256 public juryYesWeight;
    uint256 public juryNoWeight;
    uint256 public totalYesRewardWeight;
    uint256 public totalNoRewardWeight;
    uint256 public randomness;
    bytes32 public juryAuditHash;

    mapping(address => Commit) public commits;
    mapping(bytes32 => bool) private _commitHashUsed;
    address[] private _committers;
    address[] private _jury;
    mapping(address => bool) private _isJuror;

    // ---------- Events ----------

    event MarketStarted(
        bytes32 ipfsHash,
        uint64 votingDeadline,
        uint64 juryCommitDeadline,
        uint64 revealDeadline,
        uint32 jurySize,
        uint32 minCommits,
        uint32 minRevealedJurors
    );
    event VoteCommitted(
        address indexed voter, bytes32 commitHash, uint96 stake, uint16 convictionBps, uint96 riskedStake
    );
    event JuryCommitted(uint256 randomness, address[] jurors, bytes32 auditHash);
    event VoteRevealed(address indexed voter, uint8 vote, uint96 stake, uint16 convictionBps, uint96 riskedStake);
    event Resolved(
        Outcome outcome, uint256 winningJuryWeight, uint96 slashedRiskedStake, uint256 fee, uint96 distributablePool
    );
    event Withdrawn(address indexed voter, uint256 payout);

    // ---------- Errors ----------

    error WrongPhase();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error NotAuthorized();
    error CommitNotFound();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error InvalidReveal();
    error JuryAlreadyFulfilled();
    error NothingToWithdraw();
    error BadParams();
    error CommitHashTaken();
    error InsufficientCommits();

    // ---------- Modifiers ----------

    modifier onlyAdmin() {
        if (msg.sender != ADMIN) revert NotAuthorized();
        _;
    }

    modifier onlyJuryCommitter() {
        if (msg.sender != JURY_COMMITTER) revert NotAuthorized();
        _;
    }

    // ---------- Constructor (also opens the market) ----------

    constructor(
        IERC20 _stakeToken,
        address _treasury,
        bytes32 _ipfsHash,
        uint64 votingPeriod,
        uint64 adminTimeout,
        uint64 revealPeriod,
        uint96 _protocolFeeBps,
        uint32 _jurySize,
        uint32 _minCommits,
        uint32 _minRevealedJurors
    ) {
        if (address(_stakeToken) == address(0) || _treasury == address(0)) revert BadParams();
        if (_ipfsHash == bytes32(0)) revert BadParams();
        if (votingPeriod == 0 || adminTimeout == 0 || revealPeriod == 0) revert BadParams();
        if (_protocolFeeBps > MAX_PROTOCOL_FEE_BPS) revert BadParams();
        if (_jurySize == 0) revert BadParams();
        if (_minCommits == 0) revert BadParams();
        if (_minRevealedJurors > _jurySize) revert BadParams();

        stakeToken = _stakeToken;
        treasury = _treasury;
        ipfsHash = _ipfsHash;

        uint64 deployTime = uint64(block.timestamp);
        uint64 _votingDeadline = deployTime + votingPeriod;
        uint64 _juryCommitDeadline = _votingDeadline + adminTimeout;
        uint64 _revealDeadline = _juryCommitDeadline + revealPeriod;
        votingDeadline = _votingDeadline;
        juryCommitDeadline = _juryCommitDeadline;
        revealDeadline = _revealDeadline;

        protocolFeeBps = _protocolFeeBps;
        jurySize = _jurySize;
        minCommits = _minCommits;
        minRevealedJurors = _minRevealedJurors;
        phase = Phase.Voting;

        emit MarketStarted(
            _ipfsHash, _votingDeadline, _juryCommitDeadline, _revealDeadline, _jurySize, _minCommits, _minRevealedJurors
        );
    }

    // ---------- Commit (hidden vote + stake + conviction) ----------

    /// @notice Commit a hidden YES/NO belief with stake and conviction.
    ///         commitHash = keccak256(abi.encode(vote, nonce)).
    ///         Stake, conviction, and voter are bound by contract state at commit time, so they
    ///         do not need to live inside the hash. Hash uniqueness per market is enforced to
    ///         block a copier from mirroring another voter's commit.
    ///         The nonce MUST be a high-entropy 256-bit secret: vote space is {1,2}, so a
    ///         guessable nonce makes the hash brute-forceable.
    function commitVote(bytes32 commitHash, uint96 stake, uint16 convictionBps) external nonReentrant {
        if (phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= votingDeadline) revert DeadlinePassed();
        if (stake == 0) revert BadParams();
        if (convictionBps == 0 || convictionBps > MAX_CONVICTION_BPS) revert BadParams();
        if (commitHash == bytes32(0)) revert BadParams();
        if (commits[msg.sender].hash != bytes32(0)) revert AlreadyCommitted();
        if (_commitHashUsed[commitHash]) revert CommitHashTaken();

        uint96 riskedStake = _riskedStake(stake, convictionBps);
        if (riskedStake == 0) revert BadParams();

        stakeToken.safeTransferFrom(msg.sender, address(this), stake);

        commitCount++;
        totalCommittedStake += stake;
        totalRiskedStake += riskedStake;
        commits[msg.sender] = Commit({
            hash: commitHash,
            stake: stake,
            riskedStake: riskedStake,
            convictionBps: convictionBps,
            revealedVote: 0,
            revealed: false,
            withdrawn: false
        });
        _committers.push(msg.sender);
        _commitHashUsed[commitHash] = true;

        emit VoteCommitted(msg.sender, commitHash, stake, convictionBps, riskedStake);
    }

    // ---------- Jury commit + on-chain selection ----------

    /// @notice Submit SpaceComputer cTRNG randomness plus an audit hash. The contract
    ///         draws the resolving jury on-chain from `_committers` via Fisher-Yates.
    /// @param _randomness  cTRNG value used to drive the on-chain shuffle.
    /// @param auditHash    Hash of the externally persisted randomness/proof artifact.
    function commitJury(uint256 _randomness, bytes32 auditHash) external onlyJuryCommitter {
        if (phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp < votingDeadline) revert DeadlineNotPassed();
        if (block.timestamp >= juryCommitDeadline) revert DeadlinePassed();
        if (randomness != 0) revert JuryAlreadyFulfilled();
        if (_randomness == 0) revert BadParams();
        if (auditHash == bytes32(0)) revert BadParams();
        if (commitCount < minCommits) revert InsufficientCommits();

        randomness = _randomness;
        juryAuditHash = auditHash;
        phase = Phase.Reveal;

        _drawJury(_randomness);

        emit JuryCommitted(_randomness, _jury, auditHash);
    }

    // ---------- Reveal ----------

    function revealVote(uint8 vote, bytes32 nonce) external {
        if (phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp >= revealDeadline) revert DeadlinePassed();
        if (vote != 1 && vote != 2) revert InvalidReveal();

        Commit storage k = commits[msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.revealed) revert AlreadyRevealed();

        bytes32 expected = _commitHash(vote, nonce);
        if (expected != k.hash) revert InvalidReveal();

        k.revealed = true;
        k.revealedVote = vote;

        bool juror = _isJuror[msg.sender];
        if (juror) revealedJurorCount++;
        _recordReveal(k, vote, juror);

        emit VoteRevealed(msg.sender, vote, k.stake, k.convictionBps, k.riskedStake);
    }

    // ---------- Resolve ----------

    /// @notice Finalize the market. Anyone may call.
    ///         Resolves Invalid if the admin missed the jury-commit deadline, if too few
    ///         jurors revealed, or if jury weights tie.
    function resolve() external nonReentrant {
        if (phase == Phase.Resolved) revert WrongPhase();

        if (phase == Phase.Voting) {
            if (block.timestamp < juryCommitDeadline) revert DeadlineNotPassed();
            outcome = Outcome.Invalid;
            phase = Phase.Resolved;
            emit Resolved(Outcome.Invalid, 0, 0, 0, 0);
            return;
        }

        if (block.timestamp < revealDeadline) revert DeadlineNotPassed();

        if (revealedJurorCount < minRevealedJurors) {
            outcome = Outcome.Invalid;
            phase = Phase.Resolved;
            emit Resolved(Outcome.Invalid, 0, 0, 0, 0);
            return;
        }

        (Outcome out, uint256 winningJuryWeight) = _juryOutcome();
        outcome = out;
        phase = Phase.Resolved;

        uint96 slashedRiskedStake;
        uint256 fee;
        if (out != Outcome.Invalid) {
            (slashedRiskedStake, fee) = _settleSlashedPool(out);
        }

        emit Resolved(out, winningJuryWeight, slashedRiskedStake, fee, distributablePool);
    }

    // ---------- Withdraw ----------

    function withdraw() external nonReentrant {
        if (phase != Phase.Resolved) revert WrongPhase();
        Commit storage k = commits[msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.withdrawn) revert NothingToWithdraw();

        uint256 payout = _payoutFor(k);
        k.withdrawn = true;
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        emit Withdrawn(msg.sender, payout);
    }

    // ---------- Views ----------

    function getJury() external view returns (address[] memory) {
        return _jury;
    }

    function getCommitters() external view returns (address[] memory) {
        return _committers;
    }

    function isJuror(address who) external view returns (bool) {
        return _isJuror[who];
    }

    function commitHashOf(uint8 vote, bytes32 nonce) external pure returns (bytes32) {
        return _commitHash(vote, nonce);
    }

    // ---------- Admin ----------

    function setTreasury(address _treasury) external onlyAdmin {
        if (_treasury == address(0)) revert BadParams();
        treasury = _treasury;
    }

    // ---------- Internals ----------

    function _drawJury(uint256 seed) internal {
        uint256 n = _committers.length;
        uint256 k = jurySize > n ? n : jurySize;
        if (k == 0) return;

        uint256[] memory idx = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            idx[i] = i;
        }

        for (uint256 i = 0; i < k; i++) {
            uint256 r = i + (uint256(keccak256(abi.encode(seed, i))) % (n - i));
            (idx[i], idx[r]) = (idx[r], idx[i]);
            address juror = _committers[idx[i]];
            _jury.push(juror);
            _isJuror[juror] = true;
        }
    }

    function _recordReveal(Commit storage k, uint8 vote, bool juror) internal {
        if (vote == 1) {
            revealedYesStake += k.stake;
            revealedYesRisked += k.riskedStake;
            totalYesRewardWeight += k.riskedStake;
            if (juror) juryYesWeight += _juryWeight(k.riskedStake);
        } else {
            revealedNoStake += k.stake;
            revealedNoRisked += k.riskedStake;
            totalNoRewardWeight += k.riskedStake;
            if (juror) juryNoWeight += _juryWeight(k.riskedStake);
        }
    }

    function _juryOutcome() internal view returns (Outcome out, uint256 winningJuryWeight) {
        if (juryYesWeight > juryNoWeight) {
            return (Outcome.Yes, juryYesWeight);
        }
        if (juryNoWeight > juryYesWeight) {
            return (Outcome.No, juryNoWeight);
        }
        return (Outcome.Invalid, 0);
    }

    function _settleSlashedPool(Outcome out) internal returns (uint96 slashedRiskedStake, uint256 fee) {
        uint96 losingRisked = out == Outcome.Yes ? revealedNoRisked : revealedYesRisked;
        uint96 missedRisked = totalRiskedStake - revealedYesRisked - revealedNoRisked;
        slashedRiskedStake = losingRisked + missedRisked;

        if (slashedRiskedStake > 0) {
            fee = (uint256(slashedRiskedStake) * protocolFeeBps) / 10_000;
            if (fee > 0) stakeToken.safeTransfer(treasury, fee);
            // forge-lint: disable-next-line(unsafe-typecast)
            distributablePool = slashedRiskedStake - uint96(fee);
        }
    }

    function _payoutFor(Commit storage k) internal view returns (uint256) {
        if (outcome == Outcome.Invalid) {
            return k.stake;
        }
        if (!k.revealed) {
            return uint256(k.stake) - k.riskedStake;
        }
        uint8 winningVote = outcome == Outcome.Yes ? 1 : 2;
        if (k.revealedVote != winningVote) {
            return uint256(k.stake) - k.riskedStake;
        }
        uint256 totalWinnerWeight = outcome == Outcome.Yes ? totalYesRewardWeight : totalNoRewardWeight;
        uint256 bonus = totalWinnerWeight == 0 ? 0 : (uint256(distributablePool) * k.riskedStake) / totalWinnerWeight;
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
}
