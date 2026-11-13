import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AcceptButton } from "@/components/accept-button";
import { buttonVariants } from "@/components/ui/button";
import { KV, Loading, Notice, PageHeader, PageShell, Panel } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";
import { inspectionLabel, photoUrl, reputationLine, type SellerStats } from "@/lib/trade-ui";

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
            <Panel title="This transaction is no longer available">
                <p className="text-muted-foreground">Another buyer has already accepted it, or it was cancelled.</p>
            </Panel>
        );
    }
    if (t.is_seller) redirect(`/trades/${t.id}`);
    const { data: stats } = await supabase.rpc("seller_stats_for_token", { p_token: token });

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
            <PageHeader
                eyebrow={<StatusBadge status={t.status} />}
                title={t.title}
                subtitle={
                    <>
                        <p>{t.category} · {t.condition.replace("_", " ")} · Seller: {t.seller_name}</p>
                        <p className="mt-1 font-medium text-foreground">{reputationLine(stats as SellerStats | null)}</p>
                    </>
                }
            />

            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={photoUrl(p)} alt={t.title} className="aspect-square w-full rounded-2xl border object-cover" />
                    ))}
                </div>
            )}

            <Panel title="About this item">
                <p className="whitespace-pre-wrap">{t.description}</p>
                {t.known_defects && (
                    <p>
                        <span className="font-medium">Known defects:</span> {t.known_defects}
                    </p>
                )}
                <p className="text-muted-foreground">
                    Delivery: {t.delivery_method === "courier" ? "Courier" : "In-person collection"} ·
                    Inspection after you receive it: {inspectionLabel(t.inspection_minutes)}
                </p>
            </Panel>

            <Panel title="What you pay (simulated rate)">
                <dl className="space-y-1.5">
                    <KV label="Item price">{formatZar(BigInt(t.price_zar_cents))}</KV>
                    <KV label={buyerBond > 0n ? "Your security bond (refunded when the deal completes fairly)" : "Your security bond"}>{zar(buyerBond)}</KV>
                    <KV label="Total you put into protection" strong>{zar(total)}</KV>
                </dl>
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
            </Panel>

            {isOpen && (
                <Panel title="Accept and continue" className="border-primary/30">
                    {!walletLinked && (
                        <Notice tone="warn">
                            You need a linked wallet first.{" "}
                            <Link href="/dashboard" className="font-medium underline">
                                Set up your wallet on the dashboard
                            </Link>
                            , then come back to this link.
                        </Notice>
                    )}
                    <AcceptButton token={token} disabled={!walletLinked} />
                    <p className="text-xs text-muted-foreground">
                        By accepting, you agree to the terms above. They can&apos;t be changed afterwards.
                    </p>
                </Panel>
            )}

            {t.is_buyer && !isOpen && (
                <Panel title="You accepted this transaction">
                    <p>Next, the seller deposits their security bond. Then you&apos;ll be able to fund escrow.</p>
                    <Link href={`/trades/${t.id}`} className={buttonVariants({ variant: "outline", className: "rounded-full" })}>
                        View my transaction
                    </Link>
                </Panel>
            )}
        </div>
    );
}

export default function BuyerPage({ params }: { params: Promise<{ token: string }> }) {
    return (
        <PageShell width="max-w-2xl">
            <Suspense fallback={<Loading label="Loading transaction" />}>
                <BuyerContent params={params} />
            </Suspense>
        </PageShell>
    );
}
