import { ExternalLink } from "lucide-react";
import { NAYORI_NEXT } from "../../constants/nayori-next";
import { EXPLORER } from "../../services/onchain-stats";
import { NEXT_STATUS_LABELS, NEXT_STATUS_TONE } from "../../services/nayori-next/status";
import { statusName } from "../../services/nayori-next/parse";
import { txExplorer } from "../../services/tx";
import { LEATHER_MULTISIG_URL } from "../../services/nayori-next/multisig";
import { shortAddr } from "../../utils/format";
import type { NextTxProgress } from "./useNextWallet";

const TONE_CLASSES = {
  neutral: { dot: "bg-mist-500", cls: "border-white/10 text-mist-300" },
  active: { dot: "bg-brand-400", cls: "border-brand/30 text-brand-300" },
  warn: { dot: "bg-amber-400", cls: "border-amber-500/30 text-amber-300" },
  good: { dot: "bg-emerald-400", cls: "border-emerald-500/30 text-emerald-300" },
  bad: { dot: "bg-red-400", cls: "border-red-500/30 text-red-300" },
} as const;

export function NextStatusBadge({ status }: { status: number }) {
  let label = "Unknown";
  let tone: keyof typeof TONE_CLASSES = "neutral";
  try {
    const name = statusName(status);
    label = NEXT_STATUS_LABELS[name];
    tone = NEXT_STATUS_TONE[name];
  } catch {
    // An unknown status keeps the neutral badge.
  }
  const c = TONE_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

/** A principal on the Nayori contracts' network, linked to the explorer. */
export function NextAddr({ value, className = "" }: { value?: string | null; className?: string }) {
  if (!value) return <span className={`text-mist-500 ${className}`}>Not set</span>;
  return (
    <a
      href={`${EXPLORER}/address/${value}?chain=${NAYORI_NEXT.network}`}
      target="_blank"
      rel="noopener noreferrer"
      title={value}
      className={`font-mono transition hover:text-brand-300 ${className}`}
    >
      {shortAddr(value)}
    </a>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-mist-500">{label}</p>
      <div className="mt-1.5 text-sm">{children}</div>
    </div>
  );
}

const STATE_TEXT: Record<NextTxProgress["state"], string> = {
  awaiting: "Waiting for the wallet",
  submitted: "Submitted",
  pending: "Pending",
  proposed: "Proposal created: approve it in Leather multisig, then Broadcast",
  confirmed: "Confirmed",
  failed: "",
};

export function TxProgressBar({ progress }: { progress: NextTxProgress | null }) {
  if (!progress) return null;
  const failed = progress.state === "failed";
  const proposed = progress.state === "proposed";
  return (
    <div
      role="status"
      className={`mt-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
        failed
          ? "border-red-500/30 bg-red-500/10 text-red-200"
          : proposed
            ? "border-violet-500/30 bg-violet-500/10 text-violet-100"
            : "border-brand/25 bg-brand/[0.06] text-mist-200"
      }`}
    >
      <span className="font-medium">{progress.label}</span>
      {!failed && <span className="text-mist-400">{STATE_TEXT[progress.state]}</span>}
      {proposed && (
        <a href={LEATHER_MULTISIG_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
          Open Leather multisig <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {progress.txid && (
        <a
          href={txExplorer(progress.txid, NAYORI_NEXT.network)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 underline"
        >
          Explorer <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {progress.note && <p className="w-full text-xs text-mist-300">{progress.note}</p>}
    </div>
  );
}

export function NextBanner() {
  return (
    <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
      Nayori contracts on {NAYORI_NEXT.network}. Every deadline is counted in Bitcoin blocks (about
      10 minutes each), and the sBTC escrow settles in canonical sBTC.
    </div>
  );
}
