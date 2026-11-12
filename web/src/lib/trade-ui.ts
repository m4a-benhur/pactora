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

export const photoUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/item-photos/${path}`;

export function inspectionLabel(minutes: number) {
    return minutes >= 60 ? `${minutes / 60} hours` : `${minutes} minutes (demo)`;
}