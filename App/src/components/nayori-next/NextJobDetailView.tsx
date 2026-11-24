'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bitcoin, Briefcase, Coins, FileCheck2, Gavel, RefreshCw, Star } from "lucide-react";
import { NAYORI_NEXT, isMultisigAddress, nextEscrowContract, type NextAsset } from "../../constants/nayori-next";
import {
  getNextAgent,
  getNextApplications,
  getNextBurnHeight,
  getNextJobDetail,
  getNextProviderStats,
  type NextJobDetail,
} from "../../services/nayori-next/reads";
import { averageRating, type NextApplication, type NextProviderStats } from "../../services/nayori-next/parse";
import {
  NEXT_STATUS_HINTS,
  blocksToDuration,
  deadlineLabel,
  deadlineText,
  formatNextAmount,
  quoteNextFee,
} from "../../services/nayori-next/status";
import { committedEvidenceHash } from "../../services/evaluable-jobs";
import { formatSbtcCompact, formatStx } from "../../utils/format";
import { EvaluationRequestPanel, JobCriteria, jobTaskText } from "../EvaluableJob";
import NextJobActions from "./NextJobActions";
import NextApplications from "./NextApplications";
import { Field, NextAddr, NextBanner, NextStatusBadge, TxProgressBar } from "./ui";
import { useNextWallet } from "./useNextWallet";

