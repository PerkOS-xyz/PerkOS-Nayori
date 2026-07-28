'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Fingerprint, Briefcase, CheckCircle2, Coins, Users, Activity as ActivityIcon } from "lucide-react";
import { getAgentCount } from "../../services/agent-registry";
import { getJob, getJobCount, getEscrowBalance, Job } from "../../services/agentic-commerce";
import { getOnchainStats, OnchainStats } from "../../services/onchain-stats";
import { formatStx } from "../../utils/format";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorMessage from "../../components/ErrorMessage";

const STATUS_LABELS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];

interface Data {
  agents: number;
  jobs: number;
  byStatus: number[];
  totalEscrow: number;
  avgBudget: number;
  completionRate: number;
  chain: OnchainStats;
}

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
      const [agents, jobCount, chain] = await Promise.all([getAgentCount(), getJobCount(), getOnchainStats()]);
      const ids = Array.from({ length: jobCount }, (_, i) => i + 1);
      const jobs = (await Promise.all(ids.map((i) => getJob(i)))).filter(Boolean) as Job[];

      const byStatus = [0, 0, 0, 0, 0, 0];
      let budgetSum = 0, budgetCount = 0;
      for (const j of jobs) {
        if (j.status >= 0 && j.status < 6) byStatus[j.status]++;
        if (j.budget > 0) { budgetSum += j.budget; budgetCount++; }
      }
      const escrows = await Promise.all(
        jobs.filter((j) => j.status === 1 || j.status === 2).map((j) => getEscrowBalance(j.id))
      );
      const totalEscrow = escrows.reduce((a, b) => a + (b || 0), 0);
      const completed = byStatus[3];

      setData({
        agents,
        jobs: jobCount,
        byStatus,
        totalEscrow,
        avgBudget: budgetCount ? budgetSum / budgetCount : 0,
        completionRate: jobCount > 0 ? Math.round((completed / jobCount) * 100) : 0,
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
          <p className="mt-1.5 text-mist-300">Protocol metrics, computed live from on-chain state.</p>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="mt-6"><ErrorMessage message={error} onRetry={load} /></div>}

      {data && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard icon={Fingerprint} title="Agents" value={String(data.agents)} />
            <KPICard icon={Briefcase} title="Jobs" value={String(data.jobs)} />
            <KPICard icon={CheckCircle2} title="Completed" value={String(data.byStatus[3])} />
            <KPICard icon={ActivityIcon} title="Completion rate" value={`${data.completionRate}%`} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <StatCard title="Total escrow" value={`${formatStx(data.totalEscrow)} STX`} description="Locked in contracts now" />
            <StatCard title="Avg budget" value={`${formatStx(data.avgBudget)} STX`} description="Per funded job" />
            <StatCard title="Distinct wallets" value={String(data.chain.distinctWallets)} description="Unique on-chain users" />
            <StatCard title="On-chain txs" value={String(data.chain.totalTx)} description={`${formatStx(data.chain.feesSTX * 1e6)} STX in fees`} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ChartCard title="Jobs by status" labels={STATUS_LABELS} data={data.byStatus} />
            <ChartCard
              title="Transactions by contract"
              labels={data.chain.perContract.map((c) => c.name.replace(/-registry|agentic-/g, "").slice(0, 8))}
              data={data.chain.perContract.map((c) => c.total)}
            />
          </div>
        </>
      )}
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
