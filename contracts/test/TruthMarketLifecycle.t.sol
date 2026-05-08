// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { ExampleToken } from "../src/ExampleToken.sol";

contract TruthMarketLifecycleTest is Test {
    TruthMarket internal market;
    ExampleToken internal token;

    address internal treasury = makeAddr("treasury");
    address internal admin = makeAddr("admin");
    address internal juryCommitter = makeAddr("juryCommitter");
    address internal creator = makeAddr("creator");

    bytes internal constant IPFS_HASH = bytes("ipfs://Qm-claim-doc");
    bytes32 internal constant AUDIT_HASH = keccak256("swarm://ctrng-output");
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint96 internal constant DEFAULT_BALANCE = 1_000 ether;

    struct V {
        address addr;
        bytes32 nonce;
        uint96 stake;
        uint16 conv;
        uint8 vote;
    }

    function setUp() public {
        token = new ExampleToken("Truth Stake", "TRUTH", 10_000_000 ether, 10_000_000 ether, address(this));
    }

    // ---------- Deployment helpers ----------

    function _deployMarket(uint32 jurySize, uint32 minCommits, uint32 minRevealedJurors)
        internal
        returns (TruthMarket m)
    {
        m = new TruthMarket(_initParams(jurySize, minCommits, minRevealedJurors));
    }

    function _initParams(uint32 jurySize, uint32 minCommits, uint32 minRevealedJurors)
        internal
        view
        returns (TruthMarket.InitParams memory)
    {
        return TruthMarket.InitParams({
            stakeToken: IERC20(address(token)),
            treasury: treasury,
            admin: admin,
            juryCommitter: juryCommitter,
            creator: creator,
            ipfsHash: IPFS_HASH,
            votingPeriod: VOTING_PERIOD,
            adminTimeout: ADMIN_TIMEOUT,
            revealPeriod: REVEAL_PERIOD,
            protocolFeeBps: FEE_BPS,
            minStake: MIN_STAKE,
            jurySize: jurySize,
            minCommits: minCommits,
            minRevealedJurors: minRevealedJurors
        });
    }

    // ---------- Voter helpers ----------

    function _makeVoters(uint256 n, uint96 stake, uint16 conv, uint8 vote) internal returns (V[] memory vs) {
        vs = new V[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = address(uint160(uint256(keccak256(abi.encode("voter", i)))));
            vm.deal(a, 1 ether); // gas only; not strictly needed in test, but harmless
            assertTrue(token.transfer(a, DEFAULT_BALANCE));
            vs[i] = V({
                addr: a,
                nonce: keccak256(abi.encode("nonce", i)),
                stake: stake,
                conv: conv,
                vote: vote
            });
        }
    }

    function _commit(V memory v) internal {
        bytes32 hash = market.commitHashOf(v.vote, v.nonce, v.addr);
        vm.startPrank(v.addr);
        token.approve(address(market), v.stake);
        market.commitVote(hash, v.stake, v.conv);
        vm.stopPrank();
    }

    function _commitAll(V[] memory vs) internal {
        for (uint256 i = 0; i < vs.length; i++) _commit(vs[i]);
    }

    function _reveal(V memory v) internal {
        vm.prank(v.addr);
        market.revealVote(v.vote, v.nonce);
    }

    function _revealAll(V[] memory vs) internal {
        for (uint256 i = 0; i < vs.length; i++) _reveal(vs[i]);
    }

    function _withdrawAll(V[] memory vs) internal {
        for (uint256 i = 0; i < vs.length; i++) {
            vm.prank(vs[i].addr);
            market.withdraw();
        }
    }

    // ---------- Tests ----------

    function test_FullLifecycleSingleJurorYesOutcome() public {
        // jurySize=1 with the 15% rule needs minCommits >= 7. All commit + reveal yes.
        market = _deployMarket(1, 7, 1);

        V[] memory vs = _makeVoters(7, 50 ether, 4_000, 1); // all YES, 40% conv → risked 20
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, AUDIT_HASH);
        assertEq(market.getJury().length, 1);

        _revealAll(vs);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // No losers, no missed reveals → slashed pool empty. Outcome Yes.
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        assertEq(market.distributablePool(), 0);
        assertEq(market.treasuryAccrued(), 0);
        assertEq(market.creatorAccrued(), 0);

        _withdrawAll(vs);
        for (uint256 i = 0; i < vs.length; i++) {
            assertEq(token.balanceOf(vs[i].addr), DEFAULT_BALANCE);
        }
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_LifecycleSlashesLosersAndPaysWinners() public {
        // jurySize=3 needs minCommits >= 20. Mix yes/no voters with different convictions.
        market = _deployMarket(3, 20, 2);

        V[] memory yes = _makeVoters(15, 60 ether, 5_000, 1); // risked 30 each
        // 5 NO voters via separate make so addresses don't clash
        V[] memory no = new V[](5);
        for (uint256 i = 0; i < 5; i++) {
            address a = address(uint160(uint256(keccak256(abi.encode("noVoter", i)))));
            assertTrue(token.transfer(a, DEFAULT_BALANCE));
            no[i] = V({
                addr: a,
                nonce: keccak256(abi.encode("noNonce", i)),
                stake: 80 ether,
                conv: 10_000,
                vote: 2
            });
        }

        _commitAll(yes);
        _commitAll(no);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, AUDIT_HASH);

        _revealAll(yes);
        _revealAll(no);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        TruthMarket.Outcome outcome = market.outcome();
        // With 15 YES and 5 NO committers and a random 3-juror draw, both outcomes are
        // possible. Either way, no juror missed reveal so creator accrues nothing.
        assertEq(market.creatorAccrued(), 0);
        assertTrue(outcome == TruthMarket.Outcome.Yes || outcome == TruthMarket.Outcome.No);

        // slashed = losers' risked stake. fee = 5%. Whoever lost forfeits their risked.
        if (outcome == TruthMarket.Outcome.Yes) {
            // NO side lost: 5 * 80 risked = 400.
            assertEq(market.distributablePool(), 380 ether);
            assertEq(market.treasuryAccrued(), 20 ether);
        } else {
            // YES side lost: 15 * 30 risked = 450.
            assertEq(market.distributablePool(), 427.5 ether);
            assertEq(market.treasuryAccrued(), 22.5 ether);
        }

        _withdrawAll(yes);
        _withdrawAll(no);
        market.withdrawTreasury();

        // Conservation: contract balance is zero (withdrawTreasury sweeps any dust).
        assertEq(token.balanceOf(address(market)), 0);
        assertEq(market.creatorAccrued(), 0);
    }

    function test_ResolvesInvalidWhenJuryCommitDeadlineMissed() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 5_000, 1);
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
        // jurySize=3, minCommits=20. Find which addresses get drawn as jurors and pick
        // one of them to skip reveal — should forfeit full stake; rest of payouts work.
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 50 ether, 4_000, 1); // all YES, risked 20
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, AUDIT_HASH);

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
        // Fee 5% = 2.5, distributable = 47.5.
        assertEq(market.treasuryAccrued(), 2.5 ether);
        assertEq(market.distributablePool(), 47.5 ether);
        assertEq(market.creatorAccrued(), 0); // only on Invalid path

        _withdrawAll(vs);

        assertEq(token.balanceOf(skipper), DEFAULT_BALANCE - 50 ether); // full stake gone
        // Each other yes-revealer: risked 20, totalYesRewardWeight = 19 * 20 = 380.
        //   bonus = 47.5 * 20 / 380 = 2.5.
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == skipper) continue;
            assertEq(token.balanceOf(vs[i].addr), DEFAULT_BALANCE + 2.5 ether);
        }

        market.withdrawTreasury();
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_NonRevealingJurorPenaltyBypassesConvictionAtLowConv() public {
        // 10% conviction juror who skips reveal still loses full stake.
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 100 ether, 1_000, 1); // 10% conv → risked 10
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, AUDIT_HASH);

        address skipper = market.getJury()[0];
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].addr == skipper) continue;
            _reveal(vs[i]);
        }

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        // Slashed: skipper missed risked 10 + extra (100 - 10 = 90) = 100.
        // Fee 5%=5, distributable=95.
        assertEq(market.treasuryAccrued(), 5 ether);
        assertEq(market.distributablePool(), 95 ether);

        _withdrawAll(vs);
        assertEq(token.balanceOf(skipper), DEFAULT_BALANCE - 100 ether); // full stake gone
    }

    function test_InvalidWhenTooFewJurorsRevealRoutesPenaltyToCreator() public {
        // jurySize=3, minRevealedJurors=2. Only one juror reveals → Invalid; the other
        // two jurors lose full stakes, accruing to the CREATOR (not treasury).
        market = _deployMarket(3, 20, 2);
        V[] memory vs = _makeVoters(20, 80 ether, 10_000, 1); // 100% conv → risked 80
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, AUDIT_HASH);

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

    function test_RevertsConstructorOnEvenJurySize() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(2, 14, 1));
    }

    function test_RevertsConstructorWhenJuryExceedsMax() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(101, 700, 50));
    }

    function test_RevertsConstructorWhenJuryExceeds15PercentOfMinCommits() public {
        // jurySize=3 needs minCommits >= 20. Below that should revert.
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(3, 19, 2));
    }

    function test_RevertsConstructorWhenMinRevealedJurorsZero() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(1, 7, 0));
    }

    function test_RevertsConstructorWhenMinRevealedJurorsExceedsJurySize() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(3, 20, 4));
    }

    function test_RevertsConstructorOnZeroCreator() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.creator = address(0);
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(p);
    }

    function test_RevertsConstructorOnZeroAdmin() public {
        TruthMarket.InitParams memory p = _initParams(1, 7, 1);
        p.admin = address(0);
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(p);
    }

    // ---------- Behavior guard tests ----------

    function test_RevertsCommitJuryWhenBelowMinCommits() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(3, 10 ether, 5_000, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.InsufficientCommits.selector);
        market.commitJury(123, AUDIT_HASH);
    }

    function test_RevertsCommitBelowMinStake() public {
        market = _deployMarket(1, 7, 1);
        address a = makeAddr("smallStaker");
        token.transfer(a, 10 ether);

        vm.startPrank(a);
        token.approve(address(market), 0.5 ether);
        bytes32 hash = market.commitHashOf(1, "n", a);
        vm.expectRevert(TruthMarket.StakeBelowMin.selector);
        market.commitVote(hash, 0.5 ether, 10_000);
        vm.stopPrank();
    }

    function test_RevertsSecondCommitFromSameWallet() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(1, 10 ether, 10_000, 1);
        _commit(vs[0]);

        bytes32 hash2 = market.commitHashOf(2, "other", vs[0].addr);
        vm.startPrank(vs[0].addr);
        token.approve(address(market), 10 ether);
        vm.expectRevert(TruthMarket.AlreadyCommitted.selector);
        market.commitVote(hash2, 10 ether, 10_000);
        vm.stopPrank();
    }

    function test_RevealRequiresMatchingVoter() public {
        market = _deployMarket(1, 7, 1);
        V[] memory vs = _makeVoters(7, 10 ether, 5_000, 1);
        _commitAll(vs);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, AUDIT_HASH);

        // Voter[1] tries to reveal with voter[0]'s nonce/vote — fails because the hash
        // is bound to msg.sender.
        vm.prank(vs[1].addr);
        vm.expectRevert(TruthMarket.InvalidReveal.selector);
        market.revealVote(vs[0].vote, vs[0].nonce);
    }
}
