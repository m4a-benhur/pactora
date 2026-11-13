"use server";

import { redirect } from "next/navigation";
// ADAPT if your helper names differ.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthState = { error?: string; notice?: string } | null;

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(["admin", "administrator", "pactora", "support", "help", "root", "system", "moderator"]);

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export async function signUpWithUsername(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!USERNAME_RE.test(username)) return { error: "Use 3 to 20 letters, numbers or underscores for your username." };
  if (RESERVED.has(username.toLowerCase())) return { error: "That username is reserved. Choose another." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const admin = createAdminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("username_lower", username.toLowerCase()).maybeSingle();
  if (taken) return { error: "That username is taken." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
  if (error || !data.user) return { error: error?.message ?? "Could not create the account." };

  // Your existing trigger normally creates the profile row; update it, or insert if it is missing.
  const { data: updated, error: upErr } = await admin.from("profiles").update({ username }).eq("id", data.user.id).select("id");
  let failure = upErr;
  if (!failure && !updated?.length) failure = (await admin.from("profiles").insert({ id: data.user.id, username })).error;
  if (failure) {
    await admin.auth.admin.deleteUser(data.user.id); // do not leave an account without a username
    return { error: failure.code === "23505" ? "That username is taken." : "Could not save your username. Try again." };
  }
  if (!data.session) return { notice: "Check your email to confirm your account, then log in." };
  redirect(safeNext(formData.get("next")));
}

/** Accepts a username or an email, so existing accounts keep working. */
export async function loginWithIdentifier(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) return { error: "Enter your username or email and your password." };

  let email = identifier;
  if (!identifier.includes("@")) {
    const admin = createAdminClient();
    const { data: p } = await admin.from("profiles").select("id").eq("username_lower", identifier.toLowerCase()).maybeSingle();
    email = "";
    if (p) email = (await admin.auth.admin.getUserById(p.id as string)).data.user?.email ?? "";
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email || "no-such-user@invalid.invalid", password });
  if (error) return { error: "Wrong username, email or password." }; // same message for every failure
  redirect(safeNext(formData.get("next")));
}