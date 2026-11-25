import type { NextAsset } from "../../constants/nayori-next";

/**
 * A multisig proposal lives in Leather, not on chain, until a member broadcasts it. The page
 * remembers, per browser, that this job already has one, so a reload or another member on the
 * same vault account sees the steps instead of the buttons. Browser storage can be missing or
 * blocked; then the page simply shows the buttons again.
 */
export interface PendingProposal {
  action: string;
  createdAt: number;
}

const key = (asset: NextAsset, jobId: number) => `nayori:proposal:${asset}:${jobId}`;

export function readPendingProposal(asset: NextAsset, jobId: number, storage?: Storage | null): PendingProposal | null {
  try {
    const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const raw = store?.getItem(key(asset, jobId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingProposal>;
    if (typeof value.action !== "string" || typeof value.createdAt !== "number") return null;
    return { action: value.action, createdAt: value.createdAt };
  } catch {
    return null;
  }
}

export function rememberPendingProposal(asset: NextAsset, jobId: number, action: string, storage?: Storage | null): void {
  try {
    const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    store?.setItem(key(asset, jobId), JSON.stringify({ action, createdAt: Date.now() }));
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
