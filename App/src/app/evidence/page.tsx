import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Bitcoin,
  CheckCircle2,
  Code2,
  Download,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  evidenceManifest,
  evidenceWallets,
  m1SbtcLifecycle,
} from "../../constants/evidence";

const shorten = (value: string) => `${value.slice(0, 7)}…${value.slice(-6)}`;

const progress = [
  ["Agents registered", "registeredAgentsMainnet"],
  ["Completed sBTC jobs", "completedSbtcJobsMainnet"],
  ["Jobs from non-team wallets", "completedJobsFromNonTeamWallets"],
  ["Participating non-team wallets", "participatingNonTeamWallets"],
  ["External SDK adoptions", "externalSdkAdoptions"],
] as const;

export default function EvidencePage() {
  const { milestone1, milestone2 } = evidenceManifest;
  return (
    <div className="container-x py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <span className="kicker">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Public evidence · Stacks mainnet
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Verifiable delivery and adoption</h1>
          <p className="mt-2 text-mist-300">
            A transparent record of confirmed Nayori transactions and Milestone 2 adoption.
            Every transaction links to the Stacks explorer; external participation is counted only
            after explicit non-team attestation.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/evidence.csv" className="btn-ghost">
            <Download className="h-4 w-4" /> CSV
          </a>
          <a href="/api/evidence.json" className="btn-primary">
            <Code2 className="h-4 w-4" /> JSON
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          [BadgeCheck, "M1 status", "Approved"],
          [Bitcoin, "Mainnet sBTC settled", `${milestone1.amountSats.toLocaleString()} sats`],
          [CheckCircle2, "Completed baseline jobs", milestone1.completedJobs],
          [Users, "Baseline participant wallets", evidenceWallets.length],
        ].map(([Icon, label, value]) => {
          const MetricIcon = Icon as typeof BadgeCheck;
          return (
            <div key={String(label)} className="card p-5">
              <MetricIcon className="h-4 w-4 text-brand-300" />
              <p className="mt-3 text-2xl font-semibold text-white">{String(value)}</p>
              <p className="mt-1 text-xs text-mist-500">{String(label)}</p>
            </div>
          );
        })}
      </div>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Approved M1 sBTC lifecycle</h2>
            <p className="mt-1 text-sm text-mist-500">
              Job #1 · {milestone1.contract} · all baseline wallets classified as team-operated
            </p>
          </div>
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="mt-4 card divide-y divide-white/[0.06]">
          {m1SbtcLifecycle.map((transaction) => (
            <a
              key={transaction.txId}
              href={`https://explorer.hiro.so/txid/${transaction.txId}?chain=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-wrap items-center gap-4 p-4 transition hover:bg-white/[0.02]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand/30 bg-brand/10 font-mono text-xs text-brand-300">
                {transaction.step}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{transaction.label}</p>
                <p className="font-mono text-xs text-mist-500">{transaction.function}</p>
              </div>
              <span className="font-mono text-xs text-mist-300">{shorten(transaction.sender)}</span>
              <span className="hidden text-xs text-mist-500 lg:inline">block {transaction.blockHeight}</span>
              <ArrowUpRight className="h-4 w-4 text-mist-500 transition group-hover:text-brand-400" />
            </a>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div>
          <h2 className="text-xl font-semibold">Milestone 2 verified progress</h2>
          <p className="mt-1 text-sm text-mist-500">
            M1 baseline is intentionally excluded from these adoption counters.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {progress.map(([label, key]) => {
            const current = milestone2.verified[key];
            const target = milestone2.targets[key];
            const percentage = Math.min(100, Math.round((current / target) * 100));
            return (
              <div key={key} className="card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <span className="font-mono text-sm text-mist-300">{current} / {target}</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Public SDK distribution</p>
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <Link
              href={milestone2.distribution.npm}
              target="_blank"
              className="mt-4 inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200"
            >
              @perkos/agent-sdk on npm <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm text-mist-300">
        <p className="font-semibold text-white">Evidence policy</p>
        <p className="mt-2">{evidenceManifest.policy.externalWalletRule}</p>
        <p className="mt-1">{evidenceManifest.policy.baselineRule}</p>
        <p className="mt-3 text-xs text-mist-500">
          Manifest version {evidenceManifest.schemaVersion} · updated {new Date(evidenceManifest.updatedAt).toLocaleDateString("en-US")}
        </p>
      </section>
    </div>
  );
}
