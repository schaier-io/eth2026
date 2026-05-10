// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { TruthMarketRegistry, ITruthMarketRegistry } from "../src/TruthMarketRegistry.sol";
import { MockERC20 } from "./MockERC20.sol";

contract TruthMarketLifecycleTest is Test {
    TruthMarket internal implementation;
    TruthMarket internal market;
    MockERC20 internal token;
    TruthMarketRegistry internal registry;

    event Resolved(
        TruthMarket.Outcome outcome,
        uint32 winningJuryCount,
        uint256 slashedRiskedStake,
        uint256 protocolFee,
        uint256 creatorAccruedAmount,
        uint256 distributablePool
    );

    address internal juryCommitter = makeAddr("juryCommitter");
    address internal creator = makeAddr("creator");

    bytes internal constant SWARM_REFERENCE =
        bytes("bzz://8f2b1c3d4e5f67890123456789012345678901234567890123456789012345678");
    bytes internal constant RANDOMNESS_IPFS_ADDRESS =
        bytes("https://ipfs.io/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f");
    uint64 internal constant RANDOMNESS_SEQUENCE = 87_963;
    uint64 internal constant RANDOMNESS_TIMESTAMP = 1_769_179_239;
    uint16 internal constant RANDOMNESS_INDEX = 0;
    bytes32 internal constant AUDIT_HASH = keccak256("swarm://ctrng-output");
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint96 internal constant DEFAULT_BALANCE = 1000 ether;
    uint256 internal constant MAX_SWARM_REFERENCE_BYTES = 96;
    uint64 internal constant MAX_PERIOD = 365 days;

    struct V {
        address addr;
        bytes32 nonce;
        uint96 stake;
        uint8 vote;
    }

    function setUp() public {
        token = new MockERC20("Truth Stake", "TRUTH", 10_000_000 ether, address(this));
        registry = new TruthMarketRegistry();
        implementation = new TruthMarket();
    }

    // ---------- Deployment helpers ----------

    function _deployMarket(uint32 targetJurySize, uint32 minCommits, uint32 minRevealedJurors)
        internal
        returns (TruthMarket m)
    {
        m = _newMarket(_initParams(targetJurySize, minCommits, minRevealedJurors));
    }

    function _newMarket(TruthMarket.InitParams memory p) internal returns (TruthMarket m) {
        m = TruthMarket(Clones.clone(address(implementation)));
        m.initialize(p);
    }

    function _expectNewMarketRevert(bytes4 selector, TruthMarket.InitParams memory p) internal {
        TruthMarket m = TruthMarket(Clones.clone(address(implementation)));
        vm.expectRevert(selector);
        m.initialize(p);
    }

    function _initParams(uint32 targetJurySize, uint32 minCommits, uint32 minRevealedJurors)
        internal
        view
        returns (TruthMarket.InitParams memory)
    {
        return TruthMarket.InitParams({
            stakeToken: IERC20(address(token)),
            registry: ITruthMarketRegistry(address(registry)),
            juryCommitter: juryCommitter,
            creator: creator,
            swarmReference: SWARM_REFERENCE,
            votingPeriod: VOTING_PERIOD,
            adminTimeout: ADMIN_TIMEOUT,
            revealPeriod: REVEAL_PERIOD,
            minStake: MIN_STAKE,
            targetJurySize: targetJurySize,
            minCommits: minCommits,
            maxCommits: 0,
            minRevealedJurors: minRevealedJurors,
            creatorBond: 0
        });
    }

    function _randomnessMetadata() internal pure returns (TruthMarket.RandomnessMetadata memory) {
        return TruthMarket.RandomnessMetadata({
            ipfsAddress: RANDOMNESS_IPFS_ADDRESS,
            sequence: RANDOMNESS_SEQUENCE,
            timestamp: RANDOMNESS_TIMESTAMP,
            valueIndex: RANDOMNESS_INDEX
        });
    }

    // ---------- Voter helpers ----------

    function _makeVoters(uint256 n, uint96 stake, uint8 vote) internal returns (V[] memory vs) {
        vs = new V[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = address(uint160(uint256(keccak256(abi.encode("voter", i)))));
            vm.deal(a, 1 ether); // gas only; not strictly needed in test, but harmless
            assertTrue(token.transfer(a, DEFAULT_BALANCE));
            vs[i] = V({ addr: a, nonce: keccak256(abi.encode("nonce", i)), stake: stake, vote: vote });
        }
    }

    function _commit(V memory v) internal {
        bytes32 hash = market.commitHashOf(v.vote, v.nonce, v.addr);
        vm.startPrank(v.addr);
        token.approve(address(market), v.stake);
        market.commitVote(hash, v.stake);
        vm.stopPrank();
    }

    function _commitAll(V[] memory vs) internal {
        for (uint256 i = 0; i < vs.length; i++) {
            _commit(vs[i]);
        }
    }

    function _reveal(V memory v) internal {
        vm.prank(v.addr);
        market.revealVote(v.vote, v.nonce);
    }

    function _revealAll(V[] memory vs) internal {
        for (uint256 i = 0; i < vs.length; i++) {
            _reveal(vs[i]);
        }
    }

    function _withdrawAll(V[] memory vs) internal {
        for (uint256 i = 0; i < vs.length; i++) {
            vm.prank(vs[i].addr);
            market.withdraw();
        }
    }

    function _stringOfLength(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; i++) {
            b[i] = bytes1(uint8(0x61));
        }
        return string(b);
    }

    // ---------- Tests ----------

    function test_CommitHashBindsChainIdAndContractDomain() public {
        market = _deployMarket(1, 7, 1);
        address voter = makeAddr("domainVoter");
        bytes32 nonce = keccak256("domain-nonce");

        bytes32 expected = keccak256(abi.encode(uint8(1), nonce, voter, block.chainid, address(market)));
        assertEq(market.commitHashOf(1, nonce, voter), expected);

        uint256 originalChainId = block.chainid;
        vm.chainId(originalChainId + 1);
        bytes32 otherChain = market.commitHashOf(1, nonce, voter);
        assertEq(otherChain, keccak256(abi.encode(uint8(1), nonce, voter, block.chainid, address(market))));
        assertTrue(otherChain != expected);
    }

    function test_FullLifecycleSingleJurorYesOutcome() public {
        // targetJurySize=1 with MAX_TARGET_JURY_SIZE_PERCENT needs minCommits >= 7. All commit + reveal yes.
        market = _deployMarket(1, 7, 1);

        V[] memory vs = _makeVoters(7, 50 ether, 1); // all YES, 40% conv → risked 20
        _commitAll(vs);
        assertEq(market.previewPayout(vs[0].addr), 0);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, _randomnessMetadata(), AUDIT_HASH);
        assertEq(market.getJury().length, 1);

        _revealAll(vs);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        vm.expectEmit(false, false, false, true, address(market));
        emit Resolved(TruthMarket.Outcome.Yes, 1, 0, 0, 0, 0);
        market.resolve();

        // No losers, no missed reveals → slashed pool empty. Outcome Yes.
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        assertEq(market.distributablePool(), 0);
        assertEq(market.treasuryAccrued(), 0);
        assertEq(market.creatorAccrued(), 0);
        assertEq(market.previewPayout(vs[0].addr), 50 ether);

        _withdrawAll(vs);
        for (uint256 i = 0; i < vs.length; i++) {
            assertEq(token.balanceOf(vs[i].addr), DEFAULT_BALANCE);
        }
        assertEq(market.previewPayout(vs[0].addr), 0);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_CommitJuryStoresSpaceComputerRandomnessEvidence() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 50 ether, 1);
        _commitAll(vs);

        uint256 seed = 0xC0FFEE;
        bytes32 expectedRandomnessHash = keccak256(abi.encodePacked(seed));

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(seed, _randomnessMetadata(), AUDIT_HASH);

        assertEq(market.SPACE_COMPUTER_IPNS_BEACON(), "/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f");
        assertEq(market.MAX_RANDOMNESS_IPFS_ADDRESS_BYTES(), 160);
        assertEq(market.randomness(), seed);
        assertEq(market.randomnessHash(), expectedRandomnessHash);
        assertEq(market.randomnessIpfsAddress(), RANDOMNESS_IPFS_ADDRESS);
        assertEq(market.randomnessSequence(), RANDOMNESS_SEQUENCE);
        assertEq(market.randomnessTimestamp(), RANDOMNESS_TIMESTAMP);
        assertEq(market.randomnessIndex(), RANDOMNESS_INDEX);
        assertEq(market.juryAuditHash(), AUDIT_HASH);

        TruthMarket.RandomnessEvidence memory evidence = market.getRandomnessEvidence();
        assertEq(evidence.randomness, seed);
        assertEq(evidence.randomnessHash, expectedRandomnessHash);
        assertEq(evidence.randomnessIpfsAddress, RANDOMNESS_IPFS_ADDRESS);
        assertEq(evidence.randomnessSequence, RANDOMNESS_SEQUENCE);
        assertEq(evidence.randomnessTimestamp, RANDOMNESS_TIMESTAMP);
        assertEq(evidence.randomnessIndex, RANDOMNESS_INDEX);
        assertEq(evidence.juryAuditHash, AUDIT_HASH);
    }

    function test_LifecycleSlashesLosersAndPaysWinners() public {
        // targetJurySize=3 needs minCommits >= 20. Mix yes/no voters with different stakes.
        // Risked stake is fixed at 20% per voter.
        market = _deployMarket(3, 20, 2);

        V[] memory yes = _makeVoters(15, 60 ether, 1); // risked 12 each (15 * 12 = 180 total)
        // 5 NO voters via separate make so addresses don't clash
        V[] memory no = new V[](5);
        for (uint256 i = 0; i < 5; i++) {
            address a = address(uint160(uint256(keccak256(abi.encode("noVoter", i)))));
            assertTrue(token.transfer(a, DEFAULT_BALANCE));
            no[i] = V({ addr: a, nonce: keccak256(abi.encode("noNonce", i)), stake: 80 ether, vote: 2 });
        }

        _commitAll(yes);
        _commitAll(no);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, _randomnessMetadata(), AUDIT_HASH);

        _revealAll(yes);
        _revealAll(no);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        TruthMarket.Outcome outcome = market.outcome();
        // With 15 YES and 5 NO committers and a random 3-juror draw, both outcomes are
        // possible. Either way, no juror missed reveal so creator accrues nothing.
        assertEq(market.creatorAccrued(), 0);
        assertTrue(outcome == TruthMarket.Outcome.Yes || outcome == TruthMarket.Outcome.No);

        // slashed = losers' risked stake. fee = 1% (PROTOCOL_FEE_PERCENT). Risked = stake * 20 / 100.
        if (outcome == TruthMarket.Outcome.Yes) {
            // NO side lost: 5 * (80 * 20%) = 5 * 16 = 80 risked. fee = 0.8. distributable = 79.2.
            assertEq(market.distributablePool(), 79.2 ether);
            assertEq(market.treasuryAccrued(), 0.8 ether);
        } else {
            // YES side lost: 15 * (60 * 20%) = 15 * 12 = 180 risked. fee = 1.8. distributable = 178.2.
            assertEq(market.distributablePool(), 178.2 ether);
            assertEq(market.treasuryAccrued(), 1.8 ether);
        }

        _withdrawAll(yes);
        _withdrawAll(no);
        market.withdrawTreasury();

        // Sweep any rounding-dust into the treasury after the grace window.
        vm.warp(block.timestamp + market.DUST_SWEEP_GRACE() + 1);
        market.forceSweepDust(type(uint32).max);
        market.withdrawTreasury();

        assertEq(token.balanceOf(address(market)), 0);
        assertEq(market.creatorAccrued(), 0);
    }

    function test_ResolvesInvalidWhenJuryCommitDeadlineMissed() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        assertEq(market.creatorAccrued(), 0);
        assertEq(market.treasuryAccrued(), 0);

        _withdrawAll(vs);
        for (uint256 i = 0; i < vs.length; i++) {
            assertEq(token.balanceOf(vs[i].addr), DEFAULT_BALANCE);
        }
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_NonRevealingJurorAtValidOutcomeForfeitsFullStake() public {
        // targetJurySize=3, minCommits=20. Find which addresses get drawn as jurors and pick
        // one of them to skip reveal — should forfeit full stake; rest of payouts work.
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 50 ether, 1); // all YES, risked 20
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, _randomnessMetadata(), AUDIT_HASH);

        address[] memory jury = market.getJury();
        address skipper = jury[0];

        // Reveal everyone except the chosen juror.
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == skipper) continue;
            _reveal(vs[i]);
        }

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // 2 yes jurors, 0 no jurors → outcome Yes.
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        // Slashed pool: skipper missed risked (20) + extra (50 - 20 = 30) = 50.
        // Fee 1% (PROTOCOL_FEE_PERCENT) = 0.5, distributable = 49.5.
        assertEq(market.treasuryAccrued(), 0.5 ether);
        assertEq(market.distributablePool(), 49.5 ether);
        assertEq(market.creatorAccrued(), 0); // only on Invalid path

        _withdrawAll(vs);

        assertEq(token.balanceOf(skipper), DEFAULT_BALANCE - 50 ether); // full stake gone
        // Each other yes-revealer: risked 20, totalYesRewardWeight = 19 * 20 = 380.
        //   bonus = 49.5e18 * 20 / 380 = 49.5e18 / 19 ≈ 2.6053e18 (with rounding dust).
        uint256 distrib = 49.5 ether;
        uint256 expectedBonus = (distrib * 20) / 380;
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == skipper) continue;
            assertEq(token.balanceOf(vs[i].addr), DEFAULT_BALANCE + expectedBonus);
        }

        market.withdrawTreasury();
        // Residual dust from integer division stays in the market until forceSweepDust.
        vm.warp(block.timestamp + market.DUST_SWEEP_GRACE() + 1);
        market.forceSweepDust(type(uint32).max);
        market.withdrawTreasury();
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_NonRevealingJurorPenaltyBypassesConvictionAtLowConv() public {
        // 10% conviction juror who skips reveal still loses full stake.
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 100 ether, 1); // 10% conv → risked 10
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, _randomnessMetadata(), AUDIT_HASH);

        address skipper = market.getJury()[0];
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == skipper) continue;
            _reveal(vs[i]);
        }

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        // Slashed: skipper missed risked 10 + extra (100 - 10 = 90) = 100.
        // Fee 1% (PROTOCOL_FEE_PERCENT) = 1, distributable = 99.
        assertEq(market.treasuryAccrued(), 1 ether);
        assertEq(market.distributablePool(), 99 ether);

        _withdrawAll(vs);
        assertEq(token.balanceOf(skipper), DEFAULT_BALANCE - 100 ether); // full stake gone
    }

    function test_InvalidWhenTooFewJurorsRevealRoutesPenaltyToCreator() public {
        // targetJurySize=3, minRevealedJurors=2. Only one juror reveals → Invalid; the other
        // two jurors lose full stakes, accruing to the CREATOR (not treasury).
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 80 ether, 1); // 100% conv → risked 80
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, _randomnessMetadata(), AUDIT_HASH);

        address[] memory jury = market.getJury();
        // Reveal only jury[0] among jurors. Reveal all non-jurors normally.
        for (uint256 i = 0; i < vs.length; i++) {
            bool isJuror = vs[i].addr == jury[0] || vs[i].addr == jury[1] || vs[i].addr == jury[2];
            if (!isJuror) {
                _reveal(vs[i]);
                continue;
            }
            if (vs[i].addr == jury[0]) _reveal(vs[i]);
        }

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        vm.expectEmit(false, false, false, true, address(market));
        emit Resolved(TruthMarket.Outcome.Invalid, 0, 0, 0, 160 ether, 0);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        // Two non-revealing jurors × full 80-stake penalty = 160.
        assertEq(market.creatorAccrued(), 160 ether);
        // No treasury accrual on Invalid.
        assertEq(market.treasuryAccrued(), 0);

        _withdrawAll(vs);

        // Non-revealing jurors get 0; everyone else (revealing jurors and non-jurors)
        // gets full refund.
        uint256 zeroCount;
        for (uint256 i = 0; i < vs.length; i++) {
            uint256 bal = token.balanceOf(vs[i].addr);
            if (bal == DEFAULT_BALANCE - 80 ether) {
                zeroCount++;
            } else {
                assertEq(bal, DEFAULT_BALANCE);
            }
        }
        assertEq(zeroCount, 2);

        // Creator pulls; nothing left in the contract (no fee accrues on Invalid).
        market.withdrawCreator();
        assertEq(token.balanceOf(creator), 160 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    // ---------- Constructor guard tests ----------

    function test_RevertsConstructorOnEvenTargetJurySize() public {
        _expectNewMarketRevert(TruthMarket.BadParams.selector, _initParams(2, 14, 1));
    }

    function test_RevertsConstructorWhenJuryExceedsMax() public {
        _expectNewMarketRevert(TruthMarket.BadParams.selector, _initParams(101, 700, 50));
    }

    function test_RevertsConstructorWhenJuryExceedsMaxTargetJurySizePercentOfMinCommits() public {
        // targetJurySize=3 needs minCommits >= 20. Below that should revert.
        _expectNewMarketRevert(TruthMarket.BadParams.selector, _initParams(3, 19, 2));
    }

    function test_RevertsConstructorWhenMinRevealedJurorsZero() public {
        _expectNewMarketRevert(TruthMarket.BadParams.selector, _initParams(1, 7, 0));
    }

    function test_RevertsConstructorWhenMinRevealedJurorsExceedsTargetJurySize() public {
        _expectNewMarketRevert(TruthMarket.BadParams.selector, _initParams(3, 20, 4));
    }

    function test_RevertsConstructorOnZeroCreator() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creator = address(0);
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RevertsConstructorOnZeroStakeToken() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.stakeToken = IERC20(address(0));
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RevertsConstructorOnEmptyRulesReference() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.swarmReference = bytes("");
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RevertsConstructorWhenRulesReferenceTooLong() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.swarmReference = bytes(_stringOfLength(MAX_SWARM_REFERENCE_BYTES + 1));
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RevertsConstructorWhenMinStakeZero() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.minStake = 0;
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RevertsConstructorOnTooLongPeriod() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.votingPeriod = MAX_PERIOD + 1;
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    // ---------- Behavior guard tests ----------

    function test_RevertsCommitWithZeroCommitHash() public {
        market = _deployMarket(1, 7, 1);
        address voter = makeAddr("zeroHashVoter");
        token.transfer(voter, 10 ether);

        vm.startPrank(voter);
        token.approve(address(market), 10 ether);
        vm.expectRevert(TruthMarket.BadParams.selector);
        market.commitVote(bytes32(0), 10 ether);
        vm.stopPrank();
    }

    function test_RevertsCommitWhenRiskedStakeRoundsToZero() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.minStake = 1;
        market = _newMarket(p);

        address voter = makeAddr("roundsToZeroVoter");
        token.transfer(voter, 1);
        bytes32 hash = market.commitHashOf(1, "tiny", voter);

        vm.startPrank(voter);
        token.approve(address(market), 1);
        vm.expectRevert(TruthMarket.BadParams.selector);
        market.commitVote(hash, 1);
        vm.stopPrank();
    }

    function test_RevertsCommitAfterVotingDeadline() public {
        market = _deployMarket(1, 7, 1);
        address voter = makeAddr("lateVoter");
        token.transfer(voter, 10 ether);
        bytes32 hash = market.commitHashOf(1, "late", voter);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.startPrank(voter);
        token.approve(address(market), 10 ether);
        vm.expectRevert(TruthMarket.DeadlinePassed.selector);
        market.commitVote(hash, 10 ether);
        vm.stopPrank();
    }

    function test_RevertsCommitHashOfInvalidVote() public {
        market = _deployMarket(1, 7, 1);
        vm.expectRevert(TruthMarket.InvalidReveal.selector);
        market.commitHashOf(3, "nonce", makeAddr("badVote"));
    }

    function test_RevertsCommitJuryWhenBelowMinCommits() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(3, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.InsufficientCommits.selector);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
    }

    function test_RevertsCommitJuryWithoutRandomnessIpfsAddress() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.BadParams.selector);
        TruthMarket.RandomnessMetadata memory metadata = _randomnessMetadata();
        metadata.ipfsAddress = bytes("");
        market.commitJury(123, metadata, AUDIT_HASH);
    }

    function test_RevertsCommitJuryWhenRandomnessIpfsAddressTooLong() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        bytes memory tooLong = bytes(_stringOfLength(market.MAX_RANDOMNESS_IPFS_ADDRESS_BYTES() + 1));

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.BadParams.selector);
        TruthMarket.RandomnessMetadata memory metadata = _randomnessMetadata();
        metadata.ipfsAddress = tooLong;
        market.commitJury(123, metadata, AUDIT_HASH);
    }

    function test_RevertsCommitJuryBeforeVotingDeadline() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.DeadlineNotPassed.selector);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
    }

    function test_RevertsCommitJuryAtCommitDeadline() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.DeadlinePassed.selector);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
    }

    function test_RevertsCommitJuryFromUnauthorizedCaller() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(makeAddr("notJuryCommitter"));
        vm.expectRevert(TruthMarket.NotAuthorized.selector);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
    }

    function test_RevertsCommitJuryWithZeroRandomness() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.BadParams.selector);
        market.commitJury(0, _randomnessMetadata(), AUDIT_HASH);
    }

    function test_RevertsCommitJuryWithoutRandomnessTimestamp() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        TruthMarket.RandomnessMetadata memory metadata = _randomnessMetadata();
        metadata.timestamp = 0;

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.BadParams.selector);
        market.commitJury(123, metadata, AUDIT_HASH);
    }

    function test_RevertsCommitJuryWithoutAuditHash() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.BadParams.selector);
        market.commitJury(123, _randomnessMetadata(), bytes32(0));
    }

    function test_RevertsCommitBelowMinStake() public {
        market = _deployMarket(1, 7, 1);
        address a = makeAddr("smallStaker");
        token.transfer(a, 10 ether);

        vm.startPrank(a);
        token.approve(address(market), 0.5 ether);
        bytes32 hash = market.commitHashOf(1, "n", a);
        vm.expectRevert(TruthMarket.StakeBelowMin.selector);
        market.commitVote(hash, 0.5 ether);
        vm.stopPrank();
    }

    function test_RevertsSecondCommitFromSameWallet() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(1, 10 ether, 1);
        _commit(vs[0]);

        bytes32 hash2 = market.commitHashOf(2, "other", vs[0].addr);
        vm.startPrank(vs[0].addr);
        token.approve(address(market), 10 ether);
        vm.expectRevert(TruthMarket.AlreadyCommitted.selector);
        market.commitVote(hash2, 10 ether);
        vm.stopPrank();
    }

    function test_RevealRequiresMatchingVoter() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        // Voter[1] tries to reveal with voter[0]'s nonce/vote — fails because the hash
        // is bound to msg.sender.
        vm.prank(vs[1].addr);
        vm.expectRevert(TruthMarket.InvalidReveal.selector);
        market.revealVote(vs[0].vote, vs[0].nonce);
    }

    function test_RevealRejectsInvalidVoteValue() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.InvalidReveal.selector);
        market.revealVote(3, vs[0].nonce);
    }

    function test_RevealRejectsUnknownCommitter() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        vm.prank(makeAddr("unknownReveal"));
        vm.expectRevert(TruthMarket.CommitNotFound.selector);
        market.revealVote(1, "unknown");
    }

    function test_RevealRejectsSecondReveal() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        _reveal(vs[0]);
        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.AlreadyRevealed.selector);
        market.revealVote(vs[0].vote, vs[0].nonce);
    }

    function test_RevealRejectsAfterRevealDeadline() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.DeadlinePassed.selector);
        market.revealVote(vs[0].vote, vs[0].nonce);
    }

    function test_ResolveRejectsBeforeJuryCommitDeadline() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.expectRevert(TruthMarket.DeadlineNotPassed.selector);
        market.resolve();
    }

    function test_ResolveRejectsBeforeRevealDeadline() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
        _revealAll(vs);

        vm.expectRevert(TruthMarket.DeadlineNotPassed.selector);
        market.resolve();
    }

    function test_ResolveRejectsAfterAlreadyResolved() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        vm.expectRevert(TruthMarket.WrongPhase.selector);
        market.resolve();
    }

    function test_WithdrawRejectsBeforeResolved() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.WrongPhase.selector);
        market.withdraw();
    }

    function test_WithdrawRejectsUnknownCommitter() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        vm.prank(makeAddr("unknownWithdraw"));
        vm.expectRevert(TruthMarket.CommitNotFound.selector);
        market.withdraw();
    }

    function test_WithdrawRejectsSecondWithdrawal() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        vm.startPrank(vs[0].addr);
        market.withdraw();
        vm.expectRevert(TruthMarket.NothingToWithdraw.selector);
        market.withdraw();
        vm.stopPrank();
    }

    function test_ForceSweepDustRejectsBeforeResolved() public {
        market = _deployMarket(1, 7, 1);
        vm.expectRevert(TruthMarket.WrongPhase.selector);
        market.forceSweepDust(1);
    }

    function test_ForceSweepDustRejectsZeroIterations() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();
        vm.warp(block.timestamp + REVEAL_PERIOD + market.DUST_SWEEP_GRACE() + 1);

        vm.expectRevert(TruthMarket.BadParams.selector);
        market.forceSweepDust(0);
    }

    // ---------- Claim reference tests ----------

    function test_SwarmReferenceStoredOnChain() public {
        market = _deployMarket(1, 7, 1);
        assertEq(market.swarmReference(), SWARM_REFERENCE);
        TruthMarket.Config memory cfg = market.getConfig();
        assertEq(cfg.swarmReference, SWARM_REFERENCE);
        assertEq(cfg.maxCommits, 0);
        assertEq(market.MAX_SWARM_REFERENCE_BYTES(), MAX_SWARM_REFERENCE_BYTES);
    }

    // ---------- Nonce-leak revocation tests ----------

    function test_RevokeStakeSplitsHalfToClaimerHalfToPool() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 80 ether, 1);
        _commitAll(vs);

        // Attacker (non-voter) learned vs[0]'s nonce and revokes their stake.
        address attacker = makeAddr("attacker");
        uint256 attackerBefore = token.balanceOf(attacker);

        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);

        // Claimer takes half (40 ether); the other half waits in revokedSlashAccrued.
        assertEq(token.balanceOf(attacker), attackerBefore + 40 ether);
        assertEq(market.revokedSlashAccrued(), 40 ether);
        // Aggregates drop by the revoked voter's stake / risked. Risked = 20% of 80 = 16.
        assertEq(market.totalCommittedStake(), 6 * 80 ether);
        assertEq(market.totalRiskedStake(), 6 * 16 ether);
    }

    function test_RevokeStakeAccrualJoinsDistributablePoolOnYes() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(8, 80 ether, 1); // 8 voters so 1 revoke still leaves >= 7
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
        assertEq(market.revokedSlashAccrued(), 40 ether);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, _randomnessMetadata(), AUDIT_HASH);

        // Reveal everyone except the revoked voter (they cannot reveal).
        for (uint256 i = 1; i < vs.length; i++) {
            _reveal(vs[i]);
        }

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // Outcome Yes (only yes votes revealed). Slashed pool comes entirely from the
        // revoked half (no losers, no missed reveals among remaining voters).
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        // slashed = revokedHalf 40, fee 1% (PROTOCOL_FEE_PERCENT) = 0.4, distributable = 39.6.
        assertEq(market.treasuryAccrued(), 0.4 ether);
        assertEq(market.distributablePool(), 39.6 ether);
        assertEq(market.revokedSlashAccrued(), 0);
    }

    function test_RevokeStakeAccrualGoesToCreatorOnInvalid() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 80 ether, 1);
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);

        // Skip jury commit so the market resolves Invalid via timeout.
        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        vm.expectEmit(false, false, false, true, address(market));
        emit Resolved(TruthMarket.Outcome.Invalid, 0, 0, 0, 40 ether, 0);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        assertEq(market.creatorAccrued(), 40 ether);
        assertEq(market.revokedSlashAccrued(), 0);

        market.withdrawCreator();
        assertEq(token.balanceOf(creator), 40 ether);
    }

    function test_RevokeStakeRequiresValidNonce() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 80 ether, 1);
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(TruthMarket.InvalidReveal.selector);
        market.revokeStake(vs[0].addr, vs[0].vote, bytes32("wrong-nonce"));
    }

    function test_RevokeStakeRevertsAfterVotingDeadline() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 50 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(TruthMarket.DeadlinePassed.selector);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
    }

    function test_RevokeStakeRevertsInRevealPhase() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 50 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        // WrongPhase fires first (phase has advanced to Reveal).
        vm.expectRevert(TruthMarket.WrongPhase.selector);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
    }

    function test_RevokeStakeBlocksSelfCall() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 50 ether, 1);
        _commitAll(vs);

        // Voter cannot revoke their own commit (would let them bypass slashing).
        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.NotAuthorized.selector);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
    }

    function test_RevokedCommitCannotReveal() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(8, 50 ether, 1);
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);

        // Revoked voter tries to reveal — fails.
        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.CommitRevoked.selector);
        market.revealVote(vs[0].vote, vs[0].nonce);
    }

    function test_RevokedCommitCannotWithdraw() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(8, 50 ether, 1);
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);

        // Run the rest of the lifecycle.
        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
        // Reveal everyone except the revoked voter.
        for (uint256 i = 1; i < vs.length; i++) {
            _reveal(vs[i]);
        }
        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        vm.prank(vs[0].addr);
        vm.expectRevert(TruthMarket.NothingToWithdraw.selector);
        market.withdraw();
    }

    function test_RevokedVoterCannotBeDrawnAsJuror() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(8, 50 ether, 1);
        _commitAll(vs);

        // Revoke vs[0] before jury draw.
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, _randomnessMetadata(), AUDIT_HASH);

        address[] memory jury = market.getJury();
        // Drawn jurors must come from the active (non-revoked) pool.
        for (uint256 i = 0; i < jury.length; i++) {
            assertTrue(jury[i] != vs[0].addr);
        }
    }

    function test_JuryDrawHandlesLargeCommitterPool() public {
        // Stress the virtual sampler with a wide pool. Memory is O(targetJurySize) so this
        // shouldn't OOG even though `n` is large.
        market = _deployMarket(7, 47, 4); // targetJurySize=7 -> minCommits>=47 (MAX_TARGET_JURY_SIZE_PERCENT)
        uint256 n = 200;
        V[] memory vs = _makeVoters(n, 5 ether, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xCAFE, _randomnessMetadata(), AUDIT_HASH);

        address[] memory jury = market.getJury();
        assertEq(jury.length, 7);
        // All distinct.
        for (uint256 i = 0; i < jury.length; i++) {
            for (uint256 j = i + 1; j < jury.length; j++) {
                assertTrue(jury[i] != jury[j]);
            }
        }
    }

    function test_ForceSweepDustRevertsBeforeGrace() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 80 ether, 1);
        _commitAll(vs);
        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, _randomnessMetadata(), AUDIT_HASH);
        _revealAll(vs);
        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // Right after resolve — grace not yet elapsed.
        vm.expectRevert(TruthMarket.DeadlineNotPassed.selector);
        market.forceSweepDust(type(uint32).max);
    }

    function test_ForceSweepDustPreservesUnclaimedVoterRefunds() public {
        // Voters lose their right to claim only by inaction; force-sweep must not raid
        // an unclaimed payout.
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 100 ether, 1); // all YES
        _commitAll(vs);
        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, _randomnessMetadata(), AUDIT_HASH);

        // One juror skips reveal. Outcome will be Yes (no juror went NO).
        address skipper = market.getJury()[0];
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == skipper) continue;
            _reveal(vs[i]);
        }
        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // Skip past the dust-sweep grace.
        vm.warp(block.timestamp + market.DUST_SWEEP_GRACE() + 1);

        uint256 balanceBefore = token.balanceOf(address(market));
        market.forceSweepDust(type(uint32).max);

        // forceSweepDust only updates accruals — it doesn't transfer tokens. The
        // contract's stake-token balance is unchanged after the sweep; what moves
        // are the bookkeeping numbers (treasuryAccrued may grow by up to the
        // rounding-dust upper bound).
        assertEq(token.balanceOf(address(market)), balanceBefore);

        // Now have everyone withdraw. They all succeed (their balances were preserved).
        _withdrawAll(vs);
        // Treasury can pull whatever was accrued.
        market.withdrawTreasury();
        // Contract reaches 0 (nothing stuck — voter inactivity + force sweep covers everything).
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_RevertsConstructorOnTooShortPeriod() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.votingPeriod = 30; // 30 seconds, below MIN_PERIOD (60)
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RevokeStakeSplitsTinyStakeRoundsToProtocolFavor() public {
        // Smallest-viable stake: stake = 5 wei → riskedStake = 1 wei (5 * 20/100).
        // On revoke, claimerCut = 5 / 2 = 2 wei, pooledCut = 3 wei (ceiling half goes
        // to the pool, biasing rounding in the protocol's favour).
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.minStake = 5; // smallest stake whose 20% risked is non-zero
        market = _newMarket(p);
        V[] memory vs = _makeVoters(7, 5, 1); // stake = 5 wei each
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        uint256 before_ = token.balanceOf(attacker);
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
        assertEq(token.balanceOf(attacker), before_ + 2);
        assertEq(market.revokedSlashAccrued(), 3);
    }

    function test_ResolveHandlesSlashedPoolAboveUint96() public {
        market = _deployMarket(1, 7, 1);
        // Risked stake is fixed at 20% of stake. To push the slashed pool above uint96.max
        // with 6 non-revealers contributing risked stake, each voter must stake the full
        // uint96.max. Total risked across non-revealers = 6 * (uint96.max / 5) > uint96.max.
        uint96 hugeStake = type(uint96).max;
        V[] memory vs = new V[](7);
        for (uint256 i = 0; i < vs.length; i++) {
            address a = address(uint160(uint256(keccak256(abi.encode("hugeVoter", i)))));
            token.mint(a, hugeStake);
            vs[i] = V({ addr: a, nonce: keccak256(abi.encode("hugeNonce", i)), stake: hugeStake, vote: 1 });
        }
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, _randomnessMetadata(), AUDIT_HASH);

        address juror = market.getJury()[0];
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == juror) {
                _reveal(vs[i]);
                break;
            }
        }

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        assertTrue(market.distributablePool() > type(uint96).max);
        assertTrue(market.totalRiskedStake() > type(uint96).max);
    }

    function test_ForceSweepDustPaginates() public {
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 100 ether, 1); // all YES
        _commitAll(vs);
        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, _randomnessMetadata(), AUDIT_HASH);
        _revealAll(vs);
        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();
        _withdrawAll(vs);

        vm.warp(block.timestamp + market.DUST_SWEEP_GRACE() + 1);

        assertEq(market.MAX_DUST_SWEEP_ITERS(), 200);
        // Process in two batches: 7, then everything remaining.
        market.forceSweepDust(7);
        assertEq(market.sweepCursor(), 7);
        market.forceSweepDust(type(uint32).max);
        assertEq(market.sweepCursor(), 20);
        // Re-callable — restarts and finalises again.
        market.forceSweepDust(type(uint32).max);
    }

    function test_DoubleRevokeReverts() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 50 ether, 1);
        _commitAll(vs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);

        vm.prank(attacker);
        vm.expectRevert(TruthMarket.CommitRevoked.selector);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
    }

    // ---------- Registry tests ----------

    event MarketRegistered(address indexed market, address indexed creator, uint256 indexed index, uint64 registeredAt);

    function test_RevertsConstructorOnZeroRegistry() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(0));
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_RegistersOnConstruction() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        TruthMarket m = _newMarket(p);

        assertTrue(fresh.isRegistered(address(m)));
        assertEq(fresh.markets(0), address(m));
        assertEq(fresh.totalMarkets(), 1);
    }

    function test_RegistersMultipleMarkets() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        TruthMarket m1 = _newMarket(p);
        TruthMarket m2 = _newMarket(p);

        assertEq(fresh.totalMarkets(), 2);
        assertEq(fresh.markets(0), address(m1));
        assertEq(fresh.markets(1), address(m2));
        address[] memory page = fresh.marketsPaginated(0, 100);
        assertEq(page.length, 2);
        assertEq(page[0], address(m1));
        assertEq(page[1], address(m2));
    }

    function test_EmitsMarketRegistered() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));

        vm.expectEmit(true, true, true, true, address(fresh));
        emit MarketRegistered(predicted, creator, 0, uint64(block.timestamp));
        TruthMarket m = _newMarket(p);
        assertEq(address(m), predicted);
    }

    function test_RecordsMarketInfoOnRegistration() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        uint64 t = uint64(block.timestamp);
        TruthMarket m = _newMarket(p);

        (address infoCreator, uint64 registeredAt, uint32 index) = fresh.marketInfo(address(m));
        assertEq(infoCreator, creator);
        assertEq(registeredAt, t);
        assertEq(index, 0);
    }

    function test_LookupByCreator() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        TruthMarket m1 = _newMarket(p);
        TruthMarket m2 = _newMarket(p);

        // Different creator on a third deployment.
        address otherCreator = makeAddr("otherCreator");
        p.creator = otherCreator;
        TruthMarket m3 = _newMarket(p);

        address[] memory mine = fresh.marketsByCreatorPaginated(creator, 0, 100);
        assertEq(mine.length, 2);
        assertEq(mine[0], address(m1));
        assertEq(mine[1], address(m2));
        assertEq(fresh.countByCreator(creator), 2);

        address[] memory theirs = fresh.marketsByCreatorPaginated(otherCreator, 0, 100);
        assertEq(theirs.length, 1);
        assertEq(theirs[0], address(m3));
        assertEq(fresh.countByCreator(otherCreator), 1);

        assertEq(fresh.countByCreator(makeAddr("nobody")), 0);

        // Pagination clamps: offset past end and partial slice.
        assertEq(fresh.marketsByCreatorPaginated(creator, 5, 10).length, 0);
        address[] memory tail = fresh.marketsByCreatorPaginated(creator, 1, 100);
        assertEq(tail.length, 1);
        assertEq(tail[0], address(m2));

        // Auto-getter on the public mapping returns one element by index.
        assertEq(fresh.marketsByCreator(creator, 0), address(m1));
        assertEq(fresh.marketsByCreator(creator, 1), address(m2));
    }

    function test_MarketsPaginated() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        address[] memory deployed = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            deployed[i] = address(_newMarket(p));
        }

        // Full range.
        address[] memory page = fresh.marketsPaginated(0, 5);
        assertEq(page.length, 5);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(page[i], deployed[i]);
        }

        // Mid slice.
        page = fresh.marketsPaginated(1, 2);
        assertEq(page.length, 2);
        assertEq(page[0], deployed[1]);
        assertEq(page[1], deployed[2]);

        // Limit clamps to remaining.
        page = fresh.marketsPaginated(3, 100);
        assertEq(page.length, 2);
        assertEq(page[0], deployed[3]);
        assertEq(page[1], deployed[4]);

        // Offset past end returns empty.
        page = fresh.marketsPaginated(5, 10);
        assertEq(page.length, 0);

        // Zero limit returns empty.
        page = fresh.marketsPaginated(0, 0);
        assertEq(page.length, 0);
    }

    function test_RegisterRevertsOnZeroCreator() public {
        // Direct call into the registry simulating a buggy market that passed creator=0.
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        vm.expectRevert(TruthMarketRegistry.ZeroCreator.selector);
        fresh.register(address(0));
    }

    function test_RegisterRevertsOnDoubleRegister() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        fresh.register(creator);
        vm.expectRevert(TruthMarketRegistry.AlreadyRegistered.selector);
        fresh.register(creator);
    }

    function test_TotalMarketsCacheStaysInSyncWithArrayLength() public {
        TruthMarketRegistry fresh = new TruthMarketRegistry();
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.registry = ITruthMarketRegistry(address(fresh));

        assertEq(fresh.totalMarkets(), 0);
        for (uint256 i = 0; i < 4; i++) {
            _newMarket(p);
            assertEq(fresh.totalMarkets(), i + 1);
        }
        // Cached counter equals the array length and the per-creator count.
        assertEq(fresh.totalMarkets(), 4);
        assertEq(fresh.countByCreator(creator), 4);
    }

    // ---------- Max-commits cap tests ----------

    function test_RevertsConstructorWhenMaxCommitsBelowMinCommits() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.maxCommits = 6; // below minCommits=7
        _expectNewMarketRevert(TruthMarket.BadParams.selector, p);
    }

    function test_AcceptsMaxCommitsEqualToMinCommits() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.maxCommits = 7;
        TruthMarket m = _newMarket(p);
        assertEq(m.maxCommits(), 7);
        assertEq(m.getConfig().maxCommits, 7);
    }

    function test_AcceptsZeroMaxCommitsAsUncapped() public {
        // _initParams already sets maxCommits=0; commit a large number to confirm no cap.
        market = _deployMarket(1, 7, 1);
        assertEq(market.maxCommits(), 0);
        V[] memory vs = _makeVoters(20, 10 ether, 1);
        _commitAll(vs);
        assertEq(market.commitCount(), 20);
    }

    function test_RevertsCommitVoteWhenMarketFull() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.maxCommits = 7;
        market = _newMarket(p);

        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);
        assertEq(market.commitCount(), 7);

        // 8th voter is over the cap.
        V[] memory extra = _makeVoters(8, 10 ether, 1);
        bytes32 hash = market.commitHashOf(extra[7].vote, extra[7].nonce, extra[7].addr);
        vm.startPrank(extra[7].addr);
        token.approve(address(market), extra[7].stake);
        vm.expectRevert(TruthMarket.MarketFull.selector);
        market.commitVote(hash, extra[7].stake);
        vm.stopPrank();
    }

    function test_RevokeStakeDoesNotFreeMaxCommitSlot() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.maxCommits = 7;
        market = _newMarket(p);

        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);
        // commitCount is the active count and decrements on revoke; revokedCount increments.
        // Together they equal the "ever committed" total enforced by the cap.
        assertEq(market.commitCount(), 7);
        assertEq(market.revokedCount(), 0);

        // Revoke voter 0 — frees an active slot but not a cap slot.
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        market.revokeStake(vs[0].addr, vs[0].vote, vs[0].nonce);
        assertEq(market.commitCount(), 6);
        assertEq(market.revokedCount(), 1);

        // A fresh voter still cannot commit because the cap counts revoked commits too.
        V[] memory extra = _makeVoters(8, 10 ether, 1);
        bytes32 hash = market.commitHashOf(extra[7].vote, extra[7].nonce, extra[7].addr);
        vm.startPrank(extra[7].addr);
        token.approve(address(market), extra[7].stake);
        vm.expectRevert(TruthMarket.MarketFull.selector);
        market.commitVote(hash, extra[7].stake);
        vm.stopPrank();
    }

    // ---------- Creator bond ----------

    function test_BondZeroSkipsGate() public {
        market = _deployMarket(1, 7, 1);
        assertEq(market.creatorBond(), 0);
        assertTrue(market.bondPosted()); // trivially true when bond is 0
        // Voters can commit immediately.
        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);
        assertEq(market.commitCount(), 7);
    }

    function test_BondPositiveBlocksCommitUntilPosted() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creatorBond = 5 ether;
        market = _newMarket(p);
        assertFalse(market.bondPosted());

        // Voter try to commit — reverts.
        V[] memory vs = _makeVoters(1, 10 ether, 1);
        bytes32 hash = market.commitHashOf(vs[0].vote, vs[0].nonce, vs[0].addr);
        vm.startPrank(vs[0].addr);
        token.approve(address(market), vs[0].stake);
        vm.expectRevert(TruthMarket.BondNotPosted.selector);
        market.commitVote(hash, vs[0].stake);
        vm.stopPrank();
    }

    function test_PostBondGateUnlocksCommit() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creatorBond = 5 ether;
        market = _newMarket(p);

        token.mint(creator, 5 ether);
        vm.startPrank(creator);
        token.approve(address(market), 5 ether);
        market.postBond();
        vm.stopPrank();

        assertTrue(market.bondPosted());
        assertEq(token.balanceOf(address(market)), 5 ether);

        V[] memory vs = _makeVoters(7, 10 ether, 1);
        _commitAll(vs);
        assertEq(market.commitCount(), 7);
    }

    function test_PostBondRejectsNonCreator() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creatorBond = 5 ether;
        market = _newMarket(p);
        vm.expectRevert(TruthMarket.NotAuthorized.selector);
        market.postBond();
    }

    function test_PostBondRejectsDouble() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creatorBond = 5 ether;
        market = _newMarket(p);
        token.mint(creator, 10 ether);
        vm.startPrank(creator);
        token.approve(address(market), 10 ether);
        market.postBond();
        vm.expectRevert(TruthMarket.BondAlreadyPosted.selector);
        market.postBond();
        vm.stopPrank();
    }

    function test_PostBondRejectsWhenNotConfigured() public {
        market = _deployMarket(1, 7, 1);
        vm.startPrank(creator);
        vm.expectRevert(TruthMarket.NoBondConfigured.selector);
        market.postBond();
        vm.stopPrank();
    }

    function test_BondJoinsDistributablePoolOnYes() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creatorBond = 10 ether;
        market = _newMarket(p);

        token.mint(creator, 10 ether);
        vm.startPrank(creator);
        token.approve(address(market), 10 ether);
        market.postBond();
        vm.stopPrank();

        V[] memory vs = _makeVoters(7, 10 ether, 1); // all YES, risked 2 each
        _commitAll(vs);
        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, _randomnessMetadata(), AUDIT_HASH);
        for (uint256 i = 0; i < vs.length; i++) {
            _reveal(vs[i]);
        }
        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // Outcome Yes — no losers among voters, so slashed pool would be 0 absent the bond.
        // distributablePool gets the full bond.
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        assertEq(market.distributablePool(), 10 ether);
    }

    function test_BondRefundsOnInvalidViaTimeout() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creatorBond = 7 ether;
        market = _newMarket(p);

        token.mint(creator, 7 ether);
        vm.startPrank(creator);
        token.approve(address(market), 7 ether);
        market.postBond();
        vm.stopPrank();

        // Skip everything — admin never commits jury, market times out to Invalid.
        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        // Bond refunded to creator via accrual.
        assertEq(market.creatorAccrued(), 7 ether);

        market.withdrawCreator();
        assertEq(token.balanceOf(creator), 7 ether);
    }
}
