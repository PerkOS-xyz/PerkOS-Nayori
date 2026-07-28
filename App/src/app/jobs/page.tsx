'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Briefcase, Wallet } from "lucide-react";
import { getJob, getJobCount, getEscrowBalance, Job } from "../../services/agentic-commerce";
import { getBlockHeight } from "../../services/onchain-stats";
import { trackTx, txIdOf } from "../../services/tx";
import StatusBadge from "../../components/StatusBadge";
import JobStepper from "../../components/JobStepper";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";
import { formatStx, stxToMicro } from "../../utils/format";
import { request, isConnected } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { CONTRACT_ADDRESS } from "../../constants/contract";
import { NETWORK_NAME } from "../../constants/network";

const AGENTIC_COMMERCE = `${CONTRACT_ADDRESS}.agentic-commerce` as `${string}.${string}`;

export default function JobsPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [formData, setFormData] = useState({ description: "", evaluator: "", provider: "", budget: "", duration: "100" });
  const [actionForm, setActionForm] = useState<{ jobId: number; budget?: string; provider?: string } | null>(null);

  useEffect(() => {
    setConnected(isConnected());
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      const ids = Array.from({ length: count }, (_, i) => i + 1);
      const list = (await Promise.all(ids.map(async (i) => {
        const job = await getJob(i);
        if (job) job.escrow = await getEscrowBalance(i);
        return job;
      }))).filter(Boolean) as Job[];
      setJobs(list);
    } catch (error) {
      console.error("Error loading jobs:", error);
      setError("Failed to load jobs. Please try again.");
    }
    setLoading(false);
  }

  // Submit a write, toast the result, poll the chain, then refresh on confirmation.
  async function submit(fn: string, args: any[], actionKey: string, after?: () => void) {
    setActiveAction(actionKey);
    try {
      const res = await request("stx_callContract", { contract: AGENTIC_COMMERCE, functionName: fn, functionArgs: args, network: NETWORK_NAME });
      const id = txIdOf(res);
      after?.();
      if (id) trackTx(id, toast, loadJobs);
      else toast.error("No transaction id returned");
    } catch (error) {
      console.error(`Error ${fn}:`, error);
      toast.error("Transaction cancelled or failed");
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    const currentBlock = await getBlockHeight();
    const expiredAt = (currentBlock || 1) + parseInt(formData.duration || "100");
    await submit("create-job", [
      formData.provider ? Cl.some(Cl.principal(formData.provider)) : Cl.none(),
      Cl.principal(formData.evaluator),
      Cl.uint(expiredAt),
      Cl.stringAscii(formData.description),
    ], "creating", () => setShowForm(false));
  }

  function handleSetBudget(jobId: number) {
    if (!actionForm?.budget) return;
    submit("set-budget", [Cl.uint(jobId), Cl.uint(stxToMicro(actionForm.budget))], `setting-budget-${jobId}`, () => setActionForm(null));
  }
  function handleAssignProvider(jobId: number) {
    if (!actionForm?.provider) return;
    submit("assign-provider", [Cl.uint(jobId), Cl.principal(actionForm.provider)], `assigning-provider-${jobId}`, () => setActionForm(null));
  }
  const handleFundJob = (jobId: number) => submit("fund-job", [Cl.uint(jobId)], `funding-${jobId}`);
  const handleSubmitWork = (jobId: number) => submit("submit-work", [Cl.uint(jobId), Cl.bufferFromAscii("work-submitted")], `submitting-${jobId}`);
  const handleCompleteJob = (jobId: number) => submit("complete-job", [Cl.uint(jobId)], `completing-${jobId}`);
  const handleRejectJob = (jobId: number) => submit("reject-job", [Cl.uint(jobId)], `rejecting-${jobId}`);

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Escrow</h1>
          <p className="mt-1.5 text-mist-300">Create and settle agent jobs with trustless STX escrow.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className={showForm ? "btn-ghost" : "btn-primary"} disabled={!!activeAction}>
          {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> Create Job</>}
        </button>
      </div>

      {!connected && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm text-mist-300">
          <Wallet className="h-4 w-4 text-brand-300" /> Connect your wallet to create jobs and act on escrow.
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={loadJobs} className="font-medium underline underline-offset-2">Retry</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateJob} className="card mt-6 p-6">
          <h2 className="text-lg font-semibold">Create New Job</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="field" rows={3} required />
            </div>
            <div>
              <label className="label">Evaluator</label>
              <input type="text" value={formData.evaluator} onChange={(e) => setFormData({ ...formData, evaluator: e.target.value })} className="field font-mono" placeholder="ST…" required />
            </div>
            <div>
              <label className="label">Provider (optional)</label>
              <input type="text" value={formData.provider} onChange={(e) => setFormData({ ...formData, provider: e.target.value })} className="field font-mono" placeholder="ST…" />
            </div>
            <div>
              <label className="label">Duration (blocks until expiry)</label>
              <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="field" required />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-5" disabled={activeAction === "creating"}>
            {activeAction === "creating" ? "Creating…" : "Create Job"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Loading jobs from chain…</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
          <p className="mt-3 text-mist-300">No jobs created yet. Create the first one.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="card card-hover p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link href={`/jobs/${job.id}`} className="text-base font-semibold text-white hover:text-brand-300">Job #{job.id}</Link>
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
                  <dd className="text-white">{formatStx(job.budget)} <span className="text-mist-500">STX</span></dd>
                </div>
              </dl>

              {job.escrow !== undefined && job.escrow > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-bitcoin/25 bg-bitcoin/10 px-2.5 py-1 text-xs text-bitcoin-400">
                  Escrow locked: <span className="font-mono">{formatStx(job.escrow)} STX</span>
                </div>
              )}

              {actionForm?.jobId === job.id && (
                <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  {activeAction?.startsWith("setting-budget") && (
                    <div className="flex gap-2">
                      <input type="number" step="0.000001" placeholder="Budget in STX" value={actionForm.budget || ""} onChange={(e) => setActionForm({ ...actionForm, budget: e.target.value })} className="field flex-1" />
                      <button onClick={() => handleSetBudget(job.id)} className="btn-primary">Set</button>
                      <button onClick={() => setActionForm(null)} className="btn-ghost">Cancel</button>
                    </div>
                  )}
                  {activeAction?.startsWith("assigning-provider") && (
                    <div className="flex gap-2">
                      <input type="text" placeholder="Provider address (ST…)" value={actionForm.provider || ""} onChange={(e) => setActionForm({ ...actionForm, provider: e.target.value })} className="field flex-1 font-mono" />
                      <button onClick={() => handleAssignProvider(job.id)} className="btn-primary">Assign</button>
                      <button onClick={() => setActionForm(null)} className="btn-ghost">Cancel</button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                {job.status === 0 && (
                  <>
                    <button onClick={() => { setActionForm({ jobId: job.id, budget: "" }); setActiveAction(`setting-budget-${job.id}`); }} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">
                      Set Budget
                    </button>
                    {job.budget > 0 && (
                      <button onClick={() => handleFundJob(job.id)} className="btn-sm border border-bitcoin/30 text-bitcoin-400 hover:bg-bitcoin/10" disabled={activeAction === `funding-${job.id}`}>
                        {activeAction === `funding-${job.id}` ? "Funding…" : "Fund Job"}
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
                  </>
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
