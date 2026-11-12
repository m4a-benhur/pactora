// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TestUSDT} from "../src/TestUSDT.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract TestUSDTTest is Test {
    TestUSDT token;
    address admin = address(0xA11CE);
    address user = address(0xB0B);

    function setUp() public {
        vm.chainId(84532); // Base Sepolia
        vm.warp(1_700_000_000);
        token = new TestUSDT(admin);
    }

    function test_metadata() public view {
        assertEq(token.name(), "Pactora Test USDT");
        assertEq(token.symbol(), "tUSDT");
        assertEq(token.decimals(), 6);
    }

    function test_revertsOnMainnet() public {
        vm.chainId(1);
        vm.expectRevert(TestUSDT.UnsupportedChain.selector);
        new TestUSDT(admin);
    }

    function test_mintFor_byMinter() public {
        vm.prank(admin);
        token.mintFor(user, 500e6, keccak256("order-1"));
        assertEq(token.balanceOf(user), 500e6);
        assertTrue(token.usedRef(keccak256("order-1")));
    }

    function test_mintFor_sameRefTwiceReverts() public {
        vm.startPrank(admin);
        token.mintFor(user, 1e6, keccak256("order-1"));
        vm.expectRevert(TestUSDT.RefAlreadyUsed.selector);
        token.mintFor(user, 1e6, keccak256("order-1"));
        vm.stopPrank();
        assertEq(token.balanceOf(user), 1e6); // minted exactly once
    }

    function test_mintFor_nonMinterReverts() public {
        vm.prank(user);
        vm.expectRevert();
        token.mintFor(user, 1e6, keccak256("x"));
    }

    function test_mintFor_zeroAndTooLarge() public {
        vm.startPrank(admin);
        vm.expectRevert(TestUSDT.ZeroAmount.selector);
        token.mintFor(user, 0, keccak256("a"));
        vm.expectRevert(TestUSDT.AmountTooLarge.selector);
        token.mintFor(user, 10_000e6 + 1, keccak256("b"));
        vm.stopPrank();
    }

    function test_faucet_claimAndCooldown() public {
        vm.prank(user);
        token.faucetMint();
        assertEq(token.balanceOf(user), 100e6);

        vm.prank(user);
        vm.expectRevert(TestUSDT.FaucetCooldown.selector);
        token.faucetMint();

        vm.warp(block.timestamp + 1 days);
        vm.prank(user);
        token.faucetMint();
        assertEq(token.balanceOf(user), 200e6);
    }

    function testFuzz_mintFor_uniqueRefs(uint256 amount, bytes32 ref) public {
        amount = bound(amount, 1, 10_000e6);
        vm.prank(admin);
        token.mintFor(user, amount, ref);
        assertEq(token.balanceOf(user), amount);
        vm.prank(admin);
        vm.expectRevert(TestUSDT.RefAlreadyUsed.selector);
        token.mintFor(user, amount, ref);
    }
}
