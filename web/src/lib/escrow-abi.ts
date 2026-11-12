import { parseAbi } from "viem";

export const escrowAbi = parseAbi([
    "function createTrade((bytes32 id, address buyer, uint256 principal, uint256 sellerBond, uint256 buyerBond, uint32 fundWindow, uint32 dispatchWindow, uint32 inspectionSeconds, bool autoRelease, bytes32 termsHash) p)",
    "function fund(bytes32 id)",
    "function markDispatched(bytes32 id)",
    "function markHandedOver(bytes32 id)",
    "function confirmAcceptance(bytes32 id)",
    "function attestDelivery(bytes32 id)",
    "function openDispute(bytes32 id)",
    "function getTrade(bytes32 id) view returns ((address seller, address buyer, uint256 principal, uint256 sellerBond, uint256 buyerBond, uint256 feeBps, uint64 fundBy, uint64 dispatchBy, uint64 inspectionEnd, uint32 dispatchWindow, uint32 inspectionSeconds, bool autoRelease, bool deliveryAttested, uint8 status, bytes32 termsHash))",
    "function resolveRefund(bytes32 id, uint256 buyerAmount, bytes32 decisionHash)",
    "function resolveForSeller(bytes32 id, bool forfeitBuyerBond, bytes32 decisionHash)",
    "event TradeCreated(bytes32 indexed id, address indexed seller, address indexed buyer, uint256 principal, uint256 sellerBond, uint256 buyerBond, uint256 feeBps, bytes32 termsHash)",
    "event TradeFunded(bytes32 indexed id, address indexed buyer, uint256 amountIn)",
    "event TradeDispatched(bytes32 indexed id)",
    "event DeliveryRecorded(bytes32 indexed id, bool attestedByArbiter, uint64 inspectionEnd)",
    "event DisputeOpened(bytes32 indexed id, address indexed by)",
    "event TradeCompleted(bytes32 indexed id, uint256 sellerPayout, uint256 buyerBondReturned, uint256 fee, bool viaDispute)",
    "event DisputeResolvedRefund(bytes32 indexed id, uint256 buyerAmount, uint256 sellerAmount, bytes32 decisionHash)",
    "event TradeCancelled(bytes32 indexed id, uint256 buyerRefund, uint256 sellerRefund)",
]);

/** On-chain enum Status -> our database status */
export const CHAIN_STATUS_TO_DB: Record<number, string> = {
    1: "seller_bonded",
    2: "funded",
    3: "dispatched",
    4: "delivered",
    5: "disputed",
    6: "completed",
    7: "resolved",
    8: "cancelled",
};