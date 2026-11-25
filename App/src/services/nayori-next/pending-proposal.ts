import type { NextAsset } from "../../constants/nayori-next";

/**
 * A multisig proposal lives in Leather, not on chain, until a member broadcasts it. The page
 * remembers, in this browser only, that this job already has one, so a reload shows the steps
 * instead of the buttons. Other browsers and profiles do not see it. Browser storage can be missing
 * or blocked; then the page simply shows the buttons again.
 */
export interface PendingProposal {
  action: string;
  createdAt: number;
  /** The transaction id once the wallet reported one, to notice a proposal that failed on chain. */
  txid?: string;
}

const key = (asset: NextAsset, jobId: number) => `nayori:proposal:${asset}:${jobId}`;

export function readPendingProposal(asset: NextAsset, jobId: number, storage?: Storage | null): PendingProposal | null {
  try {
    const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const raw = store?.getItem(key(asset, jobId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingProposal>;
    if (typeof value.action !== "string" || typeof value.createdAt !== "number") return null;
    return typeof value.txid === "string" && /^(0x)?[0-9a-f]{64}$/i.test(value.txid)
      ? { action: value.action, createdAt: value.createdAt, txid: value.txid }
      : { action: value.action, createdAt: value.createdAt };
  } catch {
    return null;
  }
}

export function rememberPendingProposal(
  asset: NextAsset,
  jobId: number,
  action: string,
  txid?: string,
  storage?: Storage | null
): void {
  try {
    const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const createdAt = readPendingProposal(asset, jobId, store)?.createdAt ?? Date.now();
    store?.setItem(key(asset, jobId), JSON.stringify(txid ? { action, createdAt, txid } : { action, createdAt }));
  } catch {
    // Storage unavailable: the in-page state still covers this visit.
  }
}

export function forgetPendingProposal(asset: NextAsset, jobId: number, storage?: Storage | null): void {
  try {
    const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    store?.removeItem(key(asset, jobId));
  } catch {
    // Nothing to clear.
  }
}
