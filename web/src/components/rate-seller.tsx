"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function RateSeller({ tradeId }: { tradeId: string }) {
    const router = useRouter();
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        setBusy(true);
        setErr(null);
        const { error } = await createClient().rpc("rate_seller", {
            p_trade: tradeId,
            p_rating: rating,
            p_comment: comment,
        });
        if (error) {
            setErr(error.message);
            setBusy(false);
            return;
        }
        router.refresh();
        setBusy(false);
    }

    return (
        <div className="space-y-3">
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        onClick={() => setRating(n)}
                        className={`text-3xl leading-none ${n <= rating ? "text-amber-500" : "text-gray-300"}`}
                    >
                        ★
                    </button>
                ))}
            </div>
            <textarea
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                rows={2}
                maxLength={500}
                placeholder="Optional comment about the seller"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
            />
            <Button onClick={submit} disabled={busy || rating === 0}>
                {busy ? "Saving…" : "Submit rating"}
            </Button>
            {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
    );
}