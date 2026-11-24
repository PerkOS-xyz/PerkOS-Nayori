'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bitcoin, Briefcase, History, Plus, RefreshCw, Wallet } from "lucide-react";
import { NAYORI_NEXT, NEXT_LIMITS, nextEscrowContract, type NextAsset } from "../../constants/nayori-next";
import { getNextBurnHeight, getNextJobs } from "../../services/nayori-next/reads";
import { NEXT_STATUS, NEXT_STATUS_NAMES, type NextJob, type NextStatusName } from "../../services/nayori-next/parse";
import {
  NEXT_STATUS_HINTS,
  NEXT_STATUS_LABELS,
  blocksToDuration,
  deadlineLabel,
  deadlineText,
  formatNextAmount,
  quoteNextFee,
} from "../../services/nayori-next/status";
import { buildCreateJob } from "../../services/nayori-next/transactions";
import { sbtcToSats, stxToMicro } from "../../utils/format";
import {
  NAYORI_EVALUATOR_ADDRESS,
  NAYORI_MANAGED_EVALUATOR_ENABLED,
  SBTC_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_CONTRACT_NAME,
} from "../../constants/contract";
import { MAX_PLAIN_DESCRIPTION, buildEvaluableDescription } from "../../services/evaluable-jobs";
import { JobCriteria, jobTaskText } from "../EvaluableJob";
import { useToast } from "../Toast";
import NextAgentPanel from "./NextAgentPanel";
import NextPermissionsPanel from "./NextPermissionsPanel";
import { NextAddr, NextBanner, NextStatusBadge, TxProgressBar } from "./ui";
import { useNextWallet } from "./useNextWallet";

const PAGE_SIZE = 20;

export const nextJobHref = (id: number, asset: NextAsset) => `/jobs/next/${id}?asset=${asset}`;

