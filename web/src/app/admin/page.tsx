import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatZar } from "@/lib/pricing";
import { OUTCOME_LABEL } from "@/lib/trade-ui";

async function AdminContent() {
    await connection();
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!me?.is_admin) redirect("/dashboard");

    const { data: disputed } = await supabase
        .from("trades")
        .select("id, title, price_zar_cents, updated_at")
        .eq("status", "disputed")
        .order("updated_at", { ascending: true });

    const { data: resolved } = await supabase
        .from("disputes")
        .select("trade_id, outcome, resolved_at")
        .eq("status", "resolved")
        .order("resolved_at", { ascending: false })
        .limit(10);

    const ids = (resolved ?? []).map((r) => r.trade_id);
    const { data: titles } = ids.length
        ? await supabase.from("trades").select("id, title").in("id", ids)
        : { data: [] as { id: string; title: string }[] };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Administrator: disputes</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Waiting for a decision ({disputed?.length ?? 0})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    {(!disputed || disputed.length === 0) && <p>No open disputes.</p>}
                    {disputed?.map((t) => (
                        <p key={t.id}>
                            <Link href={`/admin/disputes/${t.id}`} className="underline">
                                {t.title}
                            </Link>{" "}
                            · {formatZar(BigInt(t.price_zar_cents))}
                        </p>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recently resolved</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    {(!resolved || resolved.length === 0) && <p>None yet.</p>}
                    {resolved?.map((r) => (
                        <p key={r.trade_id}>
                            <Link href={`/admin/disputes/${r.trade_id}`} className="underline">
                                {titles?.find((t) => t.id === r.trade_id)?.title ?? r.trade_id}
                            </Link>{" "}
                            · {OUTCOME_LABEL[r.outcome ?? ""] ?? r.outcome}
                        </p>
                    ))}
                </CardContent>
            </Card>

            <Link href="/dashboard" className="text-sm underline">
                Back to dashboard
            </Link>
        </div>
    );
}

export default function AdminPage() {
    return (
        <main className="mx-auto max-w-2xl space-y-4 p-6">
            <Suspense fallback={<p>Loading…</p>}>
                <AdminContent />
            </Suspense>
            <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
        </main>
    );
}