import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

export const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;
export const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
export const RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL as string;

export const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
});

export const usdtAbi = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function faucetMint()",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
]);

export const explorerTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;