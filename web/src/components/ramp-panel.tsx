"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOnRamp, createOffRamp } from "@/app/ramp/actions";
import {
  DEFAULT_OFF_FEE_BPS, DEFAULT_ON_FEE_BPS, DEFAULT_RATE, formatUnits, formatZar, parseUnits,
  parseZarToCents, quoteOffRamp, quoteOnRamp,
} from "@/lib/ramp";

const field = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary = "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

export function RampPanel({ balanceUnits }: { balanceUnits: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"on" | "off">("on");
  const [zar, setZar] = useState("");
  const [units, setUnits] = useState("");
  const [bank, setBank] = useState({ holder: "", bank: "Demo Bank (fictional)", account: "", branch: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const zarCents = parseZarToCents(zar);
  const onQuote = zarCents ? quoteOnRamp(zarCents, DEFAULT_RATE, DEFAULT_ON_FEE_BPS) : null;
  const u = parseUnits(units);
  const offQuote = u ? quoteOffRamp(u, DEFAULT_RATE, DEFAULT_OFF_FEE_BPS) : null;

  function go(run: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const r = await run();
      if (r.ok) router.push(`/ramp/${r.id}`);
      else setError(r.error);
    });
  }

  return (
    <div className="rounded-lg border p-5">
      <div className="mb-4 flex gap-2" role="tablist">
        {(["on", "off"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(null); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "border"}`}>
            {t === "on" ? "Buy tUSDT" : "Cash out to rand"}
          </button>
        ))}
      </div>

      {tab === "on" ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="zar">Amount in rand</label>
          <input id="zar" inputMode="decimal" className={field} placeholder="500" value={zar} onChange={(e) => setZar(e.target.value)} />
          {onQuote && (
            <dl className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
              <dt>Ramp fee (simulated)</dt><dd className="text-right">{formatZar(onQuote.feeCents)}</dd>
              <dt>Rate (simulated)</dt><dd className="text-right">{formatZar(DEFAULT_RATE)} per tUSDT</dd>
              <dt className="font-medium text-foreground">You receive</dt>
              <dd className="text-right font-medium text-foreground">{formatUnits(onQuote.units)} tUSDT</dd>
            </dl>
          )}
          <button className={primary} disabled={pending || !zarCents} onClick={() => go(() => createOnRamp(zar))}>
            Continue to payment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Wallet balance: {formatUnits(BigInt(balanceUnits))} tUSDT</p>
          <label className="block text-sm font-medium" htmlFor="units">Amount in tUSDT</label>
          <input id="units" inputMode="decimal" className={field} placeholder="25" value={units} onChange={(e) => setUnits(e.target.value)} />
          <p className="text-xs text-muted-foreground">Use fictional bank details only. Nothing is paid out.</p>
          <input className={field} placeholder="Account holder" value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} />
          <input className={field} placeholder="Bank" value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={field} inputMode="numeric" placeholder="Account number" value={bank.account} onChange={(e) => setBank({ ...bank, account: e.target.value })} />
            <input className={field} inputMode="numeric" placeholder="Branch code" value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} />
          </div>
          {offQuote && (
            <dl className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
              <dt>Value at simulated rate</dt><dd className="text-right">{formatZar(offQuote.grossCents)}</dd>
              <dt>Ramp fee (simulated)</dt><dd className="text-right">{formatZar(offQuote.feeCents)}</dd>
              <dt className="font-medium text-foreground">Payout</dt>
              <dd className="text-right font-medium text-foreground">{formatZar(offQuote.payoutCents)}</dd>
            </dl>
          )}
          <button className={primary} disabled={pending || !u} onClick={() => go(() => createOffRamp({ units, ...bank }))}>
            Request withdrawal
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
