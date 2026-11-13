import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RampPanel } from "@/components/ramp-panel";
import { tUsdtBalance } from "@/lib/minter";
import { STATUS_LABEL, formatUnits, formatZar, type RampStatus } from "@/lib/ramp";

export default function RampPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <RampContent />
    </Suspense>
  );
}

async function RampContent() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/ramp");

  const { data: profile } = await supabase.from("profiles").select("wallet_address").eq("id", user.id).single();
  const wallet = (profile?.wallet_address as string | null) ?? null;
  const balance = wallet ? await tUsdtBalance(wallet) : 0n;
  const { data: rows } = await supabase
    .from("ramp_transactions").select("id, kind, status, zar_cents, usdt_units, created_at")
    .order("created_at", { ascending: false }).limit(20);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        Rates and fees are simulated.
      </p>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Add or withdraw funds</h1>
        <p className="text-sm text-muted-foreground">
          {wallet ? `Wallet balance: ${formatUnits(balance)} tUSDT` : "Link your wallet on the dashboard to use this page."}
        </p>
      </header>

      {wallet ? <RampPanel balanceUnits={balance.toString()} /> : (
        <Link href="/dashboard" className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">Go to dashboard</Link>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">History</h2>
        {!rows?.length ? (
          <p className="text-sm text-muted-foreground">No purchases or withdrawals yet. Buy tUSDT above to start a trade.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((r) => (
              <li key={r.id as string}>
                <Link href={`/ramp/${r.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted">
                  <span>{r.kind === "on" ? "Bought" : "Cashed out"} {formatUnits(BigInt(r.usdt_units as string))} tUSDT</span>
                  <span className="text-muted-foreground">
                    {formatZar(Number(r.zar_cents))} · {STATUS_LABEL[r.status as RampStatus] ?? r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
