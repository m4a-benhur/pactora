"use server";

import { parseEventLogs } from "viem";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicClient } from "@/lib/minter";
import { escrowAbi } from "@/lib/escrow-abi";

export type BackfillState = { message: string; ok: boolean } | null;

const CHUNK = 9_000n; // most free Sepolia RPCs cap getLogs ranges

// ADAPT: map one decoded log to your chain_events columns (see INTEGRATION.md). Unique key must be (tx_hash, log_index).
function toRow(l: { transactionHash: string; logIndex: number; blockNumber: bigint; eventName: string; args: unknown }) {
  const args = (l.args ?? {}) as Record<string, unknown>;
  return {
    tx_hash: l.transactionHash,
    log_index: l.logIndex,
    block_number: Number(l.blockNumber),
    event_name: l.eventName,
    chain_trade_id: typeof args.id === "string" ? args.id : null,
    args: JSON.parse(JSON.stringify(args, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
  };
}

export async function backfillChainEvents(_prev: BackfillState): Promise<BackfillState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Log in first." };
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return { ok: false, message: "Admins only." };

  const escrow = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}` | undefined;
  const startRaw = process.env.ESCROW_DEPLOY_BLOCK;
  if (!escrow || !startRaw) return { ok: false, message: "Set ESCROW_DEPLOY_BLOCK (block number of the escrow deployment) in the server environment." };

  try {
    const client = publicClient();
    const latest = await client.getBlockNumber();
    const rows: ReturnType<typeof toRow>[] = [];
    for (let from = BigInt(startRaw); from <= latest; from += CHUNK + 1n) {
      const to = from + CHUNK > latest ? latest : from + CHUNK;
      const logs = await client.getLogs({ address: escrow, fromBlock: from, toBlock: to });
      const decoded = parseEventLogs({ abi: escrowAbi, logs });
      for (const l of decoded) rows.push(toRow(l as never));
    }
    if (!rows.length) return { ok: true, message: "No escrow events found in that range." };
    const { error } = await createAdminClient().from("chain_events").upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
    if (error) return { ok: false, message: `Database rejected the rows: ${error.message}. Adjust toRow() to your chain_events columns.` };
    return { ok: true, message: `Checked ${rows.length} events. Missing ones were added.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 300) : "Backfill failed." };
  }
}
