import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WdkWalletPanelLoader } from "@/components/wdk-wallet-panel-loader";
import { buttonVariants } from "@/components/ui/button";
import { formatZar } from "@/lib/pricing";
import { Loading, PageHeader, PageShell, Panel } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";

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

    const pill = "rounded-full";

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Welcome, ${profile?.display_name ?? "there"}`}
                subtitle="Your deals, wallet and funds in one place."
                actions={
                    <>
                        <Link href="/trades/new" className={buttonVariants({ className: pill })}>Create a transaction</Link>
                        <Link href="/ramp" className={buttonVariants({ variant: "outline", className: pill })}>Add or withdraw funds</Link>
                        {profile?.is_admin && (
                            <Link href="/admin" className={buttonVariants({ variant: "outline", className: pill })}>Admin: review disputes</Link>
                        )}
                    </>
                }
            />

            <Panel title="Your account">
                <p><span className="text-muted-foreground">Email:</span> {user.email}</p>
                <p className="break-all"><span className="text-muted-foreground">Wallet:</span> {profile?.wallet_address ?? "Not connected yet"}</p>
                {profile?.is_admin && <p className="font-medium text-primary">Administrator</p>}
            </Panel>

            <WdkWalletPanelLoader savedAddress={profile?.wallet_address ?? null} />

            <Panel title="My transactions">
                {(!trades || trades.length === 0) && (
                    <div className="space-y-3 py-2">
                        <p className="text-muted-foreground">No transactions yet. Start a protected deal and share the link with your buyer.</p>
                        <Link href="/trades/new" className={buttonVariants({ className: pill })}>Create your first deal</Link>
                    </div>
                )}
                {trades && trades.length > 0 && (
                    <ul className="-mx-2 divide-y">
                        {trades.map((t) => (
                            <li key={t.id}>
                                <Link href={`/trades/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-muted/60">
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{t.title}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatZar(BigInt(t.price_zar_cents))} · {t.seller_id === user.id ? "selling" : "buying"}
                                        </span>
                                    </span>
                                    <StatusBadge status={t.status} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <PageShell>
            <Suspense fallback={<Loading label="Loading your dashboard" />}>
                <DashboardContent />
            </Suspense>
        </PageShell>
    );
}
