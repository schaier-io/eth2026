// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TruthMarket
/// @notice Phased prediction-market fact-checker:
///         (1) Created  — claim + Swarm doc registered, voting opens
///         (2) Voting   — commit-only: hidden votes via keccak256(vote, nonce, stake, voter).
///                        Each commit also carries an IPFS evidence reference recorded in
///                        the VoteCommitted event (no separate evidence-attach call).
///         (3) Reveal   — admin commits a jury subset (cTRNG-selected off-chain), then
///                        any committer may reveal. Jury reveals decide the outcome;
///                        non-juror reveals don't influence the outcome but still play
///                        the prediction-market layer.
///         (4) Resolved — winners (anyone who revealed the winning side) split the
///                        slashed pool pro-rata by stake; losers and non-revealers
///                        forfeit their stake.
///
///         Token model: a single ERC20 is whitelisted at construction (`stakeToken`,
///         immutable). Deployer must pick a vanilla, non-rebasing, non-fee-on-transfer
///         token — the contract assumes 1:1 transfer accounting.
///
///         Trust model for the jury (intentional): this contract does NOT verify
///         randomness on-chain and does NOT enforce jury size or recover from a
///         stalled / malicious oracle. The oracle is trusted to (a) fetch a real
///         cTRNG output from SpaceComputer, (b) pin it to IPFS, (c) compute the jury
///         off-chain, and (d) commit {jurors, randomness, ipfsCID} via `commitJury`.
///         The IPFS CID is the only audit trail. If the oracle never calls
///         `commitJury`, no reveals can occur and the claim resolves to Invalid
///         (full refunds). `commitJury` is one-shot and accepts any subset up to
///         `jurySize`; correctness of jury composition is off-chain.
///
///         Slashed pool = (revealed-losing stake, any committer)
///                      + (non-revealing stake, any committer).
///         After fee, the distributable pool is split among ALL winning revealers
///         (jurors and non-jurors), pro-rata by their committed stake.
contract TruthMarket is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Roles ----------

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ---------- Constants ----------

    uint64 public constant MAX_PERIOD = 365 days;
    uint64 public constant DUST_SWEEP_DELAY = 30 days;
    uint96 public constant MAX_FEE_BPS = 1_000; // 10%

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
        bytes32 swarmDocHash;        // Swarm reference to claim text + sources
        address creator;
        uint64 votingDeadline;
        uint64 revealDeadline;
        uint64 resolvedAt;           // timestamp of resolve(); 0 until resolved
        uint96 protocolFeeBps;       // basis points; max MAX_FEE_BPS
        uint32 jurySize;             // must be odd
        Phase phase;
        Outcome outcome;
        // Outcome decision (jurors only — they are the truth oracle).
        uint128 juryYesStake;        // sum of revealed YES stake from jurors
        uint128 juryNoStake;         // sum of revealed NO  stake from jurors
        // Economic accounting (every committer who reveals — jury or not).
        uint128 revealedYesStake;    // sum of revealed YES stake (all committers)
        uint128 revealedNoStake;     // sum of revealed NO  stake (all committers)
        uint128 totalCommittedStake; // sum of every commit's stake
        uint128 distributablePool;   // slashed stake minus fee (cached at resolve)
        uint128 paidOut;             // running total: fee paid + payouts withdrawn + dust swept
        uint256 randomness;          // cTRNG value posted by admin (0 = unfulfilled)
    }

    struct Commit {
        bytes32 hash;          // keccak256(abi.encode(vote, nonce, stake, voter))
        uint96 stake;          // locked at commit time
        uint8 revealedVote;    // 0 = none, 1 = YES, 2 = NO
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
    event VoteCommitted(
        uint256 indexed id,
        address indexed voter,
        bytes32 commitHash,
        uint96 stake,
        bytes32 evidenceRef
    );
    event JuryCommitted(uint256 indexed id, uint256 randomness, address[] jurors, string ipfsCID);
    event VoteRevealed(uint256 indexed id, address indexed voter, uint8 vote, uint96 stake);
    event Resolved(
        uint256 indexed id,
        Outcome outcome,
        uint128 winnerStake,
        uint128 slashedStake,
        uint256 fee,
        uint128 distributablePool
    );
    event Withdrawn(uint256 indexed id, address indexed voter, uint256 payout);
    event TreasurySet(address indexed previousTreasury, address indexed newTreasury);
    event DustSwept(uint256 indexed id, address indexed to, uint256 amount);

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
    error SweepTooEarly();
    error NothingToSweep();

    // ---------- Constructor ----------

    constructor(IERC20 _stakeToken, address _treasury, address admin, address oracle) {
        if (address(_stakeToken) == address(0)) revert BadParams();
        if (_treasury == address(0)) revert BadParams();
        if (admin == address(0)) revert BadParams();
        if (oracle == address(0)) revert BadParams();
        stakeToken = _stakeToken;
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
        emit TreasurySet(address(0), _treasury);
    }

    // ---------- Phase 1: Create ----------

    /// @notice Open a claim. swarmDocHash points to the canonical claim doc on Swarm.
    /// @dev Voting opens immediately. Voting window = now..votingDeadline.
    ///      Reveal window = votingDeadline..revealDeadline.
    ///      jurySize must be odd to keep jury ties rare (a stake-weighted tie is
    ///      still theoretically possible if jurors stake equal amounts on both
    ///      sides — that resolves to Outcome.Invalid and refunds all committers).
    function createClaim(
        bytes32 swarmDocHash,
        uint64 votingPeriod,
        uint64 revealPeriod,
        uint96 protocolFeeBps,
        uint32 jurySize
    ) external returns (uint256 id) {
        if (swarmDocHash == bytes32(0)) revert BadParams();
        if (votingPeriod == 0 || revealPeriod == 0) revert BadParams();
        if (votingPeriod > MAX_PERIOD || revealPeriod > MAX_PERIOD) revert BadParams();
        if (protocolFeeBps > MAX_FEE_BPS) revert BadParams();
        if (jurySize == 0) revert BadParams();
        if (jurySize % 2 == 0) revert BadParams();

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

    // ---------- Phase 2: Commit (hidden vote + stake + evidence) ----------

    /// @notice Commit a hidden vote and an IPFS evidence reference.
    ///         commitHash = keccak256(abi.encode(uint8 vote, bytes32 nonce, uint96 stake, address voter)).
    ///         vote: 1 = YES, 2 = NO. Reuse the same nonce in reveal.
    ///         `evidenceRef` is the IPFS CID hash of the voter's evidence bundle —
    ///         emitted in the event for off-chain indexers; readers fetch + verify.
    function commitVote(uint256 id, bytes32 commitHash, uint96 stake, bytes32 evidenceRef)
        external
        nonReentrant
    {
        Claim storage c = claims[id];
        if (c.phase != Phase.Voting) revert WrongPhase();
        if (block.timestamp >= c.votingDeadline) revert DeadlinePassed();
        if (stake == 0) revert BadParams();
        if (commits[id][msg.sender].hash != bytes32(0)) revert AlreadyCommitted();

        stakeToken.safeTransferFrom(msg.sender, address(this), stake);

        c.totalCommittedStake += stake;
        commits[id][msg.sender] =
            Commit({hash: commitHash, stake: stake, revealedVote: 0, revealed: false, withdrawn: false});
        _committers[id].push(msg.sender);

        emit VoteCommitted(id, msg.sender, commitHash, stake, evidenceRef);
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
    ///         Intentionally one-shot and intentionally accepts a partial jury
    ///         (1..=jurySize). Oracle trust is the explicit security model;
    ///         a stalled oracle resolves the claim to Outcome.Invalid (refunds).
    function commitJury(uint256 id, address[] calldata jurors, uint256 randomness, string calldata ipfsCID)
        external
        onlyRole(ORACLE_ROLE)
        nonReentrant
    {
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
            if (commits[id][j].hash == bytes32(0)) revert BadParams();
            if (_isJurorMap[id][j]) revert BadParams();
            _jury[id].push(j);
            _isJurorMap[id][j] = true;
        }

        emit JuryCommitted(id, randomness, jurors, ipfsCID);
    }

    /// @notice Reveal a commit. Open to every committer; only juror reveals
    ///         decide the outcome, but every revealer is part of the prediction
    ///         market — winners share the slashed pool pro-rata by stake,
    ///         losers and non-revealers forfeit their stake.
    function revealVote(uint256 id, uint8 vote, bytes32 nonce) external nonReentrant {
        Claim storage c = claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp >= c.revealDeadline) revert DeadlinePassed();
        if (c.randomness == 0) revert WrongPhase();
        if (vote != 1 && vote != 2) revert InvalidReveal();

        Commit storage k = commits[id][msg.sender];
        if (k.hash == bytes32(0)) revert CommitNotFound();
        if (k.revealed) revert AlreadyRevealed();

        bytes32 expected = keccak256(abi.encode(vote, nonce, k.stake, msg.sender));
        if (expected != k.hash) revert InvalidReveal();

        k.revealed = true;
        k.revealedVote = vote;

        bool juror = _isJurorMap[id][msg.sender];
        if (vote == 1) {
            c.revealedYesStake += k.stake;
            if (juror) c.juryYesStake += k.stake;
        } else {
            c.revealedNoStake += k.stake;
            if (juror) c.juryNoStake += k.stake;
        }

        emit VoteRevealed(id, msg.sender, vote, k.stake);
    }

    // ---------- Phase 4: Resolve + Withdraw ----------

    /// @notice Finalize the claim. Anyone may call after revealDeadline.
    /// @dev    Outcome is decided by jury revealed stake only. A jury stake tie
    ///         (or no jury reveals) → Outcome.Invalid → all committers refunded.
    ///         Slashed pool spans the whole committer set:
    ///           losing-revealers (any committer) + non-revealers (any committer).
    ///         Fee is taken on the slashed pool; the rest is the distributable pool
    ///         that gets split pro-rata by stake among winning revealers.
    function resolve(uint256 id) external nonReentrant {
        Claim storage c = claims[id];
        if (c.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp < c.revealDeadline) revert DeadlineNotPassed();

        uint128 juryWinnerStake;
        if (c.juryYesStake > c.juryNoStake) {
            c.outcome = Outcome.Yes;
            juryWinnerStake = c.juryYesStake;
        } else if (c.juryNoStake > c.juryYesStake) {
            c.outcome = Outcome.No;
            juryWinnerStake = c.juryNoStake;
        } else {
            c.outcome = Outcome.Invalid;
        }

        c.phase = Phase.Resolved;
        c.resolvedAt = uint64(block.timestamp);

        uint128 slashedStake;
        uint256 fee;
        if (c.outcome != Outcome.Invalid) {
            uint128 losingRevealed = c.outcome == Outcome.Yes ? c.revealedNoStake : c.revealedYesStake;
            uint128 missedStake = c.totalCommittedStake - c.revealedYesStake - c.revealedNoStake;
            slashedStake = losingRevealed + missedStake;

            if (slashedStake > 0) {
                fee = (uint256(slashedStake) * c.protocolFeeBps) / 10_000;
                if (fee > 0) {
                    c.paidOut += uint128(fee);
                    stakeToken.safeTransfer(treasury, fee);
                }
                c.distributablePool = slashedStake - uint128(fee);
            }
        }

        emit Resolved(id, c.outcome, juryWinnerStake, slashedStake, fee, c.distributablePool);
    }

    /// @notice Withdraw final payout.
    ///         - Invalid outcome: refund full stake to every committer.
    ///         - Didn't reveal (juror or not): 0 — stake folded into the slashed pool.
    ///         - Revealed losing side: 0 — stake folded into the slashed pool.
    ///         - Revealed winning side (juror or not): own stake back + pro-rata-by-stake
    ///           slice of the distributable pool.
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
                uint128 winnerStakeTotal = c.outcome == Outcome.Yes ? c.revealedYesStake : c.revealedNoStake;
                uint256 bonus = winnerStakeTotal == 0
                    ? 0
                    : (uint256(c.distributablePool) * uint256(k.stake)) / uint256(winnerStakeTotal);
                payout = uint256(k.stake) + bonus;
            }
        }

        k.withdrawn = true;
        if (payout > 0) {
            c.paidOut += uint128(payout);
            stakeToken.safeTransfer(msg.sender, payout);
        }
        emit Withdrawn(id, msg.sender, payout);
    }

    /// @notice Sweep integer-division dust from a resolved claim to the treasury.
    ///         Available DUST_SWEEP_DELAY after resolve, giving winners a window
    ///         to claim first. Computes the residual as
    ///         (totalCommittedStake - paidOut) — i.e. anything still allocated
    ///         to this claim that no one can withdraw.
    function sweepDust(uint256 id) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Claim storage c = claims[id];
        if (c.phase != Phase.Resolved) revert WrongPhase();
        if (block.timestamp < uint256(c.resolvedAt) + DUST_SWEEP_DELAY) revert SweepTooEarly();

        uint128 dust = c.totalCommittedStake - c.paidOut;
        if (dust == 0) revert NothingToSweep();

        c.paidOut += dust;
        stakeToken.safeTransfer(treasury, dust);
        emit DustSwept(id, treasury, dust);
    }

    // ---------- Views ----------

    function getJury(uint256 id) external view returns (address[] memory) {
        return _jury[id];
    }

    function getCommitters(uint256 id) external view returns (address[] memory) {
        return _committers[id];
    }

    function committersCount(uint256 id) external view returns (uint256) {
        return _committers[id].length;
    }

    function juryCount(uint256 id) external view returns (uint256) {
        return _jury[id].length;
    }

    /// @notice Paginated committers for large markets where `getCommitters` exceeds
    ///         off-chain RPC return-size limits. Returns up to `limit` entries
    ///         starting at `offset`.
    function getCommittersPaged(uint256 id, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        address[] storage all = _committers[id];
        uint256 len = all.length;
        if (offset >= len) return new address[](0);
        uint256 end = offset + limit;
        if (end > len) end = len;
        page = new address[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = all[offset + i];
        }
    }

    function getJuryPaged(uint256 id, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        address[] storage all = _jury[id];
        uint256 len = all.length;
        if (offset >= len) return new address[](0);
        uint256 end = offset + limit;
        if (end > len) end = len;
        page = new address[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = all[offset + i];
        }
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

    // ---------- Admin ----------

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert BadParams();
        address prev = treasury;
        treasury = _treasury;
        emit TreasurySet(prev, _treasury);
    }
}
