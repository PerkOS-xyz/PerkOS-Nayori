'use client';

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bitcoin, Briefcase, Clock3, Coins, FileCheck2 } from "lucide-react";
import {
  CommerceJob,
  currencyProtocolLabel,
  expiryText,
  formatJobAmount,
  getCommerceEscrow,
  getCommerceJob,
  parseCurrency,
} from "../../../services/commerce";
import { getBlockHeight } from "../../../services/onchain-stats";
import StatusBadge from "../../../components/StatusBadge";
import JobStepper from "../../../components/JobStepper";
import Addr from "../../../components/Addr";

export default function JobDetailPage() {
  const id = Number(useParams().id);
  const currency = parseCurrency(useSearchParams().get("currency"));
  const [job, setJob] = useState<CommerceJob | null>(null);
  const [escrow, setEscrow] = useState(0);
  const [height, setHeight] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [nextJob, tip] = await Promise.all([
        getCommerceJob(id, currency),
        getBlockHeight(),
      ]);
      setJob(nextJob);
      setHeight(tip);
      setEscrow(nextJob ? await getCommerceEscrow(id, currency) : 0);
      setLoading(false);
    })();
  }, [currency, id]);

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
        <p className="mt-8 text-mist-300">{currency === "sbtc" ? "sBTC" : "STX"} job #{id} not found.</p>
      </div>
    );
  }

  const expired = height > 0 && height >= job.expiredAt;

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
            <span className={`badge ${currency === "sbtc" ? "border-bitcoin/30 text-bitcoin-400" : "border-white/10 text-mist-400"}`}>
              {currency === "sbtc" && <Bitcoin className="h-3 w-3" />}
              {currencyProtocolLabel(currency)}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-mist-300">{job.description}</p>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <JobStepper status={job.status} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Client"><Addr value={job.client} className="text-mist-200" /></Field>
        <Field label="Provider"><Addr value={job.provider} className="text-mist-200" /></Field>
        <Field label="Evaluator"><Addr value={job.evaluator} className="text-mist-200" /></Field>
        <Field label="Budget"><span className="text-white">{formatJobAmount(job.budget, currency)}</span></Field>
        <Field label="Expiration">
          <span className={expired ? "text-red-300" : "text-mist-200"}>
            <Clock3 className="mr-1.5 inline h-4 w-4" /> {expiryText(job.expiredAt, height, job.status)}
          </span>
          <span className="mt-1 block font-mono text-xs text-mist-500">Block #{job.expiredAt}</span>
        </Field>
        <Field label="Protocol"><span className="text-mist-200">{currencyProtocolLabel(currency)} escrow</span></Field>
      </div>

      {job.deliverable && (
        <div className="card mt-4 p-5">
          <p className="text-xs text-mist-500">Deliverable commitment</p>
          <p className="mt-2 break-all font-mono text-sm text-mist-200">
            <FileCheck2 className="mr-2 inline h-4 w-4 text-brand-300" />
            {job.deliverable}
          </p>
          <p className="mt-2 text-xs text-mist-500">On-chain buffer commitment. New app submissions use SHA-256.</p>
        </div>
      )}

      {escrow > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-bitcoin/25 bg-bitcoin/10 px-4 py-2.5 text-sm text-bitcoin-400">
          <Coins className="h-4 w-4" /> Escrow locked: <span className="font-mono">{formatJobAmount(escrow, currency)}</span>
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
      <div className="mt-1.5 text-sm">{children}</div>
    </div>
  );
}
