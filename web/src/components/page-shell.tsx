import type { ReactNode } from "react";

export function PageShell({ children, width = "max-w-3xl" }: { children: ReactNode; width?: string }) {
  return (
    <main className={`mx-auto w-full ${width} space-y-6 px-4 py-8 sm:px-6`}>
      {children}
      <p className="pt-2 text-center text-xs text-muted-foreground">DEMO — NO REAL MONEY · Test network only</p>
    </main>
  );
}

export function PageHeader({
  eyebrow, title, subtitle, actions,
}: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <div>{eyebrow}</div>}
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  );
}

export function KV({ label, children, strong = false }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${strong ? "font-semibold" : ""}`}>{children}</dd>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const t = tone === "warn" ? "bg-accent/40 text-accent-foreground" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <p className={`rounded-xl px-3 py-2 text-sm ${t}`}>{children}</p>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
