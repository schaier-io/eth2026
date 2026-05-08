// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";

/// @notice Deploy a TruthMarket with its full configuration baked in at construction.
contract TruthMarketScript is Script {
    function run() external returns (TruthMarket market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address treasury = vm.envOr("TREASURY", deployer);
        address admin = vm.envOr("ADMIN", deployer);
        address juryCommitter = vm.envOr("JURY_COMMITTER", deployer);
        bytes memory ipfsHash = vm.envBytes("IPFS_HASH");
        uint64 votingPeriod = uint64(vm.envUint("VOTING_PERIOD"));
        uint64 adminTimeout = uint64(vm.envUint("ADMIN_TIMEOUT"));
        uint64 revealPeriod = uint64(vm.envUint("REVEAL_PERIOD"));
        uint96 protocolFeeBps = uint96(vm.envUint("PROTOCOL_FEE_BPS"));
        uint96 minStake = uint96(vm.envUint("MIN_STAKE"));
        uint32 jurySize = uint32(vm.envUint("JURY_SIZE"));
        uint32 minCommits = uint32(vm.envUint("MIN_COMMITS"));
        uint32 minRevealedJurors = uint32(vm.envUint("MIN_REVEALED_JURORS"));

        vm.startBroadcast(pk);
        market = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: IERC20(stakeToken),
                treasury: treasury,
                admin: admin,
                juryCommitter: juryCommitter,
                ipfsHash: ipfsHash,
                votingPeriod: votingPeriod,
                adminTimeout: adminTimeout,
                revealPeriod: revealPeriod,
                protocolFeeBps: protocolFeeBps,
                minStake: minStake,
                jurySize: jurySize,
                minCommits: minCommits,
                minRevealedJurors: minRevealedJurors
            })
        );
        vm.stopBroadcast();

        console2.log("TruthMarket deployed at:", address(market));
        console2.log("Stake token:", stakeToken);
        console2.log("Treasury:", treasury);
        console2.log("Admin:", admin);
        console2.log("Jury committer:", juryCommitter);
    }
}
