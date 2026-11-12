// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {TestUSDT} from "../src/TestUSDT.sol";

contract DeployTestUSDT is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(pk);

        vm.startBroadcast(pk);
        TestUSDT token = new TestUSDT(admin);
        vm.stopBroadcast();

        console.log("TestUSDT deployed at:", address(token));
        console.log("Admin / minter:", admin);
    }
}
