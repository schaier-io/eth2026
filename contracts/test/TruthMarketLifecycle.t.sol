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
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");

    bytes internal constant IPFS_HASH = bytes("ipfs://Qm-claim-doc");
    bytes32 internal constant AUDIT_HASH = keccak256("swarm://ctrng-output");
    bytes32 internal constant ALICE_NONCE = "alice";
    bytes32 internal constant BOB_NONCE = "bob";
    bytes32 internal constant CAROL_NONCE = "carol";
    bytes32 internal constant DAVE_NONCE = "dave";
    bytes32 internal constant EVE_NONCE = "eve";
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint32 internal constant JURY_SIZE = 3;
    uint32 internal constant MIN_COMMITS = 3;
    uint32 internal constant MIN_REVEALED_JURORS = 2;

    function setUp() public {
        token = new ExampleToken("Truth Stake", "TRUTH", 10_000 ether, 10_000 ether, address(this));
        market = _deployMarket(JURY_SIZE, MIN_COMMITS, MIN_REVEALED_JURORS);

        assertTrue(token.transfer(alice, 1000 ether));
        assertTrue(token.transfer(bob, 1000 ether));
        assertTrue(token.transfer(carol, 1000 ether));
        assertTrue(token.transfer(dave, 1000 ether));
        assertTrue(token.transfer(eve, 1000 ether));
    }

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

    function test_FullLifecycleRewardsWinningRevealersAndSlashesLosers() public {
        // 3 voters, jurySize == 3 -> all are jurors. Yes/No outcome deterministic.
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000); // yes, risked 100
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000); // no, risked 60
        _commit(carol, 1, CAROL_NONCE, 40 ether, 5000); // yes, risked 20

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, AUDIT_HASH);

        assertEq(market.getJury().length, 3);

        vm.prank(alice);
        market.revealVote(1, ALICE_NONCE);
        vm.prank(bob);
        market.revealVote(2, BOB_NONCE);
        vm.prank(carol);
        market.revealVote(1, CAROL_NONCE);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        // slashed = bob's risked (60). Fee = 60 * 5% = 3. Distributable = 57.
        assertEq(market.distributablePool(), 57 ether);
        assertEq(market.treasuryAccrued(), 3 ether);
        // Treasury hasn't pulled yet.
        assertEq(token.balanceOf(treasury), 0);

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        vm.prank(carol);
        market.withdraw();

        // alice winner: 100 stake + bonus (57 * 100/120) = 100 + 47.5
        assertEq(token.balanceOf(alice), 1000 ether - 100 ether + 100 ether + 47.5 ether);
        // bob loser-revealed: stake - risked = 0
        assertEq(token.balanceOf(bob), 1000 ether - 60 ether);
        // carol winner: 40 stake + bonus (57 * 20/120) = 40 + 9.5
        assertEq(token.balanceOf(carol), 1000 ether - 40 ether + 40 ether + 9.5 ether);

        // Permissionless treasury pull: sweeps accrued + dust (no dust here, exact divisions).
        market.withdrawTreasury();
        assertEq(token.balanceOf(treasury), 3 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_RandomJurySubsetWhenJurySizeBelowCommitterCount() public {
        // 5 voters, jurySize 3 -> Fisher-Yates picks a strict subset.
        market = _deployMarket(3, 3, 2);

        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000);
        _commit(carol, 1, CAROL_NONCE, 40 ether, 5000);
        _commit(dave, 2, DAVE_NONCE, 30 ether, 2500);
        _commit(eve, 1, EVE_NONCE, 50 ether, 5000);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xC0FFEE, AUDIT_HASH);

        address[] memory jury = market.getJury();
        assertEq(jury.length, 3);
        // Distinct + all are committers.
        assertTrue(jury[0] != jury[1] && jury[1] != jury[2] && jury[0] != jury[2]);
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(market.isJuror(jury[i]));
            address[5] memory voters = [alice, bob, carol, dave, eve];
            bool ok;
            for (uint256 j = 0; j < 5; j++) {
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
        _commit(carol, 1, CAROL_NONCE, 40 ether, 5000);

        vm.warp(block.timestamp + VOTING_PERIOD + ADMIN_TIMEOUT);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        assertEq(uint256(market.phase()), uint256(TruthMarket.Phase.Resolved));

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        vm.prank(carol);
        market.withdraw();

        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.balanceOf(bob), 1000 ether);
        assertEq(token.balanceOf(carol), 1000 ether);
        // No accrual on this path (jury never drawn).
        assertEq(market.treasuryAccrued(), 0);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_ResolvesInvalidWhenTooFewJurorsReveal_SlashesNonRevealingJurors() public {
        // 3 jurors, minRevealedJurors=2, only 1 reveals -> Invalid + slash 2 non-revealers.
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000); // risked 100, conv 100% -> penalty cap = 100
        _commit(bob, 2, BOB_NONCE, 100 ether, 10_000); // risked 100, penalty cap = 100
        _commit(carol, 1, CAROL_NONCE, 100 ether, 10_000); // risked 100, penalty cap = 100

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, AUDIT_HASH);

        // Reveal exactly one juror.
        address[] memory jury = market.getJury();
        bytes32 nonce = jury[0] == alice ? ALICE_NONCE : (jury[0] == bob ? BOB_NONCE : CAROL_NONCE);
        uint8 vote = jury[0] == bob ? 2 : 1;
        vm.prank(jury[0]);
        market.revealVote(vote, nonce);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Invalid));
        // Both non-revealing jurors lose 100 (cap == stake at 100% conviction). Total accrued = 200.
        assertEq(market.treasuryAccrued(), 200 ether);

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        vm.prank(carol);
        market.withdraw();

        assertEq(token.balanceOf(jury[0]), 1000 ether);
        // Two non-revealers each lose their full stake.
        assertEq(token.balanceOf(jury[1]), 900 ether);
        assertEq(token.balanceOf(jury[2]), 900 ether);

        market.withdrawTreasury();
        assertEq(token.balanceOf(treasury), 200 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_QuintuplePenaltyOnNonRevealingJurorAtValidOutcome() public {
        // 5 voters, jurySize=5 -> all jurors. eve fails to reveal at 50% conviction; her
        // 5×-risked penalty saturates at full stake. The cap is the same shape as 2×
        // here (both saturate); the multiplier matters at lower convictions where the
        // penalty stays below the cap (covered in test_QuintuplePenaltyBelowCap).
        market = _deployMarket(5, 5, 3);

        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000); // yes risked 100
        _commit(bob, 1, BOB_NONCE, 100 ether, 10_000); // yes risked 100
        _commit(carol, 1, CAROL_NONCE, 100 ether, 10_000); // yes risked 100
        _commit(dave, 2, DAVE_NONCE, 100 ether, 10_000); // no risked 100 (revealed loser)
        _commit(eve, 2, EVE_NONCE, 80 ether, 5000); // no risked 40 (won't reveal, capped at 80)

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, AUDIT_HASH);

        vm.prank(alice);
        market.revealVote(1, ALICE_NONCE);
        vm.prank(bob);
        market.revealVote(1, BOB_NONCE);
        vm.prank(carol);
        market.revealVote(1, CAROL_NONCE);
        vm.prank(dave);
        market.revealVote(2, DAVE_NONCE);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        // 3 yes vs 1 no jurors revealed -> Yes wins (count-based, ignores stakes).
        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));
        assertEq(market.juryYesCount(), 3);
        assertEq(market.juryNoCount(), 1);

        // slashed = dave 100 (loser) + eve 40 (missed base) + eve extra 40 (capped 5x) = 180
        // fee = 9, distributable = 171
        assertEq(market.treasuryAccrued(), 9 ether);
        assertEq(market.distributablePool(), 171 ether);

        vm.prank(alice);
        market.withdraw();
        vm.prank(bob);
        market.withdraw();
        vm.prank(carol);
        market.withdraw();
        vm.prank(dave);
        market.withdraw();
        vm.prank(eve);
        market.withdraw();

        // Each yes-revealer: 100 stake refund + 171 * 100 / 300 = 100 + 57 bonus.
        assertEq(token.balanceOf(alice), 1000 ether - 100 ether + 100 ether + 57 ether);
        assertEq(token.balanceOf(bob), 1000 ether - 100 ether + 100 ether + 57 ether);
        assertEq(token.balanceOf(carol), 1000 ether - 100 ether + 100 ether + 57 ether);
        assertEq(token.balanceOf(dave), 1000 ether - 100 ether);
        assertEq(token.balanceOf(eve), 1000 ether - 80 ether);

        market.withdrawTreasury();
        assertEq(token.balanceOf(treasury), 9 ether);
        assertEq(token.balanceOf(address(market)), 0);
    }

    function test_QuintuplePenaltyBelowCap() public {
        // 5 voters, jurySize=5. eve commits at 10% conviction so 5x risked stays below
        // her stake and the cap doesn't bite — the multiplier is observable.
        market = _deployMarket(5, 5, 3);

        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000); // yes risked 100
        _commit(bob, 1, BOB_NONCE, 100 ether, 10_000); // yes risked 100
        _commit(carol, 1, CAROL_NONCE, 100 ether, 10_000); // yes risked 100
        _commit(dave, 2, DAVE_NONCE, 100 ether, 10_000); // no risked 100 (revealed loser)
        _commit(eve, 2, EVE_NONCE, 100 ether, 1000); // no risked 10 (won't reveal)

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(0xBEEF, AUDIT_HASH);

        vm.prank(alice);
        market.revealVote(1, ALICE_NONCE);
        vm.prank(bob);
        market.revealVote(1, BOB_NONCE);
        vm.prank(carol);
        market.revealVote(1, CAROL_NONCE);
        vm.prank(dave);
        market.revealVote(2, DAVE_NONCE);

        vm.warp(block.timestamp + ADMIN_TIMEOUT + REVEAL_PERIOD);
        market.resolve();

        assertEq(uint256(market.outcome()), uint256(TruthMarket.Outcome.Yes));

        // eve penalty = min(5*10, 100) = 50. extra = 40.
        // slashed = dave 100 + eve 10 (missed base) + eve extra 40 = 150
        // fee = 7.5, distributable = 142.5
        assertEq(market.treasuryAccrued(), 7.5 ether);
        assertEq(market.distributablePool(), 142.5 ether);

        // eve non-revealing juror loses 5x risked = 50, keeps 50.
        vm.prank(eve);
        market.withdraw();
        assertEq(token.balanceOf(eve), 1000 ether - 50 ether);
    }

    function test_RevertsCommitJuryWhenBelowMinCommits() public {
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000);
        // Only 2 commits; minCommits = 3.

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        vm.expectRevert(TruthMarket.InsufficientCommits.selector);
        market.commitJury(123, AUDIT_HASH);
    }

    function test_RevertsConstructorOnEvenJurySize() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(4, 4, 2));
    }

    function test_RevertsConstructorWhenJuryExceedsMax() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(101, 101, 50));
    }

    function test_RevertsConstructorWhenMinCommitsBelowJurySize() public {
        vm.expectRevert(TruthMarket.BadParams.selector);
        new TruthMarket(_initParams(5, 3, 2));
    }

    function test_RevertsCommitBelowMinStake() public {
        vm.startPrank(alice);
        token.approve(address(market), 0.5 ether);
        bytes32 hash = market.commitHashOf(1, ALICE_NONCE, alice);
        vm.expectRevert(TruthMarket.StakeBelowMin.selector);
        market.commitVote(hash, 0.5 ether, 10_000);
        vm.stopPrank();
    }

    function test_RevertsSecondCommitFromSameWallet() public {
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);

        bytes32 hash = market.commitHashOf(2, BOB_NONCE, alice);
        vm.startPrank(alice);
        token.approve(address(market), 100 ether);
        vm.expectRevert(TruthMarket.AlreadyCommitted.selector);
        market.commitVote(hash, 100 ether, 10_000);
        vm.stopPrank();
    }

    function test_RevealRequiresMatchingVoter() public {
        _commit(alice, 1, ALICE_NONCE, 100 ether, 10_000);
        _commit(bob, 2, BOB_NONCE, 60 ether, 10_000);
        _commit(carol, 1, CAROL_NONCE, 40 ether, 5000);

        vm.warp(block.timestamp + VOTING_PERIOD);
        vm.prank(juryCommitter);
        market.commitJury(123, AUDIT_HASH);

        // bob attempts to reveal with alice's nonce/vote — hash binds to msg.sender,
        // so this fails.
        vm.prank(bob);
        vm.expectRevert(TruthMarket.InvalidReveal.selector);
        market.revealVote(1, ALICE_NONCE);
    }

    function _commit(address voter, uint8 vote, bytes32 nonce, uint96 stake, uint16 convictionBps) internal {
        bytes32 commitHash = market.commitHashOf(vote, nonce, voter);

        vm.startPrank(voter);
        token.approve(address(market), stake);
        market.commitVote(commitHash, stake, convictionBps);
        vm.stopPrank();
    }
}
