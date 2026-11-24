'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Fingerprint,
  Briefcase,
  Coins,
  CheckCircle2,
  XCircle,
  Star,
  BadgeCheck,
  ExternalLink,
  Download,
} from "lucide-react";
import { getRecentActivity, EXPLORER, CHAIN_PARAM, RecentTx } from "../../services/onchain-stats";
import { NAYORI_FUNCTION_LABELS, type ActivityCategory } from "../../services/nayori-next/activity-labels";
import { CONTRACT_SETS, CONTRACT_SET_LABELS, type ContractSet } from "../../services/nayori-next/contract-sets";

const FN: Record<string, { label: string; cat: string; icon: any; cls: string }> = {
  "register-agent": { label: "Agent registered", cat: "agents", icon: Fingerprint, cls: "border-brand/30 text-brand-300" },
  "update-agent": { label: "Agent updated", cat: "agents", icon: Fingerprint, cls: "border-white/10 text-mist-300" },
  "deactivate-agent": { label: "Agent deactivated", cat: "agents", icon: Fingerprint, cls: "border-white/10 text-mist-500" },
  "rate-agent": { label: "Agent rated", cat: "agents", icon: Star, cls: "border-amber-500/30 text-amber-300" },
  "verify-agent": { label: "Agent verified", cat: "agents", icon: BadgeCheck, cls: "border-brand/30 text-brand-300" },
  "create-job": { label: "Job created", cat: "jobs", icon: Briefcase, cls: "border-white/10 text-mist-300" },
  "set-budget": { label: "Budget set", cat: "jobs", icon: Briefcase, cls: "border-white/10 text-mist-300" },
  "assign-provider": { label: "Provider assigned", cat: "jobs", icon: Briefcase, cls: "border-white/10 text-mist-300" },
  "submit-work": { label: "Work submitted", cat: "jobs", icon: Briefcase, cls: "border-brand/30 text-brand-300" },
  "fund-job": { label: "Job funded", cat: "funded", icon: Coins, cls: "border-bitcoin/30 text-bitcoin-400" },
  "complete-job": { label: "Job completed", cat: "completed", icon: CheckCircle2, cls: "border-emerald-500/30 text-emerald-300" },
  "reject-job": { label: "Job rejected", cat: "rejected", icon: XCircle, cls: "border-red-500/30 text-red-300" },
  "settle-review-timeout": { label: "Review timeout paid", cat: "timeout", icon: Coins, cls: "border-amber-500/30 text-amber-300" },
  "record-decision": { label: "Nayori decision recorded", cat: "jobs", icon: BadgeCheck, cls: "border-violet-500/30 text-violet-300" },
  "appeal-decision": { label: "Decision appealed", cat: "jobs", icon: XCircle, cls: "border-fuchsia-500/30 text-fuchsia-300" },
  "finalize-decision": { label: "Decision finalized", cat: "completed", icon: CheckCircle2, cls: "border-emerald-500/30 text-emerald-300" },
  "resolve-appeal": { label: "Appeal resolved", cat: "jobs", icon: BadgeCheck, cls: "border-violet-500/30 text-violet-300" },
  "settle-appeal-timeout": { label: "Appeal timeout finalized", cat: "timeout", icon: Coins, cls: "border-amber-500/30 text-amber-300" },
  "retry-reputation-sync": { label: "Reputation sync retried", cat: "jobs", icon: RefreshCw, cls: "border-brand/30 text-brand-300" },
};

const CATEGORY_STYLE: Record<ActivityCategory, { icon: any; cls: string }> = {
  agents: { icon: Fingerprint, cls: "border-brand/30 text-brand-300" },
  jobs: { icon: Briefcase, cls: "border-white/10 text-mist-300" },
  funded: { icon: Coins, cls: "border-bitcoin/30 text-bitcoin-400" },
  completed: { icon: CheckCircle2, cls: "border-emerald-500/30 text-emerald-300" },
  rejected: { icon: XCircle, cls: "border-red-500/30 text-red-300" },
  timeout: { icon: Coins, cls: "border-amber-500/30 text-amber-300" },
};

