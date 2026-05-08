// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { ExampleToken } from "../src/ExampleToken.sol";

/// @notice Anvil-driven full simulation. Each phase is a separate sig so the shell
///         driver (`bin/sim-anvil`) can advance the chain clock between phases via
///         `cast rpc evm_increaseTime`.
///
/// Phases:
///   deploy()       — deploy ExampleToken + TruthMarket, fund voters
///   commit()       — three voters commit hidden votes
///   commitJury()   — jury committer posts randomness; contract draws jury
///   reveal()       — three voters reveal
///   resolve()      — anyone resolves; voters and treasury withdraw
///   printBalances()— show final stake-token balances
///
/// All phases assume a fresh anvil run because the deterministic ExampleToken /
/// TruthMarket addresses (deployer's nonce 0/1) are hardcoded.
contract SimulateAnvilScript is Script {
    // ---------- Anvil deterministic accounts ----------
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant TREASURY_PK =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant ADMIN_PK =
        0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant JURY_COMMITTER_PK =
        0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 internal constant ALICE_PK =
        0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
    uint256 internal constant BOB_PK =
        0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;
    uint256 internal constant CAROL_PK =
        0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e;

    // ---------- Deterministic deploy addresses (deployer's first two contract nonces) ----------
    address internal constant TOKEN_ADDR = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address internal constant MARKET_ADDR = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    // ---------- Market config ----------
    bytes internal constant IPFS_HASH = bytes("ipfs://QmAnvilSimDemo");
    bytes32 internal constant AUDIT_HASH = keccak256("ctrng-anvil-output");
    uint64 internal constant VOTING_PERIOD = 1 days;
    uint64 internal constant ADMIN_TIMEOUT = 12 hours;
    uint64 internal constant REVEAL_PERIOD = 1 days;
    uint96 internal constant FEE_BPS = 500;
    uint96 internal constant MIN_STAKE = 1 ether;
    uint32 internal constant JURY_SIZE = 3;
    uint32 internal constant MIN_COMMITS = 3;
    uint32 internal constant MIN_REVEALED_JURORS = 2;

    bytes32 internal constant ALICE_NONCE = "alice";
    bytes32 internal constant BOB_NONCE = "bob";
    bytes32 internal constant CAROL_NONCE = "carol";

    uint96 internal constant ALICE_STAKE = 100 ether;
    uint96 internal constant BOB_STAKE = 60 ether;
    uint96 internal constant CAROL_STAKE = 40 ether;
    uint16 internal constant ALICE_CONV = 10_000;
    uint16 internal constant BOB_CONV = 10_000;
    uint16 internal constant CAROL_CONV = 5_000;
    uint8 internal constant ALICE_VOTE = 1;
    uint8 internal constant BOB_VOTE = 2;
    uint8 internal constant CAROL_VOTE = 1;

    // ---------- Phases ----------

    function deploy() external {
        address deployer = vm.addr(DEPLOYER_PK);
        address treasury = vm.addr(TREASURY_PK);
        address admin = vm.addr(ADMIN_PK);
        address juryCommitter = vm.addr(JURY_COMMITTER_PK);

        vm.startBroadcast(DEPLOYER_PK);
        ExampleToken token = new ExampleToken("Truth Stake", "TRUTH", 100_000 ether, 1_000_000 ether, deployer);
        TruthMarket market = new TruthMarket(
            TruthMarket.InitParams({
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
                jurySize: JURY_SIZE,
                minCommits: MIN_COMMITS,
                minRevealedJurors: MIN_REVEALED_JURORS
            })
        );
        token.transfer(vm.addr(ALICE_PK), 1_000 ether);
        token.transfer(vm.addr(BOB_PK), 1_000 ether);
        token.transfer(vm.addr(CAROL_PK), 1_000 ether);
        vm.stopBroadcast();

        require(address(token) == TOKEN_ADDR, "token addr drift");
        require(address(market) == MARKET_ADDR, "market addr drift");

        console2.log("=== Phase: Deploy ===");
        console2.log("Token:                ", address(token));
        console2.log("Market:               ", address(market));
        console2.log("Treasury:             ", treasury);
        console2.log("Admin:                ", admin);
        console2.log("Jury committer:       ", juryCommitter);
        console2.log("Voting deadline:      ", market.votingDeadline());
        console2.log("Jury commit deadline: ", market.juryCommitDeadline());
        console2.log("Reveal deadline:      ", market.revealDeadline());
    }

    function commit() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        ExampleToken token = ExampleToken(TOKEN_ADDR);

        console2.log("=== Phase: Commit ===");
        _commit(market, token, ALICE_PK, ALICE_VOTE, ALICE_NONCE, ALICE_STAKE, ALICE_CONV, "alice");
        _commit(market, token, BOB_PK, BOB_VOTE, BOB_NONCE, BOB_STAKE, BOB_CONV, "bob");
        _commit(market, token, CAROL_PK, CAROL_VOTE, CAROL_NONCE, CAROL_STAKE, CAROL_CONV, "carol");
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
            console2.log(string.concat("Juror ", vm.toString(i), ":"), jury[i], _labelOf(jury[i]));
        }
    }

    function reveal() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        console2.log("=== Phase: Reveal ===");
        _reveal(market, ALICE_PK, ALICE_VOTE, ALICE_NONCE, "alice");
        _reveal(market, BOB_PK, BOB_VOTE, BOB_NONCE, "bob");
        _reveal(market, CAROL_PK, CAROL_VOTE, CAROL_NONCE, "carol");
    }

    function resolve() external {
        TruthMarket market = TruthMarket(MARKET_ADDR);
        console2.log("=== Phase: Resolve ===");

        vm.startBroadcast(DEPLOYER_PK);
        market.resolve();
        vm.stopBroadcast();

        console2.log("Outcome:           ", _outcomeLabel(market.outcome()));
        console2.log("juryYesCount:      ", market.juryYesCount());
        console2.log("juryNoCount:       ", market.juryNoCount());
        console2.log("Distributable pool:", market.distributablePool());
        console2.log("Treasury accrued:  ", market.treasuryAccrued());

        _withdraw(market, ALICE_PK, "alice");
        _withdraw(market, BOB_PK, "bob");
        _withdraw(market, CAROL_PK, "carol");

        vm.startBroadcast(DEPLOYER_PK);
        market.withdrawTreasury();
        vm.stopBroadcast();

        printBalances();
    }

    function printBalances() public view {
        ExampleToken token = ExampleToken(TOKEN_ADDR);
        console2.log("=== Final balances ===");
        console2.log("alice:    ", token.balanceOf(vm.addr(ALICE_PK)));
        console2.log("bob:      ", token.balanceOf(vm.addr(BOB_PK)));
        console2.log("carol:    ", token.balanceOf(vm.addr(CAROL_PK)));
        console2.log("treasury: ", token.balanceOf(vm.addr(TREASURY_PK)));
        console2.log("market:   ", token.balanceOf(MARKET_ADDR));
    }

    // ---------- Helpers ----------

    function _commit(
        TruthMarket market,
        ExampleToken token,
        uint256 pk,
        uint8 vote,
        bytes32 nonce,
        uint96 stake,
        uint16 conv,
        string memory label
    ) internal {
        bytes32 hash = market.commitHashOf(vote, nonce, vm.addr(pk));
        vm.startBroadcast(pk);
        token.approve(address(market), stake);
        market.commitVote(hash, stake, conv);
        vm.stopBroadcast();
        console2.log(string.concat(label, ": vote=", vm.toString(vote), " stake=", _ether(stake)));
    }

    function _reveal(TruthMarket market, uint256 pk, uint8 vote, bytes32 nonce, string memory label) internal {
        vm.startBroadcast(pk);
        market.revealVote(vote, nonce);
        vm.stopBroadcast();
        console2.log(string.concat(label, ": revealed vote ", vm.toString(vote)));
    }

    function _withdraw(TruthMarket market, uint256 pk, string memory label) internal {
        vm.startBroadcast(pk);
        try market.withdraw() {
            console2.log(string.concat(label, ": withdrew"));
        } catch {
            console2.log(string.concat(label, ": withdraw failed"));
            vm.stopBroadcast();
            return;
        }
        vm.stopBroadcast();
    }

    function _labelOf(address a) internal pure returns (string memory) {
        if (a == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65) return "(alice)";
        if (a == 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc) return "(bob)";
        if (a == 0x976EA74026E726554dB657fA54763abd0C3a0aa9) return "(carol)";
        return "";
    }

    function _outcomeLabel(TruthMarket.Outcome o) internal pure returns (string memory) {
        if (o == TruthMarket.Outcome.Yes) return "Yes";
        if (o == TruthMarket.Outcome.No) return "No";
        if (o == TruthMarket.Outcome.Invalid) return "Invalid";
        return "Unresolved";
    }

    function _ether(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1 ether;
        uint256 frac = (wei_ % 1 ether) / 1e15;
        if (frac == 0) return string.concat(vm.toString(whole), " ether");
        return string.concat(vm.toString(whole), ".", _padded3(frac), " ether");
    }

    function _padded3(uint256 x) internal pure returns (string memory) {
        if (x >= 100) return vm.toString(x);
        if (x >= 10) return string.concat("0", vm.toString(x));
        return string.concat("00", vm.toString(x));
    }
}
