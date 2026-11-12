import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncTradeFromChain } from "@/lib/sync";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Please log in." }, { status: 401 });

    // Row-level security: only the seller, buyer or an admin can see this trade.
    const { data: trade } = await supabase.from("trades").select("id").eq("id", id).single();
    if (!trade) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const txHash = typeof body?.txHash === "string" ? body.txHash : null;

    try {
        const result = await syncTradeFromChain(id, txHash);
        return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "Sync failed." },
            { status: 500 }
        );
    }
}