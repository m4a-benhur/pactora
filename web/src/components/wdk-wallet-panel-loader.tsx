"use client";

import dynamic from "next/dynamic";

export const WdkWalletPanelLoader = dynamic(
    () => import("@/components/wdk-wallet-panel").then((m) => m.WdkWalletPanel),
    { ssr: false, loading: () => <p className="text-sm">Loading wallet…</p> }
);