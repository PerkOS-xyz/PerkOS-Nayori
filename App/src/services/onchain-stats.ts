import { CONTRACT_ADDRESS } from "../constants/contract";
import { NETWORK_NAME } from "../constants/network";

const API =
  NETWORK_NAME === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

export const EXPLORER = "https://explorer.hiro.so";
export const CHAIN_PARAM = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";

const CONTRACTS = [
  "agent-registry",
  "agentic-commerce",
  "reputation-registry",
  "validation-registry",
  // sBTC escrow stack (Milestone 1)
  "sbtc-commerce",
  "reputation-registry-v2",
] as const;

export interface RecentTx {
  txId: string;
  contract: string;
  fn: string;
  sender: string;
  status: string;
  time?: string;
}

export interface OnchainStats {
  network: string;
  deployer: string;
  totalTx: number;
  distinctWallets: number;
  feesSTX: number;
  perContract: { name: string; total: number }[];
  recent: RecentTx[];
}

export async function getOnchainStats(): Promise<OnchainStats> {
  let totalTx = 0;
  let feesMicro = 0;
  const wallets = new Set<string>();
  const perContract: { name: string; total: number }[] = [];
  const recent: RecentTx[] = [];

  for (const c of CONTRACTS) {
    try {
      const r = await fetch(
        `${API}/extended/v1/address/${CONTRACT_ADDRESS}.${c}/transactions?limit=50`,
        { cache: "no-store" }
      );
      if (!r.ok) {
        perContract.push({ name: c, total: 0 });
        continue;
      }
      const d = await r.json();
      const results: any[] = d.results ?? [];
      const total = typeof d.total === "number" ? d.total : results.length;
      perContract.push({ name: c, total });
      totalTx += total;

      for (const tx of results) {
        if (tx.sender_address) wallets.add(tx.sender_address);
        feesMicro += Number(tx.fee_rate ?? 0);
        if (tx.tx_type === "contract_call") {
          recent.push({
            txId: tx.tx_id,
            contract: c,
            fn: tx.contract_call?.function_name ?? "",
            sender: tx.sender_address,
            status: tx.tx_status,
            time: tx.block_time_iso,
          });
        }
      }
    } catch {
      perContract.push({ name: c, total: 0 });
    }
  }

  recent.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));

  return {
    network: CHAIN_PARAM,
    deployer: CONTRACT_ADDRESS,
    totalTx,
    distinctWallets: wallets.size,
    feesSTX: feesMicro / 1e6,
    perContract,
    recent: recent.slice(0, 12),
  };
}

// Current Stacks tip height, used to compute real job expiry blocks.
export async function getBlockHeight(): Promise<number> {
  try {
    const r = await fetch(`${API}/v2/info`, { cache: "no-store" });
    if (!r.ok) return 0;
    const d = await r.json();
    return Number(d.stacks_tip_height ?? 0);
  } catch {
    return 0;
  }
}

// Full on-chain activity log: all contract-call transactions across the contracts, newest first.
export async function getRecentActivity(limit = 40): Promise<RecentTx[]> {
  const all: RecentTx[] = [];
  for (const c of CONTRACTS) {
    try {
      const r = await fetch(
        `${API}/extended/v1/address/${CONTRACT_ADDRESS}.${c}/transactions?limit=50`,
        { cache: "no-store" }
      );
      if (!r.ok) continue;
      const d = await r.json();
      for (const tx of (d.results ?? []) as any[]) {
        if (tx.tx_type === "contract_call") {
          all.push({
            txId: tx.tx_id,
            contract: c,
            fn: tx.contract_call?.function_name ?? "",
            sender: tx.sender_address,
            status: tx.tx_status,
            time: tx.block_time_iso,
          });
        }
      }
    } catch {
      // skip
    }
  }
  all.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
  return all.slice(0, limit);
}
