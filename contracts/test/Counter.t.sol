// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter public counter;

    event NumberSet(address indexed by, uint256 newNumber);
    event Incremented(address indexed by, uint256 newNumber);

    function setUp() public {
        counter = new Counter();
    }

    function test_InitialNumberIsZero() public view {
        assertEq(counter.number(), 0);
    }

    function test_Increment() public {
        vm.expectEmit(true, false, false, true);
        emit Incremented(address(this), 1);
        counter.increment();
        assertEq(counter.number(), 1);
    }

    function test_SetNumber() public {
        vm.expectEmit(true, false, false, true);
        emit NumberSet(address(this), 42);
        counter.setNumber(42);
        assertEq(counter.number(), 42);
    }

    function test_IncrementBy() public {
        counter.incrementBy(5);
        assertEq(counter.number(), 5);
        counter.incrementBy(10);
        assertEq(counter.number(), 15);
    }

    function test_RevertWhen_IncrementByZero() public {
        vm.expectRevert(Counter.AmountZero.selector);
        counter.incrementBy(0);
    }

    function testFuzz_SetNumber(uint256 x) public {
        counter.setNumber(x);
        assertEq(counter.number(), x);
    }

    function testFuzz_IncrementBy(uint256 a, uint256 b) public {
        a = bound(a, 1, type(uint128).max);
        b = bound(b, 1, type(uint128).max);
        counter.incrementBy(a);
        counter.incrementBy(b);
        assertEq(counter.number(), a + b);
    }
}
