// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";

contract CounterScript is Script {
    Counter public counter;

    function run() external returns (Counter) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        counter = new Counter();
        vm.stopBroadcast();

        console2.log("Counter deployed at:", address(counter));
        return counter;
    }
}
