// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { ITruthMarketRegistry } from "../src/TruthMarketRegistry.sol";

/// @notice Deploy a MarketRegistry. Reads operational addresses from env so the
///         same script targets anvil and live networks. Each deployed market
///         created through the resulting registry inherits these.
///
///         Required env:
///           PRIVATE_KEY        - deployer key
///           STAKE_TOKEN        - ERC20 used by every market
///           DISCOVERY_REGISTRY - TruthMarketRegistry used for market self-registration
///         Optional env (default to deployer address):
///           TREASURY           - company treasury for protocol fees + dust
///           ADMIN              - market admin address
///           JURY_COMMITTER     - cTRNG jury committer address
contract MarketRegistryScript is Script {
    function run() external returns (MarketRegistry registry) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address discoveryRegistry = vm.envAddress("DISCOVERY_REGISTRY");
        address treasury = vm.envOr("TREASURY", deployer);
        address admin = vm.envOr("ADMIN", deployer);
        address juryCommitter = vm.envOr("JURY_COMMITTER", deployer);

        vm.startBroadcast(pk);
        registry = new MarketRegistry(
            IERC20(stakeToken),
            treasury,
            ITruthMarketRegistry(discoveryRegistry),
            admin,
            juryCommitter
        );
        vm.stopBroadcast();

        console2.log("MarketRegistry deployed at:", address(registry));
        console2.log("Stake token:        ", stakeToken);
        console2.log("Discovery registry: ", discoveryRegistry);
        console2.log("Treasury:           ", treasury);
        console2.log("Admin:              ", admin);
        console2.log("Jury committer:     ", juryCommitter);
    }
}
