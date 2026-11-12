"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AcceptButton({ token, disabled }: { token: string; disabled: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function accept() {
        setBusy(true);
        setErr(null);
        const { error } = await createClient().rpc("accept_trade", { p_token: token });
        if (error) {
            setErr(error.message);
            setBusy(false);
            return;
        }
        router.refresh();
        setBusy(false);
    }

    return (
        <div className="space-y-2">
            <Button onClick={accept} disabled={busy || disabled} className="w-full">
                {busy ? "Accepting…" : "I accept these terms"}
            </Button>
            {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
    );
}