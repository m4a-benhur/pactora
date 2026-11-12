// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {PactoraEscrow} from "../src/PactoraEscrow.sol";
import {TestUSDT} from "../src/TestUSDT.sol";

contract PactoraEscrowTest is Test {
    TestUSDT token;
    PactoraEscrow escrow;

    address admin = address(0xAD);
    address treasury = address(0x7EA5);
    address seller = address(0x5E11);
    address buyer = address(0xB0B);
    address stranger = address(0xBAD);

    bytes32 constant ID = keccak256("trade-1");
    // R8,000 phone scenario, expressed in 6-decimal token units
    uint256 constant PRICE = 8_000e6;
    uint256 constant SELLER_BOND = 400e6; // 5%
    uint256 constant BUYER_BOND = 80e6; // 1%
    uint256 constant FEE = 160e6; // 2%
    uint256 constant TOTAL = PRICE + SELLER_BOND + BUYER_BOND; // 8,480
    uint256 constant S0 = 1_000e6; // seller starting balance
    uint256 constant B0 = 9_000e6; // buyer starting balance

    uint256 private refNonce;

    function setUp() public {
        vm.warp(1_700_000_000);
        token = new TestUSDT(admin);
        escrow = new PactoraEscrow(address(token), treasury, admin);

        _mint(seller, S0);
        _mint(buyer, B0);
        vm.prank(seller);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(buyer);
        token.approve(address(escrow), type(uint256).max);
    }

    // ------------------------------------------------------------ helpers

    function _mint(address to, uint256 amt) internal {
        vm.prank(admin);
        token.mintFor(to, amt, bytes32(++refNonce));
    }

    function _params(
        bytes32 id,
        uint256 price,
        uint256 sBond,
        uint256 bBond,
        bool autoRel
    ) internal view returns (PactoraEscrow.CreateParams memory) {
        return
            PactoraEscrow.CreateParams({
                id: id,
                buyer: buyer,
                principal: price,
                sellerBond: sBond,
                buyerBond: bBond,
                fundWindow: 1 days,
                dispatchWindow: 3 days,
                inspectionSeconds: 48 hours,
                autoRelease: autoRel,
                termsHash: keccak256("terms")
            });
    }

    function _create(bool autoRel) internal {
        PactoraEscrow.CreateParams memory p = _params(
            ID,
            PRICE,
            SELLER_BOND,
            BUYER_BOND,
            autoRel
        );
        vm.prank(seller);
        escrow.createTrade(p);
    }

    function _fund() internal {
        vm.prank(buyer);
        escrow.fund(ID);
    }

    function _dispatch() internal {
        vm.prank(seller);
        escrow.markDispatched(ID);
    }

    function _attest() internal {
        vm.prank(admin);
        escrow.attestDelivery(ID);
    }

    function _toDelivered(bool autoRel) internal {
        _create(autoRel);
        _fund();
        _dispatch();
        _attest();
    }

    function _toDisputed() internal {
        _toDelivered(false);
        vm.prank(buyer);
        escrow.openDispute(ID);
    }

    function _assertStatus(PactoraEscrow.Status s) internal {
        assertEq(uint8(escrow.getTrade(ID).status), uint8(s));
    }

    /// Every token that exists in the test world is accounted for.
    function _assertConserved() internal {
        uint256 sum = token.balanceOf(seller) +
            token.balanceOf(buyer) +
            token.balanceOf(treasury) +
            token.balanceOf(address(escrow));
        assertEq(sum, S0 + B0);
    }

    // ------------------------------------------------------------ constructor / admin

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(PactoraEscrow.InvalidParams.selector);
        new PactoraEscrow(address(0), treasury, admin);
        vm.expectRevert(PactoraEscrow.InvalidParams.selector);
        new PactoraEscrow(address(token), address(0), admin);
        vm.expectRevert(PactoraEscrow.InvalidParams.selector);
        new PactoraEscrow(address(token), treasury, address(0));
    }

    function test_defaultFeeIsTwoPercent() public view {
        assertEq(escrow.feeBps(), 200);
        assertEq(escrow.previewFee(PRICE), FEE);
        assertEq(escrow.previewFee(500e6), 10e6); // R500 -> R10
        assertEq(escrow.previewFee(10_000e6), 200e6); // R10,000 -> R200
    }

    function test_setFeeBps_accessAndCap() public {
        vm.prank(stranger);
        vm.expectRevert();
        escrow.setFeeBps(100);

        vm.prank(admin);
        vm.expectRevert(PactoraEscrow.FeeTooHigh.selector);
        escrow.setFeeBps(501);

        vm.prank(admin);
        escrow.setFeeBps(500);
        assertEq(escrow.feeBps(), 500);
    }

    function test_feeIsSnapshottedPerTrade() public {
        _create(false); // snapshots 2%
        vm.prank(admin);
        escrow.setFeeBps(500); // later change must not affect this trade
        _fund();
        _dispatch();
        _attest();
        vm.prank(buyer);
        escrow.confirmAcceptance(ID);

        assertEq(escrow.getTrade(ID).feeBps, 200);
        assertEq(token.balanceOf(treasury), FEE);
        _assertConserved();
    }

    // ------------------------------------------------------------ happy path (Scenario A)

    function test_happyPath_R8000() public {
        _create(false);
        assertEq(escrow.heldAmount(ID), SELLER_BOND);
        _assertStatus(PactoraEscrow.Status.SellerBonded);

        _fund();
        assertEq(escrow.heldAmount(ID), TOTAL);
        assertEq(token.balanceOf(address(escrow)), TOTAL);
        _assertStatus(PactoraEscrow.Status.Funded);

        _dispatch();
        _attest();
        _assertStatus(PactoraEscrow.Status.Delivered);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit PactoraEscrow.TradeCompleted(
            ID,
            PRICE - FEE + SELLER_BOND,
            BUYER_BOND,
            FEE,
            false
        );
        vm.prank(buyer);
        escrow.confirmAcceptance(ID);

        _assertStatus(PactoraEscrow.Status.Completed);
        assertEq(token.balanceOf(seller), S0 + PRICE - FEE); // net R7,840 gained, bond returned
        assertEq(token.balanceOf(buyer), B0 - PRICE); // paid R8,000, bond returned
        assertEq(token.balanceOf(treasury), FEE); // R160 platform fee
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.heldAmount(ID), 0);
        _assertConserved();
    }

    // ------------------------------------------------------------ create validation

    function test_create_rejectsDuplicateId() public {
        _create(false);
        PactoraEscrow.CreateParams memory p = _params(
            ID,
            PRICE,
            SELLER_BOND,
            BUYER_BOND,
            false
        );
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.TradeExists.selector);
        escrow.createTrade(p);
    }

    function test_create_rejectsBadParams() public {
        PactoraEscrow.CreateParams memory p = _params(
            ID,
            PRICE,
            SELLER_BOND - 1,
            BUYER_BOND,
            false
        );
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.BondTooLow.selector);
        escrow.createTrade(p);

        p = _params(ID, PRICE, SELLER_BOND, BUYER_BOND, false);
        p.buyer = seller; // buyer == seller
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.InvalidParams.selector);
        escrow.createTrade(p);

        p = _params(ID, PRICE, SELLER_BOND, BUYER_BOND, false);
        p.principal = 0;
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.InvalidParams.selector);
        escrow.createTrade(p);

        p = _params(ID, PRICE, SELLER_BOND, BUYER_BOND, false);
        p.inspectionSeconds = 59; // below minimum
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.InvalidParams.selector);
        escrow.createTrade(p);
    }

    // ------------------------------------------------------------ access control

    function test_accessControl_roles() public {
        _create(false);

        vm.prank(stranger);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.fund(ID);

        _fund();

        vm.prank(stranger);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.markDispatched(ID);
        vm.prank(buyer);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.markDispatched(ID);

        _dispatch();

        // only the arbiter can attest delivery (the seller cannot self-certify)
        vm.prank(stranger);
        vm.expectRevert();
        escrow.attestDelivery(ID);
        vm.prank(seller);
        vm.expectRevert();
        escrow.attestDelivery(ID);

        vm.prank(stranger);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.markHandedOver(ID);
        vm.prank(stranger);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.confirmAcceptance(ID);
        vm.prank(stranger);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.openDispute(ID);
    }

    // ------------------------------------------------------------ deadlines

    function test_fund_afterDeadlineReverts() public {
        _create(false);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(buyer);
        vm.expectRevert(PactoraEscrow.DeadlinePassed.selector);
        escrow.fund(ID);
    }

    function test_dispatch_afterDeadlineReverts() public {
        _create(false);
        _fund();
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.DeadlinePassed.selector);
        escrow.markDispatched(ID);
    }

    // ------------------------------------------------------------ in-person handover

    function test_inPerson_neverAutoReleases_buyerMustConfirm() public {
        _create(true); // auto-release agreed...
        _fund();
        _dispatch();
        vm.prank(seller);
        escrow.markHandedOver(ID); // ...but seller-recorded handover is not independent
        assertFalse(escrow.getTrade(ID).deliveryAttested);

        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(PactoraEscrow.NotAutoRelease.selector);
        escrow.claimAfterDeadline(ID);

        vm.prank(buyer);
        escrow.confirmAcceptance(ID);
        _assertStatus(PactoraEscrow.Status.Completed);
        assertEq(token.balanceOf(treasury), FEE);
        _assertConserved();
    }

    // ------------------------------------------------------------ auto-release

    function test_autoRelease_whenAgreedAndAttested() public {
        _toDelivered(true);

        vm.expectRevert(PactoraEscrow.DeadlineNotReached.selector);
        escrow.claimAfterDeadline(ID);

        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(stranger); // anyone can trigger it
        escrow.claimAfterDeadline(ID);

        _assertStatus(PactoraEscrow.Status.Completed);
        assertEq(token.balanceOf(treasury), FEE);
        assertEq(token.balanceOf(seller), S0 + PRICE - FEE);
        _assertConserved();
    }

    function test_autoRelease_notAgreedReverts() public {
        _toDelivered(false);
        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(PactoraEscrow.NotAutoRelease.selector);
        escrow.claimAfterDeadline(ID);
    }

    // ------------------------------------------------------------ dispute timing

    function test_dispute_buyerWhileDispatched() public {
        _create(false);
        _fund();
        _dispatch();
        vm.prank(buyer);
        escrow.openDispute(ID);
        _assertStatus(PactoraEscrow.Status.Disputed);
    }

    function test_dispute_sellerCannotWhileDispatched() public {
        _create(false);
        _fund();
        _dispatch();
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.openDispute(ID);
    }

    function test_dispute_sellerOnlyAfterInspectionEnds() public {
        _toDelivered(false);
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.DeadlineNotReached.selector);
        escrow.openDispute(ID);

        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(seller);
        escrow.openDispute(ID);
        _assertStatus(PactoraEscrow.Status.Disputed);
    }

    function test_dispute_buyerCannotAfterInspectionEnds() public {
        _toDelivered(false);
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(buyer);
        vm.expectRevert(PactoraEscrow.DeadlinePassed.selector);
        escrow.openDispute(ID);
    }

    // ------------------------------------------------------------ dispute outcomes

    /// Scenario D: genuine condition dispute, full refund of purchase amount + buyer bond.
    function test_resolveRefund_full() public {
        _toDisputed();
        vm.prank(admin);
        escrow.resolveRefund(ID, PRICE + BUYER_BOND, keccak256("decision-1"));

        _assertStatus(PactoraEscrow.Status.Resolved);
        assertEq(token.balanceOf(buyer), B0); // made whole
        assertEq(token.balanceOf(seller), S0); // bond returned, no sale
        assertEq(token.balanceOf(treasury), 0); // NO fee on unsuccessful trade
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertConserved();
    }

    /// Scenario D variant: partial refund.
    function test_resolveRefund_partial() public {
        _toDisputed();
        vm.prank(admin);
        escrow.resolveRefund(ID, 3_080e6, keccak256("decision-2")); // R3,000 refund + buyer bond back

        assertEq(token.balanceOf(buyer), B0 - 5_000e6);
        assertEq(token.balanceOf(seller), S0 + 5_000e6);
        assertEq(token.balanceOf(treasury), 0);
        _assertConserved();
    }

    /// Scenario B: seller misconduct, seller bond goes to the buyer, no fee.
    function test_resolveRefund_sellerMisconduct_bondToBuyer() public {
        _toDisputed();
        vm.prank(admin);
        escrow.resolveRefund(ID, TOTAL, keccak256("decision-3"));

        assertEq(token.balanceOf(buyer), B0 + SELLER_BOND);
        assertEq(token.balanceOf(seller), S0 - SELLER_BOND);
        assertEq(token.balanceOf(treasury), 0);
        _assertConserved();
    }

    function test_resolveRefund_exceedsHeldReverts() public {
        _toDisputed();
        vm.prank(admin);
        vm.expectRevert(PactoraEscrow.AmountExceedsHeld.selector);
        escrow.resolveRefund(ID, TOTAL + 1, keccak256("x"));
    }

    function test_resolveRefund_onlyArbiterAndOnlyWhenDisputed() public {
        _toDisputed();
        vm.prank(stranger);
        vm.expectRevert();
        escrow.resolveRefund(ID, 0, keccak256("x"));

        _create_second_for_wrong_state();
    }

    function _create_second_for_wrong_state() internal {
        bytes32 id2 = keccak256("trade-2");
        PactoraEscrow.CreateParams memory p = _params(
            id2,
            PRICE,
            SELLER_BOND,
            BUYER_BOND,
            false
        );
        vm.prank(seller);
        escrow.createTrade(p);
        vm.prank(admin);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.resolveRefund(id2, 0, keccak256("x"));
    }

    function test_resolveForSeller_noForfeit() public {
        _toDisputed();
        vm.prank(admin);
        escrow.resolveForSeller(ID, false, keccak256("decision-4"));

        _assertStatus(PactoraEscrow.Status.Completed);
        assertEq(token.balanceOf(seller), S0 + PRICE - FEE);
        assertEq(token.balanceOf(buyer), B0 - PRICE); // buyer bond returned
        assertEq(token.balanceOf(treasury), FEE);
        _assertConserved();
    }

    /// Scenario C: buyer misconduct, buyer bond goes to the seller.
    function test_resolveForSeller_buyerMisconduct_bondForfeited() public {
        _toDisputed();
        vm.prank(admin);
        escrow.resolveForSeller(ID, true, keccak256("decision-5"));

        assertEq(token.balanceOf(seller), S0 + PRICE - FEE + BUYER_BOND);
        assertEq(token.balanceOf(buyer), B0 - PRICE - BUYER_BOND);
        assertEq(token.balanceOf(treasury), FEE);
        _assertConserved();
    }

    function test_resolveForSeller_onlyArbiter() public {
        _toDisputed();
        vm.prank(buyer);
        vm.expectRevert();
        escrow.resolveForSeller(ID, false, keccak256("x"));
    }

    // ------------------------------------------------------------ double settlement

    function test_noDoubleSettlement() public {
        _toDelivered(true);
        vm.prank(buyer);
        escrow.confirmAcceptance(ID);

        vm.prank(buyer);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.confirmAcceptance(ID);
        vm.prank(buyer);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.openDispute(ID);

        vm.startPrank(admin);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.resolveRefund(ID, 0, keccak256("x"));
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.resolveForSeller(ID, false, keccak256("x"));
        vm.stopPrank();

        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.claimAfterDeadline(ID);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.cancelUnfunded(ID);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.refundUndispatched(ID);

        assertEq(token.balanceOf(treasury), FEE); // fee collected exactly once
        _assertConserved();
    }

    function test_noDoubleRefund() public {
        _toDisputed();
        vm.startPrank(admin);
        escrow.resolveRefund(ID, TOTAL, keccak256("x"));
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.resolveRefund(ID, TOTAL, keccak256("x"));
        vm.stopPrank();
        _assertConserved();
    }

    // ------------------------------------------------------------ cancellation and timeouts

    function test_cancelUnfunded_bySeller() public {
        _create(false);
        vm.prank(seller);
        escrow.cancelUnfunded(ID);
        _assertStatus(PactoraEscrow.Status.Cancelled);
        assertEq(token.balanceOf(seller), S0);
        assertEq(token.balanceOf(treasury), 0);
        _assertConserved();
    }

    function test_cancelUnfunded_strangerOnlyAfterDeadline() public {
        _create(false);
        vm.prank(stranger);
        vm.expectRevert(PactoraEscrow.NotAuthorized.selector);
        escrow.cancelUnfunded(ID);

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(stranger);
        escrow.cancelUnfunded(ID);
        assertEq(token.balanceOf(seller), S0);
    }

    function test_cancelUnfunded_afterFundingReverts() public {
        _create(false);
        _fund();
        vm.prank(seller);
        vm.expectRevert(PactoraEscrow.InvalidState.selector);
        escrow.cancelUnfunded(ID);
    }

    function test_refundUndispatched() public {
        _create(false);
        _fund();

        vm.expectRevert(PactoraEscrow.DeadlineNotReached.selector);
        escrow.refundUndispatched(ID);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(stranger);
        escrow.refundUndispatched(ID);

        _assertStatus(PactoraEscrow.Status.Cancelled);
        assertEq(token.balanceOf(buyer), B0);
        assertEq(token.balanceOf(seller), S0); // bond returned, no automatic penalty
        assertEq(token.balanceOf(treasury), 0);
        _assertConserved();
    }

    // ------------------------------------------------------------ fuzz: money is conserved

    function testFuzz_completion_conservesFunds(
        uint256 price,
        uint256 extraBond,
        uint256 buyerBond
    ) public {
        price = bound(price, 1, 5_000e6);
        uint256 sBond = (price * 500) / 10_000 + bound(extraBond, 0, 500e6);
        buyerBond = bound(buyerBond, 0, 500e6);

        PactoraEscrow.CreateParams memory p = _params(
            ID,
            price,
            sBond,
            buyerBond,
            false
        );
        vm.prank(seller);
        escrow.createTrade(p);
        _fund();
        _dispatch();
        _attest();
        vm.prank(buyer);
        escrow.confirmAcceptance(ID);

        assertEq(token.balanceOf(treasury), (price * 200) / 10_000);
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertConserved();
    }

    function testFuzz_resolveRefund_conservesFunds(uint256 buyerAmount) public {
        _toDisputed();
        buyerAmount = bound(buyerAmount, 0, TOTAL);

        vm.prank(admin);
        escrow.resolveRefund(ID, buyerAmount, keccak256("fuzz"));

        assertEq(
            token.balanceOf(buyer),
            B0 - (PRICE + BUYER_BOND) + buyerAmount
        );
        assertEq(token.balanceOf(treasury), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertConserved();
    }
}

