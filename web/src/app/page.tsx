import Link from "next/link";

const btn = "inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-medium";

const steps = [
  { t: "Seller shares a deal", d: "Add the item, the price and photos. Pactora makes one link to send on WhatsApp, Instagram or Marketplace." },
  { t: "Buyer pays into escrow", d: "The money is held safely. The seller can see it is there, but cannot touch it yet." },
  { t: "Item ships, buyer inspects", d: "The seller sends the item. The buyer gets an inspection window to check it is as promised." },
  { t: "Money is released", d: "The buyer confirms and the seller is paid. If something is wrong, a fair review decides." },
];

const reasons = [
  { t: "Both sides put skin in the game", d: "Sellers lodge a small bond and new buyers a smaller one. Cheating costs more than playing fair." },
  { t: "Disputes get a real review", d: "Upload photos and evidence, tell your side, and receive a written ruling with a record of the decision." },
  { t: "Simple, honest pricing", d: "A 2% fee, charged only when a deal completes. Every rand is shown before you agree." },
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
        <div className="space-y-6">
          <p className="inline-flex rounded-full bg-accent/60 px-3 py-1 text-sm font-medium text-accent-foreground">
            Made for social commerce in South Africa
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Pay and get paid, without the worry.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Pactora holds the money until the item arrives as promised. Buy and sell on Facebook Marketplace,
            WhatsApp and Instagram with someone watching your back.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}>Start a protected deal</Link>
            <Link href="#how" className={`${btn} border bg-card hover:bg-muted`}>See how it works</Link>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6" aria-label="Example deal">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Example deal</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold">Vintage denim jacket</p>
              <p className="text-sm text-muted-foreground">Cape Town to Durban</p>
            </div>
            <p className="font-display text-xl font-semibold">R1,000.00</p>
          </div>
          <ol className="mt-5 space-y-3 text-sm">
            {[
              { l: "You paid into escrow", s: "done" },
              { l: "Seller shipped it", s: "done" },
              { l: "You are inspecting (48 h left)", s: "now" },
              { l: "Funds released to seller", s: "next" },
            ].map((x) => (
              <li key={x.l} className="flex items-center gap-3">
                <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  x.s === "done" ? "bg-primary text-primary-foreground" : x.s === "now" ? "bg-accent text-accent-foreground" : "border text-muted-foreground"}`}>
                  {x.s === "done" ? "✓" : x.s === "now" ? "•" : ""}
                </span>
                <span className={x.s === "next" ? "text-muted-foreground" : "font-medium"}>{x.l}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            Fee R20 · Seller bond R50 · New-buyer bond R10
          </p>
        </div>
      </section>

      <section id="how" className="border-y bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-3xl font-semibold">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.t} className="rounded-2xl border bg-card p-5">
                <span className="font-display text-3xl font-semibold text-primary">{i + 1}</span>
                <h3 className="mt-2 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-3xl font-semibold">Why it feels safe</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {reasons.map((r) => (
            <div key={r.t} className="rounded-2xl border bg-card p-6">
              <h3 className="font-semibold">{r.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{r.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rounded-3xl bg-primary px-6 py-10 text-center text-primary-foreground sm:px-12">
          <h2 className="text-3xl font-semibold">Try a protected deal in two minutes</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
            Pactora is a hackathon demo on a test network. Everything is simulated, so you can explore without risking a cent.
          </p>
          <Link href="/signup" className={`${btn} mt-6 bg-accent text-accent-foreground hover:opacity-90`}>Create a free account</Link>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>© Pactora. DEMO — NO REAL MONEY.</span>
          <span>Test tokens on Ethereum Sepolia</span>
        </div>
      </footer>
    </main>
  );
}
