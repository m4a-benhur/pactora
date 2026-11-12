import { parseEventLogs } from "viem";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicClient, ESCROW_ADDRESS } from "@/lib/chain";
import { escrowAbi, CHAIN_STATUS_TO_DB } from "@/lib/escrow-abi";
import { chainTradeId } from "@/lib/chain-ids";

export type SyncResult = { ok: boolean; status?: string; error?: string };

/**
 * Reads the escrow contract, checks it matches what we agreed in the database,
 * then updates our trade status. Never trusts anything sent by the browser.
 * txHash (optional) is only used to find event logs, and the logs must come from our escrow.
 */
export async function syncTradeFromChain(
    tradeId: string,
    txHash?: string | null
): Promise<SyncResult> {
    const admin = createAdminClient();

    const { data: trade } = await admin.from("trades").select("*").eq("id", tradeId).single();
    if (!trade) return { ok: false, error: "Transaction not found." };
    if (!trade.buyer_id) return { ok: true, status: trade.status };

    const { data: wallets } = await admin
        .from("profiles")
        .select("id, wallet_address")
        .in("id", [trade.seller_id, trade.buyer_id]);
    const sellerW = wallets?.find((w) => w.id === trade.seller_id)?.wallet_address as string | undefined;
    const buyerW = wallets?.find((w) => w.id === trade.buyer_id)?.wallet_address as string | undefined;
    if (!sellerW || !buyerW) return { ok: false, error: "Both parties need a linked wallet." };

    const id = chainTradeId(trade.id, sellerW);
    const ct = await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "getTrade",
        args: [id],
    });

    if (ct.status === 0) return { ok: true, status: trade.status }; // nothing on-chain yet

    // The on-chain terms must match the terms the buyer accepted.
    const matches =
        ct.seller.toLowerCase() === sellerW.toLowerCase() &&
        ct.buyer.toLowerCase() === buyerW.toLowerCase() &&
        ct.principal === BigInt(trade.price_units) &&
        ct.sellerBond === BigInt(trade.seller_bond_units) &&
        ct.buyerBond === BigInt(trade.buyer_bond_units ?? 0) &&
        Number(ct.feeBps) === trade.fee_bps &&
        ct.termsHash.toLowerCase() === String(trade.terms_hash).toLowerCase();
    if (!matches) {
        return {
            ok: false,
            error: "The on-chain transaction does not match the agreed terms. Status was not updated.",
        };
    }

    const dbStatus = CHAIN_STATUS_TO_DB[ct.status];
    if (!dbStatus) return { ok: false, error: "Unknown on-chain status." };

    const patch: Record<string, unknown> = {};
    if (trade.status !== dbStatus) patch.status = dbStatus;
    if (trade.chain_trade_id !== id) patch.chain_trade_id = id;
    if (ct.inspectionEnd > 0n) {
        const endMs = Number(ct.inspectionEnd) * 1000;
        if (!trade.inspection_ends_at || new Date(trade.inspection_ends_at).getTime() !== endMs) {
            patch.inspection_ends_at = new Date(endMs).toISOString();
        }
    }
    if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        await admin.from("trades").update(patch).eq("id", trade.id);
        if (patch.status) {
            await admin.from("audit_logs").insert({
                actor_id: null,
                action: "status_synced_from_chain",
                entity: "trade",
                entity_id: trade.id,
                details: { from: trade.status, to: dbStatus },
            });
        }
    }

    // Record verified events from the supplied transaction (idempotent).
    if (txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        try {
            const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
            if (receipt.status === "success") {
                const logs = parseEventLogs({
                    abi: escrowAbi,
                    logs: receipt.logs.filter(
                        (l) => l.address.toLowerCase() === ESCROW_ADDRESS.toLowerCase()
                    ),
                });
                const rows = logs
                    .filter((l) => {
                        const args = l.args as unknown as Record<string, unknown>;
                        return String(args.id).toLowerCase() === id.toLowerCase();
                    })
                    .map((l) => ({
                        trade_id: trade.id,
                        event_name: l.eventName,
                        tx_hash: l.transactionHash,
                        log_index: l.logIndex,
                        block_number: Number(l.blockNumber),
                        data: JSON.parse(
                            JSON.stringify(l.args, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
                        ),
                    }));
                if (rows.length > 0) {
                    await admin
                        .from("chain_events")
                        .upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
                }
            }
        } catch {
            // The receipt may not be visible to our RPC yet; status sync above still succeeded.
        }
    }

    // Delivery timeline entries that follow from on-chain status.
    const { count } = await admin
        .from("delivery_events")
        .select("id", { count: "exact", head: true })
        .eq("trade_id", trade.id);
    if (dbStatus === "dispatched" && trade.delivery_method === "courier" && (count ?? 0) === 0) {
        await admin.from("delivery_events").insert({
            trade_id: trade.id,
            status: "awaiting_collection",
            is_simulated: true,
            note: "SIMULATED courier",
        });
    }
    if (dbStatus === "delivered" && trade.delivery_method === "in_person") {
        const { count: handed } = await admin
            .from("delivery_events")
            .select("id", { count: "exact", head: true })
            .eq("trade_id", trade.id)
            .eq("status", "handed_over");
        if ((handed ?? 0) === 0) {
            await admin.from("delivery_events").insert({
                trade_id: trade.id,
                status: "handed_over",
                is_simulated: false,
                note: "Handover recorded by the seller (not independent proof)",
            });
        }
    }

    return { ok: true, status: dbStatus };
}