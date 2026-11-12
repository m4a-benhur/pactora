import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

async function SignupInner({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    return <AuthForm mode="signup" next={next} />;
}

export default function SignupPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <Suspense fallback={<p>Loading…</p>}>
                <SignupInner searchParams={searchParams} />
            </Suspense>
        </main>
    );
}