// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TruthMarket
/// @notice Phased prediction-market fact-checker:
///         (1) Created  — claim + Swarm doc registered, voting opens
///         (2) Voting   — commit-only: hidden votes via keccak256(vote, nonce, stake, voter)
///         (3) Reveal   — admin commits a jury subset (cTRNG-selected off-chain), then
///                        any committer may reveal. Jury reveals decide the outcome;
///                        non-juror reveals don't influence the outcome but still play
///                        the prediction-market layer.
///         (4) Resolved — winners (anyone who revealed the winning side) split the
///                        slashed pool; losers and non-revealers forfeit their stake.
///
///         Trust model for the jury: this contract does NOT verify the randomness on-chain.
///         The oracle is trusted to (a) fetch a real cTRNG output from SpaceComputer,
///         (b) pin it to IPFS, (c) compute the jury off-chain, and (d) commit
///         {jurors, randomness, ipfsCID} via `commitJury`. The IPFS CID is the only
///         audit trail — anyone can fetch it, recompute the selection, and verify the
///         posted jury matches.
///
///         Slashed pool = (revealed-losing stake, any committer)
///                      + (non-revealing stake, any committer).
///         After fee, the distributable pool is split among ALL winning revealers
///         (jurors and non-jurors), weighted by commit-order (harmonic decay) —
///         earlier correct commits earn a bigger slice.
contract TruthMarket is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Roles ----------

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ---------- Types ----------

    enum Phase { Created, Voting, Reveal, Resolved }
    enum Outcome { Unresolved, Yes, No, Invalid }

    struct Claim {
        bytes32 swarmDocHash;       // Swarm reference to claim text + sources
        address creator;
        uint64 votingDeadline;
        uint64 revealDeadline;
        uint96 protocolFeeBps;      // basis points; max 1000 (10%)
        uint32 jurySize;
        uint32 commitCount;         // monotonically assigned to each commit
        Phase phase;
        Outcome outcome;
        // Outcome decision (jurors only — they are the truth oracle).
        uint96 juryYesStake;        // sum of revealed YES stake from jurors
        uint96 juryNoStake;         // sum of revealed NO  stake from jurors
        // Economic accounting (every committer who reveals — jury or not).
        uint96 revealedYesStake;    // sum of revealed YES stake (all committers)
        uint96 revealedNoStake;     // sum of revealed NO  stake (all committers)
        uint96 totalCommittedStake; // sum of every commit's stake (for missed-stake calc)
        uint96 distributablePool;   // slashed stake minus fee (cached at resolve)
        uint256 totalYesWeight;     // sum of sequence-weights of revealed YES (all)
        uint256 totalNoWeight;      // sum of sequence-weights of revealed NO  (all)
        uint256 randomness;         // cTRNG value posted by admin (0 = unfulfilled)
    }

    struct Commit {
        bytes32 hash;               // keccak256(abi.encode(vote, nonce, stake, voter))
        uint96 stake;               // locked at commit time
        uint32 commitIndex;         // sequence position; feeds reward curve
        uint8 revealedVote;         // 0 = none, 1 = YES, 2 = NO
        bool revealed;
        bool withdrawn;
    }

    // ---------- Storage ----------

    IERC20 public immutable stakeToken;
    address public treasury;
    uint256 public nextClaimId;

    mapping(uint256 => Claim) public claims;
    mapping(uint256 => mapping(address => Commit)) public commits;
    mapping(uint256 => address[]) private _committers;
    mapping(uint256 => address[]) private _jury;
    mapping(uint256 => mapping(address => bool)) private _isJurorMap;
    mapping(uint256 => string) public juryIpfsCID;

    // ---------- Events ----------

    event ClaimCreated(
        uint256 indexed id,
        address indexed creator,
        bytes32 swarmDocHash,
        uint64 votingDeadline,
        uint64 revealDeadline,
        uint32 jurySize
    );
    event EvidenceAttached(uint256 indexed id, address indexed agent, bytes32 swarmRef);
    event VoteCommitted(
        uint256 indexed id,
        address indexed voter,
        bytes32 commitHash,
        uint96 stake,
        uint32 commitIndex
    );
    event JuryCommitted(
        uint256 indexed id,
        uint256 randomness,
        address[] jurors,
        string ipfsCID
    );
    event VoteRevealed(uint256 indexed id, address indexed voter, uint8 vote, uint96 stake);
    event Resolved(
        uint256 indexed id,
        Outcome outcome,
        uint96 winnerStake,
        uint96 slashedStake,
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

    // ---------- Constructor ----------

    constructor(IERC20 _stakeToken, address _treasury, address admin, address oracle) {
        if (address(_stakeToken) == address(0) || _treasury == address(0)) revert BadParams();
        stakeToken = _stakeToken;
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
    }

    // ---------- Phase 1: Create ----------

    /// @notice Open a claim. swarmDocHash points to the canonical claim doc on Swarm.
    /// @dev Voting opens immediately. Voting window = now..votingDeadline.
    ///      Reveal window = votingDeadline..revealDeadline.
    function createClaim(
        bytes32 swarmDocHash,
        uint64 votingPeriod,
        uint64 revealPeriod,
        uint96 protocolFeeBps,
        uint32 jurySize
    ) external returns (uint256 id) {
        if (swarmDocHash == bytes32(0)) revert BadParams();
        if (votingPeriod == 0 || revealPeriod == 0) revert BadParams();
        if (protocolFeeBps > 1_000) revert BadParams();
        if (jurySize == 0) revert BadParams();

        id = nextClaimId++;
        Claim storage c = claims[id];
        c.swarmDocHash = swarmDocHash;
        c.creator = msg.sender;
        c.votingDeadline = uint64(block.timestamp) + votingPeriod;
        c.revealDeadline = c.votingDeadline + revealPeriod;
        c.protocolFeeBps = protocolFeeBps;
        c.jurySize = jurySize;
        c.phase = Phase.Voting;

        emit ClaimCreated(id, msg.sender, swarmDocHash, c.votingDeadline, c.revealDeadline, jurySize);
    }

    /// @notice Attach extra evidence (Swarm refs from fact-checker agents).
    ///         Event-only — readers fetch + verify off-chain.
    function attachEvidence(uint256 id, bytes32 swarmRef) external {
        Claim storage c = claims[id];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= c.votingDeadline) revert DeadlinePassed();
        emit EvidenceAttached(id, msg.sender, swarmRef);
    }

    // ---------- Phase 2: Commit (hidden vote + stake) ----------

    /// @notice Commit a hidden vote.
    ///         commitHash = keccak256(abi.encode(uint8 vote, bytes32 nonce, uint96 stake, address voter))
    ///         vote: 1 = YES, 2 = NO. Reuse the same nonce in reveal.
    function commitVote(uint256 id, bytes32 commitHash, uint96 stake) external nonReentrant {
        Claim storage c = claims[id];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= c.votingDeadline) revert DeadlinePassed();
        if (stake == 0) revert BadParams();
        if (commits[id][msg.sender].hash != bytes32(0)) revert AlreadyCommitted();

        stakeToken.safeTransferFrom(msg.sender, address(this), stake);

        uint32 idx = c.commitCount++;
        c.totalCommittedStake += stake;
        commits[id][msg.sender] = Commit({
            hash: commitHash,
            stake: stake,
            commitIndex: idx,
            revealedVote: 0,
            revealed: false,
            withdrawn: false
        });
        _committers[id].push(msg.sender);

        emit VoteCommitted(id, msg.sender, commitHash, stake, idx);
    }

    // ---------- Phase 3: Jury selection + reveal ----------

    /// @notice Advance to Reveal phase after voting deadline. Anyone may call.
    function advanceToReveal(uint256 id) external {
        Claim storage c = claims[id];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp < c.votingDeadline) revert DeadlineNotPassed();
        c.phase = Phase.Reveal;
    }

    /// @notice Admin commits the jury directly. The oracle is trusted to have:
    ///         (a) fetched a real cTRNG output from SpaceComputer,
    ///         (b) pinned the cTRNG document to IPFS,
    ///         (c) computed the jury off-chain from that randomness,
    ///         (d) submitted {jurors, randomness, ipfsCID} here.
    ///         No on-chain verification — `ipfsCID` is the audit trail.
    /// @param jurors      Off-chain-selected juror addresses. Each must already have a commit.
    /// @param randomness  cTRNG value used to derive the selection (recorded for audit).
    /// @param ipfsCID     IPFS CID of the SpaceComputer cTRNG document.
    function commitJury(
        uint256 id,
        address[] calldata jurors,
        uint256 randomness,
        string calldata ipfsCID
    ) external onlyRole(ORACLE_ROLE) {
        Claim storage c = claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (c.randomness != 0) revert JuryAlreadyFulfilled();
        if (randomness == 0) revert BadParams();
        if (jurors.length == 0 || jurors.length > c.jurySize) revert BadParams();
        if (bytes(ipfsCID).length == 0) revert BadParams();

        c.randomness = randomness;
        juryIpfsCID[id] = ipfsCID;

        for (uint256 i = 0; i < jurors.length; i++) {
            address j = jurors[i];
            if (commits[id][j].hash == bytes32(0)) revert BadParams(); // not a committer
            if (_isJurorMap[id][j]) revert BadParams();                // duplicate
            _jury[id].push(j);
            _isJurorMap[id][j] = true;
        }

        emit JuryCommitted(id, randomness, jurors, ipfsCID);
    }

    /// @notice Reveal a commit. Open to every committer; only juror reveals
    ///         decide the outcome, but every revealer is part of the prediction
    ///         market — winners share the slashed pool, losers and non-revealers
    ///         lose their stake.
    function revealVote(uint256 id, uint8 vote, bytes32 nonce) external {
        Claim storage c = claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp >= c.revealDeadline) revert DeadlinePassed();
        if (c.randomness == 0) revert WrongPhase(); // jury must be committed first
        if (vote != 1 && vote != 2) revert InvalidReveal();

        Commit storage k = commits[id][msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.revealed) revert AlreadyRevealed();

        bytes32 expected = keccak256(abi.encode(vote, nonce, k.stake, msg.sender));
        if (expected != k.hash) revert InvalidReveal();

        k.revealed = true;
        k.revealedVote = vote;

        bool juror = _isJurorMap[id][msg.sender];
        uint256 w = _rewardWeight(k.commitIndex);
        if (vote == 1) {
            c.revealedYesStake += k.stake;
            c.totalYesWeight += w;
            if (juror) c.juryYesStake += k.stake;
        } else {
            c.revealedNoStake += k.stake;
            c.totalNoWeight += w;
            if (juror) c.juryNoStake += k.stake;
        }

        emit VoteRevealed(id, msg.sender, vote, k.stake);
    }

    // ---------- Phase 4: Resolve + Withdraw ----------

    /// @notice Finalize the claim. Anyone may call after revealDeadline.
    /// @dev    Outcome is decided by jury reveals only (the truth oracle).
    ///         Slashed pool spans the whole committer set:
    ///           losing-revealers (any committer) + non-revealers (any committer).
    ///         Fee is taken on the slashed pool; the rest is the distributable pool
    ///         that gets split among ALL winning revealers (jurors + non-jurors),
    ///         weighted by `_rewardWeight(commitIndex)`.
    function resolve(uint256 id) external nonReentrant {
        Claim storage c = claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp < c.revealDeadline) revert DeadlineNotPassed();

        // Outcome from jury stake-weight only.
        uint96 juryWinnerStake;
        if (c.juryYesStake > c.juryNoStake) {
            c.outcome = Outcome.Yes;
            juryWinnerStake = c.juryYesStake;
        } else if (c.juryNoStake > c.juryYesStake) {
            c.outcome = Outcome.No;
            juryWinnerStake = c.juryNoStake;
        } else {
            c.outcome = Outcome.Invalid; // jury tie or jury didn't reveal
        }

        c.phase = Phase.Resolved;

        uint96 slashedStake;
        uint256 fee;
        if (c.outcome != Outcome.Invalid) {
            // Slashed = losing-side revealers + every non-revealer.
            uint96 losingRevealed = c.outcome == Outcome.Yes ? c.revealedNoStake : c.revealedYesStake;
            uint96 missedStake = c.totalCommittedStake - c.revealedYesStake - c.revealedNoStake;
            slashedStake = losingRevealed + missedStake;

            if (slashedStake > 0) {
                fee = (uint256(slashedStake) * c.protocolFeeBps) / 10_000;
                if (fee > 0) stakeToken.safeTransfer(treasury, fee);
                c.distributablePool = slashedStake - uint96(fee);
            }
        }

        emit Resolved(id, c.outcome, juryWinnerStake, slashedStake, fee, c.distributablePool);
    }

    /// @notice Withdraw final payout. Jury status does not change the economic rules —
    ///         it only affects whether your reveal counted toward the outcome decision.
    ///         - Invalid outcome: refund full stake to every committer (no slashing).
    ///         - Didn't reveal (juror or not): 0 — stake folded into the slashed pool.
    ///         - Revealed losing side: 0 — stake folded into the slashed pool.
    ///         - Revealed winning side (juror or not): own stake back + sequence-weighted
    ///           slice of the distributable pool (= losing revealers + non-revealers, minus fee).
    function withdraw(uint256 id) external nonReentrant {
        Claim storage c = claims[id];
        if (c.phase != Phase.Resolved) revert WrongPhase();
        Commit storage k = commits[id][msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.withdrawn) revert NothingToWithdraw();

        uint256 payout;

        if (c.outcome == Outcome.Invalid) {
            payout = k.stake;
        } else if (!k.revealed) {
            payout = 0;
        } else {
            uint8 winningVote = c.outcome == Outcome.Yes ? 1 : 2;
            if (k.revealedVote == winningVote) {
                uint256 totalWinnerWeight =
                    c.outcome == Outcome.Yes ? c.totalYesWeight : c.totalNoWeight;
                uint256 weight = _rewardWeight(k.commitIndex);
                uint256 bonus = totalWinnerWeight == 0
                    ? 0
                    : (uint256(c.distributablePool) * weight) / totalWinnerWeight;

                payout = uint256(k.stake) + bonus;
            }
            // revealed losing: payout stays 0
        }

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

    function commitHashOf(uint8 vote, bytes32 nonce, uint96 stake, address voter)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(vote, nonce, stake, voter));
    }

    function isJuror(uint256 id, address who) external view returns (bool) {
        return _isJurorMap[id][who];
    }

    // ---------- Internals ----------

    /// @dev Sequence-based reward curve. Harmonic decay: w(i) = 1e18 / (i + 1).
    ///      Earlier commits weighted higher — incentivizes fast, confident reveals.
    ///      Swap for Fibonacci-inverse, exponential decay, or quadratic if desired.
    function _rewardWeight(uint32 commitIndex) internal pure returns (uint256) {
        return 1e18 / (uint256(commitIndex) + 1);
    }

    // ---------- Admin ----------

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert BadParams();
        treasury = _treasury;
    }
}
