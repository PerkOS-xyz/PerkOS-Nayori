'use client';

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Briefcase, Wallet, Bitcoin, Star } from "lucide-react";
import { getJob, getJobCount, getEscrowBalance, Job } from "../../services/agentic-commerce";
import {
  getSbtcJob, getSbtcJobCount, getSbtcEscrowBalance,
  createSbtcJob, setSbtcBudget, fundSbtcJob, assignSbtcProvider, submitSbtcWork,
  completeSbtcJob, rejectSbtcJob, rateSbtcProvider,
} from "../../services/sbtc-commerce";
import { getBlockHeight } from "../../services/onchain-stats";
import { trackTx, txIdOf } from "../../services/tx";
import StatusBadge from "../../components/StatusBadge";
import JobStepper from "../../components/JobStepper";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";
import { formatStx, stxToMicro, formatSbtcCompact, sbtcToSats } from "../../utils/format";
import { request, isConnected, getLocalStorage } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { CONTRACT_ADDRESS } from "../../constants/contract";
import { NETWORK_NAME } from "../../constants/network";

const AGENTIC_COMMERCE = `${CONTRACT_ADDRESS}.agentic-commerce` as `${string}.${string}`;

type Currency = "sbtc" | "stx";

const connectedStx = () => getLocalStorage()?.addresses?.stx?.[0]?.address ?? "";

