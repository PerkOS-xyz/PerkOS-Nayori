import { EXPLORER, CHAIN_PARAM } from "./onchain-stats";
import { hiroFetch } from "./hiro-fetch";
import { NETWORK_NAME } from "../constants/network";

const API = NETWORK_NAME === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const txExplorer = (txid: string) => `${EXPLORER}/txid/${txid}?chain=${CHAIN_PARAM}`;

// connect v8 returns the broadcast id under txid or txId depending on the wallet.
export function txIdOf(res: any): string | undefined {
  return res?.txid ?? res?.txId ?? res?.txID;
}

export async function txStatus(txid: string): Promise<string> {
  try {
    const r = await hiroFetch(`${API}/extended/v1/tx/${txid}`, { cache: "no-store" });
    if (!r.ok) return "pending";
    const d = await r.json();
    return d.tx_status ?? "pending";
  } catch {
    return "pending";
  }
}

interface Toaster {
  info: (m: string, href?: string) => void;
  success: (m: string, href?: string) => void;
  error: (m: string, href?: string) => void;
}

// Read-only contract calls can trail the transaction index by a block when the confirmation is
// first observed, so a single refresh may still read the previous state. Refresh again after
// these delays to pick up the settled state without asking the user to reload.
export const SETTLE_REFRESH_DELAYS_MS = [5_000, 15_000] as const;

interface TrackOptions {
  pollIntervalMs?: number;
  maxPolls?: number;
  settleRefreshDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<unknown>;
}

// Toast on submit, poll the chain, then toast + refresh on confirmation.
export async function trackTx(
  txid: string,
  toast: Toaster,
  onConfirmed?: () => void,
  onStatus?: (status: "pending" | "success" | "failed") => void,
  options: TrackOptions = {}
) {
  const wait = options.sleep ?? sleep;
  const pollIntervalMs = options.pollIntervalMs ?? 8000;
  const maxPolls = options.maxPolls ?? 24;
  const settleDelays = options.settleRefreshDelaysMs ?? SETTLE_REFRESH_DELAYS_MS;
  toast.info("Transaction submitted", txExplorer(txid));
  onStatus?.("pending");
  for (let i = 0; i < maxPolls; i++) {
    await wait(pollIntervalMs);
    const s = await txStatus(txid);
    if (s === "success") {
      onStatus?.("success");
      toast.success("Confirmed on-chain", txExplorer(txid));
      onConfirmed?.();
      if (onConfirmed) {
        let elapsed = 0;
        for (const delay of settleDelays) {
          await wait(Math.max(0, delay - elapsed));
          elapsed = delay;
          onConfirmed();
        }
      }
      return;
    }
    if (s.startsWith("abort")) {
      onStatus?.("failed");
      toast.error("Transaction failed on-chain", txExplorer(txid));
      return;
    }
  }
  onStatus?.("pending");
  toast.info("Still pending, check the explorer", txExplorer(txid));
}
