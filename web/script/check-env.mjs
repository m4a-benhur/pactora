// Run from web/: node scripts/check-env.mjs   (or add "preflight" to package.json scripts)
// Checks required variables, the RPC chain, and prints the wallet addresses your server keys control. Never prints keys.
import { readFileSync, existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

const file = existsSync(".env.local") ? ".env.local" : ".env";
const env = { ...process.env };
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

let bad = 0;
const fail = (m) => { bad++; console.log(`FAIL  ${m}`); };
const ok = (m) => console.log(`ok    ${m}`);

const required = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_USDT_ADDRESS", "NEXT_PUBLIC_ESCROW_ADDRESS", "NEXT_PUBLIC_SEPOLIA_RPC_URL",
  "SUPABASE_SECRET_KEY", "ARBITER_PRIVATE_KEY",
];
for (const k of required) (env[k] ? ok(k) : fail(`${k} is missing`));
if (env.NEXT_PUBLIC_CHAIN_ID && env.NEXT_PUBLIC_CHAIN_ID !== "11155111") fail("NEXT_PUBLIC_CHAIN_ID must be 11155111 (Ethereum Sepolia)");
for (const k of ["NEXT_PUBLIC_USDT_ADDRESS", "NEXT_PUBLIC_ESCROW_ADDRESS"]) if (env[k] && !/^0x[0-9a-fA-F]{40}$/.test(env[k])) fail(`${k} is not a valid address`);
for (const k of Object.keys(env)) if (k.startsWith("NEXT_PUBLIC_") && /(SECRET|PRIVATE)/.test(k)) fail(`${k} would be exposed to the browser. Remove the NEXT_PUBLIC_ prefix`);
if (!env.ESCROW_DEPLOY_BLOCK) console.log("note  ESCROW_DEPLOY_BLOCK not set (only needed for the admin backfill)");

const keys = { ARBITER_PRIVATE_KEY: env.ARBITER_PRIVATE_KEY, MINTER_PRIVATE_KEY: env.MINTER_PRIVATE_KEY };
const rpc = env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
async function call(method, params = []) {
  const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}
if (rpc) {
  try {
    const id = parseInt(await call("eth_chainId"), 16);
    id === 11155111 ? ok("RPC is on Sepolia") : fail(`RPC chain id is ${id}, expected 11155111`);
  } catch { fail("Could not reach NEXT_PUBLIC_SEPOLIA_RPC_URL"); }
}
for (const [name, key] of Object.entries(keys)) {
  if (!key) continue;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) { fail(`${name} must be 0x followed by 64 hex characters`); continue; }
  const addr = privateKeyToAccount(key).address;
  let eth = "unknown";
  try { eth = (Number(BigInt(await call("eth_getBalance", [addr, "latest"])) / 10n ** 12n) / 1e6).toFixed(4); } catch {}
  console.log(`info  ${name} controls ${addr} (${eth} Sepolia ETH)`);
}
console.log("info  ARBITER_PRIVATE_KEY's address must equal the escrow admin (constructor arg). MINTER_PRIVATE_KEY's address (or the arbiter's, if unset) must hold the minter role on TestUSDT.");
console.log(bad ? `\n${bad} problem(s) found.` : "\nAll checks passed.");
process.exit(bad ? 1 : 0);
