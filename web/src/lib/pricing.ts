// All money is integer math. ZAR in cents, USDT in 6-decimal base units.
// Formulas mirror PactoraEscrow.sol (floor division) so UI = chain.

export const BPS = 10_000n;
export const FEE_BPS = 200n; // 2%
export const SELLER_BOND_BPS = 500n; // 5%
export const NEW_BUYER_BOND_BPS = 100n; // 1% for new buyers (decided at acceptance)
export const MIN_PRICE_CENTS = 5_000n; // R50
export const MAX_PRICE_CENTS = 100_000_000n; // R1,000,000
const UNIT = 1_000_000n;

/** "8000", "8 000.50", "R8,000" -> cents, or null if invalid. */
export function parseZarToCents(input: string): bigint | null {
    const s = input.trim().replace(/^R\s*/i, "").replace(/[ ,]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const [whole, frac = ""] = s.split(".");
    return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

export function zarCentsToUnits(zarCents: bigint, rateCentsPerUsdt: bigint): bigint {
    return (zarCents * UNIT) / rateCentsPerUsdt;
}

export function unitsToZarCents(units: bigint, rateCentsPerUsdt: bigint): bigint {
    return (units * rateCentsPerUsdt) / UNIT;
}

export type Breakdown = {
    principalUnits: bigint;
    sellerBondUnits: bigint;
    buyerBondUnits: bigint;
    feeUnits: bigint;
    sellerNetUnits: bigint; // principal - fee (seller bond is returned separately)
    buyerTotalUnits: bigint; // principal + buyer bond
};

export function computeBreakdown(
    priceZarCents: bigint,
    rateCentsPerUsdt: bigint,
    buyerBondBps: bigint = 0n
): Breakdown {
    const principalUnits = zarCentsToUnits(priceZarCents, rateCentsPerUsdt);
    const sellerBondUnits = (principalUnits * SELLER_BOND_BPS) / BPS;
    const buyerBondUnits = (principalUnits * buyerBondBps) / BPS;
    const feeUnits = (principalUnits * FEE_BPS) / BPS;
    return {
        principalUnits,
        sellerBondUnits,
        buyerBondUnits,
        feeUnits,
        sellerNetUnits: principalUnits - feeUnits,
        buyerTotalUnits: principalUnits + buyerBondUnits,
    };
}

/** 800000n -> "R8,000.00" (manual formatting: no locale differences between server and browser). */
export function formatZar(cents: bigint): string {
    const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const frac = (cents % 100n).toString().padStart(2, "0");
    return `R${whole}.${frac}`;
}

/** 400000000n -> "400.00" */
export function formatUsdt(units: bigint): string {
    const whole = (units / UNIT).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const frac = ((units % UNIT) / 10_000n).toString().padStart(2, "0");
    return `${whole}.${frac}`;
}