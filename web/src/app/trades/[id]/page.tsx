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
import { KV, Loading, Notice, PageHeader, PageShell, Panel } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { TradeProgress } from "@/components/trade-progress";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";
import {
    COURIER_STEP_ORDER,
    DELIVERY_LABEL,
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
    const stars = (n: number) => `${"★".repeat(n)}${"☆".repeat(5 - n)}`;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow={<StatusBadge status={trade.status} />}
                title={trade.title}
                subtitle={
                    <>
                        <p>
                            {trade.category} · {trade.condition.replace("_", " ")} · Seller: {seller?.display_name}
                            {buyer ? ` · Buyer: ${buyer.display_name}` : ""}
                        </p>
                        <p className="mt-1 font-medium text-foreground">{reputationLine(stats as SellerStats | null)}</p>
                    </>
                }
            />

            <TradeProgress status={trade.status} />

            {trade.status === "disputed" && <Notice tone="danger">This deal is in dispute. Funds stay locked until a reviewer decides.</Notice>}

            {trade.status === "completed" && completed && (
                <Panel title="Completed ✓ Funds released" className="border-primary/30 bg-primary/5">
                    <dl className="space-y-1.5">
                        <KV label="Seller received (price − fee + bond back)">{zar(BigInt(completed.data.sellerPayout))}</KV>
                        <KV label="Buyer received (bond returned)">{zar(BigInt(completed.data.buyerBondReturned))}</KV>
                        <KV label="Pactora fee collected (2%)" strong>{zar(BigInt(completed.data.fee))}</KV>
                    </dl>
                </Panel>
            )}

            {(trade.status === "resolved" || trade.status === "completed") && (refunded || forfeit) && (
                <Panel title={trade.status === "resolved" ? "Resolved by review. No fee charged." : "Resolved by review."}>
                    <dl className="space-y-1.5">
                        {refunded && (
                            <>
                                <KV label="Buyer received">{zar(BigInt(refunded.data.buyerAmount))}</KV>
                                <KV label="Seller received">{zar(BigInt(refunded.data.sellerAmount))}</KV>
                            </>
                        )}
                        {forfeit && (
                            <>
                                <KV label="Buyer received">{zar(BigInt(forfeit.data.toBuyer))}</KV>
                                <KV label="Seller received">{zar(BigInt(forfeit.data.toSeller))}</KV>
                                <KV label="Forfeited bond to Pactora" strong>{zar(BigInt(forfeit.data.toTreasury))}</KV>
                            </>
                        )}
                    </dl>
                </Panel>
            )}

            {isBuyer && trade.status === "completed" && (
                <Panel title={rating ? "Your rating" : "Rate this seller"}>
                    {rating ? (
                        <>
                            <p className="text-xl text-amber-500" aria-label={`${rating.rating} out of 5 stars`}>{stars(rating.rating)}</p>
                            {rating.comment && <p>{rating.comment}</p>}
                        </>
                    ) : (
                        <RateSeller tradeId={trade.id} />
                    )}
                </Panel>
            )}

            {isSeller && rating && (
                <Panel title="Buyer's rating">
                    <p className="text-xl text-amber-500" aria-label={`${rating.rating} out of 5 stars`}>{stars(rating.rating)}</p>
                    {rating.comment && <p>{rating.comment}</p>}
                </Panel>
            )}

            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={photoUrl(p)} alt={trade.title} className="aspect-square w-full rounded-2xl border object-cover" />
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
                <Panel title="Photos">
                    <PhotoUploader tradeId={trade.id} count={photos.length} />
                </Panel>
            )}

            {isSeller && trade.status === "open" && (
                <Panel title="Share with your buyer">
                    <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">/t/{trade.share_token}</p>
                    <CopyLink path={`/t/${trade.share_token}`} />
                    {!seller?.wallet_address && <Notice tone="warn">Link your wallet on the dashboard before going live.</Notice>}
                </Panel>
            )}

            <Panel title="Item">
                <p className="whitespace-pre-wrap">{trade.description}</p>
                {trade.known_defects && (
                    <p>
                        <span className="font-medium">Known defects:</span> {trade.known_defects}
                    </p>
                )}
                <p className="text-muted-foreground">
                    Delivery: {trade.delivery_method === "courier" ? "Courier (simulated in this demo)" : "In-person collection"} ·
                    Inspection: {inspectionLabel(trade.inspection_minutes)}
                </p>
            </Panel>

            <Panel title="Money breakdown (simulated rate)">
                <dl className="space-y-1.5">
                    <KV label="Price">{formatZar(BigInt(trade.price_zar_cents))}</KV>
                    <KV label="Pactora fee (2%, only on completion)">{zar(b.feeUnits)}</KV>
                    {isSeller ? (
                        <>
                            <KV label="You receive" strong>{zar(b.sellerNetUnits)}</KV>
                            <KV label="Your security bond (returned on a fair completion)">{zar(b.sellerBondUnits)}</KV>
                        </>
                    ) : (
                        <>
                            <KV label="Seller security bond">{zar(b.sellerBondUnits)}</KV>
                            <KV label="Your total" strong>{zar(b.principalUnits + buyerBond)}</KV>
                        </>
                    )}
                    {trade.buyer_id && <KV label="Buyer bond">{zar(buyerBond)}</KV>}
                </dl>
                <p className="text-xs text-muted-foreground">
                    Settlement uses test USDT behind the scenes. Rate: R{(trade.rate_cents_per_usdt / 100).toFixed(2)} = 1 USDT (simulated).
                </p>
            </Panel>

            {deliveries && deliveries.length > 0 && (
                <Panel title="Delivery timeline">
                    <ol className="space-y-3 border-l-2 pl-4">
                        {deliveries.map((d, i) => (
                            <li key={i} className="relative">
                                <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" />
                                <p className="font-medium">{DELIVERY_LABEL[d.status] ?? d.status}
                                    {d.is_simulated && (
                                        <span className="ml-2 rounded-full bg-accent/60 px-2 py-0.5 text-xs font-medium text-accent-foreground">SIMULATED</span>
                                    )}
                                </p>
                                <p className="text-xs text-muted-foreground">{utcStamp(d.created_at)}</p>
                            </li>
                        ))}
                    </ol>
                </Panel>
            )}

            {events && events.length > 0 && (
                <Panel title="On-chain record (Sepolia)">
                    <ul className="space-y-1">
                        {events.map((e, i) => (
                            <li key={i} className="flex items-center justify-between gap-3">
                                <span>{e.event_name}</span>
                                <a href={explorerTx(e.tx_hash)} target="_blank" rel="noreferrer" className="font-mono text-xs underline">
                                    {e.tx_hash.slice(0, 10)}…
                                </a>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}

            <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "rounded-full" })}>
                Back to dashboard
            </Link>
        </div>
    );
}

export default function TradePage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <PageShell>
            <Suspense fallback={<Loading label="Loading transaction" />}>
                <TradeContent params={params} />
            </Suspense>
        </PageShell>
    );
}
