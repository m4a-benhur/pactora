"use client";

import { useActionState } from "react";
import { backfillChainEvents, type BackfillState } from "@/app/admin/stats/actions";

export function BackfillButton() {
  const [state, action, pending] = useActionState<BackfillState, FormData>(backfillChainEvents, null);
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending} className="inline-flex rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
        {pending ? "Reading the chain…" : "Backfill chain events"}
      </button>
      {state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>{state.message}</p>}
    </form>
  );
}
