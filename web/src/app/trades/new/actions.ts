"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, parseZarToCents } from "@/lib/pricing";

export type FormState = { error: string | null };

const CATEGORIES = [
    "Electronics", "Phones & computers", "Furniture", "Home appliances",
    "Clothing & footwear", "Vehicles & parts", "Collectibles", "Sports equipment",
    "Home & garden", "Other",
];
const CONDITIONS = ["new", "like_new", "good", "fair", "poor"];
const DELIVERY = ["courier", "in_person"];
const INSPECTION = [2, 1440, 2880]; // minutes: 2 (demo), 24h, 48h

export async function createTrade(_prev: FormState, formData: FormData): Promise<FormState> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const condition = String(formData.get("condition") ?? "");
    const knownDefects = String(formData.get("known_defects") ?? "").trim();
    const delivery = String(formData.get("delivery_method") ?? "");
    const inspection = Number(formData.get("inspection_minutes"));
    const priceCents = parseZarToCents(String(formData.get("price") ?? ""));

    if (title.length < 3 || title.length > 120) return { error: "Title must be 3–120 characters." };
    if (!CATEGORIES.includes(category)) return { error: "Choose a category." };
    if (description.length < 10 || description.length > 2000)
        return { error: "Description must be 10–2000 characters." };
    if (!CONDITIONS.includes(condition)) return { error: "Choose the item's condition." };
    if (knownDefects.length > 1000) return { error: "Known defects is too long." };
    if (!DELIVERY.includes(delivery)) return { error: "Choose a delivery method." };
    if (!INSPECTION.includes(inspection)) return { error: "Choose an inspection period." };
    if (priceCents === null) return { error: "Enter a valid price in rand, e.g. 8000 or 8000.50." };
    if (priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS)
        return { error: "Price must be between R50 and R1,000,000." };

    const { data, error } = await supabase
        .from("trades")
        .insert({
            seller_id: user.id,
            title,
            category,
            description,
            condition,
            known_defects: knownDefects,
            delivery_method: delivery,
            inspection_minutes: inspection,
            price_zar_cents: Number(priceCents),
        })
        .select("id")
        .single();

    if (error || !data) return { error: "Could not create the transaction. Please try again." };

    redirect(`/trades/${data.id}`);
}

