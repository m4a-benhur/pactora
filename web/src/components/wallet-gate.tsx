"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/wallet-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Shows children only when the wallet linked to this account is unlocked on this device. */
export function WalletGate({
    expected,
    children,
}: {
    expected: string | null;
    children: React.ReactNode;
}) {
    const w = useWallet();
    const [pin, setPin] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (w.status === "checking") return <p className="text-sm">Loading wallet…</p>;

    if (w.status === "none") {
        return (
            <p className="text-sm text-amber-700">
                You need a wallet on this device.{" "}
                <Link href="/dashboard" className="underline">
                    Create or restore it on the dashboard
                </Link>
                .
            </p>
        );
    }

    if (w.status === "locked") {
        return (
            <div className="space-y-2">
                <p className="text-sm">Enter your wallet PIN to continue.</p>
                <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                <Button
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        setErr(null);
                        try {
                            await w.unlock(pin);
                            setPin("");
                        } catch (e) {
                            setErr(e instanceof Error ? e.message : "Could not unlock.");
                        }
                        setBusy(false);
                    }}
                >
                    {busy ? "Unlocking…" : "Unlock wallet"}
                </Button>
                {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
        );
    }

    if (expected && w.address?.toLowerCase() !== expected.toLowerCase()) {
        return (
            <p className="text-sm text-amber-700">
                The wallet on this device ({w.address ? short(w.address) : "?"}) is not the one linked to
                your account ({short(expected)}). Use the device where you linked it.
            </p>
        );
    }

    return <>{children}</>;
}