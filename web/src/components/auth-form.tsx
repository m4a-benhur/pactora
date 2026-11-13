"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginWithIdentifier, signUpWithUsername, type AuthState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
    const [state, action, pending] = useActionState<AuthState, FormData>(
        mode === "login" ? loginWithIdentifier : signUpWithUsername,
        null
    );

    // The server action re-checks this; it only allows same-site relative paths
    const suffix = next ? `?next=${encodeURIComponent(next)}` : "";

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>{mode === "login" ? "Log in to Pactora" : "Create your account"}</CardTitle>
            </CardHeader>
            <CardContent>
                <form action={action} className="space-y-4">
                    <input type="hidden" name="next" value={next ?? ""} />

                    {mode === "signup" ? (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="username">Username</Label>
                                <Input
                                    id="username"
                                    name="username"
                                    autoComplete="username"
                                    minLength={3}
                                    maxLength={20}
                                    pattern="[A-Za-z0-9_]+"
                                    title="3 to 20 letters, numbers or underscores"
                                    required
                                />
                                <p className="text-xs text-muted-foreground">3 to 20 letters, numbers or underscores.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" type="email" autoComplete="email" required />
                            </div>
                        </>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="identifier">Username or email</Label>
                            <Input id="identifier" name="identifier" autoComplete="username" required />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                            minLength={mode === "signup" ? 8 : undefined}
                            required
                        />
                    </div>

                    {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
                    {state?.notice && <p role="status" className="text-sm text-green-700">{state.notice}</p>}
                    <Button type="submit" className="w-full" disabled={pending}>
                        {pending ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
                    </Button>
                </form>
                <p className="mt-4 text-sm text-muted-foreground">
                    {mode === "login" ? (
                        <>
                            New here?{" "}
                            <Link href={`/signup${suffix}`} className="underline">
                                Create an account
                            </Link>
                        </>
                    ) : (
                        <>
                            Already have an account?{" "}
                            <Link href={`/login${suffix}`} className="underline">
                                Log in
                            </Link>
                        </>
                    )}
                </p>
            </CardContent>
        </Card>
    );
}
