import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncTradeFromChain } from "@/lib/sync";
import { ResolveForm } from "@/components/resolve-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";
import { DELIVERY_LABEL, OUTCOME_LABEL, STATUS_LABEL, photoUrl, utcStamp } from "@/lib/trade-ui";
import { explorerTx } from "@/lib/chain";

async function ReviewContent({ params }: { params: Promise<{ id: string }> }) {
    await connection();
    const { id } = await params;

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!me?.is_admin) redirect("/dashboard");

    try {
        await syncTradeFromChain(id);
    } catch {
        // page still renders from stored data
    }

    const { data: trade } = await supabase.from("trades").select("*").eq("id", id).single();
    if (!trade) notFound();

    const [{ data: parties }, { data: dispute }, { data: media }, { data: deliveries }, { data: events }] =
        await Promise.all([
            supabase
                .from("profiles")
                .select("id, display_name, wallet_address")
                .in("id", [trade.seller_id, trade.buyer_id].filter(Boolean) as string[]),
            supabase.from("disputes").select("*").eq("trade_id", id).maybeSingle(),
            supabase.from("trade_media").select("*").eq("trade_id", id).order("created_at"),
            supabase
                .from("delivery_events")
                .select("status, is_simulated, created_at")
                .eq("trade_id", id)
                .order("created_at"),
            supabase
                .from("chain_events")
                .select("event_name, tx_hash, created_at")
                .eq("trade_id", id)
                .order("created_at"),
        ]);

    const seller = parties?.find((p) => p.id === trade.seller_id);
    const buyer = parties?.find((p) => p.id === trade.buyer_id);
    const photos = (media ?? []).filter((m) => m.kind === "item_photo");
    const evidence = (media ?? []).filter((m) => m.kind === "evidence");

    const { data: signed } = evidence.length
        ? await supabase.storage
            .from("evidence")
            .createSignedUrls(evidence.map((e) => e.storage_path), 3600)
        : { data: [] as { path: string | null; signedUrl: string }[] };

    const rate = BigInt(trade.rate_cents_per_usdt);
    const zar = (u: bigint) => formatZar(unitsToZarCents(u, rate));
    const b = computeBreakdown(BigInt(trade.price_zar_cents), rate);

    const who = (uid: string) =>
        uid === trade.seller_id ? `Seller (${seller?.display_name})` : `Buyer (${buyer?.display_name})`;

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABEL[trade.status] ?? trade.status}
                </p>
                <h1 className="text-2xl font-bold">{trade.title}</h1>
                <p className="text-muted-foreground">
                    Seller: {seller?.display_name} · Buyer: {buyer?.display_name} · Price{" "}
                    {formatZar(BigInt(trade.price_zar_cents))}
                </p>
                <p className="break-all text-xs text-muted-foreground">Agreed terms hash: {trade.terms_hash}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Original listing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p className="whitespace-pre-wrap">{trade.description}</p>
                    <p>
                        <span className="font-medium">Known defects (as declared):</span> {trade.known_defects || "None declared"}
                    </p>
                    <p>
                        Condition: {trade.condition.replace("_", " ")} · Delivery: {trade.delivery_method} · Bonds: seller{" "}
                        {zar(b.sellerBondUnits)}, buyer {zar(BigInt(trade.buyer_bond_units ?? 0))}
                    </p>
                    {photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {photos.map((p) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={p.id} src={photoUrl(p.storage_path)} alt="" className="aspect-square rounded-md object-cover" />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    {(deliveries ?? []).map((d, i) => (
                        <p key={`d${i}`}>
                            {utcStamp(d.created_at)} · {DELIVERY_LABEL[d.status] ?? d.status}
                            {d.is_simulated ? " (SIMULATED courier)" : ""}
                        </p>
                    ))}
                    {(events ?? []).map((e, i) => (
                        <p key={`e${i}`}>
                            {utcStamp(e.created_at)} · on-chain {e.event_name} ·{" "}
                            <a href={explorerTx(e.tx_hash)} target="_blank" rel="noreferrer" className="underline">
                                {e.tx_hash.slice(0, 10)}…
                            </a>
                        </p>
                    ))}
                    {trade.inspection_ends_at && <p>Inspection window ended/ends: {utcStamp(trade.inspection_ends_at)}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>The dispute</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    {!dispute && <p>No written dispute record was found for this trade.</p>}
                    {dispute && (
                        <>
                            <div>
                                <p className="font-medium">Opened by {who(dispute.opened_by)}</p>
                                <p className="whitespace-pre-wrap">{dispute.reason}</p>
                            </div>
                            <div>
                                <p className="font-medium">Seller&apos;s response</p>
                                <p className="whitespace-pre-wrap">{dispute.seller_response ?? "No response yet."}</p>
                            </div>
                        </>
                    )}
                    <div>
                        <p className="font-medium">Evidence ({evidence.length})</p>
                        {evidence.length === 0 && <p>None uploaded.</p>}
                        {evidence.map((e) => {
                            const url = signed?.find((s) => s.path === e.storage_path)?.signedUrl;
                            return (
                                <p key={e.id}>
                                    {url ? (
                                        <a href={url} target="_blank" rel="noreferrer" className="underline">
                                            {e.storage_path.split(".").pop()?.toUpperCase()} file
                                        </a>
                                    ) : (
                                        "File unavailable"
                                    )}{" "}
                                    · from {who(e.uploaded_by)}
                                    {e.note ? ` · ${e.note}` : ""}
                                </p>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {trade.status === "disputed" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Your decision</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResolveForm
                            tradeId={trade.id}
                            rateCents={trade.rate_cents_per_usdt}
                            principalUnits={String(trade.price_units)}
                            sellerBondUnits={String(trade.seller_bond_units)}
                            buyerBondUnits={String(trade.buyer_bond_units ?? 0)}
                            feeBps={trade.fee_bps}
                        />
                    </CardContent>
                </Card>
            )}

            {dispute?.status === "resolved" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Decision recorded</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <p className="font-medium">{OUTCOME_LABEL[dispute.outcome ?? ""] ?? dispute.outcome}</p>
                        <p className="whitespace-pre-wrap">{dispute.admin_notes}</p>
                        <p className="break-all text-xs text-muted-foreground">Decision hash: {dispute.decision_hash}</p>
                    </CardContent>
                </Card>
            )}

            <Link href="/admin" className="text-sm underline">
                Back to admin
            </Link>
        </div>
    );
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <main className="mx-auto max-w-2xl space-y-4 p-6">
            <Suspense fallback={<p>Loading case…</p>}>
                <ReviewContent params={params} />
            </Suspense>
            <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
        </main>
    );
}