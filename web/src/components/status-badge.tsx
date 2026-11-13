import { STATUS_LABEL } from "@/lib/trade-ui";

function tone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("dispute")) return "bg-destructive/10 text-destructive";
  if (s.includes("complet") || s.includes("resolved") || s.includes("released")) return "bg-primary/10 text-primary";
  if (s.includes("cancel") || s.includes("expired") || s.includes("fail")) return "bg-muted text-muted-foreground";
  return "bg-accent/60 text-accent-foreground"; // in progress
}

export function StatusBadge({ status }: { status: string }) {
  const label = (STATUS_LABEL as Record<string, string>)[status] ?? status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone(status)}`}>
      {label}
    </span>
  );
}
