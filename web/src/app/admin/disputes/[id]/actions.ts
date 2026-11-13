"use server";

import { keccak256, stringToHex } from "viem";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTradeFromChain } from "@/lib/sync";
import {
    arbiterResolveForSeller,
    arbiterResolveRefund,
    arbiterResolveWithForfeit,
} from "@/lib/arbiter";
import { chainTradeId } from "@/lib/chain-ids";
import { parseZarToCents, zarCentsToUnits } from "@/lib/pricing";

const OUTCOMES = [
    "full_refund",
    "partial_refund",
    "release_to_seller",
    "seller_bond_forfeited",    // renamed from seller_bond_to_buyer
    "buyer_bond_forfeited",     // renamed from release_buyer_bond_forfeited
] as const;

export async function resolveDispute(input: {
    tradeId: string;
    outcome: string;
    partialRefundZar?: string;
    notes: string;
}): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { error: "Please log in." };
        const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
        if (!me?.is_admin) return { error: "Administrators only." };

        const notes = input.notes.trim();
        if (notes.length < 20) return { error: "Write a reasoned decision (at least 20 characters)." };
        if (!(OUTCOMES as readonly string[]).includes(input.outcome)) return { error: "Choose an outcome." };

        const sync = await syncTradeFromChain(input.tradeId);
        if (!sync.ok) return { error: sync.error ?? "Could not verify the trade on-chain." };
        if (sync.status !== "disputed") return { error: "This transaction is not in dispute on-chain." };

        const admin = createAdminClient();
        const { data: trade } = await admin.from("trades").select("*").eq("id", input.tradeId).single();
        if (!trade) return { error: "Transaction not found." };
        const { data: seller } = await admin
            .from("profiles")
            .select("wallet_address")
            .eq("id", trade.seller_id)
            .single();
        if (!seller?.wallet_address) return { error: "Seller wallet missing." };

        const id = chainTradeId(trade.id, seller.wallet_address);
        const principal = BigInt(trade.price_units);
        const sBond = BigInt(trade.seller_bond_units);
        const bBond = BigInt(trade.buyer_bond_units ?? 0);

        // Which contract call, and with what arguments.
        let buyerAmount: bigint | null = null;        // -> resolveRefund
        let sellerForfeit: boolean | null = null;     // -> resolveForSeller
        let forfeitingParty: 1 | 2 | null = null;     // -> resolveWithForfeit

        switch (input.outcome) {
            case "full_refund":
                buyerAmount = principal + bBond;
                break;
            case "partial_refund": {
                const cents = parseZarToCents(input.partialRefundZar ?? "");
                if (cents === null) return { error: "Enter a valid refund amount." };
                const units = zarCentsToUnits(cents, BigInt(trade.rate_cents_per_usdt));
                if (units <= 0n || units >= principal) {
                    return { error: "The partial refund must be above R0 and below the item price." };
                }
                buyerAmount = units + bBond;
                break;
            }
            case "release_to_seller":
                sellerForfeit = false;      // no misconduct: bond returned, fee applies
                break;
            case "seller_bond_forfeited":
                forfeitingParty = 1;        // seller bond -> treasury
                break;
            case "buyer_bond_forfeited":
                forfeitingParty = 2;        // buyer bond + fee -> treasury
                break;
        }

        const decisionHash = keccak256(
            stringToHex(
                JSON.stringify({
                    tradeId: trade.id,
                    outcome: input.outcome,
                    buyerAmount: buyerAmount === null ? null : buyerAmount.toString(),
                    forfeit: sellerForfeit,
                    forfeitingParty,
                    notes,
                    decidedBy: user.id,
                })
            )
        );

        const txHash =
            buyerAmount !== null
                ? await arbiterResolveRefund(id, buyerAmount, decisionHash)
                : sellerForfeit !== null
                    ? await arbiterResolveForSeller(id, sellerForfeit, decisionHash)
                    : await arbiterResolveWithForfeit(id, forfeitingParty!, decisionHash);

        await admin
            .from("disputes")
            .update({
                status: "resolved",
                outcome: input.outcome,
                buyer_amount_units: buyerAmount === null ? null : Number(buyerAmount),
                admin_notes: notes,
                decision_hash: decisionHash,
                resolved_by: user.id,
                resolved_at: new Date().toISOString(),
            })
            .eq("trade_id", trade.id);

        await admin.from("audit_logs").insert({
            actor_id: user.id,
            action: "dispute_resolved",
            entity: "trade",
            entity_id: trade.id,
            details: {
                outcome: input.outcome,
                decision_hash: decisionHash,
                tx_hash: txHash,
                forfeiting_party: forfeitingParty,
            },
        });

        await syncTradeFromChain(trade.id, txHash);
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Something went wrong." };
    }
}