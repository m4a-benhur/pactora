import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RampActions } from "@/components/ramp-actions";
import { STATUS_LABEL, formatUnits, formatZar, type RampStatus } from "@/lib/ramp";

export default function RampDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/ramp/${id}`);

  const { data: r } = await supabase.from("ramp_transactions").select("*").eq("id", id).single();
  if (!r) notFound();

  const kind = r.kind as "on" | "off";
  const status = r.status as RampStatus;
  const steps: RampStatus[] = ["initiated", "processing", "completed"];
  const reached = status === "failed" ? -1 : steps.indexOf(status);
  const scan = r.tx_hash ? `https://sepolia.etherscan.io/tx/${r.tx_hash}` : null;

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        DEMO. This is a simulated {kind === "on" ? "purchase" : "withdrawal"}.
      </p>
      <header>
        <h1 className="text-2xl font-semibold">{kind === "on" ? "Buy tUSDT" : "Cash out to rand"}</h1>
        <p className="text-sm text-muted-foreground">Status: {STATUS_LABEL[status] ?? status}</p>
      </header>

      <ol className="flex gap-2 text-sm" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className={`flex-1 rounded-md border px-3 py-2 ${i <= reached ? "bg-primary/10 font-medium" : "text-muted-foreground"}`}>
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ol>
      {status === "failed" && <p role="alert" className="text-sm text-destructive">Failed: {r.failure_reason ?? "No reason recorded."}</p>}

      <dl className="grid grid-cols-2 gap-2 rounded-lg border p-4 text-sm">
        <dt className="text-muted-foreground">{kind === "on" ? "You pay" : "You send"}</dt>
        <dd className="text-right">{kind === "on" ? formatZar(Number(r.zar_cents) + Number(r.fee_cents)) : `${formatUnits(BigInt(r.usdt_units))} tUSDT`}</dd>
        <dt className="text-muted-foreground">Ramp fee (simulated)</dt><dd className="text-right">{formatZar(Number(r.fee_cents))}</dd>
        <dt className="text-muted-foreground">Rate (simulated)</dt><dd className="text-right">{formatZar(Number(r.rate))} per tUSDT</dd>
        <dt className="font-medium">{kind === "on" ? "You receive" : "Payout"}</dt>
        <dd className="text-right font-medium">{kind === "on" ? `${formatUnits(BigInt(r.usdt_units))} tUSDT` : formatZar(Number(r.zar_cents))}</dd>
        {kind === "off" && (<><dt className="text-muted-foreground">To</dt><dd className="text-right">{r.account_holder}, {r.bank_name} ····{r.account_last4}</dd></>)}
      </dl>

      <RampActions id={id} kind={kind} status={status} />

      {status === "completed" && (
        <section className="space-y-1 rounded-lg border p-4 text-sm">
          <h2 className="font-medium">Receipt {r.receipt_no}</h2>
          <p className="text-muted-foreground">Completed {new Date(r.completed_at).toISOString().replace("T", " ").slice(0, 16)} UTC. Demo receipt, not a tax document.</p>
          {scan && <a className="underline" href={scan} target="_blank" rel="noreferrer">View mint on Etherscan</a>}
          {kind === "off" && <p className="text-muted-foreground">No on-chain burn happens in this demo, so your tUSDT balance is unchanged.</p>}
        </section>
      )}
      <Link href="/ramp" className="inline-flex text-sm underline">Back to funds</Link>
    </main>
  );
}
