import { describe, expect, it } from "vitest";
import {
    computeBreakdown,
    formatUsdt,
    formatZar,
    parseZarToCents,
    unitsToZarCents,
    NEW_BUYER_BOND_BPS,
} from "./pricing";

const RATE = 2000n; // R20.00 per 1 USDT

describe("parseZarToCents", () => {
    it("parses valid amounts", () => {
        expect(parseZarToCents("8000")).toBe(800000n);
        expect(parseZarToCents("R8,000.50")).toBe(800050n);
        expect(parseZarToCents("8 000.5")).toBe(800050n);
    });
    it("rejects invalid amounts", () => {
        expect(parseZarToCents("")).toBeNull();
        expect(parseZarToCents("-5")).toBeNull();
        expect(parseZarToCents("12.345")).toBeNull();
        expect(parseZarToCents("abc")).toBeNull();
    });
});

describe("computeBreakdown: R8,000 phone scenario", () => {
    const b = computeBreakdown(800000n, RATE, NEW_BUYER_BOND_BPS);
    it("matches the demo numbers", () => {
        expect(unitsToZarCents(b.principalUnits, RATE)).toBe(800000n); // R8,000
        expect(unitsToZarCents(b.feeUnits, RATE)).toBe(16000n); // R160
        expect(unitsToZarCents(b.sellerNetUnits, RATE)).toBe(784000n); // R7,840
        expect(unitsToZarCents(b.sellerBondUnits, RATE)).toBe(40000n); // R400
        expect(unitsToZarCents(b.buyerBondUnits, RATE)).toBe(8000n); // R80
    });
    it("buyer total is principal plus bond", () => {
        expect(b.buyerTotalUnits).toBe(b.principalUnits + b.buyerBondUnits);
    });
});

describe("fee examples from the spec", () => {
    const feeZar = (zar: bigint) => unitsToZarCents(computeBreakdown(zar * 100n, RATE).feeUnits, RATE);
    it("is 2% of the price", () => {
        expect(feeZar(500n)).toBe(1000n); // R10
        expect(feeZar(1000n)).toBe(2000n); // R20
        expect(feeZar(5000n)).toBe(10000n); // R100
        expect(feeZar(10000n)).toBe(20000n); // R200
    });
});

describe("rounding", () => {
    it("floors and never overpays", () => {
        const b = computeBreakdown(33333n, 1800n, NEW_BUYER_BOND_BPS); // awkward rate
        expect(b.feeUnits + b.sellerNetUnits).toBe(b.principalUnits);
        expect(b.sellerBondUnits).toBe((b.principalUnits * 500n) / 10000n);
    });
});

describe("formatting", () => {
    it("formats rand and USDT", () => {
        expect(formatZar(800000n)).toBe("R8,000.00");
        expect(formatZar(5n)).toBe("R0.05");
        expect(formatUsdt(400000000n)).toBe("400.00");
        expect(formatUsdt(1234567n)).toBe("1.23");
    });
});