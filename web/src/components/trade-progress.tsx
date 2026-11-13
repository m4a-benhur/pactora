const STEPS = [
  ["open", "Listed"], ["accepted", "Accepted"], ["seller_bonded", "Bond lodged"],
  ["funded", "Funded"], ["dispatched", "Shipped"], ["delivered", "Delivered"], ["completed", "Complete"],
] as const;

export function TradeProgress({ status }: { status: string }) {
  const idx = status === "disputed" ? 4 : status === "resolved" ? STEPS.length - 1 : STEPS.findIndex(([k]) => k === status);
  const current = idx < 0 ? 0 : idx;
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Progress">
      {STEPS.map(([k, label], i) => {
        const done = i < current || (status === "completed" && i === current) || status === "resolved";
        const now = i === current && !done;
        return (
          <li key={k} className="min-w-[4.5rem] flex-1 text-center">
            <div className={`mx-auto h-1.5 rounded-full ${done ? "bg-primary" : now ? "bg-accent" : "bg-border"}`} />
            <p className={`mt-1.5 text-xs ${now ? "font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}
