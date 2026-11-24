'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Fingerprint, Briefcase, CheckCircle2, Activity as ActivityIcon } from "lucide-react";
import { getAgentCount } from "../../services/agent-registry";
import { getAllCommerceJobs, getCommerceJobCount } from "../../services/commerce";
import { getOnchainStats, OnchainStats } from "../../services/onchain-stats";
import { getNextAgentCount } from "../../services/nayori-next/reads";
import { getNextJobsOverview, nextIsCompleted } from "../../services/nayori-next/overview";
import { NEXT_STATUS_NAMES } from "../../services/nayori-next/parse";
import { NEXT_STATUS_LABELS } from "../../services/nayori-next/status";
import { CONTRACT_SETS, CONTRACT_SET_LABELS, shortContractName, type ContractSet } from "../../services/nayori-next/contract-sets";
import { formatSbtcCompact, formatStx } from "../../utils/format";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorMessage from "../../components/ErrorMessage";

const EARLIER_STATUS_LABELS = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
  "Timeout paid",
  "Decision pending",
  "Disputed",
];
const NAYORI_STATUS_LABELS = NEXT_STATUS_NAMES.map((name) => NEXT_STATUS_LABELS[name]);
const EARLIER_COMPLETED = 3;

/** The common shape of a job from either contract set, enough for these analytics. */
interface JobPoint {
  asset: "sbtc" | "stx";
  status: number;
  budget: number;
  escrow: number;
  completed: boolean;
}

interface SetData {
  agents: number;
  jobs: number;
  sbtcJobs: number;
  stxJobs: number;
  indexed: JobPoint[];
  byStatus: number[];
}

interface Data {
  sets: Record<ContractSet, SetData | null>;
  chain: OnchainStats;
}

function buildSetData(agents: number, sbtcJobs: number, stxJobs: number, indexed: JobPoint[], labels: string[]): SetData {
  const byStatus = Array.from({ length: labels.length }, () => 0);
  for (const job of indexed) {
    if (job.status >= 0 && job.status < labels.length) byStatus[job.status]++;
  }
  return { agents, jobs: sbtcJobs + stxJobs, sbtcJobs, stxJobs, indexed, byStatus };
}

async function loadNayori(): Promise<SetData | null> {
  try {
    const [agents, overview] = await Promise.all([
      getNextAgentCount(),
      getNextJobsOverview({ limitPerAsset: 100, includeEscrow: true }),
    ]);
    const indexed = overview.jobs.map((job) => ({
      asset: job.asset,
      status: job.status,
      budget: job.budget,
      escrow: job.escrow ?? 0,
      completed: nextIsCompleted(job),
    }));
    return buildSetData(agents, overview.counts.sbtc, overview.counts.stx, indexed, NAYORI_STATUS_LABELS);
  } catch (error) {
    console.error("Analytics: the Nayori contracts did not answer:", error);
    return null;
  }
}

