// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {PactoraEscrow} from "../src/PactoraEscrow.sol";

contract DeployEscrow is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(pk);
        address token = vm.envAddress("USDT_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(pk);
        PactoraEscrow escrow = new PactoraEscrow(token, treasury, admin);
        vm.stopBroadcast();

        console.log("PactoraEscrow deployed at:", address(escrow));
        console.log("Admin/arbiter:", admin);
        console.log("Treasury:", treasury);
    }
}
