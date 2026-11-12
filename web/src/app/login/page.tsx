import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

async function LoginInner({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    return <AuthForm mode="login" next={next} />;
}

export default function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <Suspense fallback={<p>Loading…</p>}>
                <LoginInner searchParams={searchParams} />
            </Suspense>
        </main>
    );
}