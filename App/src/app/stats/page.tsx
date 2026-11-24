'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Users,
  Fingerprint,
  Briefcase,
  Coins,
  FileCode2,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { getAgentCount } from "../../services/agent-registry";
import { getCommerceJobCount } from "../../services/commerce";
import { getOnchainStats, EXPLORER, CHAIN_PARAM, OnchainStats } from "../../services/onchain-stats";
import { getNextAgentCount, getNextJobCount } from "../../services/nayori-next/reads";
import { NAYORI_FUNCTION_LABELS } from "../../services/nayori-next/activity-labels";
import { CONTRACT_SETS, CONTRACT_SET_LABELS, type ContractSet } from "../../services/nayori-next/contract-sets";
import { CONTRACT_ADDRESS } from "../../constants/contract";
import { PRODUCT_NAME } from "../../constants/brand";

interface SetCounts {
  agents: number;
  jobs: number;
}

/** Counts of one contract set, or null when that set could not be read. */
async function readCounts(set: ContractSet): Promise<SetCounts | null> {
  try {
    const [agents, sbtcJobs, stxJobs] =
      set === "nayori"
        ? await Promise.all([getNextAgentCount(), getNextJobCount("sbtc"), getNextJobCount("stx")])
        : await Promise.all([getAgentCount(), getCommerceJobCount("sbtc"), getCommerceJobCount("stx")]);
    return { agents, jobs: sbtcJobs + stxJobs };
  } catch (error) {
    console.error(`Error loading the ${set} contract counts:`, error);
    return null;
  }
}

const fnLabel = (set: ContractSet, fn: string) =>
  (set === "nayori" ? NAYORI_FUNCTION_LABELS[fn]?.label : undefined) ?? FN_LABEL[fn] ?? fn;

const shorten = (a: string) => (a ? `${a.slice(0, 5)}…${a.slice(-4)}` : "");
const FN_LABEL: Record<string, string> = {
  "register-agent": "Agent registered",
  "update-agent": "Agent updated",
  "deactivate-agent": "Agent deactivated",
  "create-job": "Job created",
  "set-budget": "Budget set",
  "fund-job": "Job funded",
  "assign-provider": "Provider assigned",
  "submit-work": "Work submitted",
  "complete-job": "Job completed",
  "reject-job": "Job rejected",
  "expire-job": "Job expired and refunded",
  "settle-review-timeout": "Review timeout paid to provider",
  "record-decision": "Nayori decision recorded",
  "appeal-decision": "Decision appealed",
  "finalize-decision": "Decision finalized",
  "resolve-appeal": "Appeal resolved",
  "settle-appeal-timeout": "Appeal timeout finalized",
  "retry-reputation-sync": "Reputation sync retried",
  "rate-provider": "Provider rated",
  "rate-agent": "Agent rated",
  "add-protocol-caller": "Protocol caller added",
  "verify-agent": "Agent verified",
};

