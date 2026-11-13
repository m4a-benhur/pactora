"use client";

import { useActionState, useState } from "react";
import { createTrade, type FormState } from "@/app/trades/new/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    computeBreakdown,
    formatZar,
    unitsToZarCents,
    parseZarToCents,
    MIN_PRICE_CENTS,
    MAX_PRICE_CENTS,
} from "@/lib/pricing";

const fieldClass =
    "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

const CATEGORIES = [
    "Electronics", "Phones & computers", "Furniture", "Home appliances",
    "Clothing & footwear", "Vehicles & parts", "Collectibles", "Sports equipment",
    "Home & garden", "Other",
];

export function CreateTradeForm({ rateCentsPerUsdt }: { rateCentsPerUsdt: number }) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(createTrade, {
        error: null,
    });
    const [price, setPrice] = useState("");

    const cents = parseZarToCents(price);
    const valid = cents !== null && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS;
    const rate = BigInt(rateCentsPerUsdt);
    const b = valid ? computeBreakdown(cents, rate) : null;
    const zar = (units: bigint) => formatZar(unitsToZarCents(units, rate));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Create a protected transaction</CardTitle>
            </CardHeader>
            <CardContent>
                <form action={formAction} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Item title</Label>
                        <Input id="title" name="title" required maxLength={120} placeholder="e.g. iPhone 14 128GB" />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <select id="category" name="category" required className={fieldClass} defaultValue="">
                            <option value="" disabled>Select a category</option>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <textarea id="description" name="description" required rows={4} maxLength={2000} className={fieldClass} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="condition">Condition</Label>
                        <select id="condition" name="condition" required className={fieldClass} defaultValue="">
                            <option value="" disabled>Select condition</option>
                            <option value="new">New</option>
                            <option value="like_new">Like new</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="poor">Poor</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="known_defects">Known defects (be honest, it protects you in a dispute)</Label>
                        <textarea id="known_defects" name="known_defects" rows={2} maxLength={1000} className={fieldClass} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="price">Price (ZAR)</Label>
                        <Input
                            id="price"
                            name="price"
                            inputMode="decimal"
                            required
                            placeholder="8000"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="delivery_method">Delivery</Label>
                        <select id="delivery_method" name="delivery_method" required className={fieldClass} defaultValue="">
                            <option value="" disabled>Select delivery method</option>
                            <option value="courier">Courier delivery</option>
                            <option value="in_person">In-person collection</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="inspection_minutes">Buyer inspection period</Label>
                        <select id="inspection_minutes" name="inspection_minutes" className={fieldClass} defaultValue="2880">
                            <option value="2880">48 hours (recommended)</option>
                            <option value="1440">24 hours</option>
                            <option value="2">2 minutes (demo only)</option>
                        </select>
                    </div>

                    {b && (
                        <div className="space-y-1 rounded-md border p-3 text-sm">
                            <p className="font-medium">What this means for you (simulated rate: R{(rateCentsPerUsdt / 100).toFixed(2)} = 1 USDT)</p>
                            <p>Item price: {formatZar(cents!)}</p>
                            <p>Pactora fee (2%, only if the sale completes): −{zar(b.feeUnits)}</p>
                            <p className="font-medium">You receive: {zar(b.sellerNetUnits)}</p>
                            <p className="text-muted-foreground">
                                Security bond you deposit: {zar(b.sellerBondUnits)} (returned when the sale completes fairly)
                            </p>
                        </div>
                    )}

                    {state.error && <p className="text-sm text-red-600">{state.error}</p>}
                    <Button type="submit" disabled={pending} className="w-full">
                        {pending ? "Creating…" : "Create transaction"}
                    </Button>
                    <p className="text-xs text-red-600">Exchange rate is simulated.</p>
                </form>
            </CardContent>
        </Card>
    );
}