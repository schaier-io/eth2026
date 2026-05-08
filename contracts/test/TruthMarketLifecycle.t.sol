// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { ExampleToken } from "../src/ExampleToken.sol";

contract TruthMarketLifecycleTest is Test {
    TruthMarket internal market;
    ExampleToken internal token;

    address internal admin = makeAddr("admin");
    address internal juryCommitter = makeAddr("juryCommitter");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    bytes32 internal constant CLAIM_REF = bytes32(uint256(0xabc));
    bytes32 internal constant ALICE_NONCE = "alice";
    bytes32 internal constant BOB_NONCE = "bob";
    bytes32 internal constant CAROL_NONCE = "carol";
    bytes32 internal constant DAVE_NONCE = "dave";
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;

    function setUp() public {
        token = new ExampleToken("Truth Stake", "TRUTH", 10_000 ether, 10_000 ether, address(this));
        market = new TruthMarket(IERC20(address(token)), treasury, admin, juryCommitter);

        assertTrue(token.transfer(alice, 1000 ether));
        assertTrue(token.transfer(bob, 1000 ether));
        assertTrue(token.transfer(carol, 1000 ether));
        assertTrue(token.transfer(dave, 1000 ether));
    }

    function test_FullLifecycleRewardsWinningRevealersAndSlashesLosers() public {
        vm.prank(creator);
        uint256 id = market.createClaim(CLAIM_REF, VOTING_PERIOD, REVEAL_PERIOD, FEE_BPS, 2);

        _commit(id, alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(id, bob, 2, BOB_NONCE, 60 ether, 10_000);
        _commit(id, carol, 1, CAROL_NONCE, 40 ether, 5000);
        _commit(id, dave, 2, DAVE_NONCE, 30 ether, 2500);

        vm.warp(block.timestamp + VOTING_PERIOD);
        market.advanceToReveal(id);

        address[] memory jurors = new address[](2);
        jurors[0] = alice;
        jurors[1] = bob;

        vm.prank(juryCommitter);
        market.commitJury(id, jurors, 123, "swarm://ctrng-output");

        vm.prank(alice);
        market.revealVote(id, 1, ALICE_NONCE);
        vm.prank(bob);
        market.revealVote(id, 2, BOB_NONCE);
        vm.prank(carol);
        market.revealVote(id, 1, CAROL_NONCE);

        vm.warp(block.timestamp + REVEAL_PERIOD);
        market.resolve(id);

        _assertResolvedMarket(id);

        vm.prank(alice);
        market.withdraw(id);
        vm.prank(bob);
        market.withdraw(id);
        vm.prank(carol);
        market.withdraw(id);
        vm.prank(dave);
        market.withdraw(id);

        assertEq(token.balanceOf(alice), 1053.4375 ether);
        assertEq(token.balanceOf(bob), 940 ether);
        assertEq(token.balanceOf(carol), 1010.6875 ether);
        assertEq(token.balanceOf(dave), 992.5 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function _assertResolvedMarket(uint256 id) internal view {
        _assertStatus(id);
        _assertTotals(id);
        _assertWeights(id);
    }

    function _assertStatus(uint256 id) internal view {
        (TruthMarket.Phase phase, TruthMarket.Outcome outcome, uint96 distributablePool, uint256 randomness) =
            market.claimStatus(id);

        assertEq(uint256(phase), uint256(TruthMarket.Phase.Resolved));
        assertEq(uint256(outcome), uint256(TruthMarket.Outcome.Yes));
        assertEq(distributablePool, 64.125 ether);
        assertEq(randomness, 123);
        assertEq(market.juryAuditRef(id), "swarm://ctrng-output");
        assertEq(token.balanceOf(treasury), 3.375 ether);
    }

    function _assertTotals(uint256 id) internal view {
        (
            uint96 totalCommittedStake,
            uint96 totalRiskedStake,
            uint96 revealedYesStake,
            uint96 revealedNoStake,
            uint96 revealedYesRisked,
            uint96 revealedNoRisked
        ) = market.claimTotals(id);

        assertEq(revealedYesStake, 140 ether);
        assertEq(revealedNoStake, 60 ether);
        assertEq(revealedYesRisked, 120 ether);
        assertEq(revealedNoRisked, 60 ether);
        assertEq(totalCommittedStake, 230 ether);
        assertEq(totalRiskedStake, 187.5 ether);
    }

    function _assertWeights(uint256 id) internal view {
        (uint256 juryYesWeight, uint256 juryNoWeight, uint256 totalYesRewardWeight, uint256 totalNoRewardWeight) =
            market.claimWeights(id);

        assertGt(juryYesWeight, juryNoWeight);
        assertEq(totalYesRewardWeight, 120 ether);
        assertEq(totalNoRewardWeight, 60 ether);
    }

    function _commit(uint256 id, address voter, uint8 vote, bytes32 nonce, uint96 stake, uint16 convictionBps)
        internal
    {
        bytes32 commitHash = market.commitHashOf(vote, nonce);

        vm.startPrank(voter);
        token.approve(address(market), stake);
        market.commitVote(id, commitHash, stake, convictionBps);
        vm.stopPrank();
    }
}