export default function StatsPage() {
  const [counts, setCounts] = useState<Record<ContractSet, SetCounts | null>>({ nayori: null, earlier: null });
  const [stats, setStats] = useState<OnchainStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [nayori, earlier, s] = await Promise.all([
        readCounts("nayori"),
        readCounts("earlier"),
        getOnchainStats(),
      ]);
      setCounts({ nayori, earlier });
      setStats(s);
      setLoading(false);
    })();
  }, []);

  const total = (key: keyof SetCounts) => (counts.nayori?.[key] ?? 0) + (counts.earlier?.[key] ?? 0);
  const split = (key: keyof SetCounts) =>
    `${counts.nayori?.[key] ?? "—"} Nayori · ${counts.earlier?.[key] ?? "—"} earlier`;
  const setTotals = (set: ContractSet) =>
    (stats?.perContract ?? []).filter((c) => c.set === set).reduce((sum, c) => sum + c.total, 0);

  const metrics = [
    { icon: Fingerprint, label: "Agents registered", value: total("agents"), detail: split("agents") },
    { icon: Briefcase, label: "Jobs created", value: total("jobs"), detail: split("jobs") },
    { icon: Activity, label: "On-chain transactions", value: stats?.totalTx ?? 0 },
    { icon: Users, label: "Distinct wallets", value: stats?.distinctWallets ?? 0 },
    { icon: Coins, label: "Fees (STX)", value: stats ? stats.feesSTX.toFixed(3) : "0" },
    { icon: FileCode2, label: "Indexed contracts", value: stats?.perContract.length ?? 0 },
  ];

  return (
    <div className="container-x py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            On-chain data · Stacks {CHAIN_PARAM}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">On-chain Activity</h1>
          <p className="mt-1.5 text-mist-300">
            Real, verifiable usage of the contracts behind {PRODUCT_NAME}. Every number is on-chain.
          </p>
        </div>
        <Link href="/agents" className="btn-primary">
          <Plus className="h-4 w-4" /> Register your agent
        </Link>
      </div>

      {/* Metrics */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="card p-5">
            <m.icon className="h-4 w-4 text-mist-500" strokeWidth={1.75} />
            <p className="mt-3 font-mono text-2xl font-semibold tracking-tight text-white">
              {loading ? "—" : m.value}
            </p>
            <p className="mt-1 text-xs text-mist-500">{m.label}</p>
            {"detail" in m && !loading && <p className="mt-0.5 text-[11px] text-mist-500">{m.detail}</p>}
          </div>
        ))}
      </div>
      {!loading && (counts.nayori === null || counts.earlier === null) && (
        <p className="mt-3 text-xs text-amber-300">
          Some counts are still on their way from the chain. Refresh in a moment for the complete totals.
        </p>
      )}

      {/* Per-contract, one group per contract set */}
      {CONTRACT_SETS.map((set) => (
        <section key={set}>
          <div className="mt-10 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mist-500">{CONTRACT_SET_LABELS[set]}</h2>
            {stats && (
              <span className="text-xs text-mist-500">
                {setTotals(set).toLocaleString()} transactions · deployer {shorten(set === "nayori" ? stats.nayoriDeployer : stats.deployer)}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(stats?.perContract ?? []).filter((c) => c.set === set).map((c) => (
              <a
                key={c.id}
                href={`${EXPLORER}/address/${c.id}?chain=${CHAIN_PARAM}`}
                target="_blank"
                rel="noopener noreferrer"
                className="card card-hover group p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">{c.name}</span>
                  <ArrowUpRight className="h-4 w-4 text-mist-500 transition group-hover:text-brand-400" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold text-white">{c.total}</p>
                <p className="mt-1 text-xs text-mist-500">transactions</p>
              </a>
            ))}
          </div>
        </section>
      ))}

      {/* Recent activity */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-mist-500">Recent activity</h2>
      <div className="mt-3 card divide-y divide-white/[0.06]">
        {loading ? (
          <div className="p-8 text-center text-sm text-mist-500">Loading on-chain activity…</div>
        ) : (stats?.recent.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-mist-500">No contract calls yet.</div>
        ) : (
          stats!.recent.map((t) => (
            <a
              key={t.txId}
              href={`${EXPLORER}/txid/${t.txId}?chain=${CHAIN_PARAM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 p-4 transition hover:bg-white/[0.02]"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  t.status === "success" ? "bg-emerald-400" : "bg-mist-500"
                }`}
              />
              <span className="w-44 shrink-0 text-sm font-medium text-white">
                {fnLabel(t.set, t.fn)}
              </span>
              <span className="hidden font-mono text-xs text-mist-500 sm:inline">{t.contract}</span>
              <span className="hidden rounded border border-white/10 px-1.5 text-[10px] text-mist-300 md:inline">
                {CONTRACT_SET_LABELS[t.set]}
              </span>
              <span className="ml-auto font-mono text-xs text-mist-300">{shorten(t.sender)}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-mist-500 transition group-hover:text-brand-400" />
            </a>
          ))
        )}
      </div>

      <p className="mt-6 text-xs text-mist-500">
        Source: Hiro API for the Nayori contracts ({stats?.nayoriDeployer ?? "…"}) and the earlier contracts ({CONTRACT_ADDRESS}) on Stacks {CHAIN_PARAM}. Click any row to verify on the explorer.
        {stats?.truncated
          ? ` Wallet and fee totals are based on ${stats.indexedTransactions.toLocaleString()} indexed transactions; contract totals remain complete.`
          : " Wallet and fee totals include every indexed transaction."}
      </p>
    </div>
  );
}
