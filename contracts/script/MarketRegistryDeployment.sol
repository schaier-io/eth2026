// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MarketRegistry } from "../src/MarketRegistry.sol";

/// @notice Single source of truth for deterministic CREATE2 deployment of the
///         `MarketRegistry` clone factory/discovery index.
///
///         Address formula:
///             keccak256(0xff ++ DEPLOYER ++ SALT ++ keccak256(initCode))[12:]
///
///         `DEPLOYER` is the canonical Arachnid/Foundry deterministic deployer.
///         Foundry routes any `new Foo{salt: ...}()` from a broadcast tx through
///         this address; anvil ships it pre-deployed.
///
///         The salt encodes the registry deployment generation. Fresh starts can
///         reset to `.v1`; future incompatible registry generations should bump
///         the label so old deployments remain addressable.
library MarketRegistryDeployment {
    address internal constant DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 internal constant SALT = keccak256(bytes("MarketRegistry.v1"));

    /// @notice Returns the address at which a CREATE2 deployment using `SALT`,
    ///         the current `MarketRegistry` creation code, and the provided
    ///         implementation constructor arg will land.
    function predict(address implementation) internal pure returns (address) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(MarketRegistry).creationCode, abi.encode(implementation)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), DEPLOYER, SALT, initCodeHash)))));
    }
}
