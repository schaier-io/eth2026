// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { TruthMarket } from "../src/TruthMarket.sol";
import { TruthMarketReferenceDeployment } from "./TruthMarketReferenceDeployment.sol";

/// @notice Deploy the TruthMarket reference implementation used by EIP-1167
///         minimal clones. The implementation constructor locks itself, so it
///         cannot be initialized or used as a live market.
contract TruthMarketReferenceScript is Script {
    function run() external returns (TruthMarket truthMarketReference) {
        address predicted = TruthMarketReferenceDeployment.predict();
        console2.log("Salt:                  ", vm.toString(TruthMarketReferenceDeployment.SALT));
        console2.log("Deployer:              ", TruthMarketReferenceDeployment.DEPLOYER);
        console2.log("Predicted reference:    ", predicted);

        if (predicted.code.length > 0) {
            console2.log("Already deployed; nothing to do.");
            return TruthMarket(predicted);
        }

        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        truthMarketReference = new TruthMarket{ salt: TruthMarketReferenceDeployment.SALT }();
        vm.stopBroadcast();

        require(address(truthMarketReference) == predicted, "CREATE2 address drift");
        console2.log("TruthMarket reference:", address(truthMarketReference));
        console2.log("Contract version:     ", truthMarketReference.CONTRACT_VERSION());
        console2.log("Use as TRUTHMARKET_REFERENCE_ADDRESS for MarketRegistry deploy.");
    }

    /// @notice Print the deterministic CREATE2 reference address without
    ///         sending a transaction.
    function predict() external pure returns (address) {
        return TruthMarketReferenceDeployment.predict();
    }
}
