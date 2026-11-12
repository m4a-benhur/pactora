export const STATUS_LABEL: Record<string, string> = {
    open: "Waiting for a buyer",
    accepted: "Buyer accepted",
    seller_bonded: "Seller bond deposited",
    funded: "Payment protected in escrow",
    dispatched: "Dispatched",
    delivered: "Delivered, inspection running",
    disputed: "In dispute",
    completed: "Completed",
    resolved: "Resolved by review",
    cancelled: "Cancelled",
};

export const DELIVERY_LABEL: Record<string, string> = {
    awaiting_collection: "Awaiting collection by courier",
    collected: "Collected by courier",
    in_transit: "In transit",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    handed_over: "Handed over in person",
};

export const COURIER_STEP_ORDER = [
    "awaiting_collection",
    "collected",
    "in_transit",
    "out_for_delivery",
    "delivered",
];

export const COURIER_BUTTON: Record<string, string> = {
    collected: "Simulate: courier collects the parcel",
    in_transit: "Simulate: parcel in transit",
    out_for_delivery: "Simulate: out for delivery",
    delivered: "Simulate: courier marks delivered",
};

export const photoUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/item-photos/${path}`;

export function inspectionLabel(minutes: number) {
    return minutes >= 60 ? `${minutes / 60} hours` : `${minutes} minutes (demo)`;
}

export function utcStamp(iso: string) {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const OUTCOME_LABEL: Record<string, string> = {
    full_refund: "Full refund to the buyer",
    partial_refund: "Partial refund to the buyer",
    release_to_seller: "Payment released to the seller",
    release_buyer_bond_forfeited: "Released to the seller; buyer bond forfeited for deliberate misconduct",
    seller_bond_to_buyer: "Refund to the buyer; seller bond awarded to the buyer for deliberate misconduct",
};

export type SellerStats = {
    completed: number;
    rating_count: number;
    rating_avg: number;
    tier: string;
};

export function reputationLine(s: SellerStats | null) {
    if (!s) return "";
    const rating =
        s.rating_count > 0
            ? `★ ${Number(s.rating_avg).toFixed(1)} (${s.rating_count} rating${s.rating_count === 1 ? "" : "s"})`
            : "No ratings yet";
    return `${s.tier} seller · ${rating} · ${s.completed} completed sale${s.completed === 1 ? "" : "s"}`;
}