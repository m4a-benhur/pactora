import { describe, expect, it } from "vitest";
import {
  formatUnits, formatZar, parseUnits, parseZarToCents, quoteOffRamp, quoteOnRamp,
  validateBank, validateOffAmount, validateOnAmount, newReceiptNo,
} from "./ramp";

describe("parsing", () => {
  it("parses rand amounts", () => {
    expect(parseZarToCents("500")).toBe(50000);
    expect(parseZarToCents("R1,234.5")).toBe(123450);
    expect(parseZarToCents("0.05")).toBe(5);
    expect(parseZarToCents("12.345")).toBeNull();
    expect(parseZarToCents("-5")).toBeNull();
    expect(parseZarToCents("abc")).toBeNull();
  });
  it("parses tUSDT units", () => {
    expect(parseUnits("12.5")).toBe(12_500_000n);
    expect(parseUnits("0.000001")).toBe(1n);
    expect(parseUnits("1.1234567")).toBeNull();
  });
  it("formats", () => {
    expect(formatZar(100000)).toBe("R1,000.00");
    expect(formatUnits(49_250_000n)).toBe("49.25");
  });
});

describe("quotes", () => {
  it("on-ramp R1,000 at R20/USDT with 1.5% fee", () => {
    const q = quoteOnRamp(100000, 2000, 150);
    expect(q.feeCents).toBe(1500);
    expect(q.netCents).toBe(98500);
    expect(q.units).toBe(49_250_000n);
  });
  it("off-ramp 49.25 tUSDT with 1.5% fee floors the fee", () => {
    const q = quoteOffRamp(49_250_000n, 2000, 150);
    expect(q.grossCents).toBe(98500);
    expect(q.feeCents).toBe(1477);
    expect(q.payoutCents).toBe(97023);
  });
  it("never creates value on a round trip", () => {
    const on = quoteOnRamp(100000, 2000, 150);
    const off = quoteOffRamp(on.units, 2000, 150);
    expect(off.payoutCents).toBeLessThan(100000);
  });
});

describe("validation", () => {
  it("limits", () => {
    expect(validateOnAmount(5000)).toMatch(/minimum/);
    expect(validateOnAmount(600000)).toMatch(/maximum/);
    expect(validateOnAmount(50000)).toBeNull();
    expect(validateOffAmount(10_000_000n, 5_000_000n)).toMatch(/only have/);
    expect(validateOffAmount(10_000_000n, 50_000_000n)).toBeNull();
  });
  it("bank details", () => {
    expect(validateBank({ holder: "A B", bank: "Demo Bank", account: "12345", branch: "1234" })).toMatch(/account number/);
    expect(validateBank({ holder: "A B", bank: "Demo Bank", account: "123456789", branch: "250655" })).toBeNull();
  });
  it("receipt numbers look right", () => {
    expect(newReceiptNo(new Date("2026-11-13T10:00:00Z"))).toMatch(/^PAC-20261113-[0-9A-F]{6}$/);
  });
});
