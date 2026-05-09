// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { TruthMarketRegistry } from "../src/TruthMarketRegistry.sol";

/// @notice Single source of truth for the deterministic CREATE2 deployment of
///         `TruthMarketRegistry`. Every script that deploys, predicts, or
///         resolves the registry imports from here.
///
///         Address formula:
///             keccak256(0xff ++ DEPLOYER ++ SALT ++ keccak256(initCode))[12:]
///
///         `DEPLOYER` is the canonical Arachnid/Foundry deterministic deployer.
///         Foundry routes any `new Foo{salt: ...}()` from a broadcast tx
///         through this address; anvil ships it pre-deployed.
///
///         The salt encodes a version tag — if the registry contract ever
///         changes in a way that requires a new on-chain instance, bump the
///         version (e.g. `.v2`) so the new bytecode lands at a fresh address
///         and the old one stays addressable for legacy markets.
library RegistryDeployment {
    address internal constant DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 internal constant SALT = keccak256(bytes("TruthMarketRegistry.v1"));

    /// @notice Returns the address at which a CREATE2 deployment using `SALT`
    ///         and the current `TruthMarketRegistry` creation code will land.
    ///         Pure: callable from view scripts and constructors alike.
    function predict() internal pure returns (address) {
        bytes32 initCodeHash = keccak256(type(TruthMarketRegistry).creationCode);
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), DEPLOYER, SALT, initCodeHash)))));
    }
}
