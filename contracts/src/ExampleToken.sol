// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ExampleToken is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    uint256 public immutable maxSupply;

    error MaxSupplyExceeded(uint256 requested, uint256 cap);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        uint256 maxSupply_,
        address owner_
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(owner_) {
        if (initialSupply > maxSupply_) revert MaxSupplyExceeded(initialSupply, maxSupply_);
        maxSupply = maxSupply_;
        _mint(owner_, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        uint256 newSupply = totalSupply() + amount;
        if (newSupply > maxSupply) revert MaxSupplyExceeded(newSupply, maxSupply);
        _mint(to, amount);
    }
}
