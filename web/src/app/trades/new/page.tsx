import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateTradeForm } from "@/components/create-trade-form";
import { Loading, PageHeader, PageShell } from "@/components/page-shell";

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
        <PageShell width="max-w-xl">
            <PageHeader title="Create a protected deal" subtitle="Describe the item, set the price, then share one link with your buyer." />
            <Suspense fallback={<Loading label="Loading" />}>
                <NewTradeContent />
            </Suspense>
        </PageShell>
    );
}
