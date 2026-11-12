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

/** Simulated courier: the arbiter records delivery on-chain. */
export async function arbiterAttestDelivery(id: `0x${string}`) {
    const hash = await arbiterWallet().writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "attestDelivery",
        args: [id],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Delivery attestation failed on-chain.");
    return hash;
}