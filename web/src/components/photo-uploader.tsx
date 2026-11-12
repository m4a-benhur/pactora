"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 6;

export function PhotoUploader({ tradeId, count }: { tradeId: string; count: number }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const input = e.target;
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        setErr(null);

        if (count + files.length > MAX_PHOTOS) {
            setErr(`You can add up to ${MAX_PHOTOS} photos.`);
            input.value = "";
            return;
        }
        for (const f of files) {
            if (!TYPES[f.type]) {
                setErr("Only JPG, PNG or WebP images are allowed.");
                input.value = "";
                return;
            }
            if (f.size > MAX_BYTES) {
                setErr("Each photo must be 5 MB or smaller.");
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
                const up = await supabase.storage
                    .from("item-photos")
                    .upload(path, f, { contentType: f.type });
                if (up.error) throw new Error(up.error.message);

                const ins = await supabase.from("trade_media").insert({
                    trade_id: tradeId,
                    uploaded_by: auth.user.id,
                    kind: "item_photo",
                    bucket: "item-photos",
                    storage_path: path,
                });
                if (ins.error) throw new Error(ins.error.message);
            }
            router.refresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Upload failed.");
        }
        input.value = "";
        setBusy(false);
    }

    return (
        <div className="space-y-2">
            <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || count >= MAX_PHOTOS}
                onChange={onChange}
                className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
                JPG, PNG or WebP, up to 5 MB each, max {MAX_PHOTOS} photos. Photos lock once a buyer accepts.
            </p>
            {busy && <p className="text-sm">Uploading…</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
    );
}