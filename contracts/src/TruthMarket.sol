// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TruthMarket
/// @notice Single-market random-jury belief-resolution contract. Market parameters are
///         locked at deployment (no separate setup tx). Voters privately commit YES/NO
///         beliefs with stake. After the voting deadline, the jury committer posts
///         SpaceComputer cTRNG randomness plus an audit hash; the contract draws the
///         resolving jury on-chain via Fisher-Yates from the set of committed voters.
///
///         Claim metadata: in addition to the immutable Swarm/IPFS rules document, the
///         contract stores an on-chain `name`, `description`, and up to MAX_TAGS short
///         `tags` so the claim is self-describing without a fetch.
///
///         Stake token assumption: `stakeToken` must be a plain, non-rebasing,
///         no-fee ERC20. The contract measures the actual inbound amount received
///         on commit, but payout accounting assumes recorded token units remain
///         transferable 1:1 for the market lifetime.
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
///         outcome. Stake does NOT influence the YES/NO decision.
///
///         Stake roles:
///         - Normal slash: a voter on the losing side, or a non-revealing non-juror,
///           forfeits their `riskedStake` (= stake × RISK_PERCENT / 100 = 20% of stake).
///         - Reward: winning revealers split the slashed pool in proportion to their
///           own `riskedStake` (equivalently: in proportion to their own stake).
///         - Juror penalty: 5× the normal slash. A selected juror who fails to reveal
///           forfeits their FULL stake — i.e. 100% of stake, which is 5× the 20% normal
///           slash. On a Yes/No outcome the extra (above the normal 1× riskedStake
///           slash) joins the distributable pool. On Invalid (after the jury was drawn)
///           the entire juror penalty accrues to the **claim creator** while every
///           other voter is fully refunded.
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

    /// @notice Fixed protocol-wide risked-stake percentage (0–100). Every voter risks
    ///         exactly this fraction of their stake on the outcome. A losing voter or
    ///         non-revealing non-juror forfeits `stake × RISK_PERCENT / 100`. Selected
    ///         jurors who fail to reveal forfeit their full stake (RISK_PERCENT is
    ///         ignored for that case).
    uint8 public constant RISK_PERCENT = 20;
    /// @notice Protocol fee on the slashed pool, expressed as a whole percent (0–10).
    uint8 public constant MAX_PROTOCOL_FEE_PERCENT = 10;
    uint32 public constant MAX_JURY_SIZE = 100;
    /// @notice Upper bound on jury size as a percentage of committed voters. Enforced at
    ///         construction via `minCommits × MAX_JURY_PERCENTAGE ≥ jurySize × 100`, so
    ///         once `commitCount ≥ minCommits` the rule holds for the actual draw too.
    uint256 public constant MAX_JURY_PERCENTAGE = 15;
    /// @notice Maximum number of claim tags storable on-chain.
    uint256 public constant MAX_TAGS = 5;
    /// @notice Maximum bytes for the short on-chain claim name.
    uint256 public constant MAX_NAME_BYTES = 120;
    /// @notice Maximum bytes for the short on-chain claim description.
    uint256 public constant MAX_DESCRIPTION_BYTES = 1000;
    /// @notice Maximum bytes for each short on-chain claim tag.
    uint256 public constant MAX_TAG_BYTES = 32;
    /// @notice Maximum bytes for the on-chain Swarm/IPFS rules-document reference.
    ///         Sized to fit any common CID/Swarm hash plus a short scheme prefix.
    uint256 public constant MAX_IPFS_HASH_BYTES = 96;
    /// @notice Time after `revealDeadline` before residual dust may be force-swept to
    ///         treasury. Long enough that any voter has had ample time to withdraw.
    uint64 public constant DUST_SWEEP_GRACE = 30 days;
    /// @notice Minimum permitted value for each phase period. Prevents a misconfigured
    ///         deploy from setting unusable single-second windows.
    uint64 public constant MIN_PERIOD = 1 minutes;
    /// @notice Maximum permitted value for each phase period. Caps the absolute window
    ///         a misconfigured deploy can lock voter stake into the contract.
    uint64 public constant MAX_PERIOD = 365 days;
    /// @notice Upper bound on active commits processed by one `forceSweepDust` call.
    uint32 public constant MAX_DUST_SWEEP_ITERS = 200;

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
        uint96 riskedStake; // always stake × RISK_PERCENT / 100; cached for cheap reads
        uint32 committerIndex; // index into `_activeCommitters` (valid iff !revoked)
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
        uint8 protocolFeePercent;
        uint96 minStake;
        uint32 jurySize;
        uint32 minCommits;
        uint32 minRevealedJurors;
        uint32 maxJurySize;
        uint256 maxJuryPercentage;
        uint256 maxTags;
        uint256 maxNameBytes;
        uint256 maxDescriptionBytes;
        uint256 maxTagBytes;
        uint256 maxIpfsHashBytes;
        uint8 riskPercent;
        uint8 maxProtocolFeePercent;
    }

    /// @dev Snapshot of reveal-phase state. Combines counts, stake totals, and
    ///      jury-only stake breakdowns for performance/quality metrics.
    struct RevealStats {
        Phase phase;
        Outcome outcome;
        uint32 commitCount;
        uint32 revokedCount; // commitCount delta vs the original committers
        uint32 withdrawnCount;
        uint32 revealedYesCount;
        uint32 revealedNoCount;
        uint32 revealedTotalCount;
        uint32 juryDrawSize;
        uint32 juryYesCount;
        uint32 juryNoCount;
        uint32 jurorRevealCount;
        uint256 totalCommittedStake;
        uint256 totalRiskedStake;
        uint256 revealedYesStake;
        uint256 revealedNoStake;
        uint256 revealedYesRisked;
        uint256 revealedNoRisked;
        uint256 jurorYesStake;
        uint256 jurorNoStake;
        uint256 jurorYesRisked;
        uint256 jurorNoRisked;
        uint256 distributablePool;
        uint256 revokedSlashAccrued;
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
        uint8 protocolFeePercent;
        uint96 minStake;
        uint32 jurySize;
        uint32 minCommits;
        uint32 minRevealedJurors;
    }

    // ---------- Immutable deployment config ----------

    IERC20 public immutable stakeToken;
    address public immutable treasury;
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
    uint8 public immutable protocolFeePercent;
    uint96 public immutable minStake;
    uint32 public immutable jurySize;
    uint32 public immutable minCommits;
    uint32 public immutable minRevealedJurors;

    // ---------- Mutable state ----------

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
    uint256 public totalCommittedStake;
    uint256 public totalRiskedStake;
    uint256 public revealedYesStake;
    uint256 public revealedNoStake;
    uint256 public revealedYesRisked;
    uint256 public revealedNoRisked;
    /// @notice Pool distributed to winning revealers. Stake aggregates are uint256 so
    ///         settlement cannot brick at the boundary when active risked stake and
    ///         revoked slash accrual are both large.
    uint256 public distributablePool;
    /// @notice Half of every revoked stake accumulates here during the voting phase.
    ///         At resolve, it joins the distributable pool on a Yes/No outcome, or
    ///         routes to the claim creator on Invalid.
    uint256 public revokedSlashAccrued;
    uint256 public totalYesRewardWeight;
    uint256 public totalNoRewardWeight;
    uint256 public randomness;
    uint256 public treasuryAccrued;
    /// @notice Pull-pattern accrual for the claim creator. Filled with the juror
    ///         non-reveal penalty when the market resolves Invalid after the jury draw.
    uint256 public creatorAccrued;
    bytes32 public juryAuditHash;

    mapping(address => Commit) public commits;
    /// @dev Active (non-revoked) committers. Jury draws from this list. Maintained as a
    ///      swap-and-pop array so revoked entries are removed in O(1).
    address[] private _activeCommitters;
    address[] private _jury;
    mapping(address => bool) private _isJuror;
    /// @notice Cumulative count of revocations. Together with `commitCount` it equals
    ///         the total number of addresses that ever committed.
    uint32 public revokedCount;

    /// @notice `forceSweepDust` walks `_activeCommitters` from this cursor; persisted
    ///         across calls so very large pools can be processed in batches without
    ///         exceeding the block gas limit. When `>=` the active count, the prior
    ///         sweep is finalized and the next call restarts from index 0.
    uint32 public sweepCursor;
    /// @notice Running sum of unclaimed voter payouts collected during the current
    ///         in-progress dust sweep. Reset to 0 whenever a fresh sweep begins.
    uint256 public sweepUnclaimed;

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
    event VoteCommitted(address indexed voter, bytes32 commitHash, uint96 stake, uint96 riskedStake);
    event JuryCommitted(uint256 randomness, address[] jurors, bytes32 auditHash);
    event VoteRevealed(address indexed voter, uint8 vote, uint96 stake, uint96 riskedStake);
    event Resolved(
        Outcome outcome,
        uint32 winningJuryCount,
        uint256 slashedRiskedStake,
        uint256 protocolFee,
        uint256 creatorAccruedAmount,
        uint256 distributablePool
    );
    event Withdrawn(address indexed voter, uint256 payout);
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

    modifier onlyJuryCommitter() {
        if (msg.sender != juryCommitter) revert NotAuthorized();
        _;
    }

    // ---------- Constructor (also opens the market) ----------

    constructor(InitParams memory p) {
        if (address(p.stakeToken) == address(0) || p.treasury == address(0)) revert BadParams();
        if (p.admin == address(0) || p.juryCommitter == address(0) || p.creator == address(0)) revert BadParams();
        if (p.ipfsHash.length == 0 || p.ipfsHash.length > MAX_IPFS_HASH_BYTES) revert BadParams();
        if (p.votingPeriod < MIN_PERIOD || p.adminTimeout < MIN_PERIOD || p.revealPeriod < MIN_PERIOD) {
            revert BadParams();
        }
        if (p.votingPeriod > MAX_PERIOD || p.adminTimeout > MAX_PERIOD || p.revealPeriod > MAX_PERIOD) {
            revert BadParams();
        }
        if (p.protocolFeePercent > MAX_PROTOCOL_FEE_PERCENT) revert BadParams();
        if (p.minStake == 0) revert BadParams();
        if (p.jurySize == 0 || p.jurySize > MAX_JURY_SIZE) revert BadParams();
        if (p.jurySize % 2 == 0) revert BadParams(); // jury size must be odd
        // Jury size must stay within MAX_JURY_PERCENTAGE of the minimum committer pool;
        // this also implies minCommits >= jurySize, so the older subset check is subsumed.
        if (uint256(p.minCommits) * MAX_JURY_PERCENTAGE < uint256(p.jurySize) * 100) revert BadParams();
        if (p.minRevealedJurors == 0) revert BadParams();
        if (p.minRevealedJurors > p.jurySize) revert BadParams();
        if (bytes(p.name).length == 0 || bytes(p.name).length > MAX_NAME_BYTES) revert BadParams();
        if (bytes(p.description).length == 0 || bytes(p.description).length > MAX_DESCRIPTION_BYTES) {
            revert BadParams();
        }
        if (p.tags.length > MAX_TAGS) revert BadParams();
        for (uint256 i = 0; i < p.tags.length; i++) {
            if (bytes(p.tags[i]).length == 0 || bytes(p.tags[i]).length > MAX_TAG_BYTES) revert BadParams();
        }

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

        protocolFeePercent = p.protocolFeePercent;
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

    // ---------- Commit (hidden vote + stake) ----------

    /// @notice Commit a hidden YES/NO belief with stake. Risked stake (the slashable
    ///         portion) is always `stake × RISK_PERCENT / 100`.
    ///         commitHash = keccak256(abi.encode(vote, nonce, voter, block.chainid, address(this))).
    ///         The voter, chain id, and contract address are bound into the hash so that
    ///         copying someone else's hash yields a useless commit (the copier can't
    ///         reveal it), and so that nonces are not correlated across markets or chains.
    ///         Each wallet may commit at most once.
    ///         The actual received balance is what gets recorded; the `stake` argument
    ///         is just the spend authorization. This is an inbound sanity check, not
    ///         support for fee-on-transfer or rebasing tokens.
    ///         Nonce MUST be a high-entropy 256-bit secret: vote space is {1,2}, so a
    ///         guessable nonce makes the hash brute-forceable.
    function commitVote(bytes32 commitHash, uint96 stake) external nonReentrant {
        if (phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= votingDeadline) revert DeadlinePassed();
        if (stake < minStake) revert StakeBelowMin();
        if (commitHash == bytes32(0)) revert BadParams();
        if (commits[msg.sender].hash != bytes32(0)) revert AlreadyCommitted();

        // Measure the actual inbound receipt, while still requiring a plain, no-fee,
        // non-rebasing ERC20 so later payouts remain 1:1 with recorded stake units.
        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), stake);
        uint256 received = stakeToken.balanceOf(address(this)) - balanceBefore;
        if (received < minStake) revert StakeBelowMin();
        if (received > type(uint96).max) revert BadParams();
        uint96 actualStake = uint96(received);

        uint96 riskedStake = _riskedStake(actualStake);
        if (riskedStake == 0) revert BadParams();

        commitCount++;
        totalCommittedStake += actualStake;
        totalRiskedStake += riskedStake;
        uint32 idx = uint32(_activeCommitters.length);
        commits[msg.sender] = Commit({
            hash: commitHash,
            stake: actualStake,
            riskedStake: riskedStake,
            committerIndex: idx,
            revealedVote: 0,
            revealed: false,
            withdrawn: false,
            revoked: false
        });
        _activeCommitters.push(msg.sender);

        emit VoteCommitted(msg.sender, commitHash, actualStake, riskedStake);
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

        // Swap-and-pop the revoked entry out of the active committers list so future
        // jury draws never sample it. O(1).
        uint32 idx = k.committerIndex;
        uint32 lastIdx = uint32(_activeCommitters.length - 1);
        if (idx != lastIdx) {
            address last = _activeCommitters[lastIdx];
            _activeCommitters[idx] = last;
            commits[last].committerIndex = idx;
        }
        _activeCommitters.pop();

        k.revoked = true;
        k.stake = 0;
        k.riskedStake = 0;
        k.committerIndex = 0;

        commitCount--;
        revokedCount++;
        totalCommittedStake -= stake;
        totalRiskedStake -= risked;

        // 50/50 split — claimer gets the floor half, the pool gets the ceiling half so
        // an odd-wei stake still rounds in the protocol's favour. Floor the claimer cut
        // at 1 wei when the stake is non-zero, otherwise a 1-wei stake hands the claimer
        // nothing and removes their incentive to call the function.
        uint96 claimerCut = stake / 2;
        if (claimerCut == 0 && stake > 0) claimerCut = 1;
        uint96 pooledCut = stake - claimerCut;
        revokedSlashAccrued += pooledCut;

        stakeToken.safeTransfer(msg.sender, claimerCut);
        emit StakeRevoked(voter, msg.sender, stake, claimerCut, pooledCut);
    }

    // ---------- Jury commit + on-chain selection ----------

    /// @notice Submit SpaceComputer cTRNG randomness plus an audit hash. The contract
    ///         draws the resolving jury on-chain from the active (non-revoked)
    ///         committer set via a virtual Fisher-Yates sampler with O(jurySize) memory.
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

        emit VoteRevealed(msg.sender, vote, k.stake, k.riskedStake);
    }

    // ---------- Resolve ----------

    /// @notice Finalize the market. Anyone may call.
    ///         Outcome is decided by simple count of revealing jurors: each juror
    ///         contributes 1 vote regardless of their stake.
    ///         Resolves Invalid if the admin missed the jury-commit deadline, if too few
    ///         jurors revealed, or if juror counts tie (only possible when an even number
    ///         of jurors actually revealed).
    ///         Selected jurors who fail to reveal lose their FULL stake. The extra
    ///         (above the normal 1× riskedStake slash) joins the distributable pool on
    ///         a Yes/No outcome. On Invalid (after the jury was drawn) the entire juror
    ///         penalty accrues to the claim creator and every other voter is fully
    ///         refunded.
    function resolve() external nonReentrant {
        if (phase == Phase.Resolved) revert WrongPhase();

        if (phase == Phase.Voting) {
            if (block.timestamp < juryCommitDeadline) revert DeadlineNotPassed();
            uint256 revokedHalf = revokedSlashAccrued;
            revokedSlashAccrued = 0;
            creatorAccrued += revokedHalf;
            outcome = Outcome.Invalid;
            phase = Phase.Resolved;
            emit Resolved(Outcome.Invalid, 0, 0, 0, revokedHalf, 0);
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

        uint256 slashedRiskedStake;
        uint256 protocolFee;
        uint256 creatorAccruedAmount;
        if (out != Outcome.Invalid) {
            (slashedRiskedStake, protocolFee) = _settleSlashedPool(out);
        } else {
            // Jury was drawn but outcome Invalid: slash each non-revealing juror's full
            // stake and route the revoked-slash half to the creator. Every other voter
            // is refunded. The event reports this separately from protocol fees.
            uint256 jurorPenalty = _accrueNonRevealingJurorPenaltyToCreator();
            uint256 revokedHalf = revokedSlashAccrued;
            revokedSlashAccrued = 0;
            creatorAccrued += revokedHalf;
            creatorAccruedAmount = jurorPenalty + revokedHalf;
        }

        emit Resolved(out, winningJuryCount, slashedRiskedStake, protocolFee, creatorAccruedAmount, distributablePool);
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
        _resetDustSweep();
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        emit Withdrawn(msg.sender, payout);
    }

    /// @notice Pull treasury-accrued funds. Permissionless — funds always go to the
    ///         configured `treasury`. Idempotent: returns silently when nothing has
    ///         accrued. Rounding-dust collection is exclusively handled by
    ///         `forceSweepDust` after the dust-sweep grace window — keeping this surface
    ///         minimal avoids the convenience-branch ambiguity.
    function withdrawTreasury() external nonReentrant {
        uint256 amount = treasuryAccrued;
        treasuryAccrued = 0;
        if (amount == 0) return;
        stakeToken.safeTransfer(treasury, amount);
        emit TreasuryWithdrawn(treasury, amount);
    }

    /// @notice Sweep rounding-dust to the treasury after the dust-sweep grace window.
    ///         Paginated: each call processes up to `maxIters` active commits starting
    ///         from `sweepCursor`. The accumulated unclaimed payout total persists in
    ///         storage across calls so very large pools can be processed in batches.
    ///         Once the cursor reaches the end of the active list the call also
    ///         finalises by routing any residual contract balance (beyond
    ///         `unclaimed + treasuryAccrued + creatorAccrued`) into `treasuryAccrued`.
    ///         If the balance shifts mid-sweep (a voter withdraws between batches),
    ///         the next call restarts the sweep from index 0.
    function forceSweepDust(uint32 maxIters) external nonReentrant {
        if (phase != Phase.Resolved) revert WrongPhase();
        if (block.timestamp < uint256(revealDeadline) + DUST_SWEEP_GRACE) revert DeadlineNotPassed();
        if (maxIters == 0) revert BadParams();

        uint32 n = uint32(_activeCommitters.length);
        uint32 cursor = sweepCursor;
        uint32 limit = maxIters > MAX_DUST_SWEEP_ITERS ? MAX_DUST_SWEEP_ITERS : maxIters;

        // A previous sweep already finished; restart fresh from 0.
        if (cursor >= n) {
            cursor = 0;
            sweepUnclaimed = 0;
        }

        // Clamp to `n` while respecting the bounded page size.
        uint32 remaining = n - cursor;
        uint32 end = limit >= remaining ? n : cursor + limit;

        uint256 acc = sweepUnclaimed;
        for (uint32 i = cursor; i < end; i++) {
            Commit storage k = commits[_activeCommitters[i]];
            if (k.withdrawn) continue;
            acc += _payoutFor(k, _isJuror[_activeCommitters[i]]);
        }
        sweepCursor = end;
        sweepUnclaimed = acc;

        if (end == n) {
            uint256 reserved = acc + creatorAccrued + treasuryAccrued;
            uint256 balance = stakeToken.balanceOf(address(this));
            if (balance > reserved) {
                treasuryAccrued += balance - reserved;
            }
        }
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
        return _activeCommitters;
    }

    function isJuror(address who) external view returns (bool) {
        return _isJuror[who];
    }

    /// @notice Helper: compute the commit hash for a given vote.
    /// @dev    Reverts if `vote` isn't 1 or 2 — guards committers from accidentally
    ///         producing unrevealable hashes (a hash committed with vote ∉ {1,2}
    ///         can never satisfy `revealVote`'s vote check, self-griefing the stake).
    function commitHashOf(uint8 vote, bytes32 nonce, address voter) external view returns (bytes32) {
        if (vote != 1 && vote != 2) revert InvalidReveal();
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
            protocolFeePercent: protocolFeePercent,
            minStake: minStake,
            jurySize: jurySize,
            minCommits: minCommits,
            minRevealedJurors: minRevealedJurors,
            maxJurySize: MAX_JURY_SIZE,
            maxJuryPercentage: MAX_JURY_PERCENTAGE,
            maxTags: MAX_TAGS,
            maxNameBytes: MAX_NAME_BYTES,
            maxDescriptionBytes: MAX_DESCRIPTION_BYTES,
            maxTagBytes: MAX_TAG_BYTES,
            maxIpfsHashBytes: MAX_IPFS_HASH_BYTES,
            riskPercent: RISK_PERCENT,
            maxProtocolFeePercent: MAX_PROTOCOL_FEE_PERCENT
        });
    }

    /// @notice Reveal-phase / post-reveal stats: vote counts, stake totals, jury-only
    ///         stake-weighted aggregates. Safe to call at any phase; "post-reveal"
    ///         consumers should generally wait until `phase == Resolved`.
    function getRevealStats() external view returns (RevealStats memory s) {
        s.phase = phase;
        s.outcome = outcome;
        s.commitCount = commitCount;
        s.revokedCount = revokedCount;
        s.withdrawnCount = withdrawnCount;
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

    /// @notice Per-juror snapshot — address, reveal status, vote, stake, riskedStake —
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
                riskedStake: k.riskedStake
            });
        }
    }

    // ---------- Internals ----------

    /// @dev Floyd sampler. Picks `k = min(jurySize, activeCount)` unique indices into
    ///      `_activeCommitters` using `seed` as the entropy source. Memory cost is O(k)
    ///      regardless of `n`; work is bounded by one membership scan per selected
    ///      juror. This avoids both O(n) Fisher-Yates initialization and the previous
    ///      sparse-swap table's repeated lookup/update scans.
    function _drawJury(uint256 seed) internal {
        uint256 n = _activeCommitters.length;
        uint256 k = jurySize > n ? n : jurySize;
        if (k == 0) return;

        uint256[] memory selected = new uint256[](k);
        uint256 selectedLen;
        for (uint256 j = n - k; j < n; j++) {
            uint256 candidate = _uniformRandom(seed, j, j + 1);
            bool seen;
            for (uint256 s = 0; s < selectedLen; s++) {
                if (selected[s] == candidate) {
                    seen = true;
                    break;
                }
            }

            uint256 chosen = seen ? j : candidate;
            selected[selectedLen] = chosen;
            selectedLen++;

            address juror = _activeCommitters[chosen];
            _jury.push(juror);
            _isJuror[juror] = true;
        }
    }

    /// @dev Uniform random integer in [0, upper). Uses rejection sampling to remove
    ///      modulo bias before Floyd's sampler consumes the bounded draw. With the
    ///      protocol's uint32-sized committer pool, rejection probability is below
    ///      2^-224, but the loop keeps the distribution exact.
    function _uniformRandom(uint256 seed, uint256 domain, uint256 upper) internal pure returns (uint256) {
        if (upper == 0) revert BadParams();

        uint256 threshold;
        unchecked {
            threshold = (0 - upper) % upper;
        }

        uint256 attempt;
        while (true) {
            uint256 x = uint256(keccak256(abi.encode(seed, domain, attempt)));
            if (x >= threshold) return x % upper;
            attempt++;
        }
        revert BadParams();
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

    function _settleSlashedPool(Outcome out) internal returns (uint256 slashedRiskedStake, uint256 protocolFee) {
        uint256 losingRisked = out == Outcome.Yes ? revealedNoRisked : revealedYesRisked;
        uint256 missedRisked = totalRiskedStake - revealedYesRisked - revealedNoRisked;
        (, uint256 jurorExtra) = _jurorNoRevealAccounting();
        uint256 revokedHalf = revokedSlashAccrued;
        revokedSlashAccrued = 0;
        slashedRiskedStake = losingRisked + missedRisked + jurorExtra + revokedHalf;

        if (slashedRiskedStake > 0) {
            protocolFee = (slashedRiskedStake * protocolFeePercent) / 100;
            if (protocolFee > 0) treasuryAccrued += protocolFee;
            distributablePool = slashedRiskedStake - protocolFee;
        }
    }

    function _accrueNonRevealingJurorPenaltyToCreator() internal returns (uint256 totalPenalty) {
        (totalPenalty,) = _jurorNoRevealAccounting();
        if (totalPenalty > 0) {
            creatorAccrued += totalPenalty;
        }
    }

    /// @dev Returns (totalPenalty, totalExtra) summed over jurors who failed to reveal.
    ///      penalty = full `stake` (the juror non-reveal slash always takes 100%).
    ///      extra   = stake - riskedStake (the slash beyond what's already counted in
    ///                missedRisked).
    function _jurorNoRevealAccounting() internal view returns (uint256 totalPenalty, uint256 totalExtra) {
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
        // Selected juror who failed to reveal: lose full stake (RISK_PERCENT does not
        // apply). Applies on any post-jury-draw outcome.
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
        return keccak256(abi.encode(vote, nonce, voter, block.chainid, address(this)));
    }

    function _riskedStake(uint96 stake) internal pure returns (uint96) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint96((uint256(stake) * RISK_PERCENT) / 100);
    }

    function _resetDustSweep() internal {
        sweepCursor = 0;
        sweepUnclaimed = 0;
    }
}
