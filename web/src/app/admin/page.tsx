import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Loading, PageHeader, PageShell, Panel } from "@/components/page-shell";
import { formatZar } from "@/lib/pricing";
import { OUTCOME_LABEL } from "@/lib/trade-ui";

async function AdminContent() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) redirect("/dashboard");

  const { data: disputed } = await supabase
    .from("trades")
    .select("id, title, price_zar_cents, updated_at")
    .eq("status", "disputed")
    .order("updated_at", { ascending: true });

  const { data: resolved } = await supabase
    .from("disputes")
    .select("trade_id, outcome, resolved_at")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(10);

  const ids = (resolved ?? []).map((r) => r.trade_id);
  const { data: titles } = ids.length
    ? await supabase.from("trades").select("id, title").in("id", ids)
    : { data: [] as { id: string; title: string }[] };

  const row =
    "-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-muted/60";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispute console"
        subtitle="Review the evidence, then record a fair decision."
        actions={
          <Link
            href="/admin/stats"
            className={buttonVariants({ variant: "outline", className: "rounded-full" })}
          >
            Platform overview
          </Link>
        }
      />

      {/* Metric row — gives the admin page a data-first feel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-900/70">Open disputes</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-900">
            {disputed?.length ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-900/70">Recently resolved</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900">
            {resolved?.length ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-600">Scope</p>
          <p className="mt-1 text-sm font-medium text-slate-900">Both parties&apos; disputes</p>
        </div>
      </div>

      <Panel title={`Waiting for a decision (${disputed?.length ?? 0})`}>
        {(!disputed || disputed.length === 0) && (
          <p className="text-muted-foreground">No open disputes. Nice and quiet.</p>
        )}
        {disputed && disputed.length > 0 && (
          <ul className="divide-y">
            {disputed.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/disputes/${t.id}`} className={row}>
                  <span className="truncate font-medium">{t.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatZar(BigInt(t.price_zar_cents))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recently resolved">
        {(!resolved || resolved.length === 0) && (
          <p className="text-muted-foreground">None yet.</p>
        )}
        {resolved && resolved.length > 0 && (
          <ul className="divide-y">
            {resolved.map((r) => (
              <li key={r.trade_id}>
                <Link href={`/admin/disputes/${r.trade_id}`} className={row}>
                  <span className="truncate font-medium">
                    {titles?.find((t) => t.id === r.trade_id)?.title ?? r.trade_id}
                  </span>
                  <span className="shrink-0 text-right text-muted-foreground">
                    {OUTCOME_LABEL[r.outcome ?? ""] ?? r.outcome}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Link href="/dashboard" className="text-sm underline">
        Back to dashboard
      </Link>
    </div>
  );
}

function AdminBanner() {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Administrator area</p>
      <p className="mt-1 text-xs text-amber-800">
        You are viewing dispute reviews and platform-wide actions. These are not visible to
        regular users.
      </p>
    </div>
  );
}

export default function AdminPage() {
  return (
    // Slate tint makes the admin area visually distinct from the warm cream user pages.
    <div className="min-h-screen bg-slate-50/60">
      <PageShell>
        <AdminBanner />
        <Suspense fallback={<Loading label="Loading" />}>
          <AdminContent />
        </Suspense>
      </PageShell>
    </div>
  );
}