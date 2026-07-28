'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { Fingerprint, Briefcase, Coins, ArrowRight, Bitcoin } from "lucide-react";
import { getAgent, getAgentCount, Agent } from "../../services/agent-registry";
import {
  CommerceJob,
  currencyProtocolLabel,
  formatJobAmount,
  getCommerceJobCount,
  getCommerceJobs,
  jobHref,
} from "../../services/commerce";
import StatusBadge from "../../components/StatusBadge";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorMessage from "../../components/ErrorMessage";

const trunc = (s: string, n = 64) => (s.length > n ? s.slice(0, n) + "…" : s);

export default function DashboardPage() {
  const [stats, setStats] = useState({
    agents: 0,
    jobs: 0,
    sbtcJobs: 0,
    stxJobs: 0,
  });
  const [recentAgents, setRecentAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<CommerceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [agentCount, sbtcCount, stxCount, sbtcJobs, stxJobs] = await Promise.all([
        getAgentCount(),
        getCommerceJobCount("sbtc"),
        getCommerceJobCount("stx"),
        getCommerceJobs("sbtc", { limit: 3 }),
        getCommerceJobs("stx", { limit: 3 }),
      ]);

      const agentIds = Array.from(
        { length: Math.min(agentCount, 5) },
        (_, i) => agentCount - i
      );
      const agents = (await Promise.all(agentIds.map((i) => getAgent(i)))).filter(Boolean) as Agent[];
      setRecentAgents(agents);

      setRecentJobs([...sbtcJobs, ...stxJobs]);
      setStats({
        agents: agentCount,
        jobs: sbtcCount + stxCount,
        sbtcJobs: sbtcCount,
        stxJobs: stxCount,
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      setError("Failed to load dashboard data.");
    }
    setLoading(false);
  }

  if (loading) return <LoadingSpinner text="Loading dashboard…" />;

  const STATS = [
    { icon: Fingerprint, label: "Agents", value: stats.agents },
    { icon: Briefcase, label: "Jobs", value: stats.jobs },
    { icon: Bitcoin, label: "sBTC jobs", value: stats.sbtcJobs },
    { icon: Coins, label: "STX jobs", value: stats.stxJobs },
  ];

  return (
    <div className="container-x py-12">
      <div>
        <span className="kicker">Protocol overview</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1.5 text-mist-300">Live state of the PerkOS agent protocol on Stacks.</p>
      </div>

      {error && <div className="mt-6"><ErrorMessage message={error} onRetry={loadDashboard} /></div>}

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-mist-500">{s.label}</span>
              <s.icon className="h-4 w-4 text-mist-500" strokeWidth={1.75} />
            </div>
            <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Link href="/agents" className="card card-hover group flex items-start gap-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand-300">
            <Fingerprint className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Agent Registry</h3>
            <p className="mt-1 text-sm text-mist-300">Register and manage AI agents on Stacks.</p>
            <span className="mt-2 inline-flex items-center gap-1 text-sm text-brand-300">View agents <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
          </div>
        </Link>
        <Link href="/jobs" className="card card-hover group flex items-start gap-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand-300">
            <Briefcase className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Job Escrow</h3>
            <p className="mt-1 text-sm text-mist-300">Create and settle jobs with sBTC or STX; both remain first-class product options.</p>
            <span className="mt-2 inline-flex items-center gap-1 text-sm text-brand-300">View jobs <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
          </div>
        </Link>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mist-500">Recent Agents</h2>
          <div className="mt-3 space-y-3">
            {recentAgents.length === 0 ? (
              <p className="text-sm text-mist-500">No agents registered yet.</p>
            ) : recentAgents.map((agent) => (
              <Link key={agent.id} href={`/agents/${agent.id}`} className="card card-hover block p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{agent.name}</p>
                  <span className={`badge ${agent.active ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-mist-500"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${agent.active ? "bg-emerald-400" : "bg-mist-500"}`} />
                    {agent.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-mist-500">{trunc(agent.description)}</p>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mist-500">Recent Jobs</h2>
          <div className="mt-3 space-y-3">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-mist-500">No jobs created yet.</p>
            ) : recentJobs.map((job) => (
              <Link key={`${job.currency}-${job.id}`} href={jobHref(job.id, job.currency)} className="card card-hover block p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">Job #{job.id} <span className="ml-1 text-xs text-mist-500">{currencyProtocolLabel(job.currency)}</span></p>
                  <StatusBadge status={job.status} />
                </div>
                <p className="mt-1 text-sm text-mist-500">{trunc(job.description)}</p>
                <p className="mt-2 font-mono text-xs text-mist-300">{formatJobAmount(job.budget, job.currency)}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
