// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TruthMarket
/// @notice Single-market random-jury belief-resolution contract. Market parameters are
///         locked at deployment (no separate setup tx). Voters privately commit YES/NO
///         beliefs with stake and conviction. After the voting deadline, the jury
///         committer posts SpaceComputer cTRNG randomness plus an audit hash; the
///         contract draws the resolving jury on-chain via Fisher-Yates from the set of
///         committed voters.
///
///         Claim metadata: in addition to the immutable Swarm/IPFS rules document, the
///         contract stores an on-chain `name`, `description`, and up to MAX_TAGS short
///         `tags` so the claim is self-describing without a fetch.
///
///         Nonce-leak revocation (voting phase only): anyone who can produce a valid
///         (vote, nonce) for another voter's commit may call `revokeStake(voter, ...)`.
///         The voter's stake is split 50/50: half pays the claimer immediately, half
///         goes to the slashed-stake pool. This is the on-chain deterrent against
///         publishing/sharing a nonce — once leaked, anyone who learns it can take
///         half. The 50/50 split also penalises a Sybil "self-withdraw" path: a voter
///         who tries to recover their stake via a sock-puppet revoker still loses 50%.
///         The function is gated to the voting phase: during or after reveal it is no
///         longer callable, and direct self-revocation by the voter address is blocked.
///         The pooled half routes to the distributable pool on Yes/No, or to the
///         claim creator on Invalid (matching the rest of the slash-pool routing).
///
///         Voting power: every selected juror counts as exactly 1 vote toward the
///         outcome. Stake and conviction do NOT influence the YES/NO decision.
///
///         Stake roles:
///         - Normal slash: a voter on the losing side, or a non-revealing non-juror,
///           forfeits their `riskedStake` (= stake × conviction). At a typical 20%
///           conviction this is roughly 20% of stake.
///         - Reward: winning revealers split the slashed pool in proportion to their
///           own `riskedStake`.
///         - Juror penalty: ~5× the normal slash. A selected juror who fails to reveal
///           forfeits their FULL stake regardless of conviction — i.e. 100% of stake,
///           which lines up with 5× a typical 20% normal slash. On a Yes/No outcome
///           the extra (above the normal 1× riskedStake slash) joins the distributable
///           pool. On Invalid (after the jury was drawn) the entire juror penalty
///           accrues to the **claim creator** while every other voter is fully refunded.
///
///         Jury composition limit: the jury is always a strict minority. The contract
///         guarantees `jurySize ≤ MAX_JURY_PERCENTAGE × commitCount / 100`, enforced at
///         construction by requiring `minCommits × MAX_JURY_PERCENTAGE ≥ jurySize × 100`.
///
///         Tie behavior: ties on juror count resolve to Invalid. Ties are impossible
///         when `minRevealedJurors == jurySize` (all jurors reveal, odd count); they
///         remain possible whenever the revealed-juror count is even.
contract TruthMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Constants ----------

    uint16 public constant MAX_CONVICTION_BPS = 10_000;
    uint96 public constant MAX_PROTOCOL_FEE_BPS = 1000;
    uint32 public constant MAX_JURY_SIZE = 100;
    /// @notice Upper bound on jury size as a percentage of committed voters. Enforced at
    ///         construction via `minCommits × MAX_JURY_PERCENTAGE ≥ jurySize × 100`, so
    ///         once `commitCount ≥ minCommits` the rule holds for the actual draw too.
    uint256 public constant MAX_JURY_PERCENTAGE = 15;
    /// @notice Maximum number of claim tags storable on-chain.
    uint256 public constant MAX_TAGS = 5;

    // ---------- Types ----------

    enum Phase {
        Voting,
        Reveal,
        Resolved
    }

    /// @dev Outcome values:
    ///      Unresolved (0) is the default storage value while the market is in Voting/Reveal.
    ///      Yes (1)/No (2) are set by `resolve()` on a decisive jury count majority.
    ///      Invalid (3) is set by `resolve()` on missed deadline, too few revealing jurors,
    ///      or jury count tie.
    enum Outcome {
        Unresolved,
        Yes,
        No,
        Invalid
    }

    /// @dev Per-voter commit record.
    ///      `revealedVote` carries 1 (YES) or 2 (NO) once `revealed` flips true; while
    ///      `revealed == false` the field stays 0 and must not be read as a vote.
    ///      `revealed == false` and `revealedVote == 0` together mean "not revealed".
    ///      `revoked == true` means the commit's nonce was leaked and someone called
    ///      `revokeStake` to claim the stake; the slot is permanently disabled.
    struct Commit {
        bytes32 hash;
        uint96 stake;
        uint96 riskedStake;
        uint16 convictionBps;
        uint8 revealedVote;
        bool revealed;
        bool withdrawn;
        bool revoked;
    }

    /// @dev Aggregated read-only view of the deployed configuration. Useful for UIs
    ///      and indexers — every constructor field plus the on-chain caps in one call.
    struct Config {
        address stakeToken;
        address treasury;
        address admin;
        address juryCommitter;
        address creator;
        string name;
        string description;
        string[] tags;
        bytes ipfsHash;
        uint64 votingDeadline;
        uint64 juryCommitDeadline;
        uint64 revealDeadline;
        uint96 protocolFeeBps;
        uint96 minStake;
        uint32 jurySize;
        uint32 minCommits;
        uint32 minRevealedJurors;
        uint32 maxJurySize;
        uint256 maxJuryPercentage;
        uint256 maxTags;
        uint16 maxConvictionBps;
        uint96 maxProtocolFeeBps;
    }

    /// @dev Snapshot of reveal-phase state. Combines counts, stake totals, and
    ///      jury-only stake breakdowns for performance/quality metrics.
    struct RevealStats {
        Phase phase;
        Outcome outcome;
        uint32 commitCount;
        uint32 revokedCount;          // commitCount delta vs the original committers
        uint32 revealedYesCount;
        uint32 revealedNoCount;
        uint32 revealedTotalCount;
        uint32 juryDrawSize;
        uint32 juryYesCount;
        uint32 juryNoCount;
        uint32 jurorRevealCount;
        uint96 totalCommittedStake;
        uint96 totalRiskedStake;
        uint96 revealedYesStake;
        uint96 revealedNoStake;
        uint96 revealedYesRisked;
        uint96 revealedNoRisked;
        uint96 jurorYesStake;
        uint96 jurorNoStake;
        uint96 jurorYesRisked;
        uint96 jurorNoRisked;
        uint96 distributablePool;
        uint96 revokedSlashAccrued;
        uint256 treasuryAccrued;
        uint256 creatorAccrued;
    }

    /// @dev Per-juror vote view for transparency on jury behaviour.
    struct JurorVote {
        address juror;
        bool revealed;
        uint8 vote; // 0 = not revealed, 1 = YES, 2 = NO
        uint96 stake;
        uint96 riskedStake;
        uint16 convictionBps;
    }

    /// @dev Constructor params bundled to avoid stack-too-deep with the deployment config.
    struct InitParams {
        IERC20 stakeToken;
        address treasury;
        address admin;
        address juryCommitter;
        address creator;
        string name;
        string description;
        string[] tags;
        bytes ipfsHash;
        uint64 votingPeriod;
        uint64 adminTimeout;
        uint64 revealPeriod;
        uint96 protocolFeeBps;
        uint96 minStake;
        uint32 jurySize;
        uint32 minCommits;
        uint32 minRevealedJurors;
    }

    // ---------- Immutable deployment config ----------

    IERC20 public immutable stakeToken;
    /// @dev TODO: replace `admin` and `juryCommitter` with hardcoded constants once the
    ///      production addresses are finalized.
    address public immutable admin;
    address public immutable juryCommitter;
    /// @notice Claim creator. Receives the full juror non-reveal penalty when the market
    ///         resolves Invalid after the jury was drawn.
    address public immutable creator;
    uint64 public immutable votingDeadline;
    uint64 public immutable juryCommitDeadline;
    uint64 public immutable revealDeadline;
    uint96 public immutable protocolFeeBps;
    uint96 public immutable minStake;
    uint32 public immutable jurySize;
    uint32 public immutable minCommits;
    uint32 public immutable minRevealedJurors;

    // ---------- Mutable state ----------

    address public treasury;
    Phase public phase;
    Outcome public outcome;
    string public name;
    string public description;
    string[] public tags;
    bytes public ipfsHash;
    uint32 public commitCount;
    uint32 public revealedJurorCount;
    uint32 public withdrawnCount;
    /// @notice Total number of voters (juror or not) who revealed YES.
    uint32 public revealedYesCount;
    /// @notice Total number of voters (juror or not) who revealed NO.
    uint32 public revealedNoCount;
    /// @notice Number of jurors who revealed YES. Each juror contributes weight 1.
    uint32 public juryYesCount;
    /// @notice Number of jurors who revealed NO. Each juror contributes weight 1.
    uint32 public juryNoCount;
    uint96 public totalCommittedStake;
    uint96 public totalRiskedStake;
    uint96 public revealedYesStake;
    uint96 public revealedNoStake;
    uint96 public revealedYesRisked;
    uint96 public revealedNoRisked;
    uint96 public distributablePool;
    /// @notice Half of every revoked stake accumulates here during the voting phase.
    ///         At resolve, it joins the distributable pool on a Yes/No outcome, or
    ///         routes to the claim creator on Invalid.
    uint96 public revokedSlashAccrued;
    uint256 public totalYesRewardWeight;
    uint256 public totalNoRewardWeight;
    uint256 public randomness;
    uint256 public treasuryAccrued;
    /// @notice Pull-pattern accrual for the claim creator. Filled with the juror
    ///         non-reveal penalty when the market resolves Invalid after the jury draw.
    uint256 public creatorAccrued;
    bytes32 public juryAuditHash;

    mapping(address => Commit) public commits;
    address[] private _committers;
    address[] private _jury;
    mapping(address => bool) private _isJuror;

    // ---------- Events ----------

    event MarketStarted(
        string name,
        string description,
        string[] tags,
        bytes ipfsHash,
        uint64 votingDeadline,
        uint64 juryCommitDeadline,
        uint64 revealDeadline,
        uint32 jurySize,
        uint32 minCommits,
        uint32 minRevealedJurors,
        uint96 minStake
    );
    event VoteCommitted(
        address indexed voter, bytes32 commitHash, uint96 stake, uint16 convictionBps, uint96 riskedStake
    );
    event JuryCommitted(uint256 randomness, address[] jurors, bytes32 auditHash);
    event VoteRevealed(address indexed voter, uint8 vote, uint96 stake, uint16 convictionBps, uint96 riskedStake);
    event Resolved(
        Outcome outcome, uint32 winningJuryCount, uint96 slashedRiskedStake, uint256 fee, uint96 distributablePool
    );
    event Withdrawn(address indexed voter, uint256 payout);
    event TreasuryUpdated(address indexed treasury);
    event TreasuryWithdrawn(address indexed treasury, uint256 amount);
    event CreatorWithdrawn(address indexed creator, uint256 amount);
    event StakeRevoked(
        address indexed voter, address indexed claimer, uint96 stake, uint96 claimerCut, uint96 pooledCut
    );

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
    error InsufficientCommits();
    error StakeBelowMin();
    error CommitRevoked();

    // ---------- Modifiers ----------

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyJuryCommitter() {
        if (msg.sender != juryCommitter) revert NotAuthorized();
        _;
    }

    // ---------- Constructor (also opens the market) ----------

    constructor(InitParams memory p) {
        if (address(p.stakeToken) == address(0) || p.treasury == address(0)) revert BadParams();
        if (p.admin == address(0) || p.juryCommitter == address(0) || p.creator == address(0)) revert BadParams();
        if (p.ipfsHash.length == 0) revert BadParams();
        if (p.votingPeriod == 0 || p.adminTimeout == 0 || p.revealPeriod == 0) revert BadParams();
        if (p.protocolFeeBps > MAX_PROTOCOL_FEE_BPS) revert BadParams();
        if (p.minStake == 0) revert BadParams();
        if (p.jurySize == 0 || p.jurySize > MAX_JURY_SIZE) revert BadParams();
        if (p.jurySize % 2 == 0) revert BadParams(); // jury size must be odd
        // Jury size must stay within MAX_JURY_PERCENTAGE of the minimum committer pool;
        // this also implies minCommits >= jurySize, so the older subset check is subsumed.
        if (uint256(p.minCommits) * MAX_JURY_PERCENTAGE < uint256(p.jurySize) * 100) revert BadParams();
        if (p.minRevealedJurors == 0) revert BadParams();
        if (p.minRevealedJurors > p.jurySize) revert BadParams();
        if (bytes(p.name).length == 0) revert BadParams();
        if (bytes(p.description).length == 0) revert BadParams();
        if (p.tags.length > MAX_TAGS) revert BadParams();

        stakeToken = p.stakeToken;
        treasury = p.treasury;
        admin = p.admin;
        juryCommitter = p.juryCommitter;
        creator = p.creator;
        name = p.name;
        description = p.description;
        for (uint256 i = 0; i < p.tags.length; i++) {
            tags.push(p.tags[i]);
        }
        ipfsHash = p.ipfsHash;

        uint64 deployTime = uint64(block.timestamp);
        uint64 _votingDeadline = deployTime + p.votingPeriod;
        uint64 _juryCommitDeadline = _votingDeadline + p.adminTimeout;
        uint64 _revealDeadline = _juryCommitDeadline + p.revealPeriod;
        votingDeadline = _votingDeadline;
        juryCommitDeadline = _juryCommitDeadline;
        revealDeadline = _revealDeadline;

        protocolFeeBps = p.protocolFeeBps;
        minStake = p.minStake;
        jurySize = p.jurySize;
        minCommits = p.minCommits;
        minRevealedJurors = p.minRevealedJurors;
        phase = Phase.Voting;

        emit MarketStarted(
            p.name,
            p.description,
            p.tags,
            p.ipfsHash,
            _votingDeadline,
            _juryCommitDeadline,
            _revealDeadline,
            p.jurySize,
            p.minCommits,
            p.minRevealedJurors,
            p.minStake
        );
    }

    // ---------- Commit (hidden vote + stake + conviction) ----------

    /// @notice Commit a hidden YES/NO belief with stake and conviction.
    ///         commitHash = keccak256(abi.encode(vote, nonce, voter, address(this))).
    ///         The voter and contract address are bound into the hash so that copying
    ///         someone else's hash yields a useless commit (the copier can't reveal it),
    ///         and so that nonces are not correlated across markets.
    ///         Each wallet may commit at most once.
    ///         The actual received balance (after any token-transfer fee) is what gets
    ///         recorded; the `stake` argument is just the spend authorization.
    ///         Nonce MUST be a high-entropy 256-bit secret: vote space is {1,2}, so a
    ///         guessable nonce makes the hash brute-forceable.
    function commitVote(bytes32 commitHash, uint96 stake, uint16 convictionBps) external nonReentrant {
        if (phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= votingDeadline) revert DeadlinePassed();
        if (stake < minStake) revert StakeBelowMin();
        if (convictionBps == 0 || convictionBps > MAX_CONVICTION_BPS) revert BadParams();
        if (commitHash == bytes32(0)) revert BadParams();
        if (commits[msg.sender].hash != bytes32(0)) revert AlreadyCommitted();

        // Use the actual received balance to defend against fee-on-transfer / rebasing tokens.
        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), stake);
        uint256 received = stakeToken.balanceOf(address(this)) - balanceBefore;
        if (received < minStake) revert StakeBelowMin();
        if (received > type(uint96).max) revert BadParams();
        uint96 actualStake = uint96(received);

        uint96 riskedStake = _riskedStake(actualStake, convictionBps);
        if (riskedStake == 0) revert BadParams();

        commitCount++;
        totalCommittedStake += actualStake;
        totalRiskedStake += riskedStake;
        commits[msg.sender] = Commit({
            hash: commitHash,
            stake: actualStake,
            riskedStake: riskedStake,
            convictionBps: convictionBps,
            revealedVote: 0,
            revealed: false,
            withdrawn: false,
            revoked: false
        });
        _committers.push(msg.sender);

        emit VoteCommitted(msg.sender, commitHash, actualStake, convictionBps, riskedStake);
    }

    // ---------- Nonce-leak revocation (voting phase only) ----------

    /// @notice Slash a voter whose nonce has leaked. Anyone able to produce a valid
    ///         (vote, nonce) pair for `voter` may call this during the voting phase.
    ///         The voter's stake is split: half is paid to `msg.sender` immediately,
    ///         the other half accumulates in `revokedSlashAccrued` and routes through
    ///         the slash-pool plumbing at resolve (distributable pool on Yes/No, or
    ///         creator-accrued on Invalid).
    ///         The 50/50 split serves two purposes: (a) anyone with a leaked nonce
    ///         is still strongly motivated to call this rather than sit on the secret,
    ///         (b) a voter who tries to Sybil-revoke their own commit through a
    ///         sock-puppet still loses 50% of stake instead of recovering it free.
    ///         After the voting deadline (and during/after the reveal phase) this
    ///         function is no longer callable, and direct self-revocation is blocked.
    /// @param voter The address whose commit is being revoked.
    /// @param vote  The voter's committed vote (1 = YES, 2 = NO).
    /// @param nonce The leaked nonce that opens the commit.
    function revokeStake(address voter, uint8 vote, bytes32 nonce) external nonReentrant {
        if (phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= votingDeadline) revert DeadlinePassed();
        if (msg.sender == voter) revert NotAuthorized();

        Commit storage k = commits[voter];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.revoked) revert CommitRevoked();

        bytes32 expected = _commitHash(vote, nonce, voter);
        if (expected != k.hash) revert InvalidReveal();

        uint96 stake = k.stake;
        uint96 risked = k.riskedStake;

        k.revoked = true;
        k.stake = 0;
        k.riskedStake = 0;

        commitCount--;
        totalCommittedStake -= stake;
        totalRiskedStake -= risked;

        // 50/50 split — claimer gets the floor half, the pool gets the ceiling half so
        // an odd-wei stake still rounds in the protocol's favour.
        uint96 claimerCut = stake / 2;
        uint96 pooledCut = stake - claimerCut;
        revokedSlashAccrued += pooledCut;

        stakeToken.safeTransfer(msg.sender, claimerCut);
        emit StakeRevoked(voter, msg.sender, stake, claimerCut, pooledCut);
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
        if (k.revoked) revert CommitRevoked();
        if (k.revealed) revert AlreadyRevealed();

        bytes32 expected = _commitHash(vote, nonce, msg.sender);
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
    ///         Outcome is decided by simple count of revealing jurors: each juror
    ///         contributes 1 vote regardless of their stake or conviction.
    ///         Resolves Invalid if the admin missed the jury-commit deadline, if too few
    ///         jurors revealed, or if juror counts tie (only possible when an even number
    ///         of jurors actually revealed).
    ///         Selected jurors who fail to reveal lose their FULL stake — conviction is
    ///         ignored for the juror penalty. The extra (above the normal 1× riskedStake
    ///         slash) joins the distributable pool on a Yes/No outcome. On Invalid (after
    ///         the jury was drawn) the entire juror penalty accrues to the claim creator
    ///         and every other voter is fully refunded.
    function resolve() external nonReentrant {
        if (phase == Phase.Resolved) revert WrongPhase();

        if (phase == Phase.Voting) {
            if (block.timestamp < juryCommitDeadline) revert DeadlineNotPassed();
            uint96 revokedHalf = revokedSlashAccrued;
            revokedSlashAccrued = 0;
            creatorAccrued += revokedHalf;
            outcome = Outcome.Invalid;
            phase = Phase.Resolved;
            emit Resolved(Outcome.Invalid, 0, 0, revokedHalf, 0);
            return;
        }

        if (block.timestamp < revealDeadline) revert DeadlineNotPassed();

        Outcome out;
        uint32 winningJuryCount;
        if (revealedJurorCount < minRevealedJurors) {
            out = Outcome.Invalid;
        } else {
            (out, winningJuryCount) = _juryOutcome();
        }

        outcome = out;
        phase = Phase.Resolved;

        uint96 slashedRiskedStake;
        uint256 fee;
        if (out != Outcome.Invalid) {
            (slashedRiskedStake, fee) = _settleSlashedPool(out);
        } else {
            // Jury was drawn but outcome Invalid: slash each non-revealing juror's full
            // stake and route the revoked-slash half to the creator. Every other voter
            // is refunded. `fee` in the event surfaces the total creator-bound amount.
            uint96 jurorPenalty = _accrueNonRevealingJurorPenaltyToCreator();
            uint96 revokedHalf = revokedSlashAccrued;
            revokedSlashAccrued = 0;
            creatorAccrued += revokedHalf;
            fee = uint256(jurorPenalty) + uint256(revokedHalf);
        }

        emit Resolved(out, winningJuryCount, slashedRiskedStake, fee, distributablePool);
    }

    // ---------- Withdraw ----------

    function withdraw() external nonReentrant {
        if (phase != Phase.Resolved) revert WrongPhase();
        Commit storage k = commits[msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.revoked) revert NothingToWithdraw(); // stake was already taken by a revoker
        if (k.withdrawn) revert NothingToWithdraw();

        uint256 payout = _payoutFor(k, _isJuror[msg.sender]);
        k.withdrawn = true;
        withdrawnCount++;
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        emit Withdrawn(msg.sender, payout);
    }

    /// @notice Pull all treasury-bound funds. Permissionless — funds always go to the
    ///         configured `treasury`. Once every voter has withdrawn, also sweeps any
    ///         rounding dust left in the contract, but never touches funds already
    ///         accrued for the claim creator. Idempotent: returns silently when there is
    ///         nothing to sweep.
    function withdrawTreasury() external nonReentrant {
        uint256 amount;
        if (phase == Phase.Resolved && withdrawnCount == commitCount) {
            uint256 balance = stakeToken.balanceOf(address(this));
            amount = balance > creatorAccrued ? balance - creatorAccrued : 0;
        } else {
            amount = treasuryAccrued;
        }
        treasuryAccrued = 0;
        if (amount == 0) return;
        stakeToken.safeTransfer(treasury, amount);
        emit TreasuryWithdrawn(treasury, amount);
    }

    /// @notice Pull the creator-bound juror penalty accrued on an Invalid outcome.
    ///         Permissionless — funds always go to the configured `creator`. Idempotent:
    ///         returns silently when nothing has accrued.
    function withdrawCreator() external nonReentrant {
        uint256 amount = creatorAccrued;
        creatorAccrued = 0;
        if (amount == 0) return;
        stakeToken.safeTransfer(creator, amount);
        emit CreatorWithdrawn(creator, amount);
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

    function commitHashOf(uint8 vote, bytes32 nonce, address voter) external view returns (bytes32) {
        return _commitHash(vote, nonce, voter);
    }

    function getTags() external view returns (string[] memory) {
        return tags;
    }

    /// @notice Aggregate read-only snapshot of the deployment configuration. Bundles
    ///         every constructor input plus on-chain caps in one call.
    function getConfig() external view returns (Config memory) {
        return Config({
            stakeToken: address(stakeToken),
            treasury: treasury,
            admin: admin,
            juryCommitter: juryCommitter,
            creator: creator,
            name: name,
            description: description,
            tags: tags,
            ipfsHash: ipfsHash,
            votingDeadline: votingDeadline,
            juryCommitDeadline: juryCommitDeadline,
            revealDeadline: revealDeadline,
            protocolFeeBps: protocolFeeBps,
            minStake: minStake,
            jurySize: jurySize,
            minCommits: minCommits,
            minRevealedJurors: minRevealedJurors,
            maxJurySize: MAX_JURY_SIZE,
            maxJuryPercentage: MAX_JURY_PERCENTAGE,
            maxTags: MAX_TAGS,
            maxConvictionBps: MAX_CONVICTION_BPS,
            maxProtocolFeeBps: MAX_PROTOCOL_FEE_BPS
        });
    }

    /// @notice Reveal-phase / post-reveal stats: vote counts, stake totals, jury-only
    ///         stake-weighted aggregates. Safe to call at any phase; "post-reveal"
    ///         consumers should generally wait until `phase == Resolved`.
    function getRevealStats() external view returns (RevealStats memory s) {
        s.phase = phase;
        s.outcome = outcome;
        s.commitCount = commitCount;
        // _committers is the immutable original-committer list; the difference is
        // the number of slots that have been revoked.
        s.revokedCount = uint32(_committers.length) - commitCount;
        s.revealedYesCount = revealedYesCount;
        s.revealedNoCount = revealedNoCount;
        s.revealedTotalCount = revealedYesCount + revealedNoCount;
        s.juryDrawSize = uint32(_jury.length);
        s.juryYesCount = juryYesCount;
        s.juryNoCount = juryNoCount;
        s.jurorRevealCount = revealedJurorCount;
        s.totalCommittedStake = totalCommittedStake;
        s.totalRiskedStake = totalRiskedStake;
        s.revealedYesStake = revealedYesStake;
        s.revealedNoStake = revealedNoStake;
        s.revealedYesRisked = revealedYesRisked;
        s.revealedNoRisked = revealedNoRisked;
        s.distributablePool = distributablePool;
        s.revokedSlashAccrued = revokedSlashAccrued;
        s.treasuryAccrued = treasuryAccrued;
        s.creatorAccrued = creatorAccrued;

        address[] memory jury = _jury;
        for (uint256 i = 0; i < jury.length; i++) {
            Commit storage k = commits[jury[i]];
            if (!k.revealed) continue;
            if (k.revealedVote == 1) {
                s.jurorYesStake += k.stake;
                s.jurorYesRisked += k.riskedStake;
            } else if (k.revealedVote == 2) {
                s.jurorNoStake += k.stake;
                s.jurorNoRisked += k.riskedStake;
            }
        }
    }

    /// @notice Per-juror snapshot — address, reveal status, vote, stake, conviction —
    ///         in jury-draw order.
    function getJurorVotes() external view returns (JurorVote[] memory votes) {
        address[] memory jury = _jury;
        votes = new JurorVote[](jury.length);
        for (uint256 i = 0; i < jury.length; i++) {
            Commit storage k = commits[jury[i]];
            votes[i] = JurorVote({
                juror: jury[i],
                revealed: k.revealed,
                vote: k.revealedVote,
                stake: k.stake,
                riskedStake: k.riskedStake,
                convictionBps: k.convictionBps
            });
        }
    }

    // ---------- Admin ----------

    function setTreasury(address _treasury) external onlyAdmin {
        if (_treasury == address(0)) revert BadParams();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
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
            revealedYesCount++;
            revealedYesStake += k.stake;
            revealedYesRisked += k.riskedStake;
            totalYesRewardWeight += k.riskedStake;
            if (juror) juryYesCount++;
        } else {
            revealedNoCount++;
            revealedNoStake += k.stake;
            revealedNoRisked += k.riskedStake;
            totalNoRewardWeight += k.riskedStake;
            if (juror) juryNoCount++;
        }
    }

    /// @dev Returns Invalid on count tie. With odd `jurySize` and full juror reveal
    ///      (`minRevealedJurors == jurySize`) ties are impossible. Partial reveals
    ///      (even revealed-juror count) can still tie.
    function _juryOutcome() internal view returns (Outcome out, uint32 winningJuryCount) {
        if (juryYesCount > juryNoCount) {
            return (Outcome.Yes, juryYesCount);
        }
        if (juryNoCount > juryYesCount) {
            return (Outcome.No, juryNoCount);
        }
        return (Outcome.Invalid, 0);
    }

    function _settleSlashedPool(Outcome out) internal returns (uint96 slashedRiskedStake, uint256 fee) {
        uint96 losingRisked = out == Outcome.Yes ? revealedNoRisked : revealedYesRisked;
        uint96 missedRisked = totalRiskedStake - revealedYesRisked - revealedNoRisked;
        (, uint96 jurorExtra) = _jurorNoRevealAccounting();
        uint96 revokedHalf = revokedSlashAccrued;
        revokedSlashAccrued = 0;
        // forge-lint: disable-next-line(unsafe-typecast)
        slashedRiskedStake = uint96(
            uint256(losingRisked) + uint256(missedRisked) + uint256(jurorExtra) + uint256(revokedHalf)
        );

        if (slashedRiskedStake > 0) {
            fee = (uint256(slashedRiskedStake) * protocolFeeBps) / 10_000;
            if (fee > 0) treasuryAccrued += fee;
            // forge-lint: disable-next-line(unsafe-typecast)
            distributablePool = slashedRiskedStake - uint96(fee);
        }
    }

    function _accrueNonRevealingJurorPenaltyToCreator() internal returns (uint96 totalPenalty) {
        (totalPenalty,) = _jurorNoRevealAccounting();
        if (totalPenalty > 0) {
            creatorAccrued += totalPenalty;
        }
    }

    /// @dev Returns (totalPenalty, totalExtra) summed over jurors who failed to reveal.
    ///      penalty = full `stake` (conviction ignored for jurors).
    ///      extra   = stake - riskedStake (the slash beyond what's already counted in
    ///                missedRisked).
    function _jurorNoRevealAccounting() internal view returns (uint96 totalPenalty, uint96 totalExtra) {
        address[] memory jury = _jury;
        for (uint256 i = 0; i < jury.length; i++) {
            Commit storage k = commits[jury[i]];
            if (!k.revealed) {
                totalPenalty += k.stake;
                totalExtra += k.stake - k.riskedStake;
            }
        }
    }

    function _payoutFor(Commit storage k, bool jurorAddr) internal view returns (uint256) {
        // Selected juror who failed to reveal: lose full stake regardless of conviction.
        // Applies on any post-jury-draw outcome.
        if (jurorAddr && !k.revealed && randomness != 0) {
            return 0;
        }
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

    function _commitHash(uint8 vote, bytes32 nonce, address voter) internal view returns (bytes32) {
        return keccak256(abi.encode(vote, nonce, voter, address(this)));
    }

    function _riskedStake(uint96 stake, uint16 convictionBps) internal pure returns (uint96) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint96((uint256(stake) * convictionBps) / MAX_CONVICTION_BPS);
    }
}
