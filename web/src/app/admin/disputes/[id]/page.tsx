import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncTradeFromChain } from "@/lib/sync";
import { ResolveForm } from "@/components/resolve-form";
import { KV, Loading, PageHeader, PageShell, Panel } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { computeBreakdown, formatZar, unitsToZarCents } from "@/lib/pricing";
import { DELIVERY_LABEL, OUTCOME_LABEL, photoUrl, utcStamp } from "@/lib/trade-ui";
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
    uid === trade.seller_id
      ? `Seller (${seller?.display_name})`
      : `Buyer (${buyer?.display_name})`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<StatusBadge status={trade.status} />}
        title={trade.title}
        subtitle={
          <>
            <p>
              Seller: {seller?.display_name} · Buyer: {buyer?.display_name} · Price{" "}
              {formatZar(BigInt(trade.price_zar_cents))}
            </p>
            <p className="mt-1 break-all text-xs">Agreed terms hash: {trade.terms_hash}</p>
          </>
        }
      />

      <Panel title="Original listing">
        <p className="whitespace-pre-wrap">{trade.description}</p>
        <p>
          <span className="font-medium">Known defects (as declared):</span>{" "}
          {trade.known_defects || "None declared"}
        </p>
        <p className="text-muted-foreground">
          Condition: {trade.condition.replace("_", " ")} · Delivery: {trade.delivery_method} ·
          Bonds: seller {zar(b.sellerBondUnits)}, buyer {zar(BigInt(trade.buyer_bond_units ?? 0))}
        </p>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={photoUrl(p.storage_path)}
                alt=""
                className="aspect-square w-full rounded-xl border object-cover"
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Timeline">
        <ol className="space-y-3 border-l-2 pl-4">
          {(deliveries ?? []).map((d, i) => (
            <li key={`d${i}`} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" />
              <p className="font-medium">
                {DELIVERY_LABEL[d.status] ?? d.status}
                {d.is_simulated ? " (SIMULATED courier)" : ""}
              </p>
              <p className="text-xs text-muted-foreground">{utcStamp(d.created_at)}</p>
            </li>
          ))}
          {(events ?? []).map((e, i) => (
            <li key={`e${i}`} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-accent" />
              <p className="font-medium">
                On-chain {e.event_name} ·{" "}
                <a
                  href={explorerTx(e.tx_hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs underline"
                >
                  {e.tx_hash.slice(0, 10)}…
                </a>
              </p>
              <p className="text-xs text-muted-foreground">{utcStamp(e.created_at)}</p>
            </li>
          ))}
        </ol>
        {trade.inspection_ends_at && (
          <p className="text-muted-foreground">
            Inspection window ended/ends: {utcStamp(trade.inspection_ends_at)}
          </p>
        )}
      </Panel>

      <Panel title="The dispute">
        {!dispute && <p>No written dispute record was found for this trade.</p>}
        {dispute && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-3">
              <p className="font-medium">Opened by {who(dispute.opened_by)}</p>
              <p className="whitespace-pre-wrap">{dispute.reason}</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="font-medium">Seller&apos;s response</p>
              <p className="whitespace-pre-wrap">
                {dispute.seller_response ?? "No response yet."}
              </p>
            </div>
          </div>
        )}
        <div>
          <p className="font-medium">Evidence ({evidence.length})</p>
          {evidence.length === 0 && <p className="text-muted-foreground">None uploaded.</p>}
          <ul className="space-y-1">
            {evidence.map((e) => {
              const url = signed?.find((s) => s.path === e.storage_path)?.signedUrl;
              return (
                <li key={e.id}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="underline">
                      {e.storage_path.split(".").pop()?.toUpperCase()} file
                    </a>
                  ) : (
                    "File unavailable"
                  )}{" "}
                  <span className="text-muted-foreground">
                    · from {who(e.uploaded_by)}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>

      {trade.status === "disputed" && (
        <Panel title="Your decision" className="border-primary/30">
          <ResolveForm
            tradeId={trade.id}
            rateCents={trade.rate_cents_per_usdt}
            principalUnits={String(trade.price_units)}
            sellerBondUnits={String(trade.seller_bond_units)}
            buyerBondUnits={String(trade.buyer_bond_units ?? 0)}
            feeBps={trade.fee_bps}
          />
        </Panel>
      )}

      {dispute?.status === "resolved" && (
        <Panel title="Decision recorded" className="border-primary/30 bg-primary/5">
          <dl className="space-y-1.5">
            <KV label="Outcome" strong>
              {OUTCOME_LABEL[dispute.outcome ?? ""] ?? dispute.outcome}
            </KV>
          </dl>
          <p className="whitespace-pre-wrap">{dispute.admin_notes}</p>
          <p className="break-all text-xs text-muted-foreground">
            Decision hash: {dispute.decision_hash}
          </p>
        </Panel>
      )}

      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </div>
  );
}

function AdminBanner() {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Administrator area</p>
      <p className="mt-1 text-xs text-amber-800">
        Reviewing a dispute. Your decision moves funds on-chain and cannot be undone.
      </p>
    </div>
  );
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="min-h-screen bg-slate-50/60">
      <PageShell>
        <AdminBanner />
        <Suspense fallback={<Loading label="Loading case" />}>
          <ReviewContent params={params} />
        </Suspense>
      </PageShell>
    </div>
  );
}