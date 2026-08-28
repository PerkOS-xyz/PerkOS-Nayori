"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bitcoin,
  BriefcaseBusiness,
  CheckCircle2,
  Code2,
  Download,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import { evidenceManifest } from "../../constants/evidence";
import type {
  ObservedTransparencyMetrics,
  TransparencySnapshot,
} from "../../services/transparency";

const shorten = (value?: string) =>
  value ? `${value.slice(0, 7)}…${value.slice(-6)}` : "Not assigned";

const progress = [
  { label: "Agents registered", key: "registeredAgentsMainnet", observed: "registeredAgentsMainnet" },
  { label: "Completed sBTC jobs", key: "completedSbtcJobsMainnet", observed: "completedSbtcJobsMainnet" },
  { label: "Jobs from non-team wallets", key: "completedJobsFromNonTeamWallets" },
  { label: "Participating non-team wallets", key: "participatingNonTeamWallets" },
  { label: "External SDK adoptions", key: "externalSdkAdoptions" },
] as const;

const formatStx = (microStx: number) =>
  `${(microStx / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} STX`;

const formatJobAmount = (budget: number, currency: "sbtc" | "stx") =>
  currency === "sbtc" ? `${budget.toLocaleString()} sats` : formatStx(budget);

const classificationLabel = (classification: string) => {
  if (classification === "external-attested") return "External · attested";
  if (classification === "team") return "PerkOS team";
  return "Unattested";
};

const statusClass = (status: number) => {
  if (status === 3) return "border-emerald-500/30 text-emerald-300";
  if (status === 4 || status === 5) return "border-red-500/30 text-red-300";
  if (status === 1 || status === 2) return "border-brand/30 text-brand-300";
  return "border-white/10 text-mist-300";
};

