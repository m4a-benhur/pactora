"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute } from "@/app/admin/disputes/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    formatZar,
    parseZarToCents,
    unitsToZarCents,
    zarCentsToUnits,
} from "@/lib/pricing";

type Props = {
    tradeId: string;
    rateCents: number;
    principalUnits: string;
    sellerBondUnits: string;
    buyerBondUnits: string;
    feeBps: number;
};

const OUTCOMES = [
    { v: "full_refund", label: "Full refund to the buyer (no misconduct finding)" },
    { v: "partial_refund", label: "Partial refund to the buyer (e.g. undisclosed fault, item kept)" },
    { v: "release_to_seller", label: "Release payment to the seller (claim not upheld)" },
    { v: "seller_bond_to_buyer", label: "Refund buyer + award seller bond (deliberate seller misconduct)" },
    { v: "release_buyer_bond_forfeited", label: "Release to seller + forfeit buyer bond (deliberate buyer misconduct)" },
];

const area =
    "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ResolveForm(p: Props) {
    const router = useRouter();
    const [outcome, setOutcome] = useState("full_refund");
    const [partial, setPartial] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const rate = BigInt(p.rateCents);
    const principal = BigInt(p.principalUnits);
    const sBond = BigInt(p.sellerBondUnits);
    const bBond = BigInt(p.buyerBondUnits);
    const fee = (principal * BigInt(p.feeBps)) / 10000n;
    const zar = (u: bigint) => formatZar(unitsToZarCents(u, rate));

    let buyer = 0n;
    let seller = 0n;
    let treasury = 0n;
    let previewError: string | null = null;

    if (outcome === "full_refund") {
        buyer = principal + bBond;
        seller = sBond;
    } else if (outcome === "partial_refund") {
        const cents = parseZarToCents(partial);
        const units = cents === null ? 0n : zarCentsToUnits(cents, rate);
        if (units <= 0n || units >= principal) {
            previewError = "Enter a refund amount above R0 and below the item price.";
        } else {
            buyer = units + bBond;
            seller = principal - units + sBond;
        }
    } else if (outcome === "seller_bond_to_buyer") {
        buyer = principal + sBond + bBond;
    } else if (outcome === "release_to_seller") {
        seller = principal - fee + sBond;
        buyer = bBond;
        treasury = fee;
    } else {
        seller = principal - fee + sBond + bBond;
        treasury = fee;
    }

    async function submit() {
        if (!confirm("Record this decision and move the funds on-chain? This cannot be undone.")) return;
        setBusy(true);
        setErr(null);
        const res = await resolveDispute({
            tradeId: p.tradeId,
            outcome,
            partialRefundZar: partial,
            notes,
        });
        if (res.error) {
            setErr(res.error);
            setBusy(false);
            return;
        }
        router.refresh();
        setBusy(false);
    }

    return (
        <div className="space-y-4 text-sm">
            <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                An accusation is not proof, and a dispute raised in good faith must never be penalised. Choose a
                bond penalty only for deliberate misconduct, and explain why in the reasoning below.
            </p>

            <div className="space-y-2">
                {OUTCOMES.map((o) => (
                    <label key={o.v} className="flex items-start gap-2">
                        <input type="radio" name="outcome" checked={outcome === o.v} onChange={() => setOutcome(o.v)} />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>

            {outcome === "partial_refund" && (
                <div className="space-y-1">
                    <p>Refund to the buyer from the item price (ZAR). The buyer&apos;s bond is returned as well.</p>
                    <Input value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="e.g. 300" />
                </div>
            )}

            <div className="rounded border p-3">
                <p className="font-medium">What this decision pays out (simulated rate)</p>
                {previewError ? (
                    <p className="text-red-600">{previewError}</p>
                ) : (
                    <>
                        <p>Buyer receives: {zar(buyer)}</p>
                        <p>Seller receives: {zar(seller)}</p>
                        <p>Pactora fee: {zar(treasury)}</p>
                    </>
                )}
            </div>

            <div className="space-y-1">
                <p className="font-medium">Reasoned decision (required, stored in the audit record)</p>
                <textarea
                    className={area}
                    rows={4}
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What evidence did you review, and why is this outcome fair?"
                />
            </div>

            <Button onClick={submit} disabled={busy || !!previewError || notes.trim().length < 20}>
                {busy ? "Recording decision…" : "Record decision and release funds"}
            </Button>
            {err && <p className="text-red-600">{err}</p>}
        </div>
    );
}