export default function JobsPage() {
  const toast = useToast();
  const [currency, setCurrency] = useState<Currency>("sbtc");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [formData, setFormData] = useState({ description: "", evaluator: "", provider: "", duration: "100" });
  const [actionForm, setActionForm] = useState<{ jobId: number; budget?: string; provider?: string } | null>(null);
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [ratingScore, setRatingScore] = useState(5);

  const isSbtc = currency === "sbtc";
  const unit = isSbtc ? "sBTC" : "STX";
  const fmtAmount = (v: number) => (isSbtc ? formatSbtcCompact(v) : `${formatStx(v)} STX`);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const count = isSbtc ? await getSbtcJobCount() : await getJobCount();
      const ids = Array.from({ length: count }, (_, i) => i + 1);
      const list = (await Promise.all(ids.map(async (i) => {
        const job = isSbtc ? await getSbtcJob(i) : await getJob(i);
        if (job) job.escrow = isSbtc ? await getSbtcEscrowBalance(i) : await getEscrowBalance(i);
        return job;
      }))).filter(Boolean) as Job[];
      setJobs(list);
    } catch (err) {
      console.error("Error loading jobs:", err);
      setError("Failed to load jobs. Please try again.");
    }
    setLoading(false);
  }, [isSbtc]);

  useEffect(() => {
    setConnected(isConnected());
    loadJobs();
  }, [loadJobs]);

  // Submit a write, toast the result, poll the chain, then refresh on confirmation.
  async function run(fn: () => Promise<any>, actionKey: string, after?: () => void) {
    setActiveAction(actionKey);
    try {
      const res = await fn();
      const id = txIdOf(res);
      after?.();
      if (id) trackTx(id, toast, loadJobs);
      else toast.error("No transaction id returned");
    } catch (err) {
      console.error(`Error ${actionKey}:`, err);
      toast.error("Transaction cancelled or failed");
    } finally {
      setActiveAction(null);
    }
  }

  const stxCall = (functionName: string, functionArgs: any[]) =>
    request("stx_callContract", { contract: AGENTIC_COMMERCE, functionName, functionArgs, network: NETWORK_NAME });

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    const tip = await getBlockHeight();
    const expiredAt = (tip || 1) + parseInt(formData.duration || "100");
    await run(
      () =>
        isSbtc
          ? createSbtcJob(formData.evaluator, expiredAt, formData.description, formData.provider || undefined)
          : stxCall("create-job", [
              formData.provider ? Cl.some(Cl.principal(formData.provider)) : Cl.none(),
              Cl.principal(formData.evaluator),
              Cl.uint(expiredAt),
              Cl.stringAscii(formData.description),
            ]),
      "creating",
      () => setShowForm(false)
    );
  }

  function handleSetBudget(jobId: number) {
    if (!actionForm?.budget) return;
    const amount = isSbtc ? sbtcToSats(actionForm.budget) : stxToMicro(actionForm.budget);
    run(
      () => (isSbtc ? setSbtcBudget(jobId, amount) : stxCall("set-budget", [Cl.uint(jobId), Cl.uint(amount)])),
      `setting-budget-${jobId}`,
      () => setActionForm(null)
    );
  }

  function handleAssignProvider(jobId: number) {
    if (!actionForm?.provider) return;
    run(
      () =>
        isSbtc
          ? assignSbtcProvider(jobId, actionForm.provider!)
          : stxCall("assign-provider", [Cl.uint(jobId), Cl.principal(actionForm.provider!)]),
      `assigning-provider-${jobId}`,
      () => setActionForm(null)
    );
  }

  const handleFundJob = (job: Job) =>
    run(
      () =>
        isSbtc
          ? fundSbtcJob(job.id, job.budget, connectedStx())
          : stxCall("fund-job", [Cl.uint(job.id)]),
      `funding-${job.id}`
    );

  const handleSubmitWork = (jobId: number) =>
    run(
      () =>
        isSbtc
          ? submitSbtcWork(jobId, "work-submitted")
          : stxCall("submit-work", [Cl.uint(jobId), Cl.bufferFromAscii("work-submitted")]),
      `submitting-${jobId}`
    );

  const handleCompleteJob = (jobId: number) =>
    run(() => (isSbtc ? completeSbtcJob(jobId) : stxCall("complete-job", [Cl.uint(jobId)])), `completing-${jobId}`);

  const handleRejectJob = (jobId: number) =>
    run(() => (isSbtc ? rejectSbtcJob(jobId) : stxCall("reject-job", [Cl.uint(jobId)])), `rejecting-${jobId}`);

  const handleRate = (jobId: number) =>
    run(() => rateSbtcProvider(jobId, ratingScore, "Rated via PerkOS"), `rating-${jobId}`, () => setRatingFor(null));

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Escrow</h1>
          <p className="mt-1.5 text-mist-300">
            {isSbtc
              ? "Agent jobs escrowed and settled in sBTC, denominated in Bitcoin."
              : "Agent jobs escrowed and settled in native STX."}
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className={showForm ? "btn-ghost" : "btn-primary"} disabled={!!activeAction}>
          {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> Create Job</>}
        </button>
      </div>

      {/* Currency switch: sBTC escrow is the current protocol, STX is the original one. */}
      <div className="mt-6 inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
        <button
          onClick={() => setCurrency("sbtc")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
            isSbtc ? "bg-bitcoin/15 text-bitcoin-400" : "text-mist-300 hover:text-white"
          }`}
        >
          <Bitcoin className="h-4 w-4" /> sBTC escrow
        </button>
        <button
          onClick={() => setCurrency("stx")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
            !isSbtc ? "bg-white/[0.08] text-white" : "text-mist-300 hover:text-white"
          }`}
        >
          STX escrow
        </button>
      </div>

      {!connected && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm text-mist-300">
          <Wallet className="h-4 w-4 text-brand-300" /> Connect your wallet to create jobs and act on escrow.
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={loadJobs} className="font-medium underline underline-offset-2">Retry</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateJob} className="card mt-6 p-6">
          <h2 className="text-lg font-semibold">Create {unit} Job</h2>
          <p className="mt-1 text-sm text-mist-500">
            The evaluator settles the job and must be a third party: it cannot be you, and it cannot be the provider.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="field" rows={3} required />
            </div>
            <div>
              <label className="label">Evaluator</label>
              <input type="text" value={formData.evaluator} onChange={(e) => setFormData({ ...formData, evaluator: e.target.value })} className="field font-mono" placeholder="SP…" required />
            </div>
            <div>
              <label className="label">Provider (optional)</label>
              <input type="text" value={formData.provider} onChange={(e) => setFormData({ ...formData, provider: e.target.value })} className="field font-mono" placeholder="SP…" />
            </div>
            <div>
              <label className="label">Duration (blocks until expiry)</label>
              <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="field" required />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-5" disabled={activeAction === "creating"}>
            {activeAction === "creating" ? "Creating…" : `Create ${unit} Job`}
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Loading {unit} jobs from chain…</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
          <p className="mt-3 text-mist-300">No {unit} jobs yet. Create the first one.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="card card-hover p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-base font-semibold text-white">Job #{job.id}</span>
                  <p className="mt-0.5 text-sm text-mist-300">{job.description}</p>
                </div>
                <StatusBadge status={job.status} />
              </div>

              <JobStepper status={job.status} />

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-xs text-mist-500">Client</dt>
                  <dd className="truncate text-xs text-mist-300"><Addr value={job.client} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-mist-500">Provider</dt>
                  <dd className="truncate text-xs text-mist-300"><Addr value={job.provider} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-mist-500">Evaluator</dt>
                  <dd className="truncate text-xs text-mist-300"><Addr value={job.evaluator} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-mist-500">Budget</dt>
                  <dd className="text-white">{fmtAmount(job.budget)}</dd>
                </div>
              </dl>

              {job.escrow !== undefined && job.escrow > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-bitcoin/25 bg-bitcoin/10 px-2.5 py-1 text-xs text-bitcoin-400">
                  {isSbtc && <Bitcoin className="h-3.5 w-3.5" />}
                  Escrow locked: <span className="font-mono">{fmtAmount(job.escrow)}</span>
                </div>
              )}

              {actionForm?.jobId === job.id && (
                <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  {activeAction?.startsWith("setting-budget") && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step={isSbtc ? "0.00000001" : "0.000001"}
                        placeholder={`Budget in ${unit}`}
                        value={actionForm.budget || ""}
                        onChange={(e) => setActionForm({ ...actionForm, budget: e.target.value })}
                        className="field flex-1"
                      />
                      <button onClick={() => handleSetBudget(job.id)} className="btn-primary">Set</button>
                      <button onClick={() => setActionForm(null)} className="btn-ghost">Cancel</button>
                    </div>
                  )}
                  {activeAction?.startsWith("assigning-provider") && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Provider address (SP…)"
                        value={actionForm.provider || ""}
                        onChange={(e) => setActionForm({ ...actionForm, provider: e.target.value })}
                        className="field flex-1 font-mono"
                      />
                      <button onClick={() => handleAssignProvider(job.id)} className="btn-primary">Assign</button>
                      <button onClick={() => setActionForm(null)} className="btn-ghost">Cancel</button>
                    </div>
                  )}
                </div>
              )}

              {isSbtc && ratingFor === job.id && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="text-sm text-mist-300">Rate the provider</span>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setRatingScore(s)} aria-label={`${s} stars`} className="p-0.5">
                      <Star className={`h-5 w-5 ${s <= ratingScore ? "fill-amber-300 text-amber-300" : "text-mist-500"}`} />
                    </button>
                  ))}
                  <button onClick={() => handleRate(job.id)} className="btn-sm ml-auto bg-brand text-white hover:bg-brand-600" disabled={activeAction === `rating-${job.id}`}>
                    {activeAction === `rating-${job.id}` ? "Submitting…" : "Submit"}
                  </button>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                {job.status === 0 && (
                  <>
                    <button onClick={() => { setActionForm({ jobId: job.id, budget: "" }); setActiveAction(`setting-budget-${job.id}`); }} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">
                      Set Budget
                    </button>
                    {job.budget > 0 && (
                      <button onClick={() => handleFundJob(job)} className="btn-sm border border-bitcoin/30 text-bitcoin-400 hover:bg-bitcoin/10" disabled={activeAction === `funding-${job.id}`}>
                        {activeAction === `funding-${job.id}` ? "Funding…" : `Fund with ${unit}`}
                      </button>
                    )}
                  </>
                )}
                {job.status === 1 && (
                  <>
                    {!job.provider && (
                      <button onClick={() => { setActionForm({ jobId: job.id, provider: "" }); setActiveAction(`assigning-provider-${job.id}`); }} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">
                        Assign Provider
                      </button>
                    )}
                    <button onClick={() => handleSubmitWork(job.id)} className="btn-sm bg-brand text-white hover:bg-brand-600" disabled={activeAction === `submitting-${job.id}`}>
                      {activeAction === `submitting-${job.id}` ? "Submitting…" : "Submit Work"}
                    </button>
                  </>
                )}
                {job.status === 2 && (
                  <>
                    <button onClick={() => handleCompleteJob(job.id)} className="btn-sm border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" disabled={activeAction === `completing-${job.id}`}>
                      {activeAction === `completing-${job.id}` ? "Completing…" : "Complete"}
                    </button>
                    <button onClick={() => handleRejectJob(job.id)} className="btn-sm border border-red-500/25 text-red-300 hover:bg-red-500/10" disabled={activeAction === `rejecting-${job.id}`}>
                      {activeAction === `rejecting-${job.id}` ? "Rejecting…" : "Reject"}
                    </button>
                    {isSbtc && (
                      <span className="self-center text-xs text-mist-500">Only the evaluator can settle or reject.</span>
                    )}
                  </>
                )}
                {isSbtc && job.status === 3 && (
                  <button onClick={() => setRatingFor(ratingFor === job.id ? null : job.id)} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">
                    <Star className="h-3.5 w-3.5" /> Rate provider
                  </button>
                )}
                <Link href={`/jobs/${job.id}`} className="btn-sm ml-auto border border-white/[0.12] text-mist-300 hover:text-white">
                  Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
