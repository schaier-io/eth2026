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
///   forge script script/Simulate.s.sol --sig 'invalidJurorPenalty()' -vv
///   forge script script/Simulate.s.sol --sig 'randomScenario(uint256)' 0xDEADBEEF -vv
///
/// All scenarios deploy a fresh TruthMarket + ExampleToken in a local EVM, advance time
/// through every phase, and print the resulting state. No anvil or broadcast needed.
///
/// Configs respect the contract's MAX_JURY_PERCENTAGE = 15 rule:
///   jurySize=1 → minCommits ≥ 7, jurySize=3 → minCommits ≥ 20, etc.
contract SimulateScript is Script {
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint96 internal constant START_BALANCE = 1_000 ether;

    address internal constant DEPLOYER = address(uint160(uint256(keccak256("deployer"))));
    address internal constant TREASURY = address(uint160(uint256(keccak256("treasury"))));
    address internal constant ADMIN_ADDR = address(uint160(uint256(keccak256("admin"))));
    address internal constant JURY_COMMITTER_ADDR = address(uint160(uint256(keccak256("jury-committer"))));
    address internal constant CREATOR = address(uint160(uint256(keccak256("creator"))));

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

    /// @notice Happy-path: 7 voters, jurySize=1, all reveal — single juror's vote decides.
    function lifecycle() external {
        console2.log("=== Scenario: Lifecycle (jurySize=1, all reveal) ===");
        Voter[] memory voters = _makeVoters(7, 50 ether, 4_000, 1, true); // all YES, 40% conv
        (TruthMarket market, ExampleToken token) = _deployMarket(1, 7, 1);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        _commitJury(market, 0xC0FFEE);
        _printJury(market, voters);

        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        _resolveAndWithdraw(market, token, voters);
    }

    /// @notice Admin (jury committer) misses the deadline: market resolves Invalid; full
    ///         refund for everyone, no jury was ever drawn so no penalty applies.
    function invalidNoJury() external {
        console2.log("=== Scenario: Invalid (admin missed jury-commit deadline) ===");
        Voter[] memory voters = _makeVoters(7, 50 ether, 4_000, 1, true);
        (TruthMarket market, ExampleToken token) = _deployMarket(1, 7, 1);

        _commitAll(market, token, voters);
        _advanceTo(market.juryCommitDeadline()); // skip past without commitJury

        market.resolve();
        _printResolved(market);

        _withdrawAll(market, voters);
        _printFinalBalances(token, voters);
    }

    /// @notice Selected jurors fail to reveal → outcome Invalid; non-revealing jurors
    ///         forfeit their full stakes to the CREATOR (not treasury). Other voters
    ///         get full refunds. Uses jurySize=3 with 20 voters to satisfy the 15% rule.
    function invalidJurorPenalty() external {
        console2.log("=== Scenario: Invalid juror penalty -> creator ===");
        Voter[] memory voters = _makeVoters(20, 80 ether, 10_000, 1, true); // 100% conv → risked = stake
        (TruthMarket market, ExampleToken token) = _deployMarket(3, 20, 2);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        _commitJury(market, 0xBADCAFE);

        // Mark only the first juror as a reveler; the other two skip.
        address[] memory jury = market.getJury();
        for (uint256 i = 0; i < voters.length; i++) {
            if (voters[i].addr == jury[1] || voters[i].addr == jury[2]) {
                voters[i].willReveal = false;
            }
        }
        _printJury(market, voters);

        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        market.resolve();
        _printResolved(market);
        _withdrawAll(market, voters);

        // Creator pulls the juror penalty.
        market.withdrawCreator();
        market.withdrawTreasury();

        _printFinalBalances(token, voters);
        console2.log("Creator balance:  ", _ether(token.balanceOf(CREATOR)));
    }

    /// @notice Random votes, random conviction, random reveal participation.
    /// @param seed RNG seed; pass any uint256 to vary the scenario.
    function randomScenario(uint256 seed) external {
        console2.log("=== Scenario: Random ===");
        console2.log("Seed:", seed);

        Voter[] memory voters = _makeRandomVoters(7, seed);
        (TruthMarket market, ExampleToken token) = _deployMarket(1, 7, 1);

        _commitAll(market, token, voters);
        _advanceTo(market.votingDeadline());

        uint256 randomness = uint256(keccak256(abi.encode(seed, "ctrng")));
        _commitJury(market, randomness);
        _printJury(market, voters);

        _revealAll(market, voters);
        _advanceTo(market.revealDeadline());

        _resolveAndWithdraw(market, token, voters);
        market.withdrawCreator();
        console2.log("Creator balance:", _ether(token.balanceOf(CREATOR)));
    }

    // ---------- Voter constructors ----------

    function _makeVoters(uint256 n, uint96 stake, uint16 conv, uint8 vote, bool willReveal)
        internal
        pure
        returns (Voter[] memory voters)
    {
        voters = new Voter[](n);
        for (uint256 i = 0; i < n; i++) {
            voters[i] = Voter({
                addr: address(uint160(uint256(keccak256(abi.encode("voter", i))))),
                label: string.concat("v", _u(i)),
                nonce: keccak256(abi.encode("nonce", i)),
                stake: stake,
                conviction: conv,
                vote: vote,
                willReveal: willReveal
            });
        }
    }

    function _makeRandomVoters(uint256 n, uint256 seed) internal pure returns (Voter[] memory voters) {
        voters = new Voter[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            voters[i] = Voter({
                addr: address(uint160(uint256(keccak256(abi.encode("voter", i))))),
                label: string.concat("v", _u(i)),
                nonce: bytes32(uint256(keccak256(abi.encode(seed, "nonce", i)))),
                stake: uint96(((r >> 32) % 90 ether) + 10 ether),
                conviction: uint16(((r >> 8) % 9_000) + 1_000),
                vote: uint8((r & 1) + 1),
                willReveal: ((r >> 64) % 10) < 8
            });
        }
    }

    // ---------- Composable helpers ----------

    function _deployMarket(uint32 jurySize, uint32 minCommits, uint32 minRevealedJurors)
        internal
        returns (TruthMarket market, ExampleToken token)
    {
        vm.startPrank(DEPLOYER);
        token = new ExampleToken("Truth Stake", "TRUTH", 1_000_000 ether, 10_000_000 ether, DEPLOYER);
        vm.stopPrank();
        market = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: IERC20(address(token)),
                treasury: TREASURY,
                admin: ADMIN_ADDR,
                juryCommitter: JURY_COMMITTER_ADDR,
                creator: CREATOR,
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
        console2.log("Stake token:           ", address(token));
        console2.log("Voting deadline:       ", market.votingDeadline());
        console2.log("Jury commit deadline:  ", market.juryCommitDeadline());
        console2.log("Reveal deadline:       ", market.revealDeadline());
        console2.log("Jury size:             ", market.jurySize());
        console2.log("Min commits:           ", market.minCommits());
        console2.log("Min revealed jurors:   ", market.minRevealedJurors());
        console2.log("Min stake:             ", market.minStake());
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
        }
        console2.log("Committers:        ", voters.length);
        console2.log("Total committed:   ", _ether(market.totalCommittedStake()));
        console2.log("Total risked:      ", _ether(market.totalRiskedStake()));
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
            console2.log(string.concat("Juror ", _u(i), ":"), jury[i], _labelOf(voters, jury[i]));
        }
        console2.log("");
    }

    function _revealAll(TruthMarket market, Voter[] memory voters) internal {
        for (uint256 i = 0; i < voters.length; i++) {
            Voter memory v = voters[i];
            if (!v.willReveal) continue;
            vm.prank(v.addr);
            market.revealVote(v.vote, v.nonce);
        }
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
        console2.log("Outcome:           ", _outcomeLabel(market.outcome()));
        console2.log("Jury yes count:    ", market.juryYesCount());
        console2.log("Jury no count:     ", market.juryNoCount());
        console2.log("Distributable pool:", _ether(market.distributablePool()));
        console2.log("Treasury accrued:  ", _ether(market.treasuryAccrued()));
        console2.log("Creator accrued:   ", _ether(market.creatorAccrued()));
        console2.log("");
    }

    function _withdrawAll(TruthMarket market, Voter[] memory voters) internal {
        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i].addr);
            try market.withdraw() {
                // ok
            } catch {
                console2.log(string.concat(voters[i].label, ": withdraw reverted"));
            }
        }
    }

    function _printFinalBalances(ExampleToken token, Voter[] memory voters) internal view {
        console2.log("--- Final balances (delta vs starting 1000) ---");
        uint256 winners;
        uint256 losers;
        uint256 fullSlash;
        uint256 unchanged;
        for (uint256 i = 0; i < voters.length; i++) {
            uint256 bal = token.balanceOf(voters[i].addr);
            if (bal > START_BALANCE) winners++;
            else if (bal == 0 || bal <= START_BALANCE - voters[i].stake) fullSlash++;
            else if (bal < START_BALANCE) losers++;
            else unchanged++;
        }
        console2.log("Winners (gained):     ", winners);
        console2.log("Losers (partial slash):", losers);
        console2.log("Fully slashed jurors: ", fullSlash);
        console2.log("Unchanged:            ", unchanged);
        console2.log("Treasury balance:     ", _ether(token.balanceOf(TREASURY)));
    }

    // ---------- Primitive helpers ----------

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

    function _u(uint256 x) internal pure returns (string memory) {
        return vm.toString(x);
    }

    function _ether(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1 ether;
        uint256 frac = (wei_ % 1 ether) / 1e15;
        if (frac == 0) return string.concat(_u(whole), " ether");
        return string.concat(_u(whole), ".", _padded3(frac), " ether");
    }

    function _padded3(uint256 x) internal pure returns (string memory) {
        if (x >= 100) return _u(x);
        if (x >= 10) return string.concat("0", _u(x));
        return string.concat("00", _u(x));
    }
}
