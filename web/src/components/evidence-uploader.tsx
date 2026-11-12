"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";

const TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
};
const MAX_BYTES = 20 * 1024 * 1024;

export function EvidenceUploader({ tradeId }: { tradeId: string }) {
    const router = useRouter();
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const input = e.target;
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        setErr(null);
        setOk(null);

        for (const f of files) {
            if (!TYPES[f.type]) {
                setErr("Allowed: JPG, PNG, WebP, MP4, MOV or PDF.");
                input.value = "";
                return;
            }
            if (f.size > MAX_BYTES) {
                setErr("Each file must be 20 MB or smaller.");
                input.value = "";
                return;
            }
        }

        setBusy(true);
        try {
            const supabase = createClient();
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) throw new Error("Please log in again.");

            for (const f of files) {
                const path = `${tradeId}/${crypto.randomUUID()}.${TYPES[f.type]}`;
                const up = await supabase.storage.from("evidence").upload(path, f, { contentType: f.type });
                if (up.error) throw new Error(up.error.message);
                const ins = await supabase.from("trade_media").insert({
                    trade_id: tradeId,
                    uploaded_by: auth.user.id,
                    kind: "evidence",
                    bucket: "evidence",
                    storage_path: path,
                    note: note.trim() || null,
                });
                if (ins.error) throw new Error(ins.error.message);
            }
            setOk(`${files.length} file${files.length > 1 ? "s" : ""} added.`);
            setNote("");
            router.refresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Upload failed.");
        }
        input.value = "";
        setBusy(false);
    }

    return (
        <div className="space-y-2">
            <Input
                placeholder="What does this evidence show? (optional)"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
            />
            <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                disabled={busy}
                onChange={onChange}
                className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
                Photos, videos, receipts or PDFs, up to 20 MB each. Visible only to you, the other party and the reviewer.
            </p>
            {busy && <p className="text-sm">Uploading…</p>}
            {ok && <p className="text-sm text-green-700">{ok}</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
    );
}