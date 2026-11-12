import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AcceptButton } from "@/components/accept-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";
import { STATUS_LABEL, inspectionLabel, photoUrl } from "@/lib/trade-ui";

async function BuyerContent({ params }: { params: Promise<{ token: string }> }) {
    await connection();
    const { token } = await params;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/t/${token}`)}`);

    const { data: t } = await supabase.rpc("get_trade_by_token", { p_token: token });
    if (!t) notFound();
    if (t.unavailable) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>This transaction is no longer available</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                    Another buyer has already accepted it, or it was cancelled.
                </CardContent>
            </Card>
        );
    }
    if (t.is_seller) redirect(`/trades/${t.id}`);

    const { data: profile } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", user.id)
        .single();
    const walletLinked = !!profile?.wallet_address;

    const rate = BigInt(t.rate_cents_per_usdt);
    const zar = (u: bigint) => formatZar(unitsToZarCents(u, rate));
    const isOpen = t.status === "open";
    const bondBps = BigInt(t.your_bond_bps);
    const b = computeBreakdown(BigInt(t.price_zar_cents), rate, isOpen ? bondBps : 0n);
    const buyerBond = isOpen ? b.buyerBondUnits : BigInt(t.buyer_bond_units ?? 0);
    const total = b.principalUnits + buyerBond;
    const photos: string[] = t.photos ?? [];

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABEL[t.status] ?? t.status}
                </p>
                <h1 className="text-2xl font-bold">{t.title}</h1>
                <p className="text-muted-foreground">
                    {t.category} · {t.condition.replace("_", " ")} · Seller: {t.seller_name}
                </p>
            </div>

            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={photoUrl(p)} alt={t.title} className="aspect-square rounded-md object-cover" />
                    ))}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>About this item</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p className="whitespace-pre-wrap">{t.description}</p>
                    {t.known_defects && (
                        <p>
                            <span className="font-medium">Known defects:</span> {t.known_defects}
                        </p>
                    )}
                    <p>
                        Delivery: {t.delivery_method === "courier" ? "Courier" : "In-person collection"} ·
                        Inspection after you receive it: {inspectionLabel(t.inspection_minutes)}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>What you pay (simulated rate)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    <p>Item price: {formatZar(BigInt(t.price_zar_cents))}</p>
                    <p>
                        Your security bond: {zar(buyerBond)}{" "}
                        {buyerBond > 0n ? "(refunded when the deal completes fairly)" : ""}
                    </p>
                    <p className="font-medium">Total you put into protection: {zar(total)}</p>
                    <p className="text-muted-foreground">
                        Pactora&apos;s 2% fee is taken from the seller&apos;s proceeds, so you pay nothing extra, and
                        no fee is charged if the deal doesn&apos;t complete.
                    </p>
                    <p className="text-muted-foreground">
                        {bondBps === 100n && isOpen
                            ? "Why a bond? New accounts put down a small refundable 1% bond. It is never forfeited just for raising a dispute."
                            : isOpen
                                ? "No bond needed: you've completed 3 or more transactions."
                                : ""}
                    </p>
                    <p className="text-muted-foreground">
                        The seller also deposits a {zar(BigInt(t.seller_bond_units))} bond. Your money stays locked
                        in escrow until you confirm the item, or a reviewer decides a dispute.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Settlement uses test USDT behind the scenes. Rate: R{(t.rate_cents_per_usdt / 100).toFixed(2)} = 1 USDT (simulated).
                    </p>
                </CardContent>
            </Card>

            {isOpen && (
                <Card>
                    <CardHeader>
                        <CardTitle>Accept and continue</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {!walletLinked && (
                            <p className="text-amber-700">
                                You need a linked wallet first.{" "}
                                <Link href="/dashboard" className="underline">
                                    Set up your wallet on the dashboard
                                </Link>
                                , then come back to this link.
                            </p>
                        )}
                        <AcceptButton token={token} disabled={!walletLinked} />
                        <p className="text-xs text-muted-foreground">
                            By accepting, you agree to the terms above. They can&apos;t be changed afterwards.
                        </p>
                    </CardContent>
                </Card>
            )}

            {t.is_buyer && !isOpen && (
                <Card>
                    <CardHeader>
                        <CardTitle>You accepted this transaction</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p>Next, the seller deposits their security bond. Then you&apos;ll be able to fund escrow.</p>
                        <Link href={`/trades/${t.id}`} className={buttonVariants({ variant: "outline" })}>
                            View my transaction
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default function BuyerPage({ params }: { params: Promise<{ token: string }> }) {
    return (
        <main className="mx-auto max-w-2xl space-y-4 p-6">
            <Suspense fallback={<p>Loading transaction…</p>}>
                <BuyerContent params={params} />
            </Suspense>
            <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
        </main>
    );
}