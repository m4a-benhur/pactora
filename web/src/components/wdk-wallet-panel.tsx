"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, formatEther, formatUnits } from "viem";
import { createClient } from "@/lib/supabase/client";
import { publicClient, usdtAbi, USDT_ADDRESS, explorerTx } from "@/lib/chain";
import { useWallet } from "@/components/wallet-context";
import { saveSeed } from "@/lib/wdk/vault";
import { openWdkAccount } from "@/lib/wdk/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WdkWalletPanel({ savedAddress }: { savedAddress: string | null }) {
    const router = useRouter();
    const w = useWallet();
    const [pin, setPin] = useState("");
    const [pin2, setPin2] = useState("");
    const [phrase, setPhrase] = useState("");
    const [backup, setBackup] = useState<string | null>(null);
    const [eth, setEth] = useState<string | null>(null);
    const [usdt, setUsdt] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // An account that already has a linked wallet may only restore it, never create another.
    const hasLinked = !!savedAddress;
    const matchesLinked = (addr: string) => !!savedAddress && addr.toLowerCase() === savedAddress.toLowerCase();

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
            if (hasLinked) throw new Error("Your account already has a wallet. Restore it with your recovery phrase.");
            setBackup(await w.createWallet(pin));
            setPin("");
        });

    const unlock = () =>
        run(async () => {
            await w.unlock(pin);
            setPin("");
        });

    // Restore the wallet already linked to this account onto this device.
    // The recovery phrase stays in the browser: it is checked here, encrypted with the new PIN, and stored locally.
    const restore = () =>
        run(async () => {
            if (!savedAddress) throw new Error("There is no wallet linked to this account to restore.");
            const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
            if (words.length !== 12 && words.length !== 24) throw new Error("A recovery phrase has 12 or 24 words.");
            if (pin.length < 6) throw new Error("Choose a PIN of at least 6 characters.");
            if (pin !== pin2) throw new Error("The two PINs don't match.");

            const seed = words.join(" ");
            let derived: `0x${string}`;
            try {
                derived = (await openWdkAccount(seed)).address;
            } catch {
                throw new Error("That recovery phrase isn't valid.");
            }
            if (!matchesLinked(derived)) {
                throw new Error("This phrase doesn't belong to the wallet linked to your account.");
            }

            await saveSeed(seed, pin);
            await w.unlock(pin);
            setPhrase("");
            setPin("");
            setPin2("");
            setMsg("Wallet restored on this device.");
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

    const mismatch = w.status === "unlocked" && !!w.address && hasLinked && !matchesLinked(w.address);
    const area = "w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Pactora wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                    Self-custodial wallet stored on this device. Only you hold the recovery phrase.
                </p>

                {w.status === "checking" && <p>Loading wallet…</p>}

                {/* No wallet on this device, and the account has none yet: create. */}
                {w.status === "none" && !hasLinked && (
                    <div className="space-y-2">
                        <Label htmlFor="pin">Choose a wallet PIN</Label>
                        <Input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                        <Button onClick={create} disabled={busy}>
                            {busy ? "Creating…" : "Create wallet"}
                        </Button>
                    </div>
                )}

                {/* No wallet on this device, but the account already has one: restore only. */}
                {w.status === "none" && hasLinked && (
                    <div className="space-y-3">
                        <p className="rounded-xl bg-muted px-3 py-2">
                            Your account already has a wallet, but it isn&apos;t on this device. Restore it with the recovery phrase you saved when you created it.
                        </p>
                        <p className="break-all text-xs text-muted-foreground">
                            Linked address: <span className="font-mono">{savedAddress}</span>
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="phrase">Recovery phrase (12 or 24 words)</Label>
                            <textarea
                                id="phrase"
                                rows={3}
                                value={phrase}
                                onChange={(e) => setPhrase(e.target.value)}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                className={area}
                            />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="rpin">New PIN for this device</Label>
                                <Input id="rpin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rpin2">Repeat PIN</Label>
                                <Input id="rpin2" type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={restore} disabled={busy || !phrase.trim() || !pin}>
                            {busy ? "Restoring…" : "Restore wallet"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Your phrase is checked and encrypted in this browser. It is never sent to our servers. Don&apos;t restore on a shared computer.
                        </p>
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
                    <div className="space-y-2 rounded-xl border border-accent bg-accent/30 p-3 text-accent-foreground">
                        <p className="font-medium">Write down your recovery phrase now. It is shown only once, and it is the only way to restore this wallet on another device.</p>
                        <p className="break-words font-mono">{backup}</p>
                        <Button variant="outline" onClick={() => setBackup(null)}>
                            I&apos;ve saved it
                        </Button>
                    </div>
                )}

                {/* This device holds a different wallet from the one linked to the account. */}
                {mismatch && (
                    <div className="space-y-2 rounded-xl bg-destructive/10 p-3 text-destructive">
                        <p className="font-medium">This device holds a different wallet from the one linked to your account.</p>
                        <p className="break-all text-xs">Linked address: <span className="font-mono">{savedAddress}</span></p>
                        <p>Remove this wallet from the device, then restore your account&apos;s wallet with its recovery phrase.</p>
                        <Button variant="outline" onClick={reset}>
                            Remove from this device
                        </Button>
                    </div>
                )}

                {w.status === "unlocked" && w.address && !mismatch && (
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
                            {matchesLinked(w.address) ? (
                                <Button variant="outline" disabled>
                                    Linked ✓
                                </Button>
                            ) : (
                                <Button onClick={saveToProfile} disabled={busy}>
                                    Link wallet to my account
                                </Button>
                            )}
                            <Button variant="outline" onClick={w.lock}>
                                Lock
                            </Button>
                        </div>
                    </div>
                )}

                {err && <p role="alert" className="text-destructive">{err}</p>}
                {msg && <p role="status" className="break-all text-primary">{msg}</p>}
            </CardContent>
        </Card>
    );
}
