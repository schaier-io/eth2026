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
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    bytes32 internal constant IPFS_HASH = bytes32(uint256(0xabc));
    bytes32 internal constant AUDIT_HASH = keccak256("swarm://ctrng-output");
    bytes32 internal constant ALICE_NONCE = "alice";
    bytes32 internal constant BOB_NONCE = "bob";
    bytes32 internal constant CAROL_NONCE = "carol";
    bytes32 internal constant DAVE_NONCE = "dave";
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;
    uint32 internal constant JURY_SIZE = 4;
    uint32 internal constant MIN_COMMITS = 2;
    uint32 internal constant MIN_REVEALED_JURORS = 2;

    function setUp() public {
        token = new ExampleToken("Truth Stake", "TRUTH", 10_000 ether, 10_000 ether, address(this));
        market = new TruthMarket(
            IERC20(address(token)),
            treasury,
            IPFS_HASH,
            VOTING_PERIOD,
            ADMIN_TIMEOUT,
            REVEAL_PERIOD,
            FEE_BPS,
            JURY_SIZE,
            MIN_COMMITS,
            MIN_REVEALED_JURORS
        );

        assertTrue(token.transfer(alice, 1000 ether));
        assertTrue(token.transfer(bob, 1000 ether));
        assertTrue(token.transfer(carol, 1000 ether));
        assertTrue(token.transfer(dave, 1000 ether));
    }

    function test_FullLifecycleRewardsWinningRevealersAndSlashesLosers() public {
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000);
        _commit(carol, 1, CAROL_NONCE, 40 ether, 5000);
        _commit(dave, 2, DAVE_NONCE, 30 ether, 2500);

        vm.warp(block.timestamp + VOTING_PERIOD);

        vm.prank(market.JURY_COMMITTER());
        market.commitJury(123, AUDIT_HASH);

        // jurySize == committers count => everyone drawn as juror
        address[] memory jury = market.getJury();
        assertEq(jury.length, 4);

        vm.prank(alice);
        market.revealVote(1, ALICE_NONCE);
        vm.prank(bob);
        market.revealVote(2, BOB_NONCE);
        vm.prank(carol);
        market.revealVote(1, CAROL_NONCE);
        vm.prank(dave);
        market.revealVote(2, DAVE_NONCE);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        _assertResolvedMarket();

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        vm.prank(carol);
        market.withdraw();
        vm.prank(dave);
        market.withdraw();

        assertEq(token.balanceOf(alice), 1053.4375 ether);
        assertEq(token.balanceOf(bob), 940 ether);
        assertEq(token.balanceOf(carol), 1010.6875 ether);
        assertEq(token.balanceOf(dave), 992.5 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_RandomJurySubsetWhenJurySizeBelowCommitterCount() public {
        // Re-deploy with smaller jury so randomness actually selects a subset.
        market = new TruthMarket(
            IERC20(address(token)),
            treasury,
            IPFS_HASH,
            VOTING_PERIOD,
            ADMIN_TIMEOUT,
            REVEAL_PERIOD,
            FEE_BPS,
            2,
            MIN_COMMITS,
            MIN_REVEALED_JURORS
        );

        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000);
        _commit(carol, 1, CAROL_NONCE, 40 ether, 5000);
        _commit(dave, 2, DAVE_NONCE, 30 ether, 2500);

        vm.warp(block.timestamp + VOTING_PERIOD);

        vm.prank(market.JURY_COMMITTER());
        market.commitJury(0xC0FFEE, AUDIT_HASH);

        address[] memory jury = market.getJury();
        assertEq(jury.length, 2);
        assertTrue(jury[0] != jury[1]);
        assertTrue(market.isJuror(jury[0]) && market.isJuror(jury[1]));

        // Every juror must be a committer.
        address[4] memory voters = [alice, bob, carol, dave];
        for (uint256 i = 0; i < 2; i++) {
            bool ok;
            for (uint256 j = 0; j < 4; j++) {
                if (jury[i] == voters[j]) {
                    ok = true;
                    break;
                }
            }
            assertTrue(ok);
        }
    }

    function test_ResolvesInvalidWhenJuryCommitDeadlineMissed() public {
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        assertEq(uint256(market.phase()), uint256(TruthMarket.Phase.Resolved));

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.balanceOf(bob), 1000 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_ResolvesInvalidWhenTooFewJurorsReveal_SlashesNonRevealingJuror() public {
        // jurySize 2, minRevealedJurors 2, only one reveals -> Invalid.
        // Both voters use identical stake/conviction so the slash is symmetric whichever
        // juror happens to be picked first.
        market = new TruthMarket(
            IERC20(address(token)),
            treasury,
            IPFS_HASH,
            VOTING_PERIOD,
            ADMIN_TIMEOUT,
            REVEAL_PERIOD,
            FEE_BPS,
            2,
            MIN_COMMITS,
            MIN_REVEALED_JURORS
        );

        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 100 ether, 10_000);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(market.JURY_COMMITTER());
        market.commitJury(123, AUDIT_HASH);

        address[] memory jury = market.getJury();
        bytes32 revealerNonce = jury[0] == alice ? ALICE_NONCE : BOB_NONCE;
        uint8 revealerVote = jury[0] == alice ? 1 : 2;
        vm.prank(jury[0]);
        market.revealVote(revealerVote, revealerNonce);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();

        address revealer = jury[0];
        address nonRevealer = jury[1];
        // Revealer: full refund. Non-revealing juror: stake fully slashed (penalty
        // capped at stake since 100% conviction).
        assertEq(token.balanceOf(revealer), 1000 ether);
        assertEq(token.balanceOf(nonRevealer), 900 ether);
        assertEq(token.balanceOf(treasury), 100 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_DoublePenaltyOnNonRevealingJurorAtValidOutcome() public {
        // jurySize 4 (all voters jurors). One juror fails to reveal at 50% conviction
        // so the doubled penalty hits its full ceiling (2 * risked == stake).
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000); // yes, risked 100
        _commit(bob, 1, BOB_NONCE, 100 ether, 10_000); // yes, risked 100
        _commit(carol, 2, CAROL_NONCE, 100 ether, 10_000); // no, risked 100
        _commit(dave, 1, DAVE_NONCE, 80 ether, 5000); // yes, risked 40 — doesn't reveal

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(market.JURY_COMMITTER());
        market.commitJury(0xBEEF, AUDIT_HASH);

        vm.prank(alice);
        market.revealVote(1, ALICE_NONCE);
        vm.prank(bob);
        market.revealVote(1, BOB_NONCE);
        vm.prank(carol);
        market.revealVote(2, CAROL_NONCE);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));

        // Slashed pool: losers' risked (carol 100) + non-revealer base (dave 40)
        //              + non-revealing juror extra (dave another 40) = 180 ether
        // Fee 5% => 9 ether to treasury, distributable 171 ether.
        assertEq(token.balanceOf(treasury), 9 ether);
        assertEq(market.distributablePool(), 171 ether);

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        vm.prank(carol);
        market.withdraw();
        vm.prank(dave);
        market.withdraw();

        // Winner bonus = pool * risked / totalYesRewardWeight (200 ether of revealed yes)
        // alice & bob each: 171 * 100 / 200 = 85.5 ether bonus
        assertEq(token.balanceOf(alice), 1000 ether - 100 ether + 100 ether + 85.5 ether);
        assertEq(token.balanceOf(bob), 1000 ether - 100 ether + 100 ether + 85.5 ether);
        // Loser-revealed: stake - risked
        assertEq(token.balanceOf(carol), 1000 ether - 100 ether);
        // Non-revealing juror: stake - 2*risked
        assertEq(token.balanceOf(dave), 1000 ether - 80 ether + (80 ether - 80 ether));
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_RevertsCommitJuryWhenBelowMinCommits() public {
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(market.JURY_COMMITTER());
        vm.expectRevert(TruthMarket.InsufficientCommits.selector);
        market.commitJury(123, AUDIT_HASH);
    }

    function _assertResolvedMarket() internal view {
        assertEq(uint256(market.phase()), uint256(TruthMarket.Phase.Resolved));
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        assertEq(market.distributablePool(), 64.125 ether);
        assertEq(market.randomness(), 123);
        assertEq(market.juryAuditHash(), AUDIT_HASH);
        assertEq(token.balanceOf(treasury), 3.375 ether);

        assertEq(market.revealedYesStake(), 140 ether);
        assertEq(market.revealedNoStake(), 90 ether);
        assertEq(market.revealedYesRisked(), 120 ether);
        assertEq(market.revealedNoRisked(), 67.5 ether);
        assertEq(market.totalCommittedStake(), 230 ether);
        assertEq(market.totalRiskedStake(), 187.5 ether);

        assertGt(market.juryYesWeight(), market.juryNoWeight());
        assertEq(market.totalYesRewardWeight(), 120 ether);
        assertEq(market.totalNoRewardWeight(), 67.5 ether);
    }

    function _commit(address voter, uint8 vote, bytes32 nonce, uint96 stake, uint16 convictionBps) internal {
        bytes32 commitHash = market.commitHashOf(vote, nonce);

        vm.startPrank(voter);
        token.approve(address(market), stake);
        market.commitVote(commitHash, stake, convictionBps);
        vm.stopPrank();
    }
}
