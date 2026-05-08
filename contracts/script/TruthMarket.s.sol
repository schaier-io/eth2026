// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";

contract TruthMarketScript is Script {
    function run() external returns (TruthMarket market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address treasury = vm.envOr("TREASURY", deployer);
        address admin = vm.envOr("ADMIN", deployer);
        address juryCommitter = vm.envOr("JURY_COMMITTER", deployer);

        vm.startBroadcast(pk);
        market = new TruthMarket(IERC20(stakeToken), treasury, admin, juryCommitter);
        vm.stopBroadcast();

        console2.log("TruthMarket deployed at:", address(market));
        console2.log("Stake token:", stakeToken);
        console2.log("Treasury:", treasury);
        console2.log("Admin:", admin);
        console2.log("Jury committer:", juryCommitter);
    }
}
