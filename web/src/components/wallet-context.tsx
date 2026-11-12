"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Wallet } from "ethers";
import { publicClient } from "@/lib/chain";
import { hasVault, saveSeed, loadSeed, clearVault } from "@/lib/wdk/vault";
import { openWdkAccount } from "@/lib/wdk/wallet";

type Opened = Awaited<ReturnType<typeof openWdkAccount>>;
type Status = "checking" | "none" | "locked" | "unlocked";

type WalletCtx = {
    status: Status;
    address: `0x${string}` | null;
    createWallet: (pin: string) => Promise<string>;
    unlock: (pin: string) => Promise<void>;
    lock: () => void;
    removeFromDevice: () => void;
    /** Sends a contract call from the unlocked wallet and waits for it to be mined. */
    sendTx: (to: `0x${string}`, data: `0x${string}`) => Promise<`0x${string}`>;
};

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const [opened, setOpened] = useState<Opened | null>(null);
    const [vaultExists, setVaultExists] = useState<boolean | null>(null);

    useEffect(() => {
        setVaultExists(hasVault());
    }, []);

    const createWallet = useCallback(async (pin: string) => {
        if (pin.length < 6) throw new Error("Choose a PIN of at least 6 characters.");
        const seed = Wallet.createRandom().mnemonic!.phrase;
        await saveSeed(seed, pin);
        setVaultExists(true);
        setOpened(await openWdkAccount(seed));
        return seed;
    }, []);

    const unlock = useCallback(async (pin: string) => {
        const seed = await loadSeed(pin);
        setOpened(await openWdkAccount(seed));
    }, []);

    const lock = useCallback(() => setOpened(null), []);

    const removeFromDevice = useCallback(() => {
        clearVault();
        setVaultExists(false);
        setOpened(null);
    }, []);

    const sendTx = useCallback(
        async (to: `0x${string}`, data: `0x${string}`) => {
            if (!opened) throw new Error("Unlock your wallet first.");
            const tx = await opened.account.sendTransaction({ to, value: 0n, data });
            const hash = tx.hash as `0x${string}`;
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
            return hash;
        },
        [opened]
    );

    const status: Status = opened
        ? "unlocked"
        : vaultExists === null
            ? "checking"
            : vaultExists
                ? "locked"
                : "none";

    const value = useMemo<WalletCtx>(
        () => ({
            status,
            address: opened?.address ?? null,
            createWallet,
            unlock,
            lock,
            removeFromDevice,
            sendTx,
        }),
        [status, opened, createWallet, unlock, lock, removeFromDevice, sendTx]
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useWallet must be used inside WalletProvider");
    return v;
}