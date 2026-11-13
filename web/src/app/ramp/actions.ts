"use server";

import { revalidatePath } from "next/cache";
// ADAPT if your helper names differ (see INTEGRATION.md).
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_OFF_FEE_BPS, DEFAULT_ON_FEE_BPS, DEFAULT_RATE, newReceiptNo, parseUnits, parseZarToCents,
  quoteOffRamp, quoteOnRamp, validateBank, validateOffAmount, validateOnAmount,
} from "@/lib/ramp";
import { mintTUsdt, tUsdtBalance } from "@/lib/minter";

type Result = { ok: true; id: string } | { ok: false; error: string };

// Fixed demo settings. Wire to platform_settings if you want admin-editable rates.
const SETTINGS = { rate: DEFAULT_RATE, onFeeBps: DEFAULT_ON_FEE_BPS, offFeeBps: DEFAULT_OFF_FEE_BPS };

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("wallet_address").eq("id", user.id).single();
  return { id: user.id, wallet: (profile?.wallet_address as string | null) ?? null };
}

async function ownedRamp(id: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("ramp_transactions").select("*").eq("id", id).eq("user_id", userId).single();
  return { admin, ramp: data };
}

export async function createOnRamp(zarInput: string): Promise<Result> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Log in to buy tUSDT." };
  if (!u.wallet) return { ok: false, error: "Link your wallet on the dashboard first." };
  const cents = parseZarToCents(zarInput);
  const bad = validateOnAmount(cents);
  if (bad || cents === null) return { ok: false, error: bad ?? "Invalid amount." };
  const q = quoteOnRamp(cents, SETTINGS.rate, SETTINGS.onFeeBps);
  const { data, error } = await createAdminClient().from("ramp_transactions").insert({
    user_id: u.id, kind: "on", status: "initiated", zar_cents: q.zarCents, fee_cents: q.feeCents,
    rate: SETTINGS.rate, fee_bps: SETTINGS.onFeeBps, usdt_units: q.units.toString(), wallet_address: u.wallet,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not start the purchase. Try again." };
  return { ok: true, id: data.id as string };
}

/** Simulated card payment succeeds, then the server mints tUSDT to the linked wallet. */
export async function confirmOnRamp(id: string): Promise<Result> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Log in first." };
  const { admin, ramp } = await ownedRamp(id, u.id);
  if (!ramp || ramp.kind !== "on") return { ok: false, error: "Purchase not found." };
  // Atomic claim: only one request can move initiated -> processing.
  const { data: claimed } = await admin.from("ramp_transactions")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "initiated").select("id");
  if (!claimed?.length) return { ok: false, error: "This purchase was already processed." };
  try {
    const hash = await mintTUsdt(ramp.wallet_address, BigInt(ramp.usdt_units), id);
    await admin.from("ramp_transactions").update({
      status: "completed", tx_hash: hash, receipt_no: newReceiptNo(),
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", id);
  } catch (e) {
    await admin.from("ramp_transactions").update({
      status: "failed", failure_reason: e instanceof Error ? e.message.slice(0, 300) : "Mint failed",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }
  revalidatePath("/ramp"); revalidatePath(`/ramp/${id}`);
  return { ok: true, id };
}

export async function failOnRamp(id: string): Promise<Result> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Log in first." };
  const { admin, ramp } = await ownedRamp(id, u.id);
  if (!ramp || ramp.kind !== "on") return { ok: false, error: "Purchase not found." };
  const { data } = await admin.from("ramp_transactions")
    .update({ status: "failed", failure_reason: "Simulated payment declined", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "initiated").select("id");
  if (!data?.length) return { ok: false, error: "This purchase can no longer be declined." };
  revalidatePath("/ramp"); revalidatePath(`/ramp/${id}`);
  return { ok: true, id };
}

export async function createOffRamp(input: {
  units: string; holder: string; bank: string; account: string; branch: string;
}): Promise<Result> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Log in to cash out." };
  if (!u.wallet) return { ok: false, error: "Link your wallet on the dashboard first." };
  const units = parseUnits(input.units);
  const balance = await tUsdtBalance(u.wallet);
  const badAmount = validateOffAmount(units, balance);
  if (badAmount || units === null) return { ok: false, error: badAmount ?? "Invalid amount." };
  const badBank = validateBank(input);
  if (badBank) return { ok: false, error: badBank };
  const q = quoteOffRamp(units, SETTINGS.rate, SETTINGS.offFeeBps);
  const { data, error } = await createAdminClient().from("ramp_transactions").insert({
    user_id: u.id, kind: "off", status: "initiated", zar_cents: q.payoutCents, fee_cents: q.feeCents,
    rate: SETTINGS.rate, fee_bps: SETTINGS.offFeeBps, usdt_units: q.units.toString(), wallet_address: u.wallet,
    bank_name: input.bank.trim(), account_holder: input.holder.trim(), account_last4: input.account.trim().slice(-4),
  }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not start the withdrawal. Try again." };
  return { ok: true, id: data.id as string };
}

/** Simulated payout pipeline: initiated -> processing -> completed (or failed). No on-chain burn. */
export async function advanceOffRamp(id: string, outcome: "next" | "fail"): Promise<Result> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Log in first." };
  const { admin, ramp } = await ownedRamp(id, u.id);
  if (!ramp || ramp.kind !== "off") return { ok: false, error: "Withdrawal not found." };
  const now = new Date().toISOString();
  let patch: Record<string, unknown> | null = null;
  let from = ramp.status as string;
  if (outcome === "fail" && (from === "initiated" || from === "processing")) {
    patch = { status: "failed", failure_reason: "Simulated bank rejection", updated_at: now };
  } else if (from === "initiated") {
    patch = { status: "processing", updated_at: now };
  } else if (from === "processing") {
    patch = { status: "completed", receipt_no: newReceiptNo(), completed_at: now, updated_at: now };
  }
  if (!patch) return { ok: false, error: "This withdrawal can no longer be changed." };
  const { data } = await admin.from("ramp_transactions").update(patch).eq("id", id).eq("status", from).select("id");
  if (!data?.length) return { ok: false, error: "The status changed. Refresh and try again." };
  revalidatePath("/ramp"); revalidatePath(`/ramp/${id}`);
  return { ok: true, id };
}
