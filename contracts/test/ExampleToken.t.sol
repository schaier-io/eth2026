// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ExampleToken} from "../src/ExampleToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract ExampleTokenTest is Test {
    ExampleToken internal token;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant INITIAL = 1_000_000 ether;
    uint256 internal constant MAX = 10_000_000 ether;

    function setUp() public {
        token = new ExampleToken("Example", "EXM", INITIAL, MAX, owner);
    }

    function test_Metadata() public view {
        assertEq(token.name(), "Example");
        assertEq(token.symbol(), "EXM");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), INITIAL);
        assertEq(token.balanceOf(owner), INITIAL);
        assertEq(token.maxSupply(), MAX);
        assertEq(token.owner(), owner);
    }

    function test_OwnerCanMint() public {
        vm.prank(owner);
        token.mint(alice, 500 ether);
        assertEq(token.balanceOf(alice), 500 ether);
    }

    function test_RevertWhen_NonOwnerMints() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1 ether);
    }

    function test_RevertWhen_MintAboveCap() public {
        uint256 over = MAX - INITIAL + 1;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ExampleToken.MaxSupplyExceeded.selector, INITIAL + over, MAX));
        token.mint(alice, over);
    }

    function test_Burn() public {
        vm.prank(owner);
        token.transfer(alice, 100 ether);
        vm.prank(alice);
        token.burn(40 ether);
        assertEq(token.balanceOf(alice), 60 ether);
        assertEq(token.totalSupply(), INITIAL - 40 ether);
    }

    function test_Transfer() public {
        vm.prank(owner);
        token.transfer(alice, 250 ether);
        assertEq(token.balanceOf(alice), 250 ether);
        assertEq(token.balanceOf(owner), INITIAL - 250 ether);
    }

    function test_RevertWhen_TransferInsufficient() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 1 ether)
        );
        token.transfer(bob, 1 ether);
    }

    function testFuzz_Mint(uint256 amount) public {
        amount = bound(amount, 1, MAX - INITIAL);
        vm.prank(owner);
        token.mint(alice, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.totalSupply(), INITIAL + amount);
    }
}
