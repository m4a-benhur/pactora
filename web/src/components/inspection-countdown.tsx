"use client";

import { useEffect, useState } from "react";

export function InspectionCountdown({ endsAt }: { endsAt: string }) {
    const [left, setLeft] = useState<number | null>(null);

    useEffect(() => {
        const tick = () => setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
        tick();
        const i = setInterval(tick, 1000);
        return () => clearInterval(i);
    }, [endsAt]);

    if (left === null) return null;
    if (left === 0) return <p className="font-medium">The inspection period has ended.</p>;

    const s = Math.floor(left / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (
        <p className="font-medium">
            Inspection time left: {h}h {String(m).padStart(2, "0")}m {String(sec).padStart(2, "0")}s
        </p>
    );
}