"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceOffRamp, confirmOnRamp, failOnRamp } from "@/app/ramp/actions";

const primary = "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const secondary = "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50";

export function RampActions({ id, kind, status }: { id: string; kind: "on" | "off"; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (status === "completed" || status === "failed") return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {kind === "on" ? (
          <>
            <button className={primary} disabled={pending || status !== "initiated"} onClick={() => run(() => confirmOnRamp(id))}>
              {pending ? "Minting tUSDT…" : "Simulate successful payment"}
            </button>
            <button className={secondary} disabled={pending || status !== "initiated"} onClick={() => run(() => failOnRamp(id))}>
              Simulate declined payment
            </button>
          </>
        ) : (
          <>
            <button className={primary} disabled={pending} onClick={() => run(() => advanceOffRamp(id, "next"))}>
              {status === "initiated" ? "Simulate bank accepting" : "Simulate payout completing"}
            </button>
            <button className={secondary} disabled={pending} onClick={() => run(() => advanceOffRamp(id, "fail"))}>
              Simulate bank rejection
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
