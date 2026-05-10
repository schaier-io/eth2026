// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { TruthMarket } from "../src/TruthMarket.sol";

/// @notice Single source of truth for deterministic CREATE2 deployment of the
///         `TruthMarket` reference implementation used by minimal clones.
///
///         Address formula:
///             keccak256(0xff ++ DEPLOYER ++ SALT ++ keccak256(initCode))[12:]
///
///         `DEPLOYER` is the canonical Arachnid/Foundry deterministic deployer.
///         Foundry routes any `new Foo{salt: ...}()` from a broadcast tx through
///         this address; anvil ships it pre-deployed.
///
///         The salt encodes the reference version. If `TruthMarket` changes in a
///         way that should create a fresh shared implementation address, bump the
///         salt label together with `TruthMarket.CONTRACT_VERSION`.
library TruthMarketReferenceDeployment {
    address internal constant DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 internal constant SALT = keccak256(bytes("TruthMarketReference.v1"));

    /// @notice Returns the address at which a CREATE2 deployment using `SALT`
    ///         and the current `TruthMarket` creation code will land.
    function predict() internal pure returns (address) {
        bytes32 initCodeHash = keccak256(type(TruthMarket).creationCode);
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), DEPLOYER, SALT, initCodeHash)))));
    }
}
