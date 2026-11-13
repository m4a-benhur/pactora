import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformStats } from "@/lib/admin-stats";
import { BackfillButton } from "@/components/backfill-button";
import { formatUnits, formatZar } from "@/lib/ramp";

export default function StatsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <Stats />
    </Suspense>
  );
}

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

async function Stats() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/stats");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) notFound();

  const s = await getPlatformStats();
  const zar = (units: bigint) => formatZar(Number((units * BigInt(s.avgRate)) / 1_000_000n));

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">All amounts are testnet and simulated.</p>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <Link href="/admin" className="text-sm underline">Disputes</Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card label="Users" value={String(s.users)} />
        <Card label="Trades created" value={String(s.trades)} note={`${s.paidTrades} paid the fee`} />
        <Card label="Dispute rate" value={`${s.disputeRatePct}%`} note={`${s.disputes} disputes`} />
        <Card label="Settled volume" value={`${formatUnits(s.volumeUnits)} tUSDT`} note={`about ${zar(s.volumeUnits)} at the simulated rate`} />
        <Card label="Trade fees (2%)" value={`${formatUnits(s.feeUnits)} tUSDT`} note={`about ${zar(s.feeUnits)}`} />
        <Card label="Seller bonds forfeited" value={`${formatUnits(s.sellerBondForfeitUnits)} tUSDT`} note="Buyer-bond forfeits are counted below, not summed" />
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-medium">Trades by status</h2>
          <table className="w-full text-sm"><tbody>
            {Object.entries(s.byStatus).map(([k, v]) => (<tr key={k} className="border-b"><td className="py-1.5">{k}</td><td className="py-1.5 text-right">{v}</td></tr>))}
            {!Object.keys(s.byStatus).length && <tr><td className="py-1.5 text-muted-foreground">No trades yet.</td></tr>}
          </tbody></table>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-medium">Dispute outcomes</h2>
          <table className="w-full text-sm"><tbody>
            {Object.entries(s.outcomes).map(([k, v]) => (<tr key={k} className="border-b"><td className="py-1.5">{k}</td><td className="py-1.5 text-right">{v}</td></tr>))}
            {!Object.keys(s.outcomes).length && <tr><td className="py-1.5 text-muted-foreground">No resolved disputes yet.</td></tr>}
          </tbody></table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Simulated ramps (completed)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card label="Purchases" value={String(s.ramp.onCount)} note={formatZar(s.ramp.onZarCents)} />
          <Card label="Withdrawals" value={String(s.ramp.offCount)} note={formatZar(s.ramp.offZarCents)} />
          <Card label="Ramp fees" value={formatZar(s.ramp.feeCents)} note={`${s.ramp.failed} failed`} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Chain event backfill</h2>
        <p className="text-sm text-muted-foreground">Reads escrow logs from the chain and records any event that is missing from chain_events.</p>
        <BackfillButton />
      </section>
    </main>
  );
}