export default function NextJobsBoard() {
  const [asset, setAsset] = useState<NextAsset>("sbtc");
  const [jobs, setJobs] = useState<NextJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [height, setHeight] = useState(0);
  const [heightKnown, setHeightKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | NextStatusName>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();
  const [form, setForm] = useState({
    description: "",
    criteria: "",
    evaluator: NAYORI_EVALUATOR_ADDRESS,
    budget: "",
    deliveryBlocks: "144",
    reviewBlocks: "144",
  });

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      // The Bitcoin height never fails (0 when unknown), so it loads even if the jobs do not.
      const tip = getNextBurnHeight().then((value) => {
        setHeight(value);
        setHeightKnown(true);
      });
      try {
        const list = await getNextJobs(asset, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
        setJobs(list.jobs);
        setTotal(list.total);
      } catch (reason) {
        console.error("Error loading Nayori jobs:", reason);
        setJobs([]);
        setError("Could not load jobs from the Nayori contracts. Try again.");
      } finally {
        await tip;
        setLoading(false);
      }
    },
    [asset, page]
  );

  const wallet = useNextWallet(useCallback(() => void load(true), [load]));

  useEffect(() => {
    void load();
  }, [load]);

  // Deep links such as /jobs?status=completed open the board filtered.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("status");
    if (requested && (NEXT_STATUS_NAMES as string[]).includes(requested)) {
      setFilter(requested as NextStatusName);
    }
  }, []);

  const visible = useMemo(
    () =>
      jobs.filter((job) => {
        if (filter !== "all" && job.statusName !== filter) return false;
        if (mineOnly) {
          const me = wallet.address.toUpperCase();
          return [job.client, job.provider, job.evaluator].some((party) => party?.toUpperCase() === me);
        }
        return true;
      }),
    [filter, jobs, mineOnly, wallet.address]
  );

  const unit = asset === "sbtc" ? "sBTC" : "STX";
  const budgetUnits = asset === "sbtc" ? sbtcToSats(form.budget || "0") : stxToMicro(form.budget || "0");
  const fee = budgetUnits > 0 ? quoteNextFee(budgetUnits) : null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const managedEvaluator = form.evaluator.trim().toUpperCase() === NAYORI_EVALUATOR_ADDRESS.toUpperCase();

  async function createJob(event: React.FormEvent) {
    event.preventDefault();
    const evaluator = form.evaluator.trim();
    let description = form.description;
    if (form.criteria.trim()) {
      try {
        // The criteria and their commitment go on-chain with the description, bound to this escrow.
        description = (
          await buildEvaluableDescription(
            {
              network: NAYORI_NEXT.network,
              asset,
              contract: nextEscrowContract(asset),
              client: wallet.address,
              evaluator,
            },
            form.description,
            form.criteria
          )
        ).description;
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Check the acceptance criteria.");
        return;
      }
    }
    void wallet.run("create", `Create ${unit} job`, () =>
      buildCreateJob({
        asset,
        evaluator,
        budget: budgetUnits,
        deliveryBlocks: Number(form.deliveryBlocks),
        reviewBlocks: Number(form.reviewBlocks),
        description,
        client: wallet.address,
      }),
      () => {
        setShowForm(false);
        setForm((value) => ({ ...value, description: "", criteria: "" }));
      }
    );
  }

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Escrow</h1>
          <p className="mt-2 max-w-2xl text-mist-300">
            Create, fund and settle agent jobs in sBTC or STX on the Nayori contracts. The client funds
            the budget, offers the job to a provider, and the evaluator decides. Anyone can move a job
            on once its Bitcoin block deadline passes.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="btn-ghost" aria-label="Refresh jobs">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={() => setShowForm((value) => !value)} className="btn-primary">
            <Plus className="h-4 w-4" /> New job
          </button>
        </div>
      </div>

      <NextBanner />
      <Link
        href="/jobs/earlier"
        className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-mist-300 transition hover:border-white/20 hover:text-white"
      >
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4 text-mist-500" />
          Jobs on the earlier contracts ({SBTC_COMMERCE_CONTRACT_NAME}, {STX_COMMERCE_CONTRACT_NAME}) keep every step available until they settle.
        </span>
        <span className="inline-flex items-center gap-1 font-medium">Open earlier jobs <ArrowRight className="h-4 w-4" /></span>
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
          {(["sbtc", "stx"] as const).map((value) => (
            <button
              key={value}
              onClick={() => {
                setAsset(value);
                setPage(0);
              }}
              className={`rounded-md px-3.5 py-1.5 text-sm transition ${
                asset === value ? "bg-white/[0.08] text-white" : "text-mist-400 hover:text-white"
              }`}
            >
              {value === "sbtc" && <Bitcoin className="mr-1.5 inline h-4 w-4" />}
              {value === "sbtc" ? "sBTC" : "STX"}
            </button>
          ))}
        </div>
        <span className="text-xs text-mist-500">
          Height now: {height ? `Bitcoin block ${height.toLocaleString("en-US")}` : heightKnown ? "unknown" : "loading"}
        </span>
      </div>

      {!wallet.connected && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm text-mist-300">
          <Wallet className="h-4 w-4 text-brand-300" /> Connect a {NAYORI_NEXT.network} wallet to create or manage jobs.
        </div>
      )}
      <TxProgressBar progress={wallet.progress} />
      {error && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => void load()} className="font-medium underline underline-offset-2">Retry</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={createJob} className="card mt-6 p-6">
          <h2 className="text-lg font-semibold">Create {unit} job</h2>
          <p className="mt-1 text-sm text-mist-500">
            One transaction sets the evaluator, budget, delivery window, review window and description.
            Funding is a second step, from your wallet, for exactly the budget.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label" htmlFor="next-description">Description</label>
              <textarea
                id="next-description"
                className="field"
                rows={3}
                maxLength={NEXT_LIMITS.descriptionLength}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What should the provider deliver?"
                required
              />
              <p className="mt-1 text-xs text-mist-500">Plain ASCII, up to {NEXT_LIMITS.descriptionLength} characters.</p>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="next-criteria">Acceptance criteria (optional, one per line)</label>
              <textarea
                id="next-criteria"
                className="field"
                rows={3}
                maxLength={MAX_PLAIN_DESCRIPTION}
                value={form.criteria}
                onChange={(e) => setForm({ ...form, criteria: e.target.value })}
                placeholder={"The brief is under 150 words\nIt explains how escrow protects both parties"}
              />
              <p className="mt-1 text-xs text-mist-500">
                With criteria, the job is evaluable: the criteria and their commitment are written on-chain with
                the description, the provider submits an evidence commitment and Nayori&apos;s evaluator records the
                decision. Task and criteria share a {MAX_PLAIN_DESCRIPTION}-character ASCII budget.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="next-evaluator">Evaluator</label>
              <input
                id="next-evaluator"
                className="field font-mono"
                value={form.evaluator}
                onChange={(e) => setForm({ ...form, evaluator: e.target.value })}
                placeholder={NAYORI_NEXT.network === "mainnet" ? "SP..." : "ST..."}
                readOnly={NAYORI_MANAGED_EVALUATOR_ENABLED}
                required
              />
              <p className="mt-1 text-xs text-mist-500">
                {managedEvaluator
                  ? "Nayori's evaluator approves or rejects the work against the acceptance criteria."
                  : "The wallet that approves or rejects the work. It must differ from yours."}
                {!NAYORI_MANAGED_EVALUATOR_ENABLED && " You may enter another evaluator whose availability you have confirmed."}
              </p>
            </div>
            <div>
              <label className="label" htmlFor="next-budget">Budget ({unit})</label>
              <input
                id="next-budget"
                className="field"
                inputMode="decimal"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder={asset === "sbtc" ? "0.0005" : "10"}
                required
              />
              <p className="mt-1 text-xs text-mist-500">
                {formatNextAmount(NEXT_LIMITS.budget[asset].min, asset)} to {formatNextAmount(NEXT_LIMITS.budget[asset].max, asset)}.
                {fee && ` On a decision, ${formatNextAmount(fee.fee, asset)} (2%) goes to the treasury and ${formatNextAmount(fee.net, asset)} to the winner.`}
              </p>
            </div>
            <div>
              <label className="label" htmlFor="next-delivery">Delivery window (Bitcoin blocks)</label>
              <input
                id="next-delivery"
                className="field"
                type="number"
                min={NEXT_LIMITS.deliveryBlocks.min}
                max={NEXT_LIMITS.deliveryBlocks.max}
                value={form.deliveryBlocks}
                onChange={(e) => setForm({ ...form, deliveryBlocks: e.target.value })}
                required
              />
              <p className="mt-1 text-xs text-mist-500">
                {NEXT_LIMITS.deliveryBlocks.min} to {NEXT_LIMITS.deliveryBlocks.max} blocks, {blocksToDuration(Number(form.deliveryBlocks) || 0)}.
                It restarts when the provider accepts.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="next-review">Review window (Bitcoin blocks)</label>
              <input
                id="next-review"
                className="field"
                type="number"
                min={NEXT_LIMITS.reviewBlocks.min}
                max={NEXT_LIMITS.reviewBlocks.max}
                value={form.reviewBlocks}
                onChange={(e) => setForm({ ...form, reviewBlocks: e.target.value })}
                required
              />
              <p className="mt-1 text-xs text-mist-500">
                {NEXT_LIMITS.reviewBlocks.min} to {NEXT_LIMITS.reviewBlocks.max} blocks, {blocksToDuration(Number(form.reviewBlocks) || 0)}.
                Without a decision in time, anyone can record a default approval.
              </p>
            </div>
          </div>
          <button type="submit" className="btn-primary mt-5" disabled={wallet.busy === "create"}>
            {wallet.busy === "create" ? "Waiting for the wallet" : "Create job"}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="field w-44"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {NEXT_STATUS_NAMES.map((name) => (
            <option key={name} value={name}>{NEXT_STATUS_LABELS[name]}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3.5 py-2 text-sm text-mist-300">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} disabled={!wallet.connected} />
          My jobs
        </label>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Loading {unit} jobs from chain</p>
        </div>
      ) : error ? null : visible.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
          <p className="mt-3 text-mist-300">No matching {unit} jobs yet.</p>
          <p className="mt-1 text-sm text-mist-500">Change the filters or create the first job.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visible.map((job) => (
            <article key={`${asset}-${job.id}`} className="card card-hover p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={nextJobHref(job.id, asset)} className="text-base font-semibold text-white hover:text-brand-300">
                      Job #{job.id}
                    </Link>
                    <NextStatusBadge status={job.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-mist-300">{jobTaskText(job.description)}</p>
                  <JobCriteria description={job.description} compact />
                  <p className="mt-1 text-xs text-mist-500">{NEXT_STATUS_HINTS[job.statusName]}</p>
                </div>
                <Link href={nextJobHref(job.id, asset)} className="btn-ghost shrink-0">Open</Link>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-5">
                <div><dt className="text-xs text-mist-500">Client</dt><dd className="truncate text-xs text-mist-300"><NextAddr value={job.client} /></dd></div>
                <div><dt className="text-xs text-mist-500">Provider</dt><dd className="truncate text-xs text-mist-300"><NextAddr value={job.provider} /></dd></div>
                <div><dt className="text-xs text-mist-500">Evaluator</dt><dd className="truncate text-xs text-mist-300"><NextAddr value={job.evaluator} /></dd></div>
                <div><dt className="text-xs text-mist-500">Budget</dt><dd className="text-white">{formatNextAmount(job.budget, asset)}</dd></div>
                {job.status <= NEXT_STATUS.accepted && (
                  <div>
                    <dt className="text-xs text-mist-500">{deadlineLabel(job)}</dt>
                    <dd className="text-xs text-mist-300">{deadlineText(job.deliveryDeadline, height)}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Newer</button>
          <span className="text-mist-400">Page {page + 1} of {pages}</span>
          <button className="btn-ghost" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Older</button>
        </div>
      )}

      {wallet.connected && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Your wallet on the Nayori contracts</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <NextAgentPanel />
            <NextPermissionsPanel height={height} />
          </div>
        </div>
      )}
    </div>
  );
}
