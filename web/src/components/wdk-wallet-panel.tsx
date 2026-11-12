"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, formatEther, formatUnits } from "viem";
import { createClient } from "@/lib/supabase/client";
import { publicClient, usdtAbi, USDT_ADDRESS, explorerTx } from "@/lib/chain";
import { useWallet } from "@/components/wallet-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WdkWalletPanel({ savedAddress }: { savedAddress: string | null }) {
    const router = useRouter();
    const w = useWallet();
    const [pin, setPin] = useState("");
    const [backup, setBackup] = useState<string | null>(null);
    const [eth, setEth] = useState<string | null>(null);
    const [usdt, setUsdt] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function refresh(address: `0x${string}`) {
        const [ethBal, usdtBal] = await Promise.all([
            publicClient.getBalance({ address }),
            publicClient.readContract({
                address: USDT_ADDRESS,
                abi: usdtAbi,
                functionName: "balanceOf",
                args: [address],
            }),
        ]);
        setEth(formatEther(ethBal));
        setUsdt(formatUnits(usdtBal, 6));
    }

    useEffect(() => {
        if (w.address) refresh(w.address).catch(() => { });
    }, [w.address]);

    async function run(fn: () => Promise<void>) {
        setBusy(true);
        setErr(null);
        setMsg(null);
        try {
            await fn();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Something went wrong.");
        }
        setBusy(false);
    }

    const create = () =>
        run(async () => {
            setBackup(await w.createWallet(pin));
            setPin("");
        });

    const unlock = () =>
        run(async () => {
            await w.unlock(pin);
            setPin("");
        });

    const claimFaucet = () =>
        run(async () => {
            const data = encodeFunctionData({ abi: usdtAbi, functionName: "faucetMint" });
            const hash = await w.sendTx(USDT_ADDRESS, data);
            setMsg(`Claimed 100 test USDT: ${explorerTx(hash)}`);
            if (w.address) await refresh(w.address);
        });

    const saveToProfile = () =>
        run(async () => {
            if (!w.address) return;
            const supabase = createClient();
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) throw new Error("Please log in again.");
            const { error } = await supabase
                .from("profiles")
                .update({ wallet_address: w.address.toLowerCase(), wallet_type: "wdk" })
                .eq("id", auth.user.id);
            if (error) throw new Error(error.message);
            setMsg("Wallet linked to your account.");
            router.refresh();
        });

    function reset() {
        if (confirm("Remove the wallet from this device? You'll need your recovery phrase to restore it.")) {
            w.removeFromDevice();
            setBackup(null);
            router.refresh();
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Pactora wallet (Tether WDK)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                    Self-custodial wallet created on this device. Test network only — DEMO, NO REAL MONEY.
                </p>

                {w.status === "checking" && <p>Loading wallet…</p>}

                {w.status === "none" && (
                    <div className="space-y-2">
                        <Label htmlFor="pin">Choose a wallet PIN</Label>
                        <Input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                        <Button onClick={create} disabled={busy}>
                            {busy ? "Creating…" : "Create wallet"}
                        </Button>
                    </div>
                )}

                {w.status === "locked" && (
                    <div className="space-y-2">
                        <Label htmlFor="pin">Wallet PIN</Label>
                        <Input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                        <div className="flex gap-2">
                            <Button onClick={unlock} disabled={busy}>
                                {busy ? "Unlocking…" : "Unlock wallet"}
                            </Button>
                            <Button variant="outline" onClick={reset}>
                                Remove from this device
                            </Button>
                        </div>
                    </div>
                )}

                {backup && (
                    <div className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3 text-amber-900">
                        <p className="font-medium">Write down your recovery phrase now. It is shown only once.</p>
                        <p className="break-words font-mono">{backup}</p>
                        <Button variant="outline" onClick={() => setBackup(null)}>
                            I&apos;ve saved it
                        </Button>
                    </div>
                )}

                {w.status === "unlocked" && w.address && (
                    <div className="space-y-3">
                        <p className="break-all">
                            Address: <span className="font-mono">{w.address}</span>
                        </p>
                        <p>Test ETH (for network fees): {eth ?? "…"}</p>
                        <p>Test USDT: {usdt ?? "…"}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" disabled={busy} onClick={() => run(() => refresh(w.address!))}>
                                Refresh
                            </Button>
                            <Button onClick={claimFaucet} disabled={busy}>
                                Claim 100 test USDT
                            </Button>
                            <Button onClick={saveToProfile} disabled={busy}>
                                {savedAddress?.toLowerCase() === w.address.toLowerCase()
                                    ? "Linked ✓"
                                    : "Link wallet to my account"}
                            </Button>
                            <Button variant="outline" onClick={w.lock}>
                                Lock
                            </Button>
                        </div>
                    </div>
                )}

                {err && <p className="text-red-600">{err}</p>}
                {msg && <p className="break-all text-green-700">{msg}</p>}
            </CardContent>
        </Card>
    );
}