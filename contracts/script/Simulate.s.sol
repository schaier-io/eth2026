// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { ExampleToken } from "../src/ExampleToken.sol";

/// @notice Local end-to-end simulator for TruthMarket. Run a scenario with:
///
///   forge script script/Simulate.s.sol --sig 'lifecycle()' -vv
///   forge script script/Simulate.s.sol --sig 'invalidNoJury()' -vv
///   forge script script/Simulate.s.sol --sig 'invalidTooFewReveals()' -vv
///   forge script script/Simulate.s.sol --sig 'tieInvalid()' -vv
///   forge script script/Simulate.s.sol --sig 'randomScenario(uint256)' 0xDEADBEEF -vv
///
/// Each scenario deploys a fresh TruthMarket + ExampleToken in a local EVM, advances
/// time through every phase, and prints the resulting state. No anvil or broadcast
/// needed — everything runs in-process via cheatcodes.
contract SimulateScript is Script {
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint96 internal constant START_BALANCE = 1000 ether;

    address internal constant DEPLOYER = address(uint160(uint256(keccak256("deployer"))));
    address internal constant TREASURY = address(uint160(uint256(keccak256("treasury"))));
    address internal constant ADMIN_ADDR = address(uint160(uint256(keccak256("admin"))));
    address internal constant JURY_COMMITTER_ADDR = address(uint160(uint256(keccak256("jury-committer"))));

    bytes internal constant IPFS_HASH = bytes("ipfs://QmTruthMarketDemoClaim");
    bytes32 internal constant AUDIT_HASH = keccak256("ctrng-audit-output");

    struct Voter {
        address addr;
        string label;
        bytes32 nonce;
        uint96 stake;
        uint16 conviction;
        uint8 vote; // 1 = YES, 2 = NO
        bool willReveal;
    }

    // ---------- Scenarios ----------

    /// @notice Happy-path: 3 voters, all reveal, count-based outcome decided by jury.
    function lifecycle() external {
        console2.log("=== Scenario: Lifecycle (Yes outcome, all reveal) ===");
        Voter[] memory voters = _voters3();
        (TruthMarket market, ExampleToken token) = _deployMarket(3, 3, 2);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        _commitJury(market, 0xC0FFEE);
        _printJury(market, voters);

        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        _resolveAndWithdraw(market, token, voters);
    }

    /// @notice Admin (jury committer) misses the deadline: market resolves Invalid,
    ///         everyone refunded, no jury was ever drawn so no penalties apply.
    function invalidNoJury() external {
        console2.log("=== Scenario: Invalid (admin missed jury-commit deadline) ===");
        Voter[] memory voters = _voters3();
        (TruthMarket market, ExampleToken token) = _deployMarket(3, 3, 2);

        _commitAll(market, token, voters);

        // Skip past juryCommitDeadline without calling commitJury.
        _advanceTo(market.juryCommitDeadline());

        market.resolve();
        _printResolved(market);

        _withdrawAll(market, voters);
        _printFinalBalances(token, voters);
    }

    /// @notice Jury drawn, but only 1 of 3 jurors reveals — below minRevealedJurors=2.
    ///         Outcome is Invalid; the 2 non-revealing jurors are slashed 5x risked
    ///         (capped at full stake at 100% conviction). Penalty accrues to treasury.
    function invalidTooFewReveals() external {
        console2.log("=== Scenario: Invalid (too few jurors revealed) ===");
        Voter[] memory voters = _voters3();
        // Only the first will reveal.
        voters[0].willReveal = true;
        voters[1].willReveal = false;
        voters[2].willReveal = false;
        (TruthMarket market, ExampleToken token) = _deployMarket(3, 3, 2);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        _commitJury(market, 0xBADCAFE);
        _printJury(market, voters);

        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        _resolveAndWithdraw(market, token, voters);
    }

    /// @notice Demonstrates an even-revealed-juror tie returning Invalid. 5 voters,
    ///         jurySize=5, but one juror skips reveal — leaves 4 revealing jurors
    ///         configured to split 2-2.
    function tieInvalid() external {
        console2.log("=== Scenario: Invalid (jury count tie on even reveals) ===");
        (TruthMarket market, ExampleToken token) = _deployMarket(5, 5, 3);
        Voter[] memory voters = new Voter[](5);
        voters[0] = _v(_addr("alice"), "alice", "alice-nonce", 100 ether, 10_000, 1, true);
        voters[1] = _v(_addr("bob"), "bob", "bob-nonce", 100 ether, 10_000, 1, true);
        voters[2] = _v(_addr("carol"), "carol", "carol-nonce", 100 ether, 10_000, 2, true);
        voters[3] = _v(_addr("dave"), "dave", "dave-nonce", 100 ether, 10_000, 2, true);
        // eve will not reveal -> 4 revealing jurors at 2 yes, 2 no -> tie.
        voters[4] = _v(_addr("eve"), "eve", "eve-nonce", 100 ether, 10_000, 1, false);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        _commitJury(market, 0x600D);
        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        _resolveAndWithdraw(market, token, voters);
    }

    /// @notice Random votes, random conviction, random reveal participation. Outcome
    ///         emerges from the jury draw.
    /// @param seed RNG seed; pass any uint256 — try a few values to see different
    ///        outcomes.
    function randomScenario(uint256 seed) external {
        console2.log("=== Scenario: Random ===");
        console2.log("Seed:", seed);

        (TruthMarket market, ExampleToken token) = _deployMarket(5, 5, 3);
        Voter[] memory voters = new Voter[](5);
        string[5] memory labels = ["alice", "bob", "carol", "dave", "eve"];
        for (uint256 i = 0; i < 5; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint8 vote = uint8((r & 1) + 1); // 1 or 2
            uint16 conviction = uint16(((r >> 8) % 9000) + 1000); // 1000..9999 bps
            uint96 stake = uint96(((r >> 32) % 90 ether) + 10 ether); // 10..99 ether
            bool willReveal = ((r >> 64) % 10) < 8; // 80% reveal
            bytes32 nonce = bytes32(uint256(keccak256(abi.encode(seed, "nonce", i))));
            voters[i] = _v(_addr(labels[i]), labels[i], nonce, stake, conviction, vote, willReveal);
        }
        _logVoters(voters);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        uint256 randomness = uint256(keccak256(abi.encode(seed, "ctrng")));
        _commitJury(market, randomness);
        _printJury(market, voters);

        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        _resolveAndWithdraw(market, token, voters);
    }

    // ---------- Composable helpers ----------

    function _voters3() internal pure returns (Voter[] memory voters) {
        voters = new Voter[](3);
        voters[0] = _v(_addr("alice"), "alice", "alice-nonce", 100 ether, 10_000, 1, true);
        voters[1] = _v(_addr("bob"), "bob", "bob-nonce", 60 ether, 10_000, 2, true);
        voters[2] = _v(_addr("carol"), "carol", "carol-nonce", 40 ether, 5_000, 1, true);
    }

    function _deployMarket(uint32 jurySize, uint32 minCommits, uint32 minRevealedJurors)
        internal
        returns (TruthMarket market, ExampleToken token)
    {
        vm.startPrank(DEPLOYER);
        token = new ExampleToken("Truth Stake", "TRUTH", 100_000 ether, 1_000_000 ether, DEPLOYER);
        vm.stopPrank();
        market = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: IERC20(address(token)),
                treasury: TREASURY,
                admin: ADMIN_ADDR,
                juryCommitter: JURY_COMMITTER_ADDR,
                ipfsHash: IPFS_HASH,
                votingPeriod: VOTING_PERIOD,
                adminTimeout: ADMIN_TIMEOUT,
                revealPeriod: REVEAL_PERIOD,
                protocolFeeBps: FEE_BPS,
                minStake: MIN_STAKE,
                jurySize: jurySize,
                minCommits: minCommits,
                minRevealedJurors: minRevealedJurors
            })
        );

        console2.log("Deployed TruthMarket at:", address(market));
        console2.log("Stake token:", address(token));
        console2.log("Voting deadline:", market.votingDeadline());
        console2.log("Jury commit deadline:", market.juryCommitDeadline());
        console2.log("Reveal deadline:", market.revealDeadline());
        console2.log("Jury size:", market.jurySize());
        console2.log("Min commits:", market.minCommits());
        console2.log("Min revealed jurors:", market.minRevealedJurors());
        console2.log("Min stake:", market.minStake());
        console2.log("");
    }

    function _commitAll(TruthMarket market, ExampleToken token, Voter[] memory voters) internal {
        console2.log("--- Phase: Voting (commit) ---");
        for (uint256 i = 0; i < voters.length; i++) {
            Voter memory v = voters[i];
            vm.prank(DEPLOYER);
            token.transfer(v.addr, START_BALANCE);

            bytes32 hash = market.commitHashOf(v.vote, v.nonce, v.addr);

            vm.startPrank(v.addr);
            token.approve(address(market), v.stake);
            market.commitVote(hash, v.stake, v.conviction);
            vm.stopPrank();

            console2.log(
                string.concat(
                    v.label,
                    ": vote=",
                    _voteLabel(v.vote),
                    "  stake=",
                    _ether(v.stake),
                    "  conv=",
                    vm.toString(v.conviction),
                    "bps  willReveal=",
                    v.willReveal ? "yes" : "no"
                )
            );
        }
        console2.log("Total committed stake:", _ether(market.totalCommittedStake()));
        console2.log("Total risked stake:", _ether(market.totalRiskedStake()));
        console2.log("");
    }

    function _commitJury(TruthMarket market, uint256 randomness) internal {
        vm.prank(JURY_COMMITTER_ADDR);
        market.commitJury(randomness, AUDIT_HASH);
        console2.log("--- Phase: Reveal (jury drawn) ---");
        console2.log("Randomness:", randomness);
    }

    function _printJury(TruthMarket market, Voter[] memory voters) internal view {
        address[] memory jury = market.getJury();
        for (uint256 i = 0; i < jury.length; i++) {
            console2.log(string.concat("Juror ", vm.toString(i), ":"), _labelOf(voters, jury[i]));
        }
        console2.log("");
    }

    function _revealAll(TruthMarket market, Voter[] memory voters) internal {
        for (uint256 i = 0; i < voters.length; i++) {
            Voter memory v = voters[i];
            if (!v.willReveal) {
                console2.log(string.concat(v.label, ": skipping reveal"));
                continue;
            }
            vm.prank(v.addr);
            market.revealVote(v.vote, v.nonce);
            console2.log(string.concat(v.label, ": revealed ", _voteLabel(v.vote)));
        }
        console2.log("");
    }

    function _resolveAndWithdraw(TruthMarket market, ExampleToken token, Voter[] memory voters) internal {
        console2.log("--- Phase: Resolve ---");
        market.resolve();
        _printResolved(market);

        _withdrawAll(market, voters);
        market.withdrawTreasury();
        _printFinalBalances(token, voters);
    }

    function _printResolved(TruthMarket market) internal view {
        console2.log("Outcome:", _outcomeLabel(market.outcome()));
        console2.log("Jury yes count:", market.juryYesCount());
        console2.log("Jury no count:", market.juryNoCount());
        console2.log("Distributable pool:", _ether(market.distributablePool()));
        console2.log("Treasury accrued:", _ether(market.treasuryAccrued()));
        console2.log("");
    }

    function _withdrawAll(TruthMarket market, Voter[] memory voters) internal {
        console2.log("--- Phase: Withdraw ---");
        for (uint256 i = 0; i < voters.length; i++) {
            Voter memory v = voters[i];
            vm.prank(v.addr);
            try market.withdraw() {
                // ok
            } catch {
                console2.log(string.concat(v.label, ": withdraw reverted"));
            }
        }
    }

    function _printFinalBalances(ExampleToken token, Voter[] memory voters) internal view {
        console2.log("");
        console2.log("--- Final balances ---");
        for (uint256 i = 0; i < voters.length; i++) {
            Voter memory v = voters[i];
            uint256 bal = token.balanceOf(v.addr);
            int256 delta = int256(bal) - int256(uint256(START_BALANCE));
            string memory deltaStr = delta >= 0
                ? string.concat("+", _ether(uint256(delta)))
                : string.concat("-", _ether(uint256(-delta)));
            console2.log(string.concat(v.label, ":"), _ether(bal), string.concat("(", deltaStr, ")"));
        }
        console2.log("Treasury balance:", _ether(token.balanceOf(TREASURY)));
    }

    function _logVoters(Voter[] memory voters) internal pure {
        console2.log("--- Random voters ---");
        for (uint256 i = 0; i < voters.length; i++) {
            Voter memory v = voters[i];
            console2.log(
                string.concat(
                    v.label,
                    ": vote=",
                    _voteLabel(v.vote),
                    "  stake=",
                    _ether(v.stake),
                    "  conv=",
                    vm.toString(v.conviction),
                    "bps  willReveal=",
                    v.willReveal ? "yes" : "no"
                )
            );
        }
        console2.log("");
    }

    // ---------- Primitive helpers ----------

    function _v(address a, string memory label, bytes32 nonce, uint96 stake, uint16 conv, uint8 vote, bool willReveal)
        internal
        pure
        returns (Voter memory)
    {
        return Voter({
            addr: a,
            label: label,
            nonce: nonce,
            stake: stake,
            conviction: conv,
            vote: vote,
            willReveal: willReveal
        });
    }

    function _addr(string memory label) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("voter", label)))));
    }

    function _advanceTo(uint64 ts) internal {
        if (block.timestamp < ts) {
            vm.warp(ts);
        }
    }

    function _labelOf(Voter[] memory voters, address a) internal pure returns (string memory) {
        for (uint256 i = 0; i < voters.length; i++) {
            if (voters[i].addr == a) return voters[i].label;
        }
        return "<unknown>";
    }

    function _outcomeLabel(TruthMarket.Outcome o) internal pure returns (string memory) {
        if (o == TruthMarket.Outcome.Yes) return "Yes";
        if (o == TruthMarket.Outcome.No) return "No";
        if (o == TruthMarket.Outcome.Invalid) return "Invalid";
        return "Unresolved";
    }

    function _voteLabel(uint8 v) internal pure returns (string memory) {
        if (v == 1) return "YES";
        if (v == 2) return "NO";
        return "?";
    }

    function _ether(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1 ether;
        uint256 frac = (wei_ % 1 ether) / 1e15; // 3 decimal places
        if (frac == 0) return string.concat(_u(whole), " ether");
        return string.concat(_u(whole), ".", _padded3(frac), " ether");
    }

    function _u(uint256 x) internal pure returns (string memory) {
        return vm.toString(x);
    }

    function _padded3(uint256 x) internal pure returns (string memory) {
        if (x >= 100) return _u(x);
        if (x >= 10) return string.concat("0", _u(x));
        return string.concat("00", _u(x));
    }
}
