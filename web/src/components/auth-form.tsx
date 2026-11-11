"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setNotice(null);

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setLoading(true);
        const supabase = createClient();

        if (mode === "signup") {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) {
                setError(error.message);
            } else if (data.session) {
                router.push("/dashboard");
                router.refresh();
            } else {
                setNotice("Check your email to confirm your account, then log in.");
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setError(error.message);
            } else {
                router.push("/dashboard");
                router.refresh();
            }
        }
        setLoading(false);
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>{mode === "login" ? "Log in to Pactora" : "Create your account"}</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {notice && <p className="text-sm text-green-700">{notice}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
                    </Button>
                </form>
                <p className="mt-4 text-sm text-muted-foreground">
                    {mode === "login" ? (
                        <>
                            New here? <Link href="/signup" className="underline">Create an account</Link>
                        </>
                    ) : (
                        <>
                            Already have an account? <Link href="/login" className="underline">Log in</Link>
                        </>
                    )}
                </p>
                <p className="mt-4 text-xs text-red-600">DEMO — NO REAL MONEY</p>
            </CardContent>
        </Card>
    );
}