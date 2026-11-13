// SERVER ONLY. Mints tUSDT for the simulated on-ramp and reads balances.
// Import this only from server actions or server components, never from a "use client" file.
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, toHex, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const abi = parseAbi([
  "function mintFor(address to, uint256 amount, bytes32 ref)",
  "function balanceOf(address account) view returns (uint256)",
]);

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const transport = () => http(env("NEXT_PUBLIC_SEPOLIA_RPC_URL"));
const token = () => env("NEXT_PUBLIC_USDT_ADDRESS") as `0x${string}`;

export function publicClient() {
  return createPublicClient({ chain: sepolia, transport: transport() });
}

export async function tUsdtBalance(address: string): Promise<bigint> {
  if (!isAddress(address)) return 0n;
  return publicClient().readContract({ address: token(), abi, functionName: "balanceOf", args: [address] });
}

/** The unique ref makes minting idempotent on-chain: the same ramp id can never mint twice. */
export function rampRef(rampId: string): `0x${string}` {
  return keccak256(toHex(`pactora-ramp:${rampId}`));
}

export async function mintTUsdt(to: string, units: bigint, rampId: string): Promise<`0x${string}`> {
  if (!isAddress(to)) throw new Error("Linked wallet address is invalid.");
  // MINTER_PRIVATE_KEY must belong to the address that holds the minter role on TestUSDT.
  const key = (process.env.MINTER_PRIVATE_KEY || env("ARBITER_PRIVATE_KEY")) as `0x${string}`;
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: sepolia, transport: transport() });
  const hash = await wallet.writeContract({
    address: token(), abi, functionName: "mintFor", args: [to, units, rampRef(rampId)],
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The mint transaction reverted.");
  return hash;
}