export default function EvidencePage() {
  const [snapshot, setSnapshot] = useState<TransparencySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/evidence.json", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Evidence endpoint returned ${response.status}.`);
      setSnapshot((await response.json()) as TransparencySnapshot);
    } catch (reason) {
      console.error("Transparency dashboard unavailable:", reason);
      setError("Live on-chain data is temporarily unavailable. The approved baseline remains below.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const observed = snapshot?.observed ?? null;
  const milestone1 = snapshot?.milestone1 ?? evidenceManifest.milestone1;
  const milestone2 = snapshot?.milestone2 ?? evidenceManifest.milestone2;
  const chainUnavailable = snapshot?.dataStatus.chain === "unavailable";

  const overview = [
    [Fingerprint, "Registered agents", observed?.registeredAgentsMainnet],
    [BriefcaseBusiness, "All jobs", observed?.totalJobsMainnet],
    [Bitcoin, "Completed sBTC jobs", observed?.completedSbtcJobsMainnet],
    [CheckCircle2, "Completed STX jobs", observed?.completedStxJobsMainnet],
    [Activity, "Successful contract calls", observed?.successfulContractCalls],
    [Users, "Distinct on-chain wallets", observed?.distinctWallets],
  ] as const;

  return (
    <div className="container-x py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <span className="kicker">
            <span className={`h-1.5 w-1.5 rounded-full ${chainUnavailable ? "bg-amber-400" : "bg-emerald-400"}`} />
            Public evidence · Stacks mainnet
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Nayori Transparency Dashboard</h1>
          <p className="mt-2 text-mist-300">
            Live contract state, explorer-verifiable transactions and conservatively attested grant
            progress. Unknown wallets are never classified as external automatically.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-mist-500">
            <span>Network <strong className="font-mono font-medium text-mist-300">stacks:1</strong></span>
            <span>
              Data status <strong className="font-medium text-mist-300">
                {loading ? "refreshing" : snapshot?.dataStatus.chain ?? "unavailable"}
              </strong>
            </span>
            {snapshot && (
              <span>Generated <strong className="font-medium text-mist-300">
                {new Date(snapshot.generatedAt).toLocaleString()}
              </strong></span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="btn-ghost" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <a href="/api/evidence.csv" className="btn-ghost"><Download className="h-4 w-4" /> Baseline CSV</a>
          <a href="/api/evidence.json" className="btn-primary"><Code2 className="h-4 w-4" /> Live JSON</a>
        </div>
      </div>

      {(error || chainUnavailable) && (
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>{error ?? "The chain source did not return a complete snapshot. Live totals are unavailable rather than reported as zero; the approved M1 evidence remains accessible."}</p>
        </div>
      )}

      <section className="mt-10" aria-labelledby="onchain-overview">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="onchain-overview" className="text-xl font-semibold">On-chain overview</h2>
            <p className="mt-1 text-sm text-mist-500">Current state and successful calls across active Nayori contracts.</p>
          </div>
          <div className="flex gap-3 text-xs">
            <Link href="/stats" className="text-brand-300 hover:text-brand-200">Detailed stats</Link>
            <Link href="/activity" className="text-brand-300 hover:text-brand-200">Activity log</Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {overview.map(([Icon, label, value]) => (
            <div key={label} className="card p-5">
              <Icon className="h-4 w-4 text-brand-300" strokeWidth={1.75} />
              <p className="mt-3 font-mono text-2xl font-semibold text-white">
                {loading || value === undefined ? "—" : value.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-mist-500">{label}</p>
            </div>
          ))}
        </div>
        {observed && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-mist-500">
            <span>Settled sBTC: {observed.settledSbtcSats.toLocaleString()} sats</span>
            <span>Settled STX: {formatStx(observed.settledStxMicrostx)}</span>
            <span>Indexed records: {observed.indexedTransactions.toLocaleString()}</span>
            {observed.truncated && <span className="text-amber-300">Wallet totals are truncated.</span>}
          </div>
        )}
      </section>

      <section className="mt-12" aria-labelledby="grant-progress">
        <h2 id="grant-progress" className="text-xl font-semibold">Milestone 2 verified progress</h2>
        <p className="mt-1 text-sm text-mist-500">
          Qualifying counts exclude the approved baseline of {milestone2.baseline.registeredAgentsMainnet}
          {" agent and "}{milestone2.baseline.completedSbtcJobsMainnet} completed sBTC job. External
          participation requires explicit non-team attestation.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {progress.map(({ label, key, ...definition }) => {
            const current = milestone2.verified[key];
            const target = milestone2.targets[key];
            const percentage = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            const observedKey = "observed" in definition ? definition.observed : undefined;
            const observedValue = observedKey && observed
              ? observed[observedKey as keyof ObservedTransparencyMetrics]
              : undefined;
            return (
              <div key={key} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <span className="font-mono text-sm text-mist-300">{current} / {target}</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${percentage}%` }} />
                </div>
                <div className="mt-3 flex justify-between text-xs text-mist-500">
                  <span>M2 qualifying</span>
                  {typeof observedValue === "number" && <span>On-chain total: {observedValue}</span>}
                </div>
              </div>
            );
          })}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Public SDK distribution</p>
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="mt-3 text-xs text-mist-500">Requirement complete</p>
            <a href={milestone2.distribution.npm} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
              @perkos/agent-sdk on npm <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="registered-agents">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="registered-agents" className="text-xl font-semibold">Registered agents</h2>
            <p className="mt-1 text-sm text-mist-500">Identity records read directly from agent-registry.</p>
          </div>
          <Link href="/agents" className="text-sm text-brand-300 hover:text-brand-200">Open registry</Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-mist-500">
              <tr><th className="px-4 py-3 font-medium">Agent</th><th className="px-4 py-3 font-medium">Wallet</th><th className="px-4 py-3 font-medium">Classification</th><th className="px-4 py-3 font-medium">State</th><th className="px-4 py-3 font-medium">Verify</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {!loading && snapshot?.agents.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-mist-500">No live agent records available.</td></tr>
              ) : snapshot?.agents.map((agent) => (
                <tr key={agent.id} className="text-mist-300">
                  <td className="px-4 py-3"><Link href={`/agents/${agent.id}`} className="font-medium text-white hover:text-brand-200">#{agent.id} · {agent.name || "Unnamed agent"}</Link></td>
                  <td className="px-4 py-3 font-mono text-xs" title={agent.wallet}>{shorten(agent.wallet)}</td>
                  <td className="px-4 py-3 text-xs">{classificationLabel(agent.classification)}</td>
                  <td className="px-4 py-3"><span className={`badge ${agent.active ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-mist-500"}`}>{agent.active ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3"><a href={`https://explorer.hiro.so/address/${agent.wallet}?chain=mainnet`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-300 hover:text-brand-200">Explorer <ArrowUpRight className="h-3.5 w-3.5" /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="jobs-ledger">
        <div className="flex items-end justify-between gap-4">
          <div><h2 id="jobs-ledger" className="text-xl font-semibold">Job and settlement ledger</h2><p className="mt-1 text-sm text-mist-500">Current STX and sBTC escrow records.</p></div>
          <Link href="/jobs" className="text-sm text-brand-300 hover:text-brand-200">Open jobs</Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-mist-500"><tr><th className="px-4 py-3 font-medium">Job</th><th className="px-4 py-3 font-medium">Asset</th><th className="px-4 py-3 font-medium">State</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Provider</th><th className="px-4 py-3 font-medium">Evaluator</th></tr></thead>
            <tbody className="divide-y divide-white/[0.06]">
              {!loading && snapshot?.jobs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-mist-500">No live job records available.</td></tr>
              ) : snapshot?.jobs.map((job) => (
                <tr key={`${job.currency}-${job.id}`} className="text-mist-300">
                  <td className="px-4 py-3"><Link href={`/jobs/${job.id}?currency=${job.currency}`} className="font-medium text-white hover:text-brand-200">#{job.id}</Link></td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">{job.currency}</td>
                  <td className="px-4 py-3"><span className={`badge ${statusClass(job.status)}`}>{job.statusLabel}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{formatJobAmount(job.budget, job.currency)}</td>
                  <td className="px-4 py-3 font-mono text-xs" title={job.client}>{shorten(job.client)}</td>
                  <td className="px-4 py-3 font-mono text-xs" title={job.provider}>{shorten(job.provider)}</td>
                  <td className="px-4 py-3 font-mono text-xs" title={job.evaluator}>{shorten(job.evaluator)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="transaction-ledger">
        <div className="flex items-end justify-between gap-4">
          <div><h2 id="transaction-ledger" className="text-xl font-semibold">Recent transactions</h2><p className="mt-1 text-sm text-mist-500">Confirmed and failed public calls, newest first.</p></div>
          <Link href="/activity" className="text-sm text-brand-300 hover:text-brand-200">Full activity view</Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-mist-500"><tr><th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Contract</th><th className="px-4 py-3 font-medium">Sender</th><th className="px-4 py-3 font-medium">Block / time</th><th className="px-4 py-3 font-medium">Result</th><th className="px-4 py-3 font-medium">Proof</th></tr></thead>
            <tbody className="divide-y divide-white/[0.06]">
              {!loading && snapshot?.transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-mist-500">No live transaction records available.</td></tr>
              ) : snapshot?.transactions.map((transaction) => (
                <tr key={transaction.txId} className="text-mist-300">
                  <td className="px-4 py-3 font-medium text-white">{transaction.function}</td>
                  <td className="px-4 py-3 font-mono text-xs">{transaction.contract}</td>
                  <td className="px-4 py-3"><p className="font-mono text-xs" title={transaction.sender}>{shorten(transaction.sender)}</p><p className="mt-0.5 text-[11px] text-mist-500">{classificationLabel(transaction.senderClassification)}</p></td>
                  <td className="px-4 py-3 text-xs"><p>{transaction.blockHeight ? `#${transaction.blockHeight}` : "—"}</p><p className="mt-0.5 text-mist-500">{transaction.time ? new Date(transaction.time).toLocaleString() : "—"}</p></td>
                  <td className="px-4 py-3"><span className={`badge ${transaction.status === "success" ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"}`}>{transaction.status}</span></td>
                  <td className="px-4 py-3"><a href={transaction.explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-300 hover:text-brand-200">Explorer <ArrowUpRight className="h-3.5 w-3.5" /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="approved-baseline">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><h2 id="approved-baseline" className="text-xl font-semibold">Approved M1 sBTC lifecycle</h2><p className="mt-1 break-all text-sm text-mist-500">Job #{milestone1.jobId} · {milestone1.contract} · baseline wallets are team-operated</p></div>
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-400" />
        </div>
        <div className="mt-4 card divide-y divide-white/[0.06]">
          {milestone1.lifecycle.map((transaction) => (
            <a key={transaction.txId} href={`https://explorer.hiro.so/txid/${transaction.txId}?chain=mainnet`} target="_blank" rel="noopener noreferrer" className="group flex flex-wrap items-center gap-4 p-4 transition hover:bg-white/[0.02]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand/30 bg-brand/10 font-mono text-xs text-brand-300">{transaction.step}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">{transaction.label}</p><p className="font-mono text-xs text-mist-500">{transaction.function}</p></div>
              <span className="font-mono text-xs text-mist-300">{shorten(transaction.sender)}</span>
              <span className="hidden text-xs text-mist-500 lg:inline">block {transaction.blockHeight}</span>
              <ArrowUpRight className="h-4 w-4 text-mist-500 transition group-hover:text-brand-400" />
            </a>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm text-mist-300">
        <div className="flex items-center gap-2 text-white"><BadgeCheck className="h-4 w-4 text-brand-300" /><p className="font-semibold">Evidence policy</p></div>
        <p className="mt-2">{snapshot?.policy.externalWalletRule ?? evidenceManifest.policy.externalWalletRule}</p>
        <p className="mt-1">{snapshot?.policy.baselineRule ?? evidenceManifest.policy.baselineRule}</p>
        <p className="mt-3 text-xs text-mist-500">Schema version {snapshot?.schemaVersion ?? evidenceManifest.schemaVersion} · machine-readable snapshot at <a href="/api/evidence.json" className="text-brand-300 hover:text-brand-200">/api/evidence.json</a></p>
      </section>
    </div>
  );
}
