import { encodeAbiParameters, keccak256 } from "viem";

/** On-chain trade id = keccak256(abi.encode(tradeUuid, sellerWallet)) */
export function chainTradeId(tradeUuid: string, sellerWallet: string): `0x${string}` {
    return keccak256(
        encodeAbiParameters(
            [{ type: "string" }, { type: "address" }],
            [tradeUuid, sellerWallet as `0x${string}`]
        )
    );
}