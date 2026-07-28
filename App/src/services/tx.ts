import { EXPLORER, CHAIN_PARAM } from "./onchain-stats";
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
    const r = await fetch(`${API}/extended/v1/tx/${txid}`, { cache: "no-store" });
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

// Toast on submit, poll the chain, then toast + refresh on confirmation.
export async function trackTx(txid: string, toast: Toaster, onConfirmed?: () => void) {
  toast.info("Transaction submitted", txExplorer(txid));
  for (let i = 0; i < 24; i++) {
    await sleep(8000);
    const s = await txStatus(txid);
    if (s === "success") {
      toast.success("Confirmed on-chain", txExplorer(txid));
      onConfirmed?.();
      return;
    }
    if (s.startsWith("abort")) {
      toast.error("Transaction failed on-chain", txExplorer(txid));
      return;
    }
  }
  toast.info("Still pending, check the explorer", txExplorer(txid));
  onConfirmed?.();
}
