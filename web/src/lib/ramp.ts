// Simulated ZAR <-> tUSDT ramp maths. Integer-only: ZAR cents (number), tUSDT 6-decimal units (bigint).
// DEMO ONLY: no real money moves. Rate is "ZAR cents per 1 tUSDT" (2000 = R20.00).

export const USDT_DECIMALS = 6;
const ONE = 1_000_000n;

export type RampKind = "on" | "off";
export type RampStatus = "initiated" | "processing" | "completed" | "failed";

export const DEFAULT_RATE = 2000;
export const DEFAULT_ON_FEE_BPS = 150;
export const DEFAULT_OFF_FEE_BPS = 150;

export const MIN_ON_CENTS = 10_000; // R100
export const MAX_ON_CENTS = 500_000; // R5,000 (about 250 tUSDT, well under the 10,000 mint cap)
export const MIN_OFF_UNITS = 5n * ONE; // 5 tUSDT

export const STATUS_LABEL: Record<RampStatus, string> = {
  initiated: "Initiated",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

/** "1234.5" -> 123450 cents. Returns null for anything that is not a plain amount with at most 2 decimals. */
export function parseZarToCents(input: string): number | null {
  const s = input.trim().replace(/^R\s*/i, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "12.5" -> 12_500_000n. At most 6 decimals. */
export function parseUnits(input: string): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * ONE + BigInt(frac.padEnd(6, "0"));
}

export function formatZar(cents: number | bigint): string {
  const c = Number(cents);
  const rands = Math.trunc(c / 100);
  const rem = Math.abs(c % 100).toString().padStart(2, "0");
  return `R${rands.toLocaleString("en-US")}.${rem}`;
}

export function formatUnits(units: bigint | number | string, maxDecimals = 2): string {
  const u = BigInt(units);
  const whole = u / ONE;
  const frac = (u % ONE).toString().padStart(6, "0").slice(0, maxDecimals);
  return `${whole.toLocaleString("en-US")}.${frac}`;
}

export type OnQuote = { zarCents: number; feeCents: number; netCents: number; units: bigint };
export type OffQuote = { units: bigint; grossCents: number; feeCents: number; payoutCents: number };

export function quoteOnRamp(zarCents: number, rate: number, feeBps: number): OnQuote {
  const feeCents = Math.floor((zarCents * feeBps) / 10_000);
  const netCents = zarCents - feeCents;
  const units = (BigInt(netCents) * ONE) / BigInt(rate);
  return { zarCents, feeCents, netCents, units };
}

export function quoteOffRamp(units: bigint, rate: number, feeBps: number): OffQuote {
  const grossCents = Number((units * BigInt(rate)) / ONE);
  const feeCents = Math.floor((grossCents * feeBps) / 10_000);
  return { units, grossCents, feeCents, payoutCents: grossCents - feeCents };
}

export function validateOnAmount(cents: number | null): string | null {
  if (cents === null) return "Enter an amount in rand, for example 500 or 500.50.";
  if (cents < MIN_ON_CENTS) return `The minimum is ${formatZar(MIN_ON_CENTS)}.`;
  if (cents > MAX_ON_CENTS) return `The maximum is ${formatZar(MAX_ON_CENTS)} per purchase.`;
  return null;
}

export function validateOffAmount(units: bigint | null, balance: bigint): string | null {
  if (units === null) return "Enter an amount in tUSDT, for example 25 or 25.5.";
  if (units < MIN_OFF_UNITS) return `The minimum is ${formatUnits(MIN_OFF_UNITS)} tUSDT.`;
  if (units > balance) return `You only have ${formatUnits(balance)} tUSDT in your wallet.`;
  return null;
}

export type BankInput = { holder: string; bank: string; account: string; branch: string };
export function validateBank(b: BankInput): string | null {
  if (b.holder.trim().length < 2) return "Enter the account holder name.";
  if (b.bank.trim().length < 2) return "Enter a bank name.";
  if (!/^\d{6,16}$/.test(b.account.trim())) return "The account number must be 6 to 16 digits.";
  if (!/^\d{4,8}$/.test(b.branch.trim())) return "The branch code must be 4 to 8 digits.";
  return null;
}

export function newReceiptNo(now = new Date()): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  const r = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `PAC-${d}-${r}`;
}
