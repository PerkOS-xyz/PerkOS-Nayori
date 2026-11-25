import {
  CONTRACT_ADDRESS,
  REPUTATION_CONTRACT_NAME,
  SBTC_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";
import { NEXT_DEPLOYERS, nextContractIds } from "../constants/nayori-deployment";
import { NETWORK_NAME } from "../constants/network";
import { hiroFetch } from "./hiro-fetch";
import type { ContractSet } from "./nayori-next/contract-sets";

const API =
  NETWORK_NAME === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

export const EXPLORER = "https://explorer.hiro.so";
export const CHAIN_PARAM = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";

export interface IndexedContract {
  /** Full contract id, deployer included. */
  id: string;
  /** Contract name without the deployer. */
  name: string;
  set: ContractSet;
}

const NEXT_IDS = nextContractIds(NETWORK_NAME);
const nayori = (id: string): IndexedContract => ({ id, name: id.split(".")[1], set: "nayori" });
const earlier = (name: string): IndexedContract => ({ id: `${CONTRACT_ADDRESS}.${name}`, name, set: "earlier" });

/** Every contract the stats, activity and evidence pages index: the Nayori contracts first. */
export const INDEXED_CONTRACTS: readonly IndexedContract[] = [
  nayori(NEXT_IDS.escrowSbtc),
  nayori(NEXT_IDS.escrowStx),
  nayori(NEXT_IDS.agents),
  nayori(NEXT_IDS.applications),
  nayori(NEXT_IDS.reputation),
  nayori(NEXT_IDS.permissions),
  nayori(NEXT_IDS.roles),
  earlier("agent-registry"),
  earlier(STX_COMMERCE_CONTRACT_NAME),
  earlier("validation-registry"),
  earlier(SBTC_COMMERCE_CONTRACT_NAME),
  earlier(REPUTATION_CONTRACT_NAME),
];

export const NAYORI_DEPLOYER = NEXT_DEPLOYERS[NETWORK_NAME];

export interface RecentTx {
  txId: string;
  /** Contract name without the deployer. */
  contract: string;
  contractId: string;
  set: ContractSet;
  fn: string;
  sender: string;
  status: string;
  time?: string;
  blockHeight?: number;
}

export interface OnchainStats {
  network: string;
  /** Deployer of the earlier contracts. */
  deployer: string;
  /** Deployer of the Nayori contracts. */
  nayoriDeployer: string;
  totalTx: number;
  contractCalls: number;
  successfulContractCalls: number;
  distinctWallets: number;
  feesSTX: number;
  indexedTransactions: number;
  truncated: boolean;
  perContract: { name: string; id: string; set: ContractSet; total: number }[];
  recent: RecentTx[];
  /**
   * Wallets with a successful transaction on nayori-agents, newest first. Every agent wallet is
   * among them (registration needs tx-sender to be the wallet); confirm each with get-agent.
   */
  nayoriAgentCandidates: string[];
}

const PAGE_SIZE = 50;
const MAX_INDEXED_PER_CONTRACT = 1000;

async function getContractTransactions(contract: IndexedContract, allPages: boolean, strict = false) {
  const collected: any[] = [];
  let total = 0;
  let offset = 0;
  do {
    const r = await hiroFetch(
      `${API}/extended/v1/address/${contract.id}/transactions?limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (!r.ok) {
      if (strict) throw new Error(`Hiro returned ${r.status} for ${contract.id}.`);
      return { total: 0, results: [], truncated: false };
    }
    const data = await r.json();
    const page: any[] = data.results ?? [];
    total = typeof data.total === "number" ? data.total : page.length;
    collected.push(...page);
    offset += page.length;
    if (!allPages || page.length < PAGE_SIZE) break;
  } while (offset < total && offset < MAX_INDEXED_PER_CONTRACT);
  return { total, results: collected, truncated: total > collected.length };
}

const NAYORI_AGENTS_ID = NEXT_IDS.agents;

/**
 * One row per contract call. A call into an indexed contract that calls another indexed contract
 * appears in both histories; the row belongs to the contract the transaction called.
 */
function toRecentTx(tx: any, indexed: IndexedContract): RecentTx {
  const target = INDEXED_CONTRACTS.find((c) => c.id === tx.contract_call?.contract_id) ?? indexed;
  return {
    txId: tx.tx_id,
    contract: target.name,
    contractId: target.id,
    set: target.set,
    fn: tx.contract_call?.function_name ?? "",
    sender: tx.sender_address,
    status: tx.tx_status,
    time: tx.block_time_iso,
    blockHeight: Number(tx.block_height ?? 0) || undefined,
  };
}

/** Senders of successful nayori-agents transactions, newest first, without repeats. */
export function nayoriAgentCandidatesFrom(results: any[]): string[] {
  const seen = new Set<string>();
  const wallets: string[] = [];
  for (const tx of results) {
    const sender = tx?.sender_address;
    if (tx?.tx_status !== "success" || typeof sender !== "string") continue;
    const key = sender.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    wallets.push(sender);
  }
  return wallets;
}

export async function getOnchainStats(
  options: { strict?: boolean; recentLimit?: number } = {}
): Promise<OnchainStats> {
  let summedTotals = 0;
  let contractCalls = 0;
  let successfulContractCalls = 0;
  let feesMicro = 0;
  const wallets = new Set<string>();
  const seenTx = new Set<string>();
  const perContract: OnchainStats["perContract"] = [];
  const recent: RecentTx[] = [];
  let truncated = false;
  let nayoriAgentCandidates: string[] = [];

  const contractResults = await Promise.all(
    INDEXED_CONTRACTS.map(async (contract) => ({
      contract,
      data: await getContractTransactions(contract, true, options.strict).catch((error) => {
        if (options.strict) throw error;
        return {
          total: 0,
          results: [] as any[],
          truncated: false,
        };
      }),
    }))
  );

  for (const { contract: c, data } of contractResults) {
    perContract.push({ name: c.name, id: c.id, set: c.set, total: data.total });
    summedTotals += data.total;
    truncated ||= data.truncated;
    if (c.id === NAYORI_AGENTS_ID) nayoriAgentCandidates = nayoriAgentCandidatesFrom(data.results);

    for (const tx of data.results) {
      if (!tx.tx_id || seenTx.has(tx.tx_id)) continue;
      seenTx.add(tx.tx_id);
      if (tx.sender_address) wallets.add(tx.sender_address);
      feesMicro += Number(tx.fee_rate ?? 0);
      if (tx.tx_type === "contract_call") {
        contractCalls += 1;
        if (tx.tx_status === "success") successfulContractCalls += 1;
        recent.push(toRecentTx(tx, c));
      }
    }
  }

  recent.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));

  return {
    network: CHAIN_PARAM,
    deployer: CONTRACT_ADDRESS,
    nayoriDeployer: NAYORI_DEPLOYER,
    // Complete histories are counted once per transaction; a truncated one can only sum the
    // per-contract totals, which count a call shared by two contracts twice.
    totalTx: truncated ? summedTotals : seenTx.size,
    contractCalls,
    successfulContractCalls,
    distinctWallets: wallets.size,
    feesSTX: feesMicro / 1e6,
    indexedTransactions: seenTx.size,
    truncated,
    perContract,
    recent: recent.slice(0, options.recentLimit ?? 12),
    nayoriAgentCandidates,
  };
}

/** Candidate agent wallets on nayori-agents (see `OnchainStats.nayoriAgentCandidates`). */
export async function getNayoriAgentCandidates(): Promise<string[]> {
  const agents = INDEXED_CONTRACTS.find((c) => c.id === NAYORI_AGENTS_ID)!;
  const data = await getContractTransactions(agents, true).catch(() => ({ results: [] as any[] }));
  return nayoriAgentCandidatesFrom(data.results);
}

// Current Stacks tip height, used to compute real job expiry blocks.
export async function getBlockHeight(): Promise<number> {
  try {
    const r = await hiroFetch(`${API}/v2/info`, { cache: "no-store" });
    if (!r.ok) return 0;
    const d = await r.json();
    return Number(d.stacks_tip_height ?? 0);
  } catch {
    return 0;
  }
}

// Current Bitcoin height observed by Stacks. Versioned escrow review windows
// use burn-block-height, not the faster Stacks block height.
export async function getBurnBlockHeight(): Promise<number> {
  try {
    const r = await hiroFetch(`${API}/v2/info`, { cache: "no-store" });
    if (!r.ok) return 0;
    const d = await r.json();
    return Number(d.burn_block_height ?? 0);
  } catch {
    return 0;
  }
}

// Full on-chain activity log: contract calls across both contract sets, newest first.
export async function getRecentActivity(limit = 40): Promise<RecentTx[]> {
  const pages = await Promise.all(
    INDEXED_CONTRACTS.map(async (contract) => ({
      contract,
      data: await getContractTransactions(contract, false).catch(() => ({
        total: 0,
        results: [] as any[],
        truncated: false,
      })),
    }))
  );
  const seen = new Set<string>();
  const all: RecentTx[] = [];
  for (const { contract, data } of pages) {
    for (const tx of data.results) {
      if (tx?.tx_type !== "contract_call" || !tx.tx_id || seen.has(tx.tx_id)) continue;
      seen.add(tx.tx_id);
      all.push(toRecentTx(tx, contract));
    }
  }
  all.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
  return all.slice(0, limit);
}
