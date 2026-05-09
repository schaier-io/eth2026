// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { MockERC20 } from "../test/MockERC20.sol";

/// @notice Anvil-driven full simulation with seeded-random voter votes.
///         175 voters, jurySize = 25, minRevealedJurors = 25 —
///         odd jury size with all jurors revealing means the outcome is the
///         simple majority of the 25 drawn jurors and ties are impossible.
///
///         All 25 jurors reveal. Of the 150 non-jurors, ~25 are randomly
///         selected (seed-driven) to skip reveal — exercising the partial
///         `riskedStake` slash for non-revealing non-jurors. The rest reveal
///         and either win (split the slashed pool) or lose (absorb their
///         own riskedStake slash).
///
///         Reproducible: every voter's (vote, reveal-or-skip) and the jury
///         randomness are derived from a single `SEED` env var (default
///         `0xC0DEC0DE`). Pass a different `SEED` to explore a different
///         vote distribution.
///
/// Phases (each is a separate sig so the shell driver can advance the chain
/// clock between phases via `cast rpc evm_increaseTime`):
///   deploy()         — MockERC20 + TruthMarket; fund 175 voters; persist
///                      addresses to `./.sim-anvil-random.json`
///   commit()         — 175 voters commit (random YES/NO)
///   commitJury()     — jury committer posts seed-derived randomness
///   reveal()         — all 25 jurors + ~125 non-jurors reveal (~25 skip)
///   resolve()        — anyone resolves; voters / treasury / creator pull
///   summary()        — aggregate end-of-run results table
///
/// Cross-phase address handoff is via `./.sim-anvil-random.json`, written by
/// `deploy()` and read by every later phase. The mock token has an open
/// mint and is for local simulation only.
///
/// Anvil must be started with at least 180 accounts (5 roles + 175 voters):
///   ANVIL_ACCOUNTS=180 ./bin/anvil-up
///   (the bin/sim-anvil-random driver does this for you)
contract SimulateAnvilRandomScript is Script {
    // ---------- Anvil deterministic mnemonic ----------
    string internal constant MNEMONIC = "test test test test test test test test test test test junk";

    // ---------- Account index assignments ----------
    uint32 internal constant DEPLOYER_IDX = 0;
    uint32 internal constant TREASURY_IDX = 1;
    uint32 internal constant ADMIN_IDX = 2;
    uint32 internal constant JURY_COMMITTER_IDX = 3;
    uint32 internal constant CREATOR_IDX = 4;
    uint32 internal constant VOTER_BASE_IDX = 5;
    uint256 internal constant VOTER_COUNT = 175;
    /// @dev Number of non-jurors that randomly skip reveal each run. Jurors
    ///      always reveal — otherwise the outcome would go Invalid.
    uint256 internal constant NON_JUROR_NON_REVEALERS = 25;

    /// @dev Cross-phase address handoff. `deploy()` writes the actual deployed
    ///      addresses here; later phases read this file. Avoids hardcoding
    ///      deployer-nonce-derived addresses, which break if the deployer has
    ///      any prior nonce activity.
    string internal constant ADDR_FILE = "./.sim-anvil-random.json";

    // ---------- Market config ----------
    bytes internal constant IPFS_HASH = bytes("ipfs://QmAnvilSimRandom");
    bytes32 internal constant AUDIT_HASH = keccak256("ctrng-anvil-random");
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint8 internal constant FEE_PERCENT = 5;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint96 internal constant VOTER_STAKE = 50 ether;
    // Jury size must be odd (contract enforces).
    uint32 internal constant JURY_SIZE = 25;
    // 175 * 15 = 2625 ≥ 25 * 100 = 2500 → satisfies MAX_JURY_PERCENTAGE constraint.
    uint32 internal constant MIN_COMMITS = 175;
    // All 25 jurors must reveal so the count majority is decisive (odd → no ties).
    uint32 internal constant MIN_REVEALED_JURORS = 25;

    // ---------- Phases ----------

    function deploy() external {
        uint256 deployerPk = vm.deriveKey(MNEMONIC, DEPLOYER_IDX);
        address deployer = vm.addr(deployerPk);
        address treasury = vm.addr(vm.deriveKey(MNEMONIC, TREASURY_IDX));
        address admin = vm.addr(vm.deriveKey(MNEMONIC, ADMIN_IDX));
        address juryCommitter = vm.addr(vm.deriveKey(MNEMONIC, JURY_COMMITTER_IDX));
        address creator = vm.addr(vm.deriveKey(MNEMONIC, CREATOR_IDX));

        vm.startBroadcast(deployerPk);
        // 500 voters * 100 ether starting balance + headroom for the deployer.
        MockERC20 token = new MockERC20("Truth Stake", "TRUTH", 1_000_000 ether, deployer);
        string[] memory tags = new string[](3);
        tags[0] = "anvil";
        tags[1] = "demo";
        tags[2] = "random";
        TruthMarket market = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: IERC20(address(token)),
                treasury: treasury,
                admin: admin,
                juryCommitter: juryCommitter,
                creator: creator,
                name: "Anvil Random Demo",
                description: "Lifecycle simulation with seeded-random voter votes.",
                tags: tags,
                ipfsHash: IPFS_HASH,
                votingPeriod: VOTING_PERIOD,
                adminTimeout: ADMIN_TIMEOUT,
                revealPeriod: REVEAL_PERIOD,
                protocolFeePercent: FEE_PERCENT,
                minStake: MIN_STAKE,
                jurySize: JURY_SIZE,
                minCommits: MIN_COMMITS,
                minRevealedJurors: MIN_REVEALED_JURORS
            })
        );
        for (uint256 i = 0; i < VOTER_COUNT; i++) {
            token.transfer(_voterAddr(i), 100 ether);
        }
        vm.stopBroadcast();

        // Persist deployed addresses for subsequent phases.
        vm.writeFile(
            ADDR_FILE,
            string.concat(
                '{"token":"',
                vm.toString(address(token)),
                '","market":"',
                vm.toString(address(market)),
                '"}'
            )
        );

        console2.log("=== Phase: Deploy (random) ===");
        console2.log("Random seed:          ", _seed());
        console2.log("Token:                ", address(token));
        console2.log("Market:               ", address(market));
        console2.log("Voters:               ", VOTER_COUNT);
        console2.log("Jury size:            ", JURY_SIZE);
        console2.log("Min revealed jurors:  ", MIN_REVEALED_JURORS);
        console2.log("Treasury:             ", treasury);
        console2.log("Admin:                ", admin);
        console2.log("Jury committer:       ", juryCommitter);
        console2.log("Creator:              ", creator);
        console2.log("Voting deadline:      ", market.votingDeadline());
        console2.log("Jury commit deadline: ", market.juryCommitDeadline());
        console2.log("Reveal deadline:      ", market.revealDeadline());
    }

    function commit() external {
        (address tokenAddr, address marketAddr) = _addrs();
        TruthMarket market = TruthMarket(marketAddr);
        MockERC20 token = MockERC20(tokenAddr);
        uint256 seed = _seed();

        console2.log("=== Phase: Commit (random) ===");
        uint256 yesCount;
        uint256 noCount;
        for (uint256 i = 0; i < VOTER_COUNT; i++) {
            uint8 vote = _voteFor(seed, i);
            if (vote == 1) yesCount++;
            else noCount++;
            _commit(market, token, i, vote);
        }
        console2.log("Voters voting YES:    ", yesCount);
        console2.log("Voters voting NO:     ", noCount);
        console2.log("Total committed stake:", market.totalCommittedStake());
        console2.log("Total risked stake:   ", market.totalRiskedStake());
    }

    function commitJury() external {
        (, address marketAddr) = _addrs();
        TruthMarket market = TruthMarket(marketAddr);
        uint256 juryCommitterPk = vm.deriveKey(MNEMONIC, JURY_COMMITTER_IDX);
        uint256 randomness = uint256(keccak256(abi.encode(_seed(), "jury")));
        if (randomness == 0) randomness = 1;

        console2.log("=== Phase: CommitJury (random) ===");
        vm.startBroadcast(juryCommitterPk);
        market.commitJury(randomness, AUDIT_HASH);
        vm.stopBroadcast();

        address[] memory jury = market.getJury();
        for (uint256 i = 0; i < jury.length; i++) {
            console2.log(string.concat("Juror ", vm.toString(i), ":"), jury[i]);
        }
    }

    function reveal() external {
        (, address marketAddr) = _addrs();
        TruthMarket market = TruthMarket(marketAddr);
        uint256 seed = _seed();
        console2.log("=== Phase: Reveal (random) ===");
        uint256 jurorReveals;
        uint256 nonJurorReveals;
        uint256 skipped;
        for (uint256 i = 0; i < VOTER_COUNT; i++) {
            address addr = _voterAddr(i);
            bool juror = market.isJuror(addr);
            if (!_shouldReveal(seed, i, juror)) {
                skipped++;
                continue;
            }
            uint8 vote = _voteFor(seed, i);
            _reveal(market, i, vote);
            if (juror) jurorReveals++;
            else nonJurorReveals++;
        }
        console2.log("Juror reveals:        ", jurorReveals);
        console2.log("Non-juror reveals:    ", nonJurorReveals);
        console2.log("Total reveals:        ", jurorReveals + nonJurorReveals);
        console2.log("Skipped (no reveal):  ", skipped);
    }

    function resolve() external {
        (, address marketAddr) = _addrs();
        TruthMarket market = TruthMarket(marketAddr);
        uint256 deployerPk = vm.deriveKey(MNEMONIC, DEPLOYER_IDX);
        console2.log("=== Phase: Resolve (random) ===");

        vm.startBroadcast(deployerPk);
        market.resolve();
        vm.stopBroadcast();

        _printRevealStats(market);

        for (uint256 i = 0; i < VOTER_COUNT; i++) {
            _withdraw(market, i);
        }

        vm.startBroadcast(deployerPk);
        if (market.creatorAccrued() > 0) market.withdrawCreator();
        market.withdrawTreasury();
        vm.stopBroadcast();

        printBalances();
    }

    function printBalances() public view {
        (address tokenAddr, address marketAddr) = _addrs();
        MockERC20 token = MockERC20(tokenAddr);
        address treasury = vm.addr(vm.deriveKey(MNEMONIC, TREASURY_IDX));
        address creator = vm.addr(vm.deriveKey(MNEMONIC, CREATOR_IDX));

        console2.log("=== Final balances (aggregate) ===");
        uint256 totalVoterBal;
        for (uint256 i = 0; i < VOTER_COUNT; i++) {
            totalVoterBal += token.balanceOf(_voterAddr(i));
        }
        console2.log("voters (sum):", totalVoterBal);
        console2.log("treasury:    ", token.balanceOf(treasury));
        console2.log("creator:     ", token.balanceOf(creator));
        console2.log("market:      ", token.balanceOf(marketAddr));
    }

    /// @notice End-of-run human-readable results summary. Idempotent — safe to call
    ///         any time after `resolve()`. Reads chain state only. Aggregate-only
    ///         (no per-voter dump); shows jury detail since the jury is the
    ///         small interesting set.
    /// @dev    Not marked `view` even though it does no state writes — `vm.readFile`
    ///         interacts oddly with `forge script`'s view-context resolution, so
    ///         we keep the broadcast wrapper consistent with the other phases.
    function summary() external {
        (address tokenAddr, address marketAddr) = _addrs();
        TruthMarket market = TruthMarket(marketAddr);
        MockERC20 token = MockERC20(tokenAddr);
        TruthMarket.RevealStats memory s = market.getRevealStats();
        TruthMarket.JurorVote[] memory jv = market.getJurorVotes();
        address treasury = vm.addr(vm.deriveKey(MNEMONIC, TREASURY_IDX));
        address creator = vm.addr(vm.deriveKey(MNEMONIC, CREATOR_IDX));

        console2.log("");
        console2.log("============================================================");
        console2.log("                  TRUTHMARKET RUN SUMMARY                   ");
        console2.log("============================================================");
        console2.log("Seed:                 ", _seed());
        console2.log("Outcome:              ", _outcomeLabel(s.outcome));

        // Stake flows: less interpretive than counts/P&L — surfaced first so the
        // headline (P&L) lands at the bottom of the report.
        console2.log("");
        console2.log("--- Stake flows ---");
        console2.log(string.concat("Total committed:      ", _formatEther(s.totalCommittedStake)));
        console2.log(
            string.concat(
                "Total risked:         ",
                _formatEther(s.totalRiskedStake),
                "  (",
                _formatPct(s.totalRiskedStake, s.totalCommittedStake),
                " of committed)"
            )
        );
        console2.log(
            string.concat(
                "Distributable pool:   ",
                _formatEther(s.distributablePool),
                "  (",
                _formatPct(s.distributablePool, s.totalRiskedStake),
                " of risked)"
            )
        );
        console2.log(string.concat("Treasury balance:     ", _formatEther(token.balanceOf(treasury))));
        console2.log(string.concat("Creator balance:      ", _formatEther(token.balanceOf(creator))));
        console2.log(
            string.concat(
                "Market residual:      ",
                _formatEther(token.balanceOf(marketAddr)),
                "  (",
                vm.toString(token.balanceOf(marketAddr)),
                " wei dust)"
            )
        );

        console2.log("");
        console2.log("--- Voters ---");
        console2.log("Committed:            ", s.commitCount);
        console2.log("Revealed (total):     ", s.revealedTotalCount);
        console2.log("  YES revealed:       ", s.revealedYesCount);
        console2.log("  NO  revealed:       ", s.revealedNoCount);
        console2.log("Non-revealers:        ", s.commitCount - s.revealedTotalCount);

        console2.log("");
        console2.log("--- Jury ---");
        console2.log("Drawn:                ", s.juryDrawSize);
        console2.log("Revealed:             ", s.jurorRevealCount);
        console2.log("  YES jurors:         ", s.juryYesCount);
        console2.log("  NO  jurors:         ", s.juryNoCount);
        for (uint256 i = 0; i < jv.length; i++) {
            console2.log(
                string.concat(
                    "  Juror ",
                    vm.toString(i),
                    ": ",
                    _voteLabel(jv[i].vote)
                ),
                jv[i].juror
            );
        }

        // P&L is the headline: where did the value land?
        console2.log("");
        console2.log("--- Voter P&L (vs 100 ETH starting balance) ---");
        _printPnLAggregate(token);
        console2.log("============================================================");
    }

    /// @dev Walks all voter balances once, accumulates aggregate P&L statistics.
    ///      Does not print per-voter lines — those would be 500 lines of noise.
    function _printPnLAggregate(MockERC20 token) internal view {
        uint256 winners;
        uint256 losers;
        uint256 neutral;
        int256 totalDelta;
        int256 totalWinDelta;
        uint256 totalLossDelta;
        int256 maxGain;
        uint256 maxLoss;
        address maxGainAddr;
        address maxLossAddr;
        for (uint256 i = 0; i < VOTER_COUNT; i++) {
            address addr = _voterAddr(i);
            uint256 bal = token.balanceOf(addr);
            if (bal > 100 ether) {
                uint256 gain = bal - 100 ether;
                winners++;
                totalDelta += int256(gain);
                totalWinDelta += int256(gain);
                if (int256(gain) > maxGain) {
                    maxGain = int256(gain);
                    maxGainAddr = addr;
                }
            } else if (bal < 100 ether) {
                uint256 loss = 100 ether - bal;
                losers++;
                totalDelta -= int256(loss);
                totalLossDelta += loss;
                if (loss > maxLoss) {
                    maxLoss = loss;
                    maxLossAddr = addr;
                }
            } else {
                neutral++;
            }
        }
        uint256 startingBal = 100 ether;
        uint256 avgWin = winners > 0 ? uint256(totalWinDelta) / winners : 0;
        uint256 avgLoss = losers > 0 ? totalLossDelta / losers : 0;

        console2.log("Winners:              ", winners);
        console2.log("Losers:               ", losers);
        console2.log("Even:                 ", neutral);
        console2.log(
            string.concat(
                "Avg winner gain:      ", _formatEther(avgWin), "  (", _formatPct(avgWin, startingBal), " of start)"
            )
        );
        console2.log(
            string.concat(
                "Avg loser loss:       ", _formatEther(avgLoss), "  (", _formatPct(avgLoss, startingBal), " of start)"
            )
        );
        console2.log(
            string.concat(
                "Max gain:             ",
                _formatEther(uint256(maxGain)),
                "  (",
                _formatPct(uint256(maxGain), startingBal),
                " of start)"
            )
        );
        if (maxGainAddr != address(0)) console2.log("  by:                 ", maxGainAddr);
        console2.log(
            string.concat(
                "Max loss:             ", _formatEther(maxLoss), "  (", _formatPct(maxLoss, startingBal), " of start)"
            )
        );
        if (maxLossAddr != address(0)) console2.log("  by:                 ", maxLossAddr);
        console2.log(string.concat("Net P&L sum:          ", _formatEtherSigned(totalDelta)));
    }

    // ---------- Formatting helpers ----------

    /// @dev Render `wei_` as "X.YY ETH" (2 decimal places, truncated).
    function _formatEther(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1e18;
        uint256 cents = (wei_ % 1e18) / 1e16; // hundredths of an ether
        string memory cstr = vm.toString(cents);
        if (cents < 10) cstr = string.concat("0", cstr);
        return string.concat(vm.toString(whole), ".", cstr, " ETH");
    }

    /// @dev Signed variant: prepend a leading "-" for negatives, then format the magnitude.
    function _formatEtherSigned(int256 wei_) internal pure returns (string memory) {
        if (wei_ < 0) return string.concat("-", _formatEther(uint256(-wei_)));
        return _formatEther(uint256(wei_));
    }

    /// @dev Render `numerator / denominator` as "X.YY%" with two decimal places.
    ///      Returns "n/a" if denominator is zero.
    function _formatPct(uint256 numerator, uint256 denominator) internal pure returns (string memory) {
        if (denominator == 0) return "n/a";
        // bps = numerator/denominator * 10000 → "X.YY%" with two decimal precision
        uint256 bps = (numerator * 10000) / denominator;
        uint256 whole = bps / 100;
        uint256 frac = bps % 100;
        string memory fracStr = vm.toString(frac);
        if (frac < 10) fracStr = string.concat("0", fracStr);
        return string.concat(vm.toString(whole), ".", fracStr, "%");
    }

    // ---------- Helpers ----------

    /// @dev Reads token + market addresses written by `deploy()`. Reverts loudly
    ///      if the file is missing or malformed (= deploy hasn't run).
    function _addrs() internal view returns (address tokenAddr, address marketAddr) {
        string memory raw = vm.readFile(ADDR_FILE);
        tokenAddr = vm.parseJsonAddress(raw, ".token");
        marketAddr = vm.parseJsonAddress(raw, ".market");
    }

    /// @dev Per-non-juror reveal predicate. Jurors always reveal (otherwise the
    ///      outcome flips to Invalid). For non-jurors, draws a uniform value
    ///      and skips reveal at a rate of `NON_JUROR_NON_REVEALERS / non-juror
    ///      population` so the average run produces the requested skip count.
    function _shouldReveal(uint256 seed, uint256 i, bool juror) internal pure returns (bool) {
        if (juror) return true;
        uint256 nonJurorPool = VOTER_COUNT - JURY_SIZE; // 175 - 25 = 150
        // basis-point threshold; integer math handles the ratio without floats.
        uint256 bp = (NON_JUROR_NON_REVEALERS * 10000) / nonJurorPool;
        uint256 r = uint256(keccak256(abi.encode(seed, "skip", i))) % 10000;
        return r >= bp;
    }

    function _commit(TruthMarket market, MockERC20 token, uint256 i, uint8 vote) internal {
        uint256 pk = vm.deriveKey(MNEMONIC, uint32(VOTER_BASE_IDX + i));
        address addr = vm.addr(pk);
        bytes32 hash = market.commitHashOf(vote, _nonce(i), addr);
        vm.startBroadcast(pk);
        token.approve(address(market), VOTER_STAKE);
        market.commitVote(hash, VOTER_STAKE);
        vm.stopBroadcast();
        console2.log(string.concat("v", vm.toString(i), ": vote=", _voteLabel(vote)));
    }

    function _reveal(TruthMarket market, uint256 i, uint8 vote) internal {
        uint256 pk = vm.deriveKey(MNEMONIC, uint32(VOTER_BASE_IDX + i));
        vm.startBroadcast(pk);
        market.revealVote(vote, _nonce(i));
        vm.stopBroadcast();
        console2.log(string.concat("v", vm.toString(i), ": revealed ", _voteLabel(vote)));
    }

    function _withdraw(TruthMarket market, uint256 i) internal {
        uint256 pk = vm.deriveKey(MNEMONIC, uint32(VOTER_BASE_IDX + i));
        vm.startBroadcast(pk);
        try market.withdraw() {
            // ok
        } catch {
            console2.log(string.concat("v", vm.toString(i), ": withdraw failed"));
        }
        vm.stopBroadcast();
    }

    function _printRevealStats(TruthMarket market) internal view {
        TruthMarket.RevealStats memory s = market.getRevealStats();
        console2.log("Outcome:           ", _outcomeLabel(s.outcome));
        console2.log("Active commits:    ", s.commitCount);
        console2.log("Reveals total:     ", s.revealedTotalCount);
        console2.log("  yes:             ", s.revealedYesCount);
        console2.log("  no:              ", s.revealedNoCount);
        console2.log("Jury draws:        ", s.juryDrawSize);
        console2.log("Jury reveals:      ", s.jurorRevealCount);
        console2.log("  yes:             ", s.juryYesCount);
        console2.log("  no:              ", s.juryNoCount);
        console2.log("Total committed:   ", s.totalCommittedStake);
        console2.log("Total risked:      ", s.totalRiskedStake);
        console2.log("Yes risked:        ", s.revealedYesRisked);
        console2.log("No risked:         ", s.revealedNoRisked);
        console2.log("Distributable pool:", s.distributablePool);
        console2.log("Treasury accrued:  ", s.treasuryAccrued);
        console2.log("Creator accrued:   ", s.creatorAccrued);

        TruthMarket.JurorVote[] memory jv = market.getJurorVotes();
        for (uint256 i = 0; i < jv.length; i++) {
            console2.log(
                string.concat("Juror ", vm.toString(i), " ", _voteLabel(jv[i].vote)),
                jv[i].juror
            );
        }
    }

    /// @dev Reproducible per-run seed. Override with the `SEED` env var. Default
    ///      `0xC0DEC0DE`. The seed feeds two independent draws via keccak256:
    ///      vote, and the jury randomness.
    function _seed() internal view returns (uint256) {
        return vm.envOr("SEED", uint256(0xC0DEC0DE));
    }

    /// @dev Per-voter vote in {1, 2}. Bit-balanced across many seeds.
    function _voteFor(uint256 seed, uint256 i) internal pure returns (uint8) {
        uint256 r = uint256(keccak256(abi.encode(seed, "vote", i)));
        return uint8((r % 2) + 1); // 1 = YES, 2 = NO
    }

    function _voterAddr(uint256 i) internal view returns (address) {
        return vm.addr(vm.deriveKey(MNEMONIC, uint32(VOTER_BASE_IDX + i)));
    }

    function _nonce(uint256 i) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode("voter-nonce-random", i))));
    }

    function _voteLabel(uint8 v) internal pure returns (string memory) {
        if (v == 1) return "YES";
        if (v == 2) return "NO";
        return "?";
    }

    function _outcomeLabel(TruthMarket.Outcome o) internal pure returns (string memory) {
        if (o == TruthMarket.Outcome.Yes) return "Yes";
        if (o == TruthMarket.Outcome.No) return "No";
        if (o == TruthMarket.Outcome.Invalid) return "Invalid";
        return "Unresolved";
    }
}
