import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { Wordmark } from "@/components/wordmark";
import { connection } from "next/server";

const link = "rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground";
const cta = "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="bg-accent/70 py-1 text-center text-xs font-medium text-accent-foreground">
        Ethereum Sepolia test network
      </div>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Pactora home"><Wordmark /></Link>
        <Suspense fallback={<div className="h-9 w-32" />}><Nav /></Suspense>
      </div>
    </header>
  );
}

async function Nav() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    isAdmin = !!data?.is_admin;
  }

  const items = user
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/trades/new", label: "New deal" },
        { href: "/ramp", label: "Funds" },
        ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [{ href: "/login", label: "Log in" }];

  return (
    <>
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
        {items.map((i) => <Link key={i.href} href={i.href} className={link}>{i.label}</Link>)}
        {user ? <SignOutButton /> : <Link href="/signup" className={cta}>Get started</Link>}
      </nav>
      <details className="relative sm:hidden">
        <summary className="cursor-pointer list-none rounded-full border px-3 py-1.5 text-sm font-medium">Menu</summary>
        <div className="absolute right-0 mt-2 flex w-52 flex-col gap-1 rounded-2xl border bg-card p-2 shadow-lg">
          {items.map((i) => <Link key={i.href} href={i.href} className={link}>{i.label}</Link>)}
          {user ? <SignOutButton /> : <Link href="/signup" className={cta + " text-center"}>Get started</Link>}
        </div>
      </details>
    </>
  );
}
