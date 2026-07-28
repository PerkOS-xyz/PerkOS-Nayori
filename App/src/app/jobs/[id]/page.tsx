'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, Coins } from "lucide-react";
import { getJob, getEscrowBalance, Job } from "../../../services/agentic-commerce";
import StatusBadge from "../../../components/StatusBadge";
import JobStepper from "../../../components/JobStepper";
import Addr from "../../../components/Addr";
import { formatStx } from "../../../utils/format";

export default function JobDetailPage() {
  const id = Number(useParams().id);
  const [job, setJob] = useState<Job | null>(null);
  const [escrow, setEscrow] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const j = await getJob(id);
      setJob(j);
      if (j) setEscrow(await getEscrowBalance(id));
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="container-x py-20 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container-x py-12">
        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Jobs
        </Link>
        <p className="mt-8 text-mist-300">Job #{id} not found.</p>
      </div>
    );
  }

  return (
    <div className="container-x py-12">
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </Link>

      <div className="mt-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand-300">
          <Briefcase className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Job #{job.id}</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-2 max-w-2xl text-mist-300">{job.description}</p>
        </div>
      </div>

      <div className="mt-6 card p-6">
        <JobStepper status={job.status} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Client"><Addr value={job.client} className="text-mist-200" /></Field>
        <Field label="Provider"><Addr value={job.provider} className="text-mist-200" /></Field>
        <Field label="Evaluator"><Addr value={job.evaluator} className="text-mist-200" /></Field>
        <Field label="Budget"><span className="text-white">{formatStx(job.budget)} <span className="text-mist-500">STX</span></span></Field>
        <Field label="Expires at block"><span className="font-mono text-mist-200">#{job.expiredAt}</span></Field>
        <Field label="Job ID"><span className="font-mono text-mist-200">#{job.id}</span></Field>
      </div>

      {escrow > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-bitcoin/25 bg-bitcoin/10 px-4 py-2.5 text-sm text-bitcoin-400">
          <Coins className="h-4 w-4" /> Escrow locked: <span className="font-mono">{formatStx(escrow)} STX</span>
        </div>
      )}

      <div className="mt-6">
        <Link href="/jobs" className="btn-ghost">Manage on the Jobs page</Link>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-mist-500">{label}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