/** Function names repeat across the two sets, so a Nayori call reads the Nayori names first. */
function metaFor(t: RecentTx) {
  const nayori = t.set === "nayori" ? NAYORI_FUNCTION_LABELS[t.fn] : undefined;
  if (nayori) return { label: nayori.label, cat: nayori.category, ...CATEGORY_STYLE[nayori.category] };
  return FN[t.fn] ?? { label: t.fn, cat: "other", icon: Briefcase, cls: "border-white/10 text-mist-300" };
}

const SET_FILTERS: Record<"all" | ContractSet, string> = {
  all: "All contracts",
  nayori: CONTRACT_SET_LABELS.nayori,
  earlier: CONTRACT_SET_LABELS.earlier,
};

const FILTERS: Record<string, string> = {
  all: "All",
  agents: "Agents",
  jobs: "Jobs",
  funded: "Funded",
  completed: "Completed",
  rejected: "Rejected",
  timeout: "Timeout paid",
};

const shorten = (a: string) => (a ? `${a.slice(0, 5)}…${a.slice(-4)}` : "");
const fmt = (t?: string) => (t ? new Date(t).toLocaleString() : "");

export default function ActivityLogPage() {
  const [items, setItems] = useState<RecentTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [contractSetFilter, setContractSetFilter] = useState<"all" | ContractSet>("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setItems(await getRecentActivity(50));
    setLoading(false);
  }

  function downloadReport() {
    const head = ["time", "type", "contract set", "contract", "function", "sender", "status", "tx", "explorer"];
    const rows = items.map((t) => [
      t.time ?? "",
      metaFor(t).label,
      CONTRACT_SET_LABELS[t.set],
      t.contractId,
      t.fn,
      t.sender,
      t.status,
      t.txId,
      `${EXPLORER}/txid/${t.txId}?chain=${CHAIN_PARAM}`,
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `perkos-activity-${CHAIN_PARAM}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = items.filter(
    (i) => (filter === "all" || metaFor(i).cat === filter) && (contractSetFilter === "all" || i.set === contractSetFilter)
  );

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
          <p className="mt-1.5 text-mist-300">
            Every contract call on the Nayori contracts and the earlier contracts, newest first. Click any row to verify.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadReport} disabled={!items.length} className="btn-ghost disabled:opacity-40">
            <Download className="h-4 w-4" /> Report (CSV)
          </button>
          <button onClick={load} className="btn-ghost">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", ...CONTRACT_SETS] as const).map((key) => (
          <button
            key={key}
            onClick={() => setContractSetFilter(key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              contractSetFilter === key ? "bg-brand/15 text-white" : "border border-white/[0.08] text-mist-300 hover:text-white"
            }`}
          >
            {SET_FILTERS[key]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              filter === key ? "bg-white/[0.08] text-white" : "border border-white/[0.08] text-mist-300 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Reading the chain…</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-mist-500">No activity in this view yet.</p>
      ) : (
        <div className="mt-6 card divide-y divide-white/[0.06]">
          {filtered.map((t) => {
            const meta = metaFor(t);
            const Icon = meta.icon;
            return (
              <a
                key={t.txId}
                href={`${EXPLORER}/txid/${t.txId}?chain=${CHAIN_PARAM}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-4 transition hover:bg-white/[0.02]"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white/[0.02] ${meta.cls}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{meta.label}</span>
                    <span className="rounded border border-white/10 px-1.5 text-[10px] text-mist-300">{CONTRACT_SET_LABELS[t.set]}</span>
                    {t.status !== "success" && (
                      <span className="rounded border border-red-500/30 px-1.5 text-[10px] text-red-300">{t.status}</span>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-mist-500">{t.contract}</p>
                </div>
                <span className="hidden text-xs text-mist-500 sm:inline">{fmt(t.time)}</span>
                <span className="font-mono text-xs text-mist-300">{shorten(t.sender)}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-mist-500 transition group-hover:text-brand-400" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
