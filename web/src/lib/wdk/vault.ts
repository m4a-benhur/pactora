const KEY = "pactora_wdk_vault_v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

type Vault = { salt: string; iv: string; data: string };

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pin: string, salt: Uint8Array) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt as BufferSource, iterations: 250_000, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export function hasVault(): boolean {
    try {
        return typeof window !== "undefined" && !!localStorage.getItem(KEY);
    } catch {
        return false;
    }
}

export async function saveSeed(seed: string, pin: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pin, salt);
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(seed));
    const vault: Vault = { salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
    localStorage.setItem(KEY, JSON.stringify(vault));
}

/** Throws if the PIN is wrong. */
export async function loadSeed(pin: string): Promise<string> {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("No wallet found on this device.");
    const vault: Vault = JSON.parse(raw);
    const key = await deriveKey(pin, fromB64(vault.salt));
    try {
        const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromB64(vault.iv) as BufferSource },
            key,
            fromB64(vault.data) as BufferSource
        );
        return dec.decode(plain);
    } catch {
        throw new Error("Wrong PIN.");
    }
}

export function clearVault() {
    localStorage.removeItem(KEY);
}