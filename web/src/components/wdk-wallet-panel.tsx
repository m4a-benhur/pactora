"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "ethers";
import { encodeFunctionData, formatEther, formatUnits } from "viem";
import { createClient } from "@/lib/supabase/client";
import { publicClient, usdtAbi, USDT_ADDRESS, explorerTx } from "@/lib/chain";
import { hasVault, saveSeed, loadSeed, clearVault } from "@/lib/wdk/vault";
import { openWdkAccount } from "@/lib/wdk/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Opened = Awaited<ReturnType<typeof openWdkAccount>>;

export function WdkWalletPanel({ savedAddress }: { savedAddress: string | null }) {
    const router = useRouter();
    const [wallet, setWallet] = useState<Opened | null>(null);
    const [pin, setPin] = useState("");
    const [backup, setBackup] = useState<string | null>(null);
    const [eth, setEth] = useState<string | null>(null);
    const [usdt, setUsdt] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // null = still checking this browser's storage
    const [vaultExists, setVaultExists] = useState<boolean | null>(null);

    useEffect(() => {
        setVaultExists(hasVault()); // runs only in the browser, after first render
    }, []);

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

    const createWallet = () =>
        run(async () => {
            if (pin.length < 6) throw new Error("Choose a PIN of at least 6 characters.");
            const seed = Wallet.createRandom().mnemonic!.phrase;
            await saveSeed(seed, pin);
            setVaultExists(true);
            const opened = await openWdkAccount(seed);
            setWallet(opened);
            setBackup(seed);
            await refresh(opened.address);
        });

    const unlock = () =>
        run(async () => {
            const seed = await loadSeed(pin);
            const opened = await openWdkAccount(seed);
            setWallet(opened);
            await refresh(opened.address);
        });

    const claimFaucet = () =>
        run(async () => {
            if (!wallet) return;
            const data = encodeFunctionData({ abi: usdtAbi, functionName: "faucetMint" });
            const tx = await wallet.account.sendTransaction({ to: USDT_ADDRESS, value: 0n, data });
            setMsg(`Sent: ${explorerTx(tx.hash)}`);
            await publicClient.waitForTransactionReceipt({ hash: tx.hash as `0x${string}` });
            await refresh(wallet.address);
            setMsg("Claimed 100 test USDT.");
        });

    const saveToProfile = () =>
        run(async () => {
            if (!wallet) return;
            const supabase = createClient();
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) throw new Error("Please log in again.");
            const { error } = await supabase
                .from("profiles")
                .update({ wallet_address: wallet.address.toLowerCase(), wallet_type: "wdk" })
                .eq("id", auth.user.id);
            if (error) throw new Error(error.message);
            setMsg("Wallet linked to your account.");
            router.refresh();
        });

    function reset() {
        if (confirm("Remove the wallet from this device? You'll need your recovery phrase to restore it.")) {
            clearVault();
            setVaultExists(false);
            setWallet(null);
            setBackup(null);
            setPin("");
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

                {!wallet && vaultExists === null && <p>Loading wallet…</p>}

                {!wallet && vaultExists === false && (
                    <div className="space-y-2">
                        <Label htmlFor="pin">Choose a wallet PIN</Label>
                        <Input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                        <Button onClick={createWallet} disabled={busy}>
                            {busy ? "Creating…" : "Create wallet"}
                        </Button>
                    </div>
                )}

                {!wallet && vaultExists === true && (
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

                {wallet && (
                    <div className="space-y-3">
                        <p className="break-all">
                            Address: <span className="font-mono">{wallet.address}</span>
                        </p>
                        <p>Test ETH (for network fees): {eth ?? "…"}</p>
                        <p>Test USDT: {usdt ?? "…"}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => run(() => refresh(wallet.address))} variant="outline" disabled={busy}>
                                Refresh
                            </Button>
                            <Button onClick={claimFaucet} disabled={busy}>
                                Claim 100 test USDT
                            </Button>
                            <Button onClick={saveToProfile} disabled={busy}>
                                {savedAddress?.toLowerCase() === wallet.address.toLowerCase()
                                    ? "Linked ✓"
                                    : "Link wallet to my account"}
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