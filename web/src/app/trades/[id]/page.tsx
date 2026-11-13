import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncTradeFromChain } from "@/lib/sync";
import { CopyLink } from "@/components/copy-link";
import { PhotoUploader } from "@/components/photo-uploader";
import { TradeActions } from "@/components/trade-actions";
import { DisputeSection, type EvidenceItem } from "@/components/dispute-section";
import { RateSeller } from "@/components/rate-seller";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";
import {
    COURIER_STEP_ORDER,
    DELIVERY_LABEL,
    OUTCOME_LABEL,
    STATUS_LABEL,
    inspectionLabel,
    photoUrl,
    reputationLine,
    utcStamp,
    type SellerStats,
} from "@/lib/trade-ui";
import { explorerTx } from "@/lib/chain";

const SYNCABLE = ["accepted", "seller_bonded", "funded", "dispatched", "delivered", "disputed"];

async function TradeContent({ params }: { params: Promise<{ id: string }> }) {
    await connection();
    const { id } = await params;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: first } = await supabase.from("trades").select("*").eq("id", id).single();
    if (!first) notFound();

    if (first.buyer_id && SYNCABLE.includes(first.status)) {
        try {
            await syncTradeFromChain(id);
        } catch {
            // e.g. missing server env vars; the page still renders
        }
    }
    const { data: trade } = await supabase.from("trades").select("*").eq("id", id).single();
    if (!trade) notFound();

    const partyIds = [trade.seller_id, trade.buyer_id].filter(Boolean) as string[];
    const [
        { data: parties },
        { data: media },
        { data: deliveries },
        { data: events },
        { data: dispute },
        { data: rating },
        { data: stats },
    ] = await Promise.all([
        supabase.from("profiles").select("id, display_name, wallet_address").in("id", partyIds),
        supabase.from("trade_media").select("id, kind, storage_path, note, uploaded_by").eq("trade_id", id).order("created_at"),
        supabase
            .from("delivery_events")
            .select("status, is_simulated, note, created_at")
            .eq("trade_id", id)
            .order("created_at"),
        supabase
            .from("chain_events")
            .select("event_name, tx_hash, data, created_at")
            .eq("trade_id", id)
            .order("created_at"),
        supabase
            .from("disputes")
            .select("reason, seller_response, status, outcome, admin_notes, opened_by")
            .eq("trade_id", id)
            .maybeSingle(),
        supabase.from("seller_ratings").select("rating, comment").eq("trade_id", id).maybeSingle(),
        supabase.rpc("seller_stats", { p_seller: trade.seller_id }),
    ]);

    const seller = parties?.find((p) => p.id === trade.seller_id);
    const buyer = parties?.find((p) => p.id === trade.buyer_id);
    const isSeller = trade.seller_id === user.id;
    const isBuyer = trade.buyer_id === user.id;

    const photos = (media ?? []).filter((m) => m.kind === "item_photo").map((m) => m.storage_path as string);
    const evidenceRows = (media ?? []).filter((m) => m.kind === "evidence");
    const { data: signed } = evidenceRows.length
        ? await supabase.storage
            .from("evidence")
            .createSignedUrls(evidenceRows.map((e) => e.storage_path), 3600)
        : { data: [] as { path: string | null; signedUrl: string }[] };
    const evidence: EvidenceItem[] = evidenceRows.map((e) => ({
        id: e.id,
        url: signed?.find((s) => s.path === e.storage_path)?.signedUrl ?? null,
        note: e.note,
        mine: e.uploaded_by === user.id,
        ext: String(e.storage_path).split(".").pop() ?? "file",
    }));

    const rate = BigInt(trade.rate_cents_per_usdt);
    const zar = (units: bigint) => formatZar(unitsToZarCents(units, rate));
    const b = computeBreakdown(BigInt(trade.price_zar_cents), rate);
    const buyerBond = BigInt(trade.buyer_bond_units ?? 0);

    const lastStep = deliveries && deliveries.length > 0 ? deliveries[deliveries.length - 1].status : null;
    const nextIdx = (lastStep ? COURIER_STEP_ORDER.indexOf(lastStep) : -1) + 1;
    const courierNext =
        trade.status === "dispatched" &&
            trade.delivery_method === "courier" &&
            nextIdx < COURIER_STEP_ORDER.length
            ? COURIER_STEP_ORDER[nextIdx]
            : null;

    const completed = events?.find((e) => e.event_name === "TradeCompleted");
    const refunded = events?.find((e) => e.event_name === "DisputeResolvedRefund");
    const forfeit = events?.find((e) => e.event_name === "DisputeResolvedWithForfeit");

    const inProgress = ["dispatched", "delivered", "disputed"].includes(trade.status);

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABEL[trade.status] ?? trade.status}
                </p>
                <h1 className="text-2xl font-bold">{trade.title}</h1>
                <p className="text-muted-foreground">
                    {trade.category} · {trade.condition.replace("_", " ")} · Seller: {seller?.display_name}
                    {buyer ? ` · Buyer: ${buyer.display_name}` : ""}
                </p>
                <p className="text-sm font-medium">{reputationLine(stats as SellerStats | null)}</p>
            </div>

            {trade.status === "completed" && completed && (
                <Card>
                    <CardHeader>
                        <CardTitle>Completed ✓ Funds released</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <p>Seller received (price − fee + bond back): {zar(BigInt(completed.data.sellerPayout))}</p>
                        <p>Buyer received (bond returned): {zar(BigInt(completed.data.buyerBondReturned))}</p>
                        <p className="font-medium">Pactora fee collected (2%): {zar(BigInt(completed.data.fee))}</p>
                    </CardContent>
                </Card>
            )}

            {(trade.status === "resolved" || trade.status === "completed") && (refunded || forfeit) && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {trade.status === "resolved" ? "Resolved by review. No fee charged." : "Resolved by review."}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        {refunded && (
                            <>
                                <p>Buyer received: {zar(BigInt(refunded.data.buyerAmount))}</p>
                                <p>Seller received: {zar(BigInt(refunded.data.sellerAmount))}</p>
                            </>
                        )}
                        {forfeit && (
                            <>
                                <p>Buyer received: {zar(BigInt(forfeit.data.toBuyer))}</p>
                                <p>Seller received: {zar(BigInt(forfeit.data.toSeller))}</p>
                                <p className="font-medium">
                                    Forfeited bond to Pactora: {zar(BigInt(forfeit.data.toTreasury))}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {isBuyer && trade.status === "completed" && (
                <Card>
                    <CardHeader>
                        <CardTitle>{rating ? "Your rating" : "Rate this seller"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {rating ? (
                            <>
                                <p className="text-xl text-amber-500">{"★".repeat(rating.rating)}{"☆".repeat(5 - rating.rating)}</p>
                                {rating.comment && <p>{rating.comment}</p>}
                            </>
                        ) : (
                            <RateSeller tradeId={trade.id} />
                        )}
                    </CardContent>
                </Card>
            )}

            {isSeller && rating && (
                <Card>
                    <CardHeader>
                        <CardTitle>Buyer&apos;s rating</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <p className="text-xl text-amber-500">{"★".repeat(rating.rating)}{"☆".repeat(5 - rating.rating)}</p>
                        {rating.comment && <p>{rating.comment}</p>}
                    </CardContent>
                </Card>
            )}

            {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={photoUrl(p)} alt={trade.title} className="aspect-square rounded-md object-cover" />
                    ))}
                </div>
            )}

            {(isSeller || isBuyer) && trade.buyer_id && (
                <TradeActions
                    tradeId={trade.id}
                    status={trade.status}
                    role={isSeller ? "seller" : "buyer"}
                    deliveryMethod={trade.delivery_method}
                    sellerWallet={seller?.wallet_address ?? null}
                    buyerWallet={buyer?.wallet_address ?? null}
                    priceUnits={String(trade.price_units)}
                    sellerBondUnits={String(trade.seller_bond_units)}
                    buyerBondUnits={String(trade.buyer_bond_units ?? 0)}
                    inspectionMinutes={trade.inspection_minutes}
                    termsHash={trade.terms_hash ?? ""}
                    inspectionEndsAt={trade.inspection_ends_at}
                    courierNext={courierNext}
                />
            )}

            {(isSeller || isBuyer) && trade.buyer_id && inProgress && (
                <DisputeSection
                    tradeId={trade.id}
                    role={isSeller ? "seller" : "buyer"}
                    status={trade.status}
                    sellerWallet={seller?.wallet_address ?? null}
                    buyerWallet={buyer?.wallet_address ?? null}
                    inspectionEndsAt={trade.inspection_ends_at}
                    dispute={
                        dispute
                            ? {
                                reason: dispute.reason,
                                seller_response: dispute.seller_response,
                                status: dispute.status,
                                opened_by_me: dispute.opened_by === user.id,
                            }
                            : null
                    }
                    evidence={evidence}
                />
            )}

            {isSeller && trade.status === "open" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Photos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PhotoUploader tradeId={trade.id} count={photos.length} />
                    </CardContent>
                </Card>
            )}

            {isSeller && trade.status === "open" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Share with your buyer</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p className="break-all font-mono text-xs">/t/{trade.share_token}</p>
                        <CopyLink path={`/t/${trade.share_token}`} />
                        {!seller?.wallet_address && (
                            <p className="text-amber-700">Link your wallet on the dashboard before going live.</p>
                        )}
                    </CardContent>
                </Card>
            )}

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
                        Delivery: {trade.delivery_method === "courier" ? "Courier (simulated in this demo)" : "In-person collection"} ·
                        Inspection: {inspectionLabel(trade.inspection_minutes)}
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
                        <>
                            <p>Seller security bond: {zar(b.sellerBondUnits)}</p>
                            <p className="font-medium">Your total: {zar(b.principalUnits + buyerBond)}</p>
                        </>
                    )}
                    {trade.buyer_id && <p>Buyer bond: {zar(buyerBond)}</p>}
                    <p className="text-xs text-muted-foreground">
                        Settlement uses test USDT behind the scenes. Rate: R{(trade.rate_cents_per_usdt / 100).toFixed(2)} = 1 USDT (simulated).
                    </p>
                </CardContent>
            </Card>

            {deliveries && deliveries.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Delivery timeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        {deliveries.map((d, i) => (
                            <p key={i}>
                                {utcStamp(d.created_at)} · {DELIVERY_LABEL[d.status] ?? d.status}
                                {d.is_simulated && (
                                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">SIMULATED</span>
                                )}
                            </p>
                        ))}
                    </CardContent>
                </Card>
            )}

            {events && events.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>On-chain record (Sepolia)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        {events.map((e, i) => (
                            <p key={i}>
                                {e.event_name} ·{" "}
                                <a href={explorerTx(e.tx_hash)} target="_blank" rel="noreferrer" className="underline">
                                    {e.tx_hash.slice(0, 10)}…
                                </a>
                            </p>
                        ))}
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