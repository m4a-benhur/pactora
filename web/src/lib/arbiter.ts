import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { publicClient, ESCROW_ADDRESS, RPC_URL } from "@/lib/chain";
import { escrowAbi } from "@/lib/escrow-abi";

function arbiterWallet() {
    const pk = process.env.ARBITER_PRIVATE_KEY;
    if (!pk) throw new Error("Missing ARBITER_PRIVATE_KEY in web/.env.local");
    return createWalletClient({
        account: privateKeyToAccount(pk as `0x${string}`),
        chain: sepolia,
        transport: http(RPC_URL),
    });
}

async function finish(hash: `0x${string}`, what: string) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${what} failed on-chain.`);
    return hash;
}

/** Simulated courier: the arbiter records delivery on-chain. */
export async function arbiterAttestDelivery(id: `0x${string}`) {
    const hash = await arbiterWallet().writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "attestDelivery",
        args: [id],
    });
    return finish(hash, "Delivery attestation");
}

/** Refund-style ruling: buyer gets buyerAmount, seller gets the rest, no fee. */
export async function arbiterResolveRefund(
    id: `0x${string}`,
    buyerAmount: bigint,
    decisionHash: `0x${string}`
) {
    const hash = await arbiterWallet().writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "resolveRefund",
        args: [id, buyerAmount, decisionHash],
    });
    return finish(hash, "The refund ruling");
}

/** Ruling for the seller: completes the trade (2% fee applies). */
export async function arbiterResolveForSeller(
    id: `0x${string}`,
    forfeitBuyerBond: boolean,
    decisionHash: `0x${string}`
) {
    const hash = await arbiterWallet().writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "resolveForSeller",
        args: [id, forfeitBuyerBond, decisionHash],
    });
    return finish(hash, "The seller ruling");
}