export default function NextJobDetailView({ id, asset }: { id: number; asset: NextAsset }) {
  const [detail, setDetail] = useState<NextJobDetail | null>(null);
  const [height, setHeight] = useState(0);
  const [stats, setStats] = useState<NextProviderStats | null>(null);
  const [applications, setApplications] = useState<NextApplication[]>([]);
  const [isAgent, setIsAgent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [next, tip] = await Promise.all([getNextJobDetail(asset, id), getNextBurnHeight()]);
        setDetail(next);
        setHeight(tip);
        if (next) {
          const [providerStats, list, agent] = await Promise.all([
            next.job.provider ? getNextProviderStats(next.job.provider) : Promise.resolve(null),
            asset === "sbtc" ? getNextApplications(id) : Promise.resolve([]),
            address ? getNextAgent(address) : Promise.resolve(null),
          ]);
          setStats(providerStats);
          setApplications(list);
          setIsAgent(Boolean(agent));
        }
      } catch (reason) {
        console.error("Error loading the Nayori job:", reason);
        setError("Could not load this job from the Nayori contracts. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [address, asset, id]
  );

  const wallet = useNextWallet(useCallback(() => void load(true), [load]));
  useEffect(() => setAddress(wallet.address), [wallet.address]);
  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
      <ArrowLeft className="h-4 w-4" /> Back to Jobs
    </Link>
  );

  if (loading && !detail) {
    return (
      <div className="container-x py-20 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="container-x py-12">
        {back}
        <p className="mt-8 text-mist-300">{error ?? `${asset === "sbtc" ? "sBTC" : "STX"} job #${id} was not found.`}</p>
        <button onClick={() => void load()} className="btn-ghost mt-4">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const { job, submission, decision } = detail;
  const amount = (value: number) => formatNextAmount(value, asset);
  const fee = quoteNextFee(job.budget);
  const evidence = submission ? committedEvidenceHash(submission.deliverable) : null;

  return (
    <div className="container-x py-12">
      {back}
      <div className="mt-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand-300">
          <Briefcase className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Job #{job.id}</h1>
            <NextStatusBadge status={job.status} />
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${asset === "sbtc" ? "border-bitcoin/30 text-bitcoin-400" : "border-white/10 text-mist-400"}`}>
              {asset === "sbtc" && <Bitcoin className="h-3 w-3" />}
              {asset === "sbtc" ? "sBTC" : "STX"}
            </span>
            <button onClick={() => void load()} className="btn-ghost ml-auto" aria-label="Refresh job">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
          <p className="mt-2 max-w-2xl whitespace-pre-line break-words text-mist-300">{jobTaskText(job.description)}</p>
          <JobCriteria description={job.description} />
          <p className="mt-2 text-sm text-mist-500">{NEXT_STATUS_HINTS[job.statusName]}</p>
        </div>
      </div>

      <NextBanner />
      <TxProgressBar progress={wallet.progress} />
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Client"><NextAddr value={job.client} className="text-mist-200" /></Field>
        <Field label="Provider"><NextAddr value={job.provider} className="text-mist-200" /></Field>
        <Field label="Evaluator"><NextAddr value={job.evaluator} className="text-mist-200" /></Field>
        <Field label="Budget">
          <span className="text-white">{amount(job.budget)}</span>
          <span className="mt-1 block text-xs text-mist-500">
            On a decision: {amount(fee.net)} to the winner, {amount(fee.fee)} (2%) to the treasury
          </span>
        </Field>
        <Field label="Treasury">
          <NextAddr value={job.treasury} className="text-mist-200" />
          {isMultisigAddress(job.treasury) && <span className="mt-1 block text-xs text-mist-500">Multisig account</span>}
        </Field>
        <Field label="Appeal authority">
          <NextAddr value={job.appealAuthority} className="text-mist-200" />
          <span className="mt-1 block text-xs text-mist-500">
            {isMultisigAddress(job.appealAuthority) ? "Multisig account, pinned on this job" : "Pinned on this job"}
          </span>
        </Field>
        {job.status <= 3 && (
          <Field label={deadlineLabel(job)}>
            <span className="text-mist-200">{deadlineText(job.deliveryDeadline, height)}</span>
            <span className="mt-1 block font-mono text-xs text-mist-500">Bitcoin block {job.deliveryDeadline.toLocaleString("en-US")}</span>
          </Field>
        )}
        <Field label="Windows">
          <span className="text-mist-200">
            Delivery {job.deliveryBlocks} blocks ({blocksToDuration(job.deliveryBlocks)})
          </span>
          <span className="mt-1 block text-mist-200">
            Review {job.reviewBlocks} blocks ({blocksToDuration(job.reviewBlocks)})
          </span>
        </Field>
        <Field label="Bitcoin height now">
          <span className="font-mono text-mist-200">{height ? height.toLocaleString("en-US") : "Unknown"}</span>
        </Field>
      </div>

      {detail.escrow > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-bitcoin/25 bg-bitcoin/10 px-4 py-2.5 text-sm text-bitcoin-400">
          <Coins className="h-4 w-4" /> Held in escrow: <span className="font-mono">{amount(detail.escrow)}</span>
        </div>
      )}

      {submission && (
        <div className="card mt-4 p-5">
          <p className="text-xs text-mist-500">Delivery commitment</p>
          <p className="mt-2 break-all font-mono text-sm text-mist-200">
            <FileCheck2 className="mr-2 inline h-4 w-4 text-brand-300" />
            {submission.deliverable}
          </p>
          {evidence && <p className="mt-2 text-xs text-mist-500">Nayori evidence commitment (ny1): {evidence}</p>}
          <p className="mt-2 text-sm text-mist-300">
            Review deadline: {deadlineText(submission.reviewDeadline, height, true)}
          </p>
          <EvaluationRequestPanel
            context={{
              network: NAYORI_NEXT.network,
              asset,
              contract: nextEscrowContract(asset),
              client: job.client,
              evaluator: job.evaluator,
            }}
            scope={nextEscrowContract(asset)}
            jobId={job.id}
            submitted={job.status === 4}
            description={job.description}
            provider={job.provider}
            deliverableHex={submission.deliverable}
            reviewDeadlineBurn={submission.reviewDeadline}
          />
        </div>
      )}

      {decision && (
        <div className="card mt-4 p-5">
          <p className="flex items-center gap-2 text-xs text-mist-500"><Gavel className="h-4 w-4" /> Decision</p>
          <p className="mt-2 text-white">
            {decision.decision === "approve" ? "Approved" : "Rejected"}
            {decision.byDefault && " by default, after the review window passed"}
          </p>
          {!decision.byDefault && (
            <p className="mt-1 break-all font-mono text-xs text-mist-500">Evidence hash {decision.evidenceHash}</p>
          )}
          {job.status === 5 && (
            <p className="mt-2 text-sm text-mist-300">
              Appeal deadline: {deadlineText(decision.appealDeadline, height, true)}
            </p>
          )}
          {decision.appellant && (
            <p className="mt-2 text-sm text-mist-300">
              Appealed by <NextAddr value={decision.appellant} />.
              {decision.resolutionDeadline !== undefined && job.status === 6 &&
                ` Resolution deadline: ${deadlineText(decision.resolutionDeadline, height, true)}. If it passes, the original decision stands.`}
            </p>
          )}
          {decision.appellant && (job.status === 7 || job.status === 8) && (
            <p className="mt-2 text-sm text-mist-200">
              {(job.status === 7 ? "approve" : "reject") === decision.decision
                ? "Final: the original decision stands."
                : `Final: the appeal authority changed the decision. ${job.status === 7 ? "Approved and paid to the provider." : "Rejected and returned to the client."}`}
            </p>
          )}
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">What you can do</h2>
        <NextJobActions detail={detail} wallet={wallet.address} burnHeight={height} busy={wallet.busy} run={wallet.run} />
      </section>

      {stats && job.provider && <ProviderRecord stats={stats} />}

      {asset === "sbtc" && (
        <NextApplications
          job={job}
          applications={applications}
          wallet={wallet.address}
          isAgent={isAgent}
          burnHeight={height}
          busy={wallet.busy}
          run={wallet.run}
        />
      )}
    </div>
  );
}

/** Raw reputation data from the registry; it computes no score. */
function ProviderRecord({ stats }: { stats: NextProviderStats }) {
  const rating = averageRating(stats);
  const items = [
    ["Completed", stats.completed.toLocaleString("en-US")],
    ["Rejected", stats.rejected.toLocaleString("en-US")],
    ["Not delivered", stats.notDelivered.toLocaleString("en-US")],
    ["Distinct clients", stats.distinctClients.toLocaleString("en-US")],
    ["Completed value in sBTC", formatSbtcCompact(stats.completedValueSbtc)],
    ["Completed value in STX", `${formatStx(stats.completedValueStx)} STX`],
    ["Average rating", rating === null ? "No ratings yet" : `${rating.toFixed(1)} of 5 (${stats.ratingCount})`],
  ];
  return (
    <section className="card mt-6 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Star className="h-5 w-5 text-brand-300" /> Provider record
      </h2>
      <p className="mt-1 text-sm text-mist-400">
        Counted across all jobs on the Nayori contracts. Look at value and distinct clients, not only the counts.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-mist-500">{label}</dt>
            <dd className="text-mist-200">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
