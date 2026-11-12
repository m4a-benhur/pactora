"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData } from "viem";
import { publicClient, usdtAbi, USDT_ADDRESS, ESCROW_ADDRESS } from "@/lib/chain";
import { escrowAbi } from "@/lib/escrow-abi";
import { chainTradeId } from "@/lib/chain-ids";
import { formatUsdt } from "@/lib/pricing";
import { COURIER_BUTTON } from "@/lib/trade-ui";
import { useWallet } from "@/components/wallet-context";
import { WalletGate } from "@/components/wallet-gate";
import { InspectionCountdown } from "@/components/inspection-countdown";
import { advanceCourier } from "@/app/trades/[id]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
    tradeId: string;
    status: string;
    role: "seller" | "buyer";
    deliveryMethod: "courier" | "in_person";
    sellerWallet: string | null;
    buyerWallet: string | null;
    priceUnits: string;
    sellerBondUnits: string;
    buyerBondUnits: string;
    inspectionMinutes: number;
    termsHash: string;
    inspectionEndsAt: string | null;
    courierNext: string | null;
};

export function TradeActions(p: Props) {
    const router = useRouter();
    const w = useWallet();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const isSeller = p.role === "seller";
    const myWallet = isSeller ? p.sellerWallet : p.buyerWallet;
    const hex = (s: string) => s as `0x${string}`;
    const escrowId = () => chainTradeId(p.tradeId, p.sellerWallet!);

    async function sync(txHash?: string) {
        for (let i = 0; i < 4; i++) {
            const res = await fetch(`/api/trades/${p.tradeId}/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txHash }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error ?? "Could not verify the on-chain state.");
            if (!txHash || j.status !== p.status) break; // status moved (or plain refresh)
            await new Promise((r) => setTimeout(r, 3000)); // RPC may lag a few seconds
        }
        router.refresh();
    }

    async function ensureFunds(amount: bigint) {
        const owner = w.address!;
        const bal = await publicClient.readContract({
            address: USDT_ADDRESS,
            abi: usdtAbi,
            functionName: "balanceOf",
            args: [owner],
        });
        if (bal < amount) {
            throw new Error(
                `Not enough test USDT. You need ${formatUsdt(amount)} and have ${formatUsdt(bal)}. Claim from the faucet on your dashboard.`
            );
        }
        const allowance = await publicClient.readContract({
            address: USDT_ADDRESS,
            abi: usdtAbi,
            functionName: "allowance",
            args: [owner, ESCROW_ADDRESS],
        });
        if (allowance < amount) {
            setNote("Step 1 of 2: approving the escrow to hold your funds…");
            await w.sendTx(
                USDT_ADDRESS,
                encodeFunctionData({ abi: usdtAbi, functionName: "approve", args: [ESCROW_ADDRESS, amount] })
            );
        }
    }

    async function run(fn: () => Promise<void>) {
        setBusy(true);
        setErr(null);
        setNote(null);
        try {
            await fn();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Something went wrong.");
        }
        setNote(null);
        setBusy(false);
    }

    const simpleCall = (fn: "fund" | "markDispatched" | "markHandedOver" | "confirmAcceptance") =>
        run(async () => {
            setNote("Confirming in your wallet…");
            const hash = await w.sendTx(
                ESCROW_ADDRESS,
                encodeFunctionData({ abi: escrowAbi, functionName: fn, args: [escrowId()] })
            );
            setNote("Verifying on-chain…");
            await sync(hash);
        });

    const depositBond = () =>
        run(async () => {
            const bond = BigInt(p.sellerBondUnits);
            await ensureFunds(bond);
            setNote("Step 2 of 2: depositing your security bond…");
            const hash = await w.sendTx(
                ESCROW_ADDRESS,
                encodeFunctionData({
                    abi: escrowAbi,
                    functionName: "createTrade",
                    args: [
                        {
                            id: escrowId(),
                            buyer: hex(p.buyerWallet!),
                            principal: BigInt(p.priceUnits),
                            sellerBond: bond,
                            buyerBond: BigInt(p.buyerBondUnits),
                            fundWindow: 172800, // buyer has 2 days to fund
                            dispatchWindow: 259200, // seller has 3 days to dispatch after funding
                            inspectionSeconds: p.inspectionMinutes * 60,
                            autoRelease: false, // buyer must always confirm in this MVP
                            termsHash: hex(p.termsHash),
                        },
                    ],
                })
            );
            setNote("Verifying on-chain…");
            await sync(hash);
        });

    const fundEscrow = () =>
        run(async () => {
            await ensureFunds(BigInt(p.priceUnits) + BigInt(p.buyerBondUnits));
            setNote("Step 2 of 2: funding escrow…");
            const hash = await w.sendTx(
                ESCROW_ADDRESS,
                encodeFunctionData({ abi: escrowAbi, functionName: "fund", args: [escrowId()] })
            );
            setNote("Verifying on-chain…");
            await sync(hash);
        });

    const courierStep = () =>
        run(async () => {
            setNote("Updating the simulated courier…");
            const res = await advanceCourier(p.tradeId);
            if (res.error) throw new Error(res.error);
            router.refresh();
        });

    const refreshOnly = () => run(() => sync());

    function Panel({ title, children }: { title: string; children: React.ReactNode }) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    {children}
                    {note && <p className="text-muted-foreground">{note}</p>}
                    {err && <p className="text-red-600">{err}</p>}
                    <Button variant="outline" size="sm" disabled={busy} onClick={refreshOnly}>
                        Refresh status
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const s = p.status;

    if (isSeller && s === "accepted") {
        return (
            <Panel title="Next: deposit your security bond">
                <p>
                    Your bond is {formatUsdt(BigInt(p.sellerBondUnits))} test USDT. It&apos;s returned when the
                    sale completes fairly. Once deposited, the buyer can fund the escrow.
                </p>
                <WalletGate expected={myWallet}>
                    <Button onClick={depositBond} disabled={busy}>
                        {busy ? "Working…" : "Deposit security bond"}
                    </Button>
                </WalletGate>
            </Panel>
        );
    }

    if (!isSeller && s === "seller_bonded") {
        const total = BigInt(p.priceUnits) + BigInt(p.buyerBondUnits);
        return (
            <Panel title="Next: fund the escrow">
                <p>
                    The seller has deposited their bond. You&apos;ll put {formatUsdt(total)} test USDT
                    (price plus your refundable bond) into escrow. The seller can&apos;t touch it until you
                    confirm the item, or a reviewer decides a dispute.
                </p>
                <WalletGate expected={myWallet}>
                    <Button onClick={fundEscrow} disabled={busy}>
                        {busy ? "Working…" : "Fund escrow"}
                    </Button>
                </WalletGate>
            </Panel>
        );
    }

    if (isSeller && s === "funded") {
        return (
            <Panel title="Payment is protected. Send the item.">
                <p>The buyer&apos;s money is locked in escrow. Mark the item once you hand it over.</p>
                <WalletGate expected={myWallet}>
                    <Button onClick={() => simpleCall("markDispatched")} disabled={busy}>
                        {busy
                            ? "Working…"
                            : p.deliveryMethod === "courier"
                                ? "Mark as dispatched to courier"
                                : "Mark as ready for collection"}
                    </Button>
                </WalletGate>
            </Panel>
        );
    }

    if (isSeller && s === "dispatched") {
        return (
            <Panel title="Delivery in progress">
                {p.deliveryMethod === "courier" ? (
                    <>
                        <p className="text-xs uppercase tracking-wide text-amber-700">
                            Simulated courier. Not a real courier integration.
                        </p>
                        {p.courierNext ? (
                            <Button onClick={courierStep} disabled={busy}>
                                {busy ? "Working…" : COURIER_BUTTON[p.courierNext] ?? "Next courier step"}
                            </Button>
                        ) : (
                            <p>Waiting for confirmation…</p>
                        )}
                    </>
                ) : (
                    <>
                        <p>When the buyer has collected the item, record the handover.</p>
                        <WalletGate expected={myWallet}>
                            <Button onClick={() => simpleCall("markHandedOver")} disabled={busy}>
                                {busy ? "Working…" : "I handed the item over"}
                            </Button>
                        </WalletGate>
                    </>
                )}
            </Panel>
        );
    }

    if (isSeller && s === "delivered") {
        return (
            <Panel title="Waiting for the buyer to inspect">
                {p.inspectionEndsAt && <InspectionCountdown endsAt={p.inspectionEndsAt} />}
                <p>You&apos;ll be paid as soon as the buyer confirms the item is as described.</p>
            </Panel>
        );
    }

    if (!isSeller && s === "delivered") {
        return (
            <Panel title="Inspect your item">
                {p.inspectionEndsAt && <InspectionCountdown endsAt={p.inspectionEndsAt} />}
                <p>
                    Check the item against the listing. If it&apos;s as described, confirm to release payment
                    to the seller. Reporting a problem is added in the next update.
                </p>
                <WalletGate expected={myWallet}>
                    <Button onClick={() => simpleCall("confirmAcceptance")} disabled={busy}>
                        {busy ? "Working…" : "Confirm: the item is as described"}
                    </Button>
                </WalletGate>
            </Panel>
        );
    }

    if (s === "accepted" || s === "seller_bonded" || s === "funded" || s === "dispatched") {
        const text: Record<string, string> = {
            accepted: "Waiting for the seller to deposit their security bond.",
            seller_bonded: "Waiting for the buyer to fund the escrow.",
            funded: "Waiting for the seller to send the item.",
            dispatched: "The item is on its way.",
        };
        return <Panel title="In progress">{<p>{text[s]}</p>}</Panel>;
    }

    return null;
}