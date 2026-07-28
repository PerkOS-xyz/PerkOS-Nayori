import {
  CONTRACT_ADDRESS,
  STX_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";
import { NETWORK_NAME } from "../constants/network";

const API =
  NETWORK_NAME === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

export const EXPLORER = "https://explorer.hiro.so";
export const CHAIN_PARAM = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";

const CONTRACTS = [
  "agent-registry",
  STX_COMMERCE_CONTRACT_NAME,
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
  indexedTransactions: number;
  truncated: boolean;
  perContract: { name: string; total: number }[];
  recent: RecentTx[];
}

const PAGE_SIZE = 50;
const MAX_INDEXED_PER_CONTRACT = 1000;

async function getContractTransactions(contract: string, allPages: boolean) {
  const collected: any[] = [];
  let total = 0;
  let offset = 0;
  do {
    const r = await fetch(
      `${API}/extended/v1/address/${CONTRACT_ADDRESS}.${contract}/transactions?limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (!r.ok) return { total: 0, results: [], truncated: false };
    const data = await r.json();
    const page: any[] = data.results ?? [];
    total = typeof data.total === "number" ? data.total : page.length;
    collected.push(...page);
    offset += page.length;
    if (!allPages || page.length < PAGE_SIZE) break;
  } while (offset < total && offset < MAX_INDEXED_PER_CONTRACT);
  return { total, results: collected, truncated: total > collected.length };
}

export async function getOnchainStats(): Promise<OnchainStats> {
  let totalTx = 0;
  let feesMicro = 0;
  const wallets = new Set<string>();
  const perContract: { name: string; total: number }[] = [];
  const recent: RecentTx[] = [];
  let indexedTransactions = 0;
  let truncated = false;

  const contractResults = await Promise.all(
    CONTRACTS.map(async (contract) => ({
      contract,
      data: await getContractTransactions(contract, true).catch(() => ({
        total: 0,
        results: [] as any[],
        truncated: false,
      })),
    }))
  );

  for (const { contract: c, data } of contractResults) {
    try {
      perContract.push({ name: c, total: data.total });
      totalTx += data.total;
      indexedTransactions += data.results.length;
      truncated ||= data.truncated;

      for (const tx of data.results) {
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
    indexedTransactions,
    truncated,
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
  const pages = await Promise.all(
    CONTRACTS.map(async (contract) => ({
      contract,
      data: await getContractTransactions(contract, false).catch(() => ({
        total: 0,
        results: [] as any[],
        truncated: false,
      })),
    }))
  );
  for (const { contract: c, data } of pages) {
    try {
      for (const tx of data.results) {
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
