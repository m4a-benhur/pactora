import { RPC_URL } from "@/lib/chain";

/** Loaded only in the browser (dynamic import) so the server build never touches WDK. */
export async function openWdkAccount(seedPhrase: string) {
    const { default: WalletManagerEvm } = await import("@tetherto/wdk-wallet-evm");
    const manager = new WalletManagerEvm(seedPhrase, { provider: RPC_URL });
    const account = await manager.getAccount(0);
    const address = (await account.getAddress()) as `0x${string}`;
    return { manager, account, address };
}