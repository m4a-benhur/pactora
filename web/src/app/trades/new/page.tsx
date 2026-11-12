import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateTradeForm } from "@/components/create-trade-form";

async function NewTradeContent() {
    await connection();
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: settings } = await supabase
        .from("platform_settings")
        .select("demo_rate_zar_cents_per_usdt")
        .eq("id", 1)
        .single();

    return <CreateTradeForm rateCentsPerUsdt={settings?.demo_rate_zar_cents_per_usdt ?? 2000} />;
}

export default function NewTradePage() {
    return (
        <main className="mx-auto max-w-xl space-y-4 p-6">
            <Suspense fallback={<p>Loading…</p>}>
                <NewTradeContent />
            </Suspense>
        </main>
    );
}