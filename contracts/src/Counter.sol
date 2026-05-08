// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract Counter {
    uint256 public number;

    event NumberSet(address indexed by, uint256 newNumber);
    event Incremented(address indexed by, uint256 newNumber);

    error AmountZero();

    function setNumber(uint256 newNumber) external {
        number = newNumber;
        emit NumberSet(msg.sender, newNumber);
    }

    function increment() external {
        unchecked {
            ++number;
        }
        emit Incremented(msg.sender, number);
    }

    function incrementBy(uint256 amount) external {
        if (amount == 0) revert AmountZero();
        number += amount;
        emit Incremented(msg.sender, number);
    }
}
