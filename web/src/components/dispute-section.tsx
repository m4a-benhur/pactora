"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData } from "viem";
import { createClient } from "@/lib/supabase/client";
import { ESCROW_ADDRESS } from "@/lib/chain";
import { escrowAbi } from "@/lib/escrow-abi";
import { chainTradeId } from "@/lib/chain-ids";
import { useWallet } from "@/components/wallet-context";
import { WalletGate } from "@/components/wallet-gate";
import { EvidenceUploader } from "@/components/evidence-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type EvidenceItem = {
    id: string;
    url: string | null;
    note: string | null;
    mine: boolean;
    ext: string;
};
type DisputeInfo = {
    reason: string;
    seller_response: string | null;
    status: string;
    opened_by_me: boolean;
} | null;

type Props = {
    tradeId: string;
    role: "seller" | "buyer";
    status: string;
    sellerWallet: string | null;
    buyerWallet: string | null;
    inspectionEndsAt: string | null;
    dispute: DisputeInfo;
    evidence: EvidenceItem[];
};

const area =
    "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DisputeSection(p: Props) {
    const router = useRouter();
    const w = useWallet();
    const [text, setText] = useState("");
    const [response, setResponse] = useState(p.dispute?.seller_response ?? "");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [ended, setEnded] = useState(false);

    useEffect(() => {
        if (!p.inspectionEndsAt) return;
        const check = () => setEnded(Date.now() > new Date(p.inspectionEndsAt!).getTime());
        check();
        const i = setInterval(check, 5000);
        return () => clearInterval(i);
    }, [p.inspectionEndsAt]);

    const isBuyer = p.role === "buyer";
    const myWallet = isBuyer ? p.buyerWallet : p.sellerWallet;
    const canOpenNew =
        !p.dispute &&
        ((isBuyer && (p.status === "dispatched" || p.status === "delivered")) ||
            (!isBuyer && p.status === "delivered" && ended));
    const needsRetry = !!p.dispute && p.dispute.opened_by_me && p.status !== "disputed";

    async function sync(txHash?: string) {
        for (let i = 0; i < 4; i++) {
            const res = await fetch(`/api/trades/${p.tradeId}/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txHash }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error ?? "Could not verify the on-chain state.");
            if (j.status === "disputed") break;
            await new Promise((r) => setTimeout(r, 3000));
        }
        router.refresh();
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

    const submitDispute = () =>
        run(async () => {
            if (!needsRetry) {
                const { error } = await createClient().rpc("record_dispute", {
                    p_trade: p.tradeId,
                    p_reason: text.trim(),
                });
                if (error) throw new Error(error.message);
            }
            setNote("Confirm in your wallet. This freezes the funds until a reviewer decides.");
            const hash = await w.sendTx(
                ESCROW_ADDRESS,
                encodeFunctionData({
                    abi: escrowAbi,
                    functionName: "openDispute",
                    args: [chainTradeId(p.tradeId, p.sellerWallet!)],
                })
            );
            setNote("Verifying on-chain…");
            await sync(hash);
        });

    const saveResponse = () =>
        run(async () => {
            const { error } = await createClient().rpc("respond_dispute", {
                p_trade: p.tradeId,
                p_response: response.trim(),
            });
            if (error) throw new Error(error.message);
            router.refresh();
        });

    return (
        <>
            {(canOpenNew || needsRetry) && (
                <Card>
                    <CardHeader>
                        <CardTitle>{needsRetry ? "Finish opening your dispute" : "Something wrong?"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p>
                            Opening a dispute freezes the money in escrow until a reviewer looks at both sides.
                            Raising a genuine concern never counts against you.
                        </p>
                        {needsRetry ? (
                            <p className="rounded border p-2">Your description: {p.dispute!.reason}</p>
                        ) : (
                            <textarea
                                className={area}
                                rows={4}
                                maxLength={2000}
                                placeholder="Describe what is wrong, as specifically as you can."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                        )}
                        <WalletGate expected={myWallet}>
                            <Button onClick={submitDispute} disabled={busy || (!needsRetry && text.trim().length < 10)}>
                                {busy ? "Working…" : needsRetry ? "Submit dispute to escrow" : "Open dispute"}
                            </Button>
                        </WalletGate>
                        {note && <p className="text-muted-foreground">{note}</p>}
                        {err && <p className="text-red-600">{err}</p>}
                    </CardContent>
                </Card>
            )}

            {p.status === "disputed" && p.dispute && (
                <Card>
                    <CardHeader>
                        <CardTitle>Dispute under review</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        <p>The money is frozen in escrow until a reviewer decides. Add anything that supports your side.</p>
                        <div>
                            <p className="font-medium">Reported problem</p>
                            <p className="whitespace-pre-wrap">{p.dispute.reason}</p>
                        </div>

                        {p.dispute.seller_response && !isBuyer === false && (
                            <div>
                                <p className="font-medium">Seller&apos;s response</p>
                                <p className="whitespace-pre-wrap">{p.dispute.seller_response}</p>
                            </div>
                        )}

                        {!isBuyer && (
                            <div className="space-y-2">
                                <p className="font-medium">Your response</p>
                                <textarea
                                    className={area}
                                    rows={3}
                                    maxLength={2000}
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                />
                                <Button onClick={saveResponse} disabled={busy || response.trim().length < 10}>
                                    {busy ? "Saving…" : "Save response"}
                                </Button>
                            </div>
                        )}

                        <div className="space-y-2">
                            <p className="font-medium">Evidence</p>
                            {p.evidence.length === 0 && <p className="text-muted-foreground">No evidence uploaded yet.</p>}
                            {p.evidence.map((e) => (
                                <p key={e.id}>
                                    {e.url ? (
                                        <a href={e.url} target="_blank" rel="noreferrer" className="underline">
                                            {e.ext.toUpperCase()} file
                                        </a>
                                    ) : (
                                        "File unavailable"
                                    )}{" "}
                                    · {e.mine ? "from you" : "from the other party"}
                                    {e.note ? ` · ${e.note}` : ""}
                                </p>
                            ))}
                            <EvidenceUploader tradeId={p.tradeId} />
                        </div>
                        {err && <p className="text-red-600">{err}</p>}
                    </CardContent>
                </Card>
            )}
        </>
    );
}