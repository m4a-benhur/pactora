import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { WdkWalletPanelLoader } from "@/components/wdk-wallet-panel-loader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatZar } from "@/lib/pricing";
import { STATUS_LABEL } from "@/lib/trade-ui";

async function DashboardContent() {
    await connection();

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, wallet_address, is_admin")
        .eq("id", user.id)
        .single();

    const { data: trades } = await supabase
        .from("trades")
        .select("id, title, status, price_zar_cents, seller_id")
        .order("created_at", { ascending: false })
        .limit(20);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Welcome, {profile?.display_name ?? "there"}</h1>
                <SignOutButton />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Your account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    <p>Email: {user.email}</p>
                    <p className="break-all">Wallet: {profile?.wallet_address ?? "Not connected yet"}</p>
                    {profile?.is_admin && <p className="font-medium">Administrator</p>}
                </CardContent>
            </Card>

            <Link href="/trades/new" className={buttonVariants()}>
                Create a transaction
            </Link>
            {profile?.is_admin && (
                <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
                    Admin: review disputes
                </Link>
            )}

            <WdkWalletPanelLoader savedAddress={profile?.wallet_address ?? null} />

            <Card>
                <CardHeader>
                    <CardTitle>My transactions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    {(!trades || trades.length === 0) && <p>No transactions yet.</p>}
                    {trades?.map((t) => (
                        <p key={t.id}>
                            <Link href={`/trades/${t.id}`} className="underline">
                                {t.title}
                            </Link>{" "}
                            · {formatZar(BigInt(t.price_zar_cents))} · {t.seller_id === user.id ? "selling" : "buying"} ·{" "}
                            {STATUS_LABEL[t.status] ?? t.status}
                        </p>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <main className="mx-auto max-w-2xl space-y-4 p-6">
            <Suspense fallback={<p>Loading your dashboard…</p>}>
                <DashboardContent />
            </Suspense>
            <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
        </main>
    );
}