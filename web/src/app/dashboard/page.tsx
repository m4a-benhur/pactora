import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WdkWalletPanel } from "@/components/wdk-wallet-panel";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
//import { WdkWalletPanelLoader } from "@/components/wdk-wallet-panel-loader";

import { WdkWalletPanelLoader } from "@/components/wdk-wallet-panel-loader";

async function DashboardContent() {
    await connection(); // render at request time, before anything time-dependent runs

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, wallet_address, is_admin")
        .eq("id", user.id)
        .single();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">
                    Welcome, {profile?.display_name ?? "there"}
                </h1>
                <SignOutButton />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Your account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    <p>Email: {user.email}</p>
                    <p>Wallet: {profile?.wallet_address ?? "Not connected yet"}</p>
                    {profile?.is_admin && <p className="font-medium">Administrator</p>}
                </CardContent>
            </Card>
            <Link href="/trades/new" className={buttonVariants()}>
                Create a transaction
            </Link>
            <WdkWalletPanelLoader savedAddress={profile?.wallet_address ?? null} />
        </div>
    );
}

export default function DashboardPage() {
    return (
        <main className="mx-auto max-w-2xl space-y-4 p-6">
            <Suspense fallback={<p>Loading your dashboard…</p>}>
                <DashboardContent />
            </Suspense>
            <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
        </main>
    );
}