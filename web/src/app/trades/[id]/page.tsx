import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CopyLink } from "@/components/copy-link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";

async function TradeContent({ params }: { params: Promise<{ id: string }> }) {
    await connection();
    const { id } = await params;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: trade } = await supabase.from("trades").select("*").eq("id", id).single();
    if (!trade) notFound();

    const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", user.id)
        .single();

    const rate = BigInt(trade.rate_cents_per_usdt);
    const b = computeBreakdown(BigInt(trade.price_zar_cents), rate);
    const zar = (units: bigint) => formatZar(unitsToZarCents(units, rate));
    const isSeller = trade.seller_id === user.id;

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status: {trade.status}</p>
                <h1 className="text-2xl font-bold">{trade.title}</h1>
                <p className="text-muted-foreground">
                    {trade.category} · {trade.condition.replace("_", " ")}
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Item</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p className="whitespace-pre-wrap">{trade.description}</p>
                    {trade.known_defects && (
                        <p>
                            <span className="font-medium">Known defects:</span> {trade.known_defects}
                        </p>
                    )}
                    <p>
                        Delivery: {trade.delivery_method === "courier" ? "Courier" : "In-person collection"} ·
                        Inspection: {trade.inspection_minutes >= 60 ? `${trade.inspection_minutes / 60} hours` : `${trade.inspection_minutes} minutes (demo)`}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Money breakdown (simulated rate)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    <p>Price: {formatZar(BigInt(trade.price_zar_cents))}</p>
                    <p>Pactora fee (2%, only on completion): {zar(b.feeUnits)}</p>
                    {isSeller ? (
                        <>
                            <p className="font-medium">You receive: {zar(b.sellerNetUnits)}</p>
                            <p>Your security bond: {zar(b.sellerBondUnits)} (returned on a fair completion)</p>
                        </>
                    ) : (
                        <p>Seller security bond: {zar(b.sellerBondUnits)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Settlement uses test USDT behind the scenes. Rate: R{(trade.rate_cents_per_usdt / 100).toFixed(2)} = 1 USDT (simulated).
                    </p>
                </CardContent>
            </Card>

            {isSeller && (
                <Card>
                    <CardHeader>
                        <CardTitle>Share with your buyer</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p className="break-all font-mono text-xs">/t/{trade.share_token}</p>
                        <CopyLink path={`/t/${trade.share_token}`} />
                        <p className="text-xs text-muted-foreground">
                            The buyer page is built in the next task, so this link won&apos;t open yet.
                        </p>
                        {!profile?.wallet_address && (
                            <p className="text-amber-700">
                                Link your wallet on the dashboard before you can deposit your bond and go live.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
                Back to dashboard
            </Link>
        </div>
    );
}

export default function TradePage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <main className="mx-auto max-w-2xl space-y-4 p-6">
            <Suspense fallback={<p>Loading transaction…</p>}>
                <TradeContent params={params} />
            </Suspense>
            <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
        </main>
    );
}