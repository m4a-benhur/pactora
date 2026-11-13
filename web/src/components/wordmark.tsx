export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect width="30" height="30" rx="9" fill="var(--primary)" />
        <circle cx="11.5" cy="15" r="6" fill="none" stroke="var(--primary-foreground)" strokeWidth="2" />
        <circle cx="18.5" cy="15" r="6" fill="none" stroke="var(--primary-foreground)" strokeWidth="2" />
        <circle cx="15" cy="15" r="2.2" fill="var(--accent)" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight">pactora</span>
    </span>
  );
}
