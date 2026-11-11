import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Pactora</h1>
      <p className="text-lg text-muted-foreground">Every agreement deserves protection.</p>
      <div className="flex gap-3">
        <Link href="/signup" className={buttonVariants()}>
          Get started
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Log in
        </Link>
      </div>
      <p className="text-xs text-red-600">DEMO — NO REAL MONEY</p>
    </main>
  );
}