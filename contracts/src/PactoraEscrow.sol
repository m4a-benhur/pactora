// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PactoraEscrow
/// @notice DEMO / TESTNET. Escrow with two-sided security bonds and a 2% platform fee.
/// @dev Smart contracts enforce money flows; they cannot judge physical item condition.
///      Disputes are decided off-chain by the ARBITER (single trusted admin in the MVP).
contract PactoraEscrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500; // fee can never exceed 5%
    uint256 public constant MIN_SELLER_BOND_BPS = 500; // seller bond >= 5% of price
    uint256 public constant MIN_INSPECTION = 60; // seconds (short for demos)
    uint256 public constant MAX_INSPECTION = 14 days;
    uint256 public constant MAX_WINDOW = 30 days;

    enum Status {
        None,
        SellerBonded, // seller bond deposited, waiting for buyer
        Funded, // buyer principal + buyer bond deposited
        Dispatched, // seller says item is on its way
        Delivered, // delivery/handover recorded, inspection clock running
        Disputed, // frozen until the arbiter decides
        Completed, // paid out to seller (fee taken)
        Resolved, // dispute settled by refund-style split (no fee)
        Cancelled // unfunded/undispatched trade unwound (no fee)
    }

    struct Trade {
        address seller;
        address buyer;
        uint256 principal;
        uint256 sellerBond;
        uint256 buyerBond;
        uint256 feeBps; // snapshot at creation
        uint64 fundBy;
        uint64 dispatchBy;
        uint64 inspectionEnd;
        uint32 dispatchWindow;
        uint32 inspectionSeconds;
        bool autoRelease;
        bool deliveryAttested; // true only if recorded by ARBITER (courier proxy)
        Status status;
        bytes32 termsHash; // hash of the agreed off-chain terms
    }

    struct CreateParams {
        bytes32 id;
        address buyer;
        uint256 principal;
        uint256 sellerBond;
        uint256 buyerBond;
        uint32 fundWindow;
        uint32 dispatchWindow;
        uint32 inspectionSeconds;
        bool autoRelease;
        bytes32 termsHash;
    }

    IERC20 public immutable token;
    address public immutable treasury;
    uint256 public feeBps = 200; // 2%, applies to trades created after a change

    mapping(bytes32 => Trade) private trades;

    event TradeCreated(
        bytes32 indexed id,
        address indexed seller,
        address indexed buyer,
        uint256 principal,
        uint256 sellerBond,
        uint256 buyerBond,
        uint256 feeBps,
        bytes32 termsHash
    );
    event TradeFunded(
        bytes32 indexed id,
        address indexed buyer,
        uint256 amountIn
    );
    event TradeDispatched(bytes32 indexed id);
    event DeliveryRecorded(
        bytes32 indexed id,
        bool attestedByArbiter,
        uint64 inspectionEnd
    );
    event DisputeOpened(bytes32 indexed id, address indexed by);
    event TradeCompleted(
        bytes32 indexed id,
        uint256 sellerPayout,
        uint256 buyerBondReturned,
        uint256 fee,
        bool viaDispute
    );
    event DisputeResolvedRefund(
        bytes32 indexed id,
        uint256 buyerAmount,
        uint256 sellerAmount,
        bytes32 decisionHash
    );
    event TradeCancelled(
        bytes32 indexed id,
        uint256 buyerRefund,
        uint256 sellerRefund
    );
    event FeeBpsUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    error InvalidState();
    error NotAuthorized();
    error InvalidParams();
    error TradeExists();
    error BondTooLow();
    error DeadlinePassed();
    error DeadlineNotReached();
    error FeeTooHigh();
    error AmountExceedsHeld();
    error NotAutoRelease();

    constructor(address token_, address treasury_, address admin) {
        if (
            token_ == address(0) ||
            treasury_ == address(0) ||
            admin == address(0)
        ) revert InvalidParams();
        token = IERC20(token_);
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Only affects trades created afterwards (fee is snapshotted per trade).
    function setFeeBps(
        uint256 newFeeBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeBpsUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    // ---------------------------------------------------------------- seller

    /// @notice Seller creates the trade and deposits their security bond.
    function createTrade(CreateParams calldata p) external nonReentrant {
        Trade storage t = trades[p.id];
        if (t.status != Status.None) revert TradeExists();
        if (p.buyer == address(0) || p.buyer == msg.sender || p.principal == 0)
            revert InvalidParams();
        if (p.sellerBond < (p.principal * MIN_SELLER_BOND_BPS) / BPS)
            revert BondTooLow();
        if (
            p.inspectionSeconds < MIN_INSPECTION ||
            p.inspectionSeconds > MAX_INSPECTION
        ) revert InvalidParams();
        if (p.fundWindow == 0 || p.fundWindow > MAX_WINDOW)
            revert InvalidParams();
        if (p.dispatchWindow == 0 || p.dispatchWindow > MAX_WINDOW)
            revert InvalidParams();

        t.seller = msg.sender;
        t.buyer = p.buyer;
        t.principal = p.principal;
        t.sellerBond = p.sellerBond;
        t.buyerBond = p.buyerBond;
        t.feeBps = feeBps;
        t.fundBy = uint64(block.timestamp + p.fundWindow);
        t.dispatchWindow = p.dispatchWindow;
        t.inspectionSeconds = p.inspectionSeconds;
        t.autoRelease = p.autoRelease;
        t.termsHash = p.termsHash;
        t.status = Status.SellerBonded;

        token.safeTransferFrom(msg.sender, address(this), p.sellerBond);

        emit TradeCreated(
            p.id,
            msg.sender,
            p.buyer,
            p.principal,
            p.sellerBond,
            p.buyerBond,
            t.feeBps,
            p.termsHash
        );
    }

    function markDispatched(bytes32 id) external {
        Trade storage t = trades[id];
        if (msg.sender != t.seller) revert NotAuthorized();
        if (t.status != Status.Funded) revert InvalidState();
        if (block.timestamp > t.dispatchBy) revert DeadlinePassed();
        t.status = Status.Dispatched;
        emit TradeDispatched(id);
    }

    /// @notice In-person handover recorded by the seller. NOT independent evidence, so
    ///         it never enables auto-release; the buyer must confirm or dispute.
    function markHandedOver(bytes32 id) external {
        Trade storage t = trades[id];
        if (msg.sender != t.seller) revert NotAuthorized();
        if (t.status != Status.Dispatched) revert InvalidState();
        _startInspection(id, t, false);
    }

    // ---------------------------------------------------------------- buyer

    /// @notice Buyer deposits purchase amount + buyer bond (requires prior token approval).
    function fund(bytes32 id) external nonReentrant {
        Trade storage t = trades[id];
        if (msg.sender != t.buyer) revert NotAuthorized();
        if (t.status != Status.SellerBonded) revert InvalidState();
        if (block.timestamp > t.fundBy) revert DeadlinePassed();

        t.status = Status.Funded;
        t.dispatchBy = uint64(block.timestamp + t.dispatchWindow);
        uint256 amountIn = t.principal + t.buyerBond;

        token.safeTransferFrom(msg.sender, address(this), amountIn);
        emit TradeFunded(id, msg.sender, amountIn);
    }

    function confirmAcceptance(bytes32 id) external nonReentrant {
        Trade storage t = trades[id];
        if (msg.sender != t.buyer) revert NotAuthorized();
        if (t.status != Status.Dispatched && t.status != Status.Delivered)
            revert InvalidState();
        _complete(id, t);
    }

    // ------------------------------------------------- delivery (arbiter proxy)

    /// @notice Delivery recorded by the ARBITER. In the MVP this stands in for a courier
    ///         integration and is SIMULATED. Enables auto-release if agreed at creation.
    function attestDelivery(bytes32 id) external onlyRole(ARBITER_ROLE) {
        Trade storage t = trades[id];
        if (t.status != Status.Dispatched) revert InvalidState();
        _startInspection(id, t, true);
    }

    // ---------------------------------------------------------------- disputes

    /// @dev Buyer: while Dispatched or during inspection. Seller: only after the
    ///      inspection window has ended with no buyer response.
    function openDispute(bytes32 id) external {
        Trade storage t = trades[id];
        bool isBuyer = msg.sender == t.buyer;
        bool isSeller = msg.sender == t.seller;
        if (!isBuyer && !isSeller) revert NotAuthorized();

        if (t.status == Status.Dispatched) {
            if (!isBuyer) revert NotAuthorized();
        } else if (t.status == Status.Delivered) {
            if (isBuyer) {
                if (block.timestamp > t.inspectionEnd) revert DeadlinePassed();
            } else {
                if (block.timestamp <= t.inspectionEnd)
                    revert DeadlineNotReached();
            }
        } else {
            revert InvalidState();
        }

        t.status = Status.Disputed;
        emit DisputeOpened(id, msg.sender);
    }

    /// @notice Refund-style ruling: buyer gets `buyerAmount`, seller gets the rest. No fee.
    ///         Covers full refund, partial refund and bond forfeiture to the innocent party.
    function resolveRefund(
        bytes32 id,
        uint256 buyerAmount,
        bytes32 decisionHash
    ) external onlyRole(ARBITER_ROLE) nonReentrant {
        Trade storage t = trades[id];
        if (t.status != Status.Disputed) revert InvalidState();
        uint256 total = t.principal + t.sellerBond + t.buyerBond;
        if (buyerAmount > total) revert AmountExceedsHeld();

        uint256 sellerAmount = total - buyerAmount;
        t.status = Status.Resolved;

        _send(t.buyer, buyerAmount);
        _send(t.seller, sellerAmount);
        emit DisputeResolvedRefund(id, buyerAmount, sellerAmount, decisionHash);
    }

    /// @notice Ruling in the seller's favour: completes the trade (2% fee applies).
    ///         If `forfeitBuyerBond` is true, the buyer's bond goes to the seller.
    function resolveForSeller(
        bytes32 id,
        bool forfeitBuyerBond,
        bytes32 decisionHash
    ) external onlyRole(ARBITER_ROLE) nonReentrant {
        Trade storage t = trades[id];
        if (t.status != Status.Disputed) revert InvalidState();
        decisionHash; // recorded off-chain; kept in the signature for the audit trail
        _completeWith(id, t, forfeitBuyerBond, true);
    }

    // ---------------------------------------------------------------- timeouts

    /// @notice Auto-release after the inspection window. Only if agreed at creation AND
    ///         delivery was recorded by the ARBITER. Anyone may call.
    function claimAfterDeadline(bytes32 id) external nonReentrant {
        Trade storage t = trades[id];
        if (t.status != Status.Delivered) revert InvalidState();
        if (!t.autoRelease || !t.deliveryAttested) revert NotAutoRelease();
        if (block.timestamp <= t.inspectionEnd) revert DeadlineNotReached();
        _complete(id, t);
    }

    /// @notice Unwind a trade the buyer never funded. Seller/buyer any time, anyone after deadline.
    function cancelUnfunded(bytes32 id) external nonReentrant {
        Trade storage t = trades[id];
        if (t.status != Status.SellerBonded) revert InvalidState();
        bool party = msg.sender == t.seller || msg.sender == t.buyer;
        if (!party && block.timestamp <= t.fundBy) revert NotAuthorized();

        t.status = Status.Cancelled;
        _send(t.seller, t.sellerBond);
        emit TradeCancelled(id, 0, t.sellerBond);
    }

    /// @notice Seller never dispatched in time: refund everyone, no fee, no automatic penalty.
    function refundUndispatched(bytes32 id) external nonReentrant {
        Trade storage t = trades[id];
        if (t.status != Status.Funded) revert InvalidState();
        if (block.timestamp <= t.dispatchBy) revert DeadlineNotReached();

        t.status = Status.Cancelled;
        uint256 buyerRefund = t.principal + t.buyerBond;
        _send(t.buyer, buyerRefund);
        _send(t.seller, t.sellerBond);
        emit TradeCancelled(id, buyerRefund, t.sellerBond);
    }

    // ---------------------------------------------------------------- views

    function getTrade(bytes32 id) external view returns (Trade memory) {
        return trades[id];
    }

    function previewFee(uint256 principal) external view returns (uint256) {
        return (principal * feeBps) / BPS;
    }

    /// @notice Tokens this trade currently holds in the contract.
    function heldAmount(bytes32 id) external view returns (uint256) {
        Trade storage t = trades[id];
        Status s = t.status;
        if (s == Status.SellerBonded) return t.sellerBond;
        if (
            s == Status.Funded ||
            s == Status.Dispatched ||
            s == Status.Delivered ||
            s == Status.Disputed
        ) {
            return t.principal + t.sellerBond + t.buyerBond;
        }
        return 0;
    }

    // ---------------------------------------------------------------- internals

    function _startInspection(
        bytes32 id,
        Trade storage t,
        bool attested
    ) private {
        t.status = Status.Delivered;
        t.deliveryAttested = attested;
        t.inspectionEnd = uint64(block.timestamp + t.inspectionSeconds);
        emit DeliveryRecorded(id, attested, t.inspectionEnd);
    }

    function _complete(bytes32 id, Trade storage t) private {
        _completeWith(id, t, false, false);
    }

    /// @dev Pays: seller = principal - fee + sellerBond (+ buyerBond if forfeited),
    ///      buyer = buyerBond (unless forfeited), treasury = fee. Status is set first.
    function _completeWith(
        bytes32 id,
        Trade storage t,
        bool forfeitBuyerBond,
        bool viaDispute
    ) private {
        t.status = Status.Completed;

        uint256 fee = (t.principal * t.feeBps) / BPS;
        uint256 buyerBondReturned = forfeitBuyerBond ? 0 : t.buyerBond;
        uint256 sellerPayout = t.principal -
            fee +
            t.sellerBond +
            (forfeitBuyerBond ? t.buyerBond : 0);

        _send(t.seller, sellerPayout);
        _send(t.buyer, buyerBondReturned);
        _send(treasury, fee);

        emit TradeCompleted(
            id,
            sellerPayout,
            buyerBondReturned,
            fee,
            viaDispute
        );
    }

    function _send(address to, uint256 amount) private {
        if (amount > 0) token.safeTransfer(to, amount);
    }
}
