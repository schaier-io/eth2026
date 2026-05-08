// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ExampleToken} from "../src/ExampleToken.sol";

contract ExampleTokenScript is Script {
    function run() external returns (ExampleToken token) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("TOKEN_OWNER", vm.addr(pk));
        string memory name = vm.envOr("TOKEN_NAME", string("Example"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("EXM"));
        uint256 initial = vm.envOr("TOKEN_INITIAL_SUPPLY", uint256(1_000_000 ether));
        uint256 max = vm.envOr("TOKEN_MAX_SUPPLY", uint256(10_000_000 ether));

        vm.startBroadcast(pk);
        token = new ExampleToken(name, symbol, initial, max, owner);
        vm.stopBroadcast();

        console2.log("ExampleToken deployed at:", address(token));
        console2.log("Owner:", owner);
        console2.log("Initial supply:", initial);
        console2.log("Max supply:", max);
    }
}
