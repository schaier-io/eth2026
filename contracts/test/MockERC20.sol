// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal ERC20 for tests and local simulations. Open mint — never deploy
///         this anywhere a permissionless minter is unsafe.
contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s, uint256 initial, address to) ERC20(n, s) {
        _mint(to, initial);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
