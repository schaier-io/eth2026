// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { TruthMarketRegistry } from "../src/TruthMarketRegistry.sol";
import { RegistryDeployment } from "./RegistryDeployment.sol";

/// @notice Deterministic CREATE2 deploy of `TruthMarketRegistry`. The address
///         is derived from `RegistryDeployment.SALT` and the registry's
///         creation code, so every chain that uses these scripts ends up with
///         the registry at the same address. Foundry routes
///         `new Foo{salt: ...}()` from a broadcast tx through the canonical
///         deterministic deployer (`0x4e59b...`), which anvil ships
///         pre-deployed.
///
/// Usage:
///   forge script script/RegistryDeploy.s.sol --sig 'run()'    --rpc-url <NET> --broadcast -vvv
///   forge script script/RegistryDeploy.s.sol --sig 'predict()' --rpc-url <NET>
///
/// `run()` is idempotent — if the predicted address already has code, no tx
/// is sent. `predict()` is RPC-free: it just prints the deterministic address.
contract RegistryDeployScript is Script {
    function run() external returns (TruthMarketRegistry registry) {
        address predicted = RegistryDeployment.predict();
        console2.log("Salt:        ", vm.toString(RegistryDeployment.SALT));
        console2.log("Deployer:    ", RegistryDeployment.DEPLOYER);
        console2.log("Predicted:   ", predicted);

        if (predicted.code.length > 0) {
            console2.log("Already deployed; nothing to do.");
            return TruthMarketRegistry(predicted);
        }

        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        registry = new TruthMarketRegistry{ salt: RegistryDeployment.SALT }();
        vm.stopBroadcast();

        require(address(registry) == predicted, "CREATE2 address drift");
        console2.log("TruthMarketRegistry deployed at:", address(registry));
    }

    /// @notice Print the CREATE2 address without sending any tx. Useful from
    ///         CI / tooling: no PRIVATE_KEY needed, no RPC needed (though
    ///         forge still wants one).
    function predict() external pure returns (address) {
        return RegistryDeployment.predict();
    }
}
