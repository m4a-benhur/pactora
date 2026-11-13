// SERVER ONLY. Aggregates platform numbers for /admin/stats. Fine at hackathon scale (reads up to 5,000 rows per table).
import { createAdminClient } from "@/lib/supabase/admin";

const COMPLETED_STATUSES = ["completed"]; // ADAPT if your completed status string differs (see STATUS_LABEL in trade-ui.ts)

type Trade = { id: string; status: string; price_units: string | number; seller_bond_units: string | number; fee_bps: number; rate: number };
type Dispute = { trade_id: string; status: string | null; outcome: string | null };

const big = (v: string | number | null | undefined) => BigInt(v ?? 0);

export async function getPlatformStats() {
  const admin = createAdminClient();
  const [{ data: trades }, { data: disputes }, { data: ramps }, { count: users }] = await Promise.all([
    admin.from("trades").select("id,status,price_units,seller_bond_units,fee_bps,rate").limit(5000),
    admin.from("disputes").select("trade_id,status,outcome").limit(5000),
    admin.from("ramp_transactions").select("kind,status,zar_cents,fee_cents,usdt_units").limit(5000),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const T = (trades ?? []) as Trade[];
  const D = (disputes ?? []) as Dispute[];
  const byTrade = new Map(T.map((t) => [t.id, t]));

  const byStatus: Record<string, number> = {};
  for (const t of T) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

  const outcomes: Record<string, number> = {};
  for (const d of D) if (d.outcome) outcomes[d.outcome] = (outcomes[d.outcome] ?? 0) + 1;

  // Trades that paid the 2% fee: normal completion, or a dispute ruled for the seller / buyer misconduct.
  const feePaying = new Set<string>(T.filter((t) => COMPLETED_STATUSES.includes(t.status)).map((t) => t.id));
  for (const d of D) if (d.outcome === "release_to_seller" || d.outcome === "buyer_bond_forfeited") feePaying.add(d.trade_id);

  let volumeUnits = 0n, feeUnits = 0n, sellerBondForfeitUnits = 0n, avgRate = 0, rateN = 0;
  for (const id of feePaying) {
    const t = byTrade.get(id);
    if (!t) continue;
    const price = big(t.price_units);
    volumeUnits += price;
    feeUnits += (price * BigInt(t.fee_bps)) / 10_000n;
    avgRate += Number(t.rate); rateN++;
  }
  for (const d of D) {
    if (d.outcome !== "seller_bond_forfeited") continue;
    const t = byTrade.get(d.trade_id);
    if (t) sellerBondForfeitUnits += big(t.seller_bond_units);
  }

  const R = (ramps ?? []) as { kind: string; status: string; zar_cents: number; fee_cents: number; usdt_units: string }[];
  const ramp = { onCount: 0, offCount: 0, onZarCents: 0, offZarCents: 0, feeCents: 0, failed: 0 };
  for (const r of R) {
    if (r.status === "failed") { ramp.failed++; continue; }
    if (r.status !== "completed") continue;
    if (r.kind === "on") { ramp.onCount++; ramp.onZarCents += Number(r.zar_cents); }
    else { ramp.offCount++; ramp.offZarCents += Number(r.zar_cents); }
    ramp.feeCents += Number(r.fee_cents);
  }

  return {
    users: users ?? 0,
    trades: T.length,
    byStatus,
    outcomes,
    disputes: D.length,
    disputeRatePct: T.length ? Math.round((D.length / T.length) * 1000) / 10 : 0,
    volumeUnits, feeUnits, sellerBondForfeitUnits,
    avgRate: rateN ? Math.round(avgRate / rateN) : 2000,
    paidTrades: feePaying.size,
    ramp,
  };
}
