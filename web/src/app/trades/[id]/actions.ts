"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTradeFromChain } from "@/lib/sync";
import { arbiterAttestDelivery } from "@/lib/arbiter";
import { chainTradeId } from "@/lib/chain-ids";
import { COURIER_STEP_ORDER } from "@/lib/trade-ui";

/** SIMULATED courier: moves the parcel to the next step. The last step records delivery on-chain. */
export async function advanceCourier(tradeId: string): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { error: "Please log in." };

        const { data: trade } = await supabase.from("trades").select("*").eq("id", tradeId).single();
        if (!trade || trade.seller_id !== user.id) return { error: "Only the seller can do this." };
        if (trade.delivery_method !== "courier") return { error: "This is an in-person trade." };

        const sync = await syncTradeFromChain(tradeId);
        if (!sync.ok) return { error: sync.error ?? "Could not verify the trade." };
        if (sync.status !== "dispatched") return { error: "Mark the item as dispatched first." };

        const admin = createAdminClient();
        const { data: events } = await admin
            .from("delivery_events")
            .select("status")
            .eq("trade_id", tradeId)
            .order("created_at");
        const last = events && events.length > 0 ? events[events.length - 1].status : null;
        const next = COURIER_STEP_ORDER[(last ? COURIER_STEP_ORDER.indexOf(last) : -1) + 1];
        if (!next) return { error: "The simulated delivery is already complete." };

        if (next === "delivered") {
            const { data: seller } = await admin
                .from("profiles")
                .select("wallet_address")
                .eq("id", trade.seller_id)
                .single();
            if (!seller?.wallet_address) return { error: "Seller wallet missing." };
            const hash = await arbiterAttestDelivery(chainTradeId(trade.id, seller.wallet_address));
            await admin.from("delivery_events").insert({
                trade_id: tradeId,
                status: "delivered",
                is_simulated: true,
                note: "SIMULATED courier confirmation, recorded on-chain by the demo arbiter",
                created_by: user.id,
            });
            await syncTradeFromChain(tradeId, hash);
        } else {
            await admin.from("delivery_events").insert({
                trade_id: tradeId,
                status: next,
                is_simulated: true,
                note: "SIMULATED courier event",
                created_by: user.id,
            });
        }
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Something went wrong." };
    }
}