const sum = (jobs: JobPoint[], pick: (job: JobPoint) => number) => jobs.reduce((total, job) => total + pick(job), 0);
const average = (jobs: JobPoint[]) => {
  const budgeted = jobs.filter((job) => job.budget > 0);
  return budgeted.length ? sum(budgeted, (job) => job.budget) / budgeted.length : 0;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agents, sbtcCount, stxCount, jobs, chain, nayori] = await Promise.all([
        getAgentCount(),
        getCommerceJobCount("sbtc"),
        getCommerceJobCount("stx"),
        getAllCommerceJobs({ includeEscrow: true, limitPerCurrency: 100 }),
        getOnchainStats(),
        loadNayori(),
      ]);
      const earlierIndexed = jobs.map((job) => ({
        asset: job.currency,
        status: job.status,
        budget: job.budget,
        escrow: job.escrow || 0,
        completed: job.status === EARLIER_COMPLETED,
      }));
      setData({
        sets: {
          nayori,
          earlier: buildSetData(agents, sbtcCount, stxCount, earlierIndexed, EARLIER_STATUS_LABELS),
        },
        chain,
      });
    } catch (err) {
      console.error("Analytics error:", err);
      setError("Failed to load analytics data");
    }
    setLoading(false);
  }

  if (loading) return <LoadingSpinner text="Loading analytics…" />;

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1.5 text-mist-300">Protocol metrics across the Nayori contracts and the earlier contracts, computed live from on-chain state.</p>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="mt-6"><ErrorMessage message={error} onRetry={load} /></div>}

      {data && (() => {
        const loaded = CONTRACT_SETS.map((set) => data.sets[set]).filter((set): set is SetData => Boolean(set));
        const total = (pick: (set: SetData) => number) => loaded.reduce((acc, set) => acc + pick(set), 0);
        const indexed = loaded.flatMap((set) => set.indexed);
        const sbtc = indexed.filter((job) => job.asset === "sbtc");
        const stx = indexed.filter((job) => job.asset === "stx");
        const completed = indexed.filter((job) => job.completed).length;
        const jobs = total((set) => set.jobs);
        const completionRate = indexed.length > 0 ? Math.round((completed / indexed.length) * 100) : 0;
        const split = (pick: (set: SetData) => number) =>
          CONTRACT_SETS.map((set) => `${data.sets[set] ? pick(data.sets[set]!) : "—"} ${set === "nayori" ? "Nayori" : "earlier"}`).join(" · ");
        return (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard icon={Fingerprint} title={`Agents (${split((set) => set.agents)})`} value={String(total((set) => set.agents))} />
            <KPICard
              icon={Briefcase}
              title={`Jobs (${total((set) => set.sbtcJobs)} sBTC · ${total((set) => set.stxJobs)} STX)`}
              value={String(jobs)}
            />
            <KPICard icon={CheckCircle2} title="Completed" value={String(completed)} />
            <KPICard icon={ActivityIcon} title="Indexed completion rate" value={`${completionRate}%`} />
          </div>

          {data.sets.nayori === null && (
            <p className="mt-3 text-xs text-amber-300">
              The Nayori contracts are still on their way from the chain. Refresh in a moment to include them.
            </p>
          )}
          {indexed.length < jobs && (
            <p className="mt-3 text-xs text-amber-300">
              Status and budget analytics use the newest {indexed.length} of {jobs} jobs; total job and transaction counts remain complete.
            </p>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <StatCard title="sBTC escrow" value={formatSbtcCompact(sum(sbtc, (job) => job.escrow))} description="Bitcoin-denominated jobs" />
            <StatCard title="STX escrow" value={`${formatStx(sum(stx, (job) => job.escrow))} STX`} description="STX-denominated jobs" />
            <StatCard title="Average sBTC budget" value={formatSbtcCompact(average(sbtc))} description="Per budgeted sBTC job" />
            <StatCard title="Average STX budget" value={`${formatStx(average(stx))} STX`} description="Per budgeted STX job" />
          </div>

          <div className="mt-4 card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-mist-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Contract set</th>
                  <th className="px-5 py-3 font-medium">Agents</th>
                  <th className="px-5 py-3 font-medium">Jobs</th>
                  <th className="px-5 py-3 font-medium">Completed</th>
                  <th className="px-5 py-3 font-medium">sBTC escrow</th>
                  <th className="px-5 py-3 font-medium">STX escrow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono text-mist-300">
                {CONTRACT_SETS.map((key) => {
                  const set = data.sets[key];
                  const held = (asset: "sbtc" | "stx") => sum(set?.indexed.filter((job) => job.asset === asset) ?? [], (job) => job.escrow);
                  return (
                    <tr key={key}>
                      <td className="px-5 py-3 font-sans text-white">{CONTRACT_SET_LABELS[key]}</td>
                      <td className="px-5 py-3">{set ? set.agents : "—"}</td>
                      <td className="px-5 py-3">{set ? `${set.jobs} (${set.sbtcJobs} sBTC · ${set.stxJobs} STX)` : "—"}</td>
                      <td className="px-5 py-3">{set ? set.indexed.filter((job) => job.completed).length : "—"}</td>
                      <td className="px-5 py-3">{set ? formatSbtcCompact(held("sbtc")) : "—"}</td>
                      <td className="px-5 py-3">{set ? `${formatStx(held("stx"))} STX` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <StatCard title="Distinct wallets" value={String(data.chain.distinctWallets)} description="Unique on-chain users" />
            <StatCard title="On-chain txs" value={String(data.chain.totalTx)} description={`${data.chain.feesSTX.toFixed(6)} STX in indexed fees`} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {data.sets.nayori && (
              <ChartCard title="Jobs by status · Nayori contracts" labels={NAYORI_STATUS_LABELS} data={data.sets.nayori.byStatus} />
            )}
            <ChartCard title="Jobs by status · earlier contracts" labels={EARLIER_STATUS_LABELS} data={data.sets.earlier!.byStatus} />
            {CONTRACT_SETS.map((set) => {
              const contracts = data.chain.perContract.filter((c) => c.set === set);
              return (
                <ChartCard
                  key={set}
                  title={`Transactions by contract · ${set === "nayori" ? "Nayori" : "earlier"} contracts`}
                  labels={contracts.map((c) =>
                    set === "nayori" ? shortContractName(c.name) : c.name.replace(/-registry|agentic-/g, "").slice(0, 8)
                  )}
                  data={contracts.map((c) => c.total)}
                />
              );
            })}
          </div>
        </>
        );
      })()}
    </div>
  );
}

function KPICard({ icon: Icon, title, value }: { icon: any; title: string; value: string }) {
  return (
    <div className="card p-5">
      <Icon className="h-4 w-4 text-mist-500" strokeWidth={1.75} />
      <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 text-sm text-mist-500">{title}</p>
    </div>
  );
}

function StatCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="card p-6">
      <p className="text-sm text-mist-500">{title}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-mist-500">{description}</p>
    </div>
  );
}

function ChartCard({ title, labels, data }: { title: string; labels: string[]; data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-mist-500">{title}</h3>
      <div className="mt-5 flex h-48 items-end gap-2.5">
        {data.map((value, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="font-mono text-xs text-mist-300">{value}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400 transition-all duration-500"
                style={{ height: `${Math.max((value / max) * 100, 2)}%` }}
              />
            </div>
            <span className="text-center text-[11px] text-mist-500">{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
