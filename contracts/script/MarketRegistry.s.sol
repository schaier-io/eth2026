// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { MarketRegistry } from "../src/MarketRegistry.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { TruthMarketReferenceDeployment } from "./TruthMarketReferenceDeployment.sol";

/// @notice Deploy the TruthMarket implementation once, then deploy the clone
///         factory/discovery registry that creates all user markets.
contract MarketRegistryScript is Script {
    function run() external returns (TruthMarket implementation, MarketRegistry registry) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address referenceAddress = vm.envOr("TRUTHMARKET_REFERENCE_ADDRESS", address(0));

        address predictedReference = TruthMarketReferenceDeployment.predict();
        console2.log("Predicted TruthMarket reference:", predictedReference);

        vm.startBroadcast(pk);
        if (referenceAddress == address(0)) {
            if (predictedReference.code.length > 0) {
                implementation = TruthMarket(predictedReference);
            } else {
                implementation = new TruthMarket{ salt: TruthMarketReferenceDeployment.SALT }();
                require(address(implementation) == predictedReference, "CREATE2 address drift");
            }
        } else {
            require(referenceAddress.code.length > 0, "reference has no code");
            implementation = TruthMarket(referenceAddress);
        }
        registry = new MarketRegistry(address(implementation));
        vm.stopBroadcast();

        console2.log("TruthMarket implementation:", address(implementation));
        console2.log("Implementation version:    ", implementation.CONTRACT_VERSION());
        console2.log("MarketRegistry:            ", address(registry));
        console2.log("Registry version:          ", registry.CONTRACT_VERSION());
        console2.log("Stake token:                configured per clone");
        console2.log("Jury committer:             configured per clone");
    }
}