/// Mimics real USDT: transfer/transferFrom/approve return NO value.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external {
        allowance[msg.sender][s] = a;
    }

    function transfer(address to, uint256 a) external {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }

    function transferFrom(address f, address to, uint256 a) external {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
    }
}

contract PactoraEscrowUsdtStyleTokenTest is Test {
    function test_happyPath_withTokenThatReturnsNothing() public {
        address admin = address(0xAD);
        address treasury = address(0x7EA5);
        address seller = address(0x5E11);
        address buyer = address(0xB0B);
        bytes32 id = keccak256("usdt-style");

        NoReturnToken t = new NoReturnToken();
        PactoraEscrow e = new PactoraEscrow(address(t), treasury, admin);
        t.mint(seller, 1_000e6);
        t.mint(buyer, 9_000e6);
        vm.prank(seller);
        t.approve(address(e), type(uint256).max);
        vm.prank(buyer);
        t.approve(address(e), type(uint256).max);

        PactoraEscrow.CreateParams memory p = PactoraEscrow.CreateParams({
            id: id,
            buyer: buyer,
            principal: 8_000e6,
            sellerBond: 400e6,
            buyerBond: 80e6,
            fundWindow: 1 days,
            dispatchWindow: 3 days,
            inspectionSeconds: 48 hours,
            autoRelease: false,
            termsHash: keccak256("terms")
        });
        vm.prank(seller);
        e.createTrade(p);
        vm.prank(buyer);
        e.fund(id);
        vm.prank(seller);
        e.markDispatched(id);
        vm.prank(admin);
        e.attestDelivery(id);
        vm.prank(buyer);
        e.confirmAcceptance(id);

        assertEq(t.balanceOf(treasury), 160e6);
        assertEq(t.balanceOf(seller), 1_000e6 + 7_840e6);
        assertEq(t.balanceOf(buyer), 9_000e6 - 8_000e6);
        assertEq(t.balanceOf(address(e)), 0);
    }
}
