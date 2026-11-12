"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLink({ path }: { path: string }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        const url = `${window.location.origin}${path}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <Button variant="outline" onClick={copy}>
            {copied ? "Copied ✓" : "Copy share link"}
        </Button>
    );
}