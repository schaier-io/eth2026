// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { MockERC20 } from "../test/MockERC20.sol";

/// @notice Anvil-driven full simulation. Each phase is a separate sig so the shell
///         driver (`bin/sim-anvil`) can advance the chain clock between phases via
///         `cast rpc evm_increaseTime`.
///
/// Phases:
///   deploy()         — deploy MockERC20 + TruthMarket, fund 7 voters
///   commit()         — 7 voters commit hidden votes (jurySize=1, minCommits=7)
///   commitJury()     — jury committer posts randomness; contract draws 1 juror
///   reveal()         — 7 voters reveal
///   resolve()        — anyone resolves; voters and treasury withdraw
///   printBalances()  — show final stake-token balances
///
/// All phases assume a fresh anvil run because the deterministic MockERC20 /
/// TruthMarket addresses (deployer's nonce 0/1) are hardcoded. The mock token has
/// an open mint and is for local simulation only.
///
/// Anvil must be started with at least 12 accounts (deployer + 4 roles + 7 voters):
///   anvil --accounts 12   (or higher)
contract SimulateAnvilScript is Script {
    // ---------- Anvil deterministic accounts (mnemonic: "test test ... junk") ----------
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant TREASURY_PK =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant ADMIN_PK =
        0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant JURY_COMMITTER_PK =
        0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 internal constant CREATOR_PK =
        0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    // 7 voter keys — anvil accounts 5 through 11.
    uint256 internal constant V0_PK =
        0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;
    uint256 internal constant V1_PK =
        0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e;
    uint256 internal constant V2_PK =
        0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356;
    uint256 internal constant V3_PK =
        0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97;
    uint256 internal constant V4_PK =
        0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6;
    uint256 internal constant V5_PK =
        0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897;
    uint256 internal constant V6_PK =
        0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82;

    // ---------- Deterministic deploy addresses (deployer's first two contract nonces) ----------
    address internal constant TOKEN_ADDR = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address internal constant MARKET_ADDR = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    // ---------- Market config ----------
    bytes internal constant IPFS_HASH = bytes("ipfs://QmAnvilSimDemo");
    bytes32 internal constant AUDIT_HASH = keccak256("ctrng-anvil-output");
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint8 internal constant FEE_PERCENT = 5;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint32 internal constant JURY_SIZE = 1;
    uint32 internal constant MIN_COMMITS = 7;
    uint32 internal constant MIN_REVEALED_JURORS = 1;

    uint96 internal constant VOTER_STAKE = 50 ether;
    uint8 internal constant VOTER_CONV = 40; // 40% conviction

    // ---------- Phases ----------

    function deploy() external {
        address deployer = vm.addr(DEPLOYER_PK);
        address treasury = vm.addr(TREASURY_PK);
        address admin = vm.addr(ADMIN_PK);
        address juryCommitter = vm.addr(JURY_COMMITTER_PK);
        address creator = vm.addr(CREATOR_PK);

        vm.startBroadcast(DEPLOYER_PK);
        MockERC20 token = new MockERC20("Truth Stake", "TRUTH", 100_000 ether, deployer);
        string[] memory tags = new string[](3);
        tags[0] = "anvil";
        tags[1] = "demo";
        tags[2] = "lifecycle";
        TruthMarket market = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: IERC20(address(token)),
                treasury: treasury,
                admin: admin,
                juryCommitter: juryCommitter,
                creator: creator,
                name: "Anvil Demo Claim",
                description: "End-to-end TruthMarket lifecycle on a fresh anvil node.",
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
        for (uint256 i = 0; i < 7; i++) {
            token.transfer(_voterAddr(i), 1_000 ether);
        }
        vm.stopBroadcast();

        require(address(token) == TOKEN_ADDR, "token addr drift");
        require(address(market) == MARKET_ADDR, "market addr drift");

        console2.log("=== Phase: Deploy ===");
        console2.log("Token:                ", address(token));
        console2.log("Market:               ", address(market));
        console2.log("Name:                 ", market.name());
        console2.log("Description:          ", market.description());
        console2.log("Tags count:           ", market.getTags().length);
        console2.log("Treasury:             ", treasury);
        console2.log("Admin:                ", admin);
        console2.log("Jury committer:       ", juryCommitter);
        console2.log("Creator:              ", creator);
        console2.log("Voting deadline:      ", market.votingDeadline());
        console2.log("Jury commit deadline: ", market.juryCommitDeadline());
        console2.log("Reveal deadline:      ", market.revealDeadline());
        console2.log("Jury size:            ", market.jurySize());
        console2.log("Min commits:          ", market.minCommits());
    }

    function commit() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        MockERC20 token = MockERC20(TOKEN_ADDR);

        console2.log("=== Phase: Commit ===");
        for (uint256 i = 0; i < 7; i++) {
            _commit(market, token, _voterPk(i), 1, _nonce(i), VOTER_STAKE, VOTER_CONV, i);
        }
        console2.log("Total committed stake:", market.totalCommittedStake());
        console2.log("Total risked stake:   ", market.totalRiskedStake());
    }

    function commitJury() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        console2.log("=== Phase: CommitJury ===");

        vm.startBroadcast(JURY_COMMITTER_PK);
        market.commitJury(0xC0FFEE, AUDIT_HASH);
        vm.stopBroadcast();

        address[] memory jury = market.getJury();
        for (uint256 i = 0; i < jury.length; i++) {
            console2.log(string.concat("Juror ", vm.toString(i), ":"), jury[i]);
        }
    }

    function reveal() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        console2.log("=== Phase: Reveal ===");
        for (uint256 i = 0; i < 7; i++) {
            _reveal(market, _voterPk(i), 1, _nonce(i), i);
        }
    }

    function resolve() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        console2.log("=== Phase: Resolve ===");

        vm.startBroadcast(DEPLOYER_PK);
        market.resolve();
        vm.stopBroadcast();

        _printRevealStats(market);

        for (uint256 i = 0; i < 7; i++) {
            _withdraw(market, _voterPk(i), i);
        }

        vm.startBroadcast(DEPLOYER_PK);
        if (market.creatorAccrued() > 0) market.withdrawCreator();
        market.withdrawTreasury();
        vm.stopBroadcast();

        printBalances();
    }

    function _printRevealStats(TruthMarket market) internal view {
        TruthMarket.RevealStats memory s = market.getRevealStats();
        console2.log("Outcome:           ", _outcomeLabel(s.outcome));
        console2.log("Active commits:    ", s.commitCount);
        console2.log("Revoked:           ", s.revokedCount);
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
        console2.log("Juror yes stake:   ", s.jurorYesStake);
        console2.log("Juror no stake:    ", s.jurorNoStake);
        console2.log("Distributable pool:", s.distributablePool);
        console2.log("Revoked accrued:   ", s.revokedSlashAccrued);
        console2.log("Treasury accrued:  ", s.treasuryAccrued);
        console2.log("Creator accrued:   ", s.creatorAccrued);

        TruthMarket.JurorVote[] memory jv = market.getJurorVotes();
        for (uint256 i = 0; i < jv.length; i++) {
            console2.log(
                string.concat(
                    "Juror ", vm.toString(i), " ", _voteLabel(jv[i].vote), " revealed=", jv[i].revealed ? "yes" : "no"
                ),
                jv[i].juror
            );
        }
    }

    function _voteLabel(uint8 v) internal pure returns (string memory) {
        if (v == 1) return "YES";
        if (v == 2) return "NO";
        return "?";
    }

    function printBalances() public view {
        MockERC20 token = MockERC20(TOKEN_ADDR);
        console2.log("=== Final balances ===");
        for (uint256 i = 0; i < 7; i++) {
            console2.log(string.concat("v", vm.toString(i), ":      "), token.balanceOf(_voterAddr(i)));
        }
        console2.log("treasury: ", token.balanceOf(vm.addr(TREASURY_PK)));
        console2.log("creator:  ", token.balanceOf(vm.addr(CREATOR_PK)));
        console2.log("market:   ", token.balanceOf(MARKET_ADDR));
    }

    // ---------- Helpers ----------

    function _commit(
        TruthMarket market,
        MockERC20 token,
        uint256 pk,
        uint8 vote,
        bytes32 nonce,
        uint96 stake,
        uint8 conv,
        uint256 i
    ) internal {
        bytes32 hash = market.commitHashOf(vote, nonce, vm.addr(pk));
        vm.startBroadcast(pk);
        token.approve(address(market), stake);
        market.commitVote(hash, stake, conv);
        vm.stopBroadcast();
        console2.log(string.concat("v", vm.toString(i), ": committed vote=", vm.toString(vote)));
    }

    function _reveal(TruthMarket market, uint256 pk, uint8 vote, bytes32 nonce, uint256 i) internal {
        vm.startBroadcast(pk);
        market.revealVote(vote, nonce);
        vm.stopBroadcast();
        console2.log(string.concat("v", vm.toString(i), ": revealed"));
    }

    function _withdraw(TruthMarket market, uint256 pk, uint256 i) internal {
        vm.startBroadcast(pk);
        try market.withdraw() {
            // ok
        } catch {
            console2.log(string.concat("v", vm.toString(i), ": withdraw failed"));
        }
        vm.stopBroadcast();
    }

    function _voterPk(uint256 i) internal pure returns (uint256) {
        if (i == 0) return V0_PK;
        if (i == 1) return V1_PK;
        if (i == 2) return V2_PK;
        if (i == 3) return V3_PK;
        if (i == 4) return V4_PK;
        if (i == 5) return V5_PK;
        if (i == 6) return V6_PK;
        revert("voter index out of range");
    }

    function _voterAddr(uint256 i) internal pure returns (address) {
        return vm.addr(_voterPk(i));
    }

    function _nonce(uint256 i) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode("voter-nonce", i))));
    }

    function _outcomeLabel(TruthMarket.Outcome o) internal pure returns (string memory) {
        if (o == TruthMarket.Outcome.Yes) return "Yes";
        if (o == TruthMarket.Outcome.No) return "No";
        if (o == TruthMarket.Outcome.Invalid) return "Invalid";
        return "Unresolved";
    }
}
