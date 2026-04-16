// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/ContactRegistry.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();
        ContactRegistry registry = new ContactRegistry();
        vm.stopBroadcast();

        console.log("ContactRegistry:", address(registry));
    }
}
