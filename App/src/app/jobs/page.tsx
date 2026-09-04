'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bitcoin,
  Briefcase,
  Clock3,
  ExternalLink,
  Plus,
  RefreshCw,
  Star,
  Wallet,
} from "lucide-react";
import { request, isConnected } from "@stacks/connect";
import { Cl, Pc } from "@stacks/transactions";
import {
  assignSbtcProvider,
  appealSbtcDecision,
  completeSbtcJob,
  createSbtcJob,
  expireSbtcJob,
  fundSbtcJob,
  finalizeSbtcDecision,
  rateSbtcProvider,
  rejectSbtcJob,
  resolveSbtcAppeal,
  retrySbtcReputationSync,
  settleSbtcReviewTimeout,
  settleSbtcAppealTimeout,
  setSbtcBudget,
  submitSbtcWork,
} from "../../services/sbtc-commerce";
import {
  CommerceJob,
  Currency,
  canOfferRating,
  appealDeadlineText,
  autonomousPermissions,
  currencyDescription,
  durationToBlocks,
  expiryText,
  formatJobAmount,
  getCommerceJobCount,
  getCommerceJob,
  getCommerceEscrow,
  getCommerceJobs,
  getRatingAvailability,
  isValidStacksAddress,
  jobHref,
  jobPermissions,
  RatingAvailability,
  reviewDeadlineText,
  reviewPermissions,
} from "../../services/commerce";
import { getBlockHeight, getBurnBlockHeight } from "../../services/onchain-stats";
import { humanizeContractError } from "../../services/contract-errors";
import { trackTx, txExplorer, txIdOf } from "../../services/tx";
import StatusBadge from "../../components/StatusBadge";
import JobStepper from "../../components/JobStepper";
import ServiceFeeBreakdown from "../../components/ServiceFeeBreakdown";
import { feeAcceptanceKey, hasServiceFees, verifyFeeAction } from "../../services/service-fees";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";
import { sbtcToSats, stxToMicro } from "../../utils/format";
import {
  AGENTIC_COMMERCE_CONTRACT,
  NAYORI_EVALUATOR_ADDRESS,
} from "../../constants/contract";
import { decisionLabel } from "../../services/autonomous-decision";
import { NETWORK_NAME } from "../../constants/network";
import { BRANDED_RATING_MEMO } from "../../constants/brand";
import { getConnectedStxAddress } from "../../services/wallet";

const AGENTIC_COMMERCE =
  AGENTIC_COMMERCE_CONTRACT as `${string}.${string}`;
const STATUS_OPTIONS = ["all", "open", "funded", "submitted", "decision-pending", "disputed", "completed", "rejected", "expired", "timeout-paid"] as const;
const STATUS_INDEX: Record<string, number> = {
  open: 0,
  funded: 1,
  submitted: 2,
  completed: 3,
  rejected: 4,
  expired: 5,
  "timeout-paid": 6,
  "decision-pending": 7,
  disputed: 8,
};
const PAGE_SIZE = 20;

function exactEscrow(job: CommerceJob, allowZero = false) {
  const amount = job.escrow;
  if (
    amount === undefined ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    (!allowZero && amount === 0)
  ) {
    throw new Error(
      allowZero
        ? "Could not verify the current escrow balance."
        : "Could not verify a positive current escrow balance."
    );
  }
  return amount;
}

type ActionForm =
  | { jobId: number; mode: "budget"; value: string }
  | { jobId: number; mode: "provider"; value: string }
  | { jobId: number; mode: "deliverable"; value: string }
  | { jobId: number; mode: "appeal"; value: string }
  | { jobId: number; mode: "resolve-approve" | "resolve-reject"; value: string };

type TxProgress = {
  state: "awaiting" | "submitted" | "pending" | "confirmed" | "failed";
  label: string;
  txid?: string;
};

async function sha256Ascii(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function JobsPage() {
  const toast = useToast();
  const [currency, setCurrency] = useState<Currency>("sbtc");
  const [jobs, setJobs] = useState<CommerceJob[]>([]);
  const [page, setPage] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [height, setHeight] = useState(0);
  const [burnHeight, setBurnHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm | null>(null);
  const [acceptedFees, setAcceptedFees] = useState<Record<string, boolean>>({});
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingStates, setRatingStates] = useState<
    Record<string, RatingAvailability>
  >({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [txProgress, setTxProgress] = useState<TxProgress | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    evaluator: NAYORI_EVALUATOR_ADDRESS,
    provider: "",
    duration: "24",
    durationUnit: "hours" as "hours" | "days",
  });

  const isSbtc = currency === "sbtc";
  const unit = isSbtc ? "sBTC" : "STX";

  const refreshWallet = useCallback(() => {
    const next = getConnectedStxAddress();
    setAddress(next);
    setConnected(isConnected() && Boolean(next));
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, count, tip, burnTip] = await Promise.all([
        getCommerceJobs(currency, {
          newestFirst: true,
          includeEscrow: true,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        getCommerceJobCount(currency),
        getBlockHeight(),
        getBurnBlockHeight(),
      ]);
      setJobs(list);
      setTotalJobs(count);
      setHeight(tip);
      setBurnHeight(burnTip);
    } catch (err) {
      console.error("Error loading jobs:", err);
      setError("Failed to load jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currency, page]);

  useEffect(() => {
    const requestedStatus = new URLSearchParams(window.location.search).get("status");
    if (STATUS_OPTIONS.includes(requestedStatus as any)) {
      setStatusFilter(requestedStatus as (typeof STATUS_OPTIONS)[number]);
    }
    refreshWallet();
    loadJobs();
    window.addEventListener("perkos-wallet-change", refreshWallet);
    window.addEventListener("focus", refreshWallet);
    return () => {
      window.removeEventListener("perkos-wallet-change", refreshWallet);
      window.removeEventListener("focus", refreshWallet);
    };
  }, [loadJobs, refreshWallet]);

  useEffect(() => {
    let cancelled = false;
    const candidates = jobs.filter(
      (job) => jobPermissions(job, address).canRate
    );

    if (!connected || !address || candidates.length === 0) {
      setRatingStates({});
      return;
    }

    setRatingStates(
      Object.fromEntries(
        candidates.map((job) => [`${job.currency}:${job.id}`, "checking"])
      )
    );
    void Promise.all(
      candidates.map(async (job) => {
        const state = await getRatingAvailability(
          job.id,
          job.currency,
          address
        );
        return [`${job.currency}:${job.id}`, state] as const;
      })
    ).then((entries) => {
      if (!cancelled) setRatingStates(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [address, connected, jobs]);

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (statusFilter !== "all" && job.status !== STATUS_INDEX[statusFilter]) return false;
        if (
          mineOnly &&
          ![job.client, job.provider, job.evaluator].some(
            (party) => party && party.toUpperCase() === address.toUpperCase()
          )
        ) {
          return false;
        }
        return true;
      }),
    [address, jobs, mineOnly, statusFilter]
  );

  async function run(
    fn: () => Promise<any>,
    actionKey: string,
    label: string,
    after?: () => void,
    onStatus?: (status: "pending" | "success" | "failed") => void
  ) {
    if (!connected) {
      toast.error("Connect a wallet before submitting a transaction.");
      return;
    }
    setActiveAction(actionKey);
    setTxProgress({ state: "awaiting", label });
    try {
      const res = await fn();
      const id = txIdOf(res);
      if (!id) throw new Error("No transaction id returned");
      after?.();
      setTxProgress({ state: "submitted", label, txid: id });
      void trackTx(id, toast, loadJobs, (state) => {
        setTxProgress({
          state: state === "success" ? "confirmed" : state === "failed" ? "failed" : "pending",
          label,
          txid: id,
        });
        onStatus?.(state);
      });
    } catch (err) {
      console.error(`Error ${actionKey}:`, err);
      const message = humanizeContractError(err);
      setTxProgress({ state: "failed", label: message });
      toast.error(message);
    } finally {
      setActiveAction(null);
    }
  }

  const stxCall = (functionName: string, functionArgs: any[], extra: Record<string, any> = {}) =>
    request("stx_callContract", {
      contract: AGENTIC_COMMERCE,
      functionName,
      functionArgs,
      network: NETWORK_NAME,
      ...extra,
    });

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    const evaluator = formData.evaluator.trim();
    const provider = formData.provider.trim();
    const duration = Number(formData.duration);
    if (!isValidStacksAddress(evaluator) || (provider && !isValidStacksAddress(provider))) {
      toast.error("Enter valid Stacks addresses.");
      return;
    }
    if ([address, provider].filter(Boolean).some((party) => party.toUpperCase() === evaluator.toUpperCase())) {
      toast.error("The evaluator must be different from the client and provider.");
      return;
    }
    if (provider && provider.toUpperCase() === address.toUpperCase()) {
      toast.error("The provider must be different from the client.");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.error("Enter a valid duration.");
      return;
    }
    const tip = height || (await getBlockHeight());
    if (!tip) {
      toast.error("Could not read the current block height.");
      return;
    }
    const expiredAt = tip + durationToBlocks(duration, formData.durationUnit);
    await run(
      () =>
        isSbtc
          ? createSbtcJob(evaluator, expiredAt, formData.description, provider || undefined)
          : stxCall("create-job", [
              provider ? Cl.some(Cl.principal(provider)) : Cl.none(),
              Cl.principal(evaluator),
              Cl.uint(expiredAt),
              Cl.stringAscii(formData.description),
            ]),
      "creating",
      `Create ${unit} job`,
      () => setShowForm(false)
    );
  }

  function handleSetBudget(jobId: number) {
    if (!actionForm || actionForm.mode !== "budget" || !actionForm.value) return;
    const amount = isSbtc ? sbtcToSats(actionForm.value) : stxToMicro(actionForm.value);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toast.error(`Enter a valid positive ${unit} budget.`);
      return;
    }
    void run(
      () =>
        isSbtc
          ? setSbtcBudget(jobId, amount)
          : stxCall("set-budget", [Cl.uint(jobId), Cl.uint(amount)]),
      `setting-budget-${jobId}`,
      "Set budget",
      () => setActionForm(null)
    );
  }

  function handleAssignProvider(jobId: number) {
    if (!actionForm || actionForm.mode !== "provider") return;
    const provider = actionForm.value.trim();
    if (!isValidStacksAddress(provider)) {
      toast.error("Enter a valid provider address.");
      return;
    }
    void run(
      () =>
        isSbtc
          ? assignSbtcProvider(jobId, provider)
          : stxCall("assign-provider", [Cl.uint(jobId), Cl.principal(provider)]),
      `assigning-provider-${jobId}`,
      "Assign provider",
      () => setActionForm(null)
    );
  }

  async function handleSubmitWork(jobId: number) {
    if (!actionForm || actionForm.mode !== "deliverable" || !actionForm.value.trim()) {
      toast.error("Add a deliverable URL, CID or description.");
      return;
    }
    const digest = await sha256Ascii(actionForm.value.trim());
    await run(
      async () => {
        const job = jobs.find((item) => item.id === jobId);
        if (!job) throw new Error("Refresh the job before submitting.");
        await withFreshFee(job, async () => undefined, true);
        return isSbtc
          ? submitSbtcWork(jobId, digest)
          : stxCall("submit-work", [Cl.uint(jobId), Cl.bufferFromAscii(digest)]);
      },
      `submitting-${jobId}`,
      "Submit deliverable",
      () => setActionForm(null)
    );
  }

  async function withFreshFee<T>(job: CommerceJob, action: (fresh: CommerceJob) => Promise<T>, consent = false): Promise<T> {
    if (!hasServiceFees(job.currency)) return action(job);
    const fresh = await getCommerceJob(job.id, job.currency);
    if (!fresh) throw new Error("Could not reload the job before signing.");
    const key = feeAcceptanceKey(job, address);
    verifyFeeAction(job, fresh, address, consent ? (acceptedFees[key] ? key : "") : undefined);
    if (job.status === 7 || job.status === 8) {
      fresh.escrow = await getCommerceEscrow(job.id, job.currency);
      if (exactEscrow(fresh) !== fresh.budget || !fresh.serviceFee?.serviceRecorded || fresh.serviceFee.settlement) throw new Error("Could not verify exact unsettled gross escrow and evaluation.");
    }
    if (getConnectedStxAddress() !== address) throw new Error("Wallet account changed. Reconnect and review the job terms again.");
    return action(fresh);
  }

  const handleFundJob = (job: CommerceJob) =>
    run(
      () => withFreshFee(job, async (job) =>
        isSbtc
          ? fundSbtcJob(job.id, job.budget, address)
          : stxCall("fund-job", [Cl.uint(job.id)], {
              postConditions: [Pc.principal(address).willSendEq(job.budget).ustx()],
              postConditionMode: "deny",
            }), true),
      `funding-${job.id}`,
      `Fund job with ${unit}`
    );

  const settlementOptions = (job: CommerceJob, allowZero = false) => {
    const amount = exactEscrow(job, allowZero);
    return {
      postConditions:
        amount === 0
          ? []
          : [Pc.principal(AGENTIC_COMMERCE).willSendEq(amount).ustx()],
      postConditionMode: "deny" as const,
    };
  };

  const handleCompleteJob = (job: CommerceJob) =>
    run(
      () =>
        isSbtc
          ? completeSbtcJob(job.id, exactEscrow(job))
          : stxCall("complete-job", [Cl.uint(job.id)], settlementOptions(job)),
      `completing-${job.id}`,
      "Complete job"
    );

  const handleRejectJob = (job: CommerceJob) =>
    run(
      () =>
        isSbtc
          ? rejectSbtcJob(job.id, exactEscrow(job))
          : stxCall("reject-job", [Cl.uint(job.id)], settlementOptions(job)),
      `rejecting-${job.id}`,
      "Reject job"
    );

  const handleExpireJob = (job: CommerceJob) =>
    run(
      () =>
        isSbtc
          ? expireSbtcJob(job.id, exactEscrow(job, true))
          : stxCall("expire-job", [Cl.uint(job.id)], settlementOptions(job, true)),
      `expiring-${job.id}`,
      "Expire job and refund escrow"
    );

  const handleReviewTimeout = (job: CommerceJob) =>
    run(
      () =>
        isSbtc
          ? settleSbtcReviewTimeout(job.id, exactEscrow(job))
          : stxCall("settle-review-timeout", [Cl.uint(job.id)], settlementOptions(job)),
      `timing-out-${job.id}`,
      "Pay provider after review timeout"
    );

  async function handleAppealDecision(job: CommerceJob) {
    if (!actionForm || actionForm.mode !== "appeal" || !actionForm.value.trim()) {
      toast.error("Add an appeal evidence URL, CID or concise reference.");
      return;
    }
    const digest = await sha256Ascii(actionForm.value.trim());
    await run(
      () =>
        isSbtc
          ? appealSbtcDecision(job.id, digest)
          : stxCall("appeal-decision", [
              Cl.uint(job.id),
              Cl.bufferFromHex(digest),
            ], { postConditionMode: "deny" }),
      `appealing-${job.id}`,
      "Appeal Nayori decision",
      () => setActionForm(null)
    );
  }

  const handleFinalizeDecision = (job: CommerceJob) =>
    run(
      () => withFreshFee(job, async (job) =>
        isSbtc
          ? finalizeSbtcDecision(job.id, exactEscrow(job))
          : stxCall(
              "finalize-decision",
              [Cl.uint(job.id)],
              settlementOptions(job)
            )),
      `finalizing-decision-${job.id}`,
      "Finalize unappealed decision"
    );

  async function handleResolveAppeal(job: CommerceJob) {
    if (
      !actionForm ||
      (actionForm.mode !== "resolve-approve" && actionForm.mode !== "resolve-reject") ||
      !actionForm.value.trim()
    ) {
      toast.error("Add the human resolution evidence reference.");
      return;
    }
    const decision = actionForm.mode === "resolve-approve" ? 1 : 2;
    const digest = await sha256Ascii(actionForm.value.trim());
    await run(
      () => withFreshFee(job, async (job) =>
        isSbtc
          ? resolveSbtcAppeal(job.id, decision, digest, exactEscrow(job))
          : stxCall(
              "resolve-appeal",
              [Cl.uint(job.id), Cl.uint(decision), Cl.bufferFromHex(digest)],
              settlementOptions(job)
            )),
      `resolving-appeal-${job.id}`,
      `Resolve appeal: ${decision === 1 ? "approve" : "reject"}`,
      () => setActionForm(null)
    );
  }

  const handleSettleAppealTimeout = (job: CommerceJob) =>
    run(
      () => withFreshFee(job, async (job) =>
        isSbtc
          ? settleSbtcAppealTimeout(job.id, exactEscrow(job))
          : stxCall(
              "settle-appeal-timeout",
              [Cl.uint(job.id)],
              settlementOptions(job)
            )),
      `settling-appeal-timeout-${job.id}`,
      "Finalize original decision after appeal timeout"
    );

  const handleRetryReputation = (job: CommerceJob) =>
    run(
      () =>
        isSbtc
          ? retrySbtcReputationSync(job.id)
          : stxCall("retry-reputation-sync", [Cl.uint(job.id)], {
              postConditionMode: "deny",
            }),
      `retrying-reputation-${job.id}`,
      "Retry reputation synchronization"
    );

  const handleRate = (jobId: number) => {
    const ratingKey = `${currency}:${jobId}`;
    return run(
      () =>
        isSbtc
          ? rateSbtcProvider(jobId, ratingScore, BRANDED_RATING_MEMO)
          : stxCall("rate-provider", [
              Cl.uint(jobId),
              Cl.uint(ratingScore),
              Cl.stringAscii(BRANDED_RATING_MEMO),
            ]),
      `rating-${jobId}`,
      "Rate provider",
      () => {
        setRatingFor(null);
        setRatingStates((current) => ({
          ...current,
          [ratingKey]: "checking",
        }));
      },
      (state) => {
        if (state === "success" || state === "failed") {
          setRatingStates((current) => ({
            ...current,
            [ratingKey]: state === "success" ? "rated" : "available",
          }));
        }
      }
    );
  };

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
              ? "Recommended protocol: agent jobs settled in Bitcoin-denominated sBTC."
              : "Agent jobs with neutral evaluation and expiry-safe settlement in STX."}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={showForm ? "btn-ghost" : "btn-primary"}
          disabled={!connected || Boolean(activeAction)}
          title={!connected ? "Connect a wallet first" : undefined}
        >
          {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> Create Job</>}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
          {(["sbtc", "stx"] as Currency[]).map((value) => (
            <button
              key={value}
              onClick={() => {
                setCurrency(value);
                setPage(0);
                setActionForm(null);
                setRatingFor(null);
                setRatingStates({});
              }}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                currency === value
                  ? value === "sbtc"
                    ? "bg-bitcoin/15 text-bitcoin-400"
                    : "bg-white/[0.08] text-white"
                  : "text-mist-300 hover:text-white"
              }`}
            >
              {value === "sbtc" && <Bitcoin className="mr-1.5 inline h-4 w-4" />}
              {value === "sbtc"
                ? "sBTC · Recommended"
                : "STX"}
            </button>
          ))}
        </div>
        <span className="text-xs text-mist-500">{currencyDescription(currency)}</span>
      </div>

      {!connected && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm text-mist-300">
          <Wallet className="h-4 w-4 text-brand-300" /> Connect your wallet to create or manage escrow.
        </div>
      )}

      {txProgress && (
        <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          txProgress.state === "failed"
            ? "border-red-500/30 bg-red-500/10 text-red-300"
            : txProgress.state === "confirmed"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-brand/25 bg-brand/[0.06] text-mist-200"
        }`}>
          <span className="font-medium">{txProgress.label}</span>
          <span className="capitalize text-mist-400">{txProgress.state}</span>
          {txProgress.txid && (
            <a href={txExplorer(txProgress.txid)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline">
              Explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
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
            Client, provider and evaluator must be different wallets.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea
                value={formData.description}
                maxLength={512}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="field"
                rows={3}
                required
              />
            </div>
            <div>
              <label className="label">Evaluator</label>
              <input
                value={formData.evaluator}
                onChange={(e) => setFormData({ ...formData, evaluator: e.target.value.trim() })}
                className="field font-mono"
                placeholder={NETWORK_NAME === "mainnet" ? "SP…" : "ST…"}
                readOnly={Boolean(NAYORI_EVALUATOR_ADDRESS)}
                required
              />
              {NAYORI_EVALUATOR_ADDRESS && (
                <p className="mt-1 text-xs text-violet-300">
                  QA pins Nayori as the autonomous evaluator for controlled lifecycle tests.
                </p>
              )}
            </div>
            <div>
              <label className="label">Provider (optional)</label>
              <input
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value.trim() })}
                className="field font-mono"
                placeholder={NETWORK_NAME === "mainnet" ? "SP…" : "ST…"}
              />
            </div>
            <div>
              <label className="label">Duration</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  className="field"
                  required
                />
                <select
                  value={formData.durationUnit}
                  onChange={(e) => setFormData({ ...formData, durationUnit: e.target.value as "hours" | "days" })}
                  className="field w-32"
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <p className="mt-1 text-xs text-mist-500">Converted to an estimated Stacks block height.</p>
            </div>
          </div>
          <button type="submit" className="btn-primary mt-5" disabled={activeAction === "creating"}>
            {activeAction === "creating" ? "Awaiting wallet…" : `Create ${unit} Job`}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="field w-44">
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1)}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3.5 py-2 text-sm text-mist-300">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} disabled={!connected} />
          My jobs
        </label>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Loading {unit} jobs from chain…</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
          <p className="mt-3 text-mist-300">No matching {unit} jobs.</p>
          <p className="mt-1 text-sm text-mist-500">Change the filters or create a new job.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filteredJobs.map((job) => {
            const permissions = jobPermissions(job, address);
            const review = reviewPermissions(job, burnHeight, address);
            const autonomous = autonomousPermissions(job, burnHeight, address);
            const ratingState = ratingStates[`${job.currency}:${job.id}`];
            const canRate = canOfferRating(
              permissions.canRate,
              ratingState
            );
            const expired = height > 0 && height >= job.expiredAt;
            const canExpire = expired && (job.status === 0 || job.status === 1);
            const canRetryReputation = Boolean(address && job.reputationSyncPending);
            const hasActions =
              permissions.canSetBudget ||
              permissions.canFund ||
              permissions.canAssign ||
              permissions.canSubmit ||
              review.canEvaluatorSettle ||
              review.canTimeout ||
              autonomous.canAppeal ||
              autonomous.canFinalize ||
              autonomous.canResolve ||
              autonomous.canSettleAppealTimeout ||
              canRetryReputation ||
              permissions.canRate ||
              canExpire;

            return (
              <article key={`${currency}-${job.id}`} className="card card-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-white">Job #{job.id}</span>
                      <span className={`badge ${isSbtc ? "border-bitcoin/30 text-bitcoin-400" : "border-white/10 text-mist-400"}`}>
                        {isSbtc
                          ? "sBTC"
                          : "STX"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-mist-300">{job.description}</p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>

                <JobStepper status={job.status} />

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-6">
                  <div><dt className="text-xs text-mist-500">Client</dt><dd className="truncate text-xs text-mist-300"><Addr value={job.client} /></dd></div>
                  <div><dt className="text-xs text-mist-500">Provider</dt><dd className="truncate text-xs text-mist-300"><Addr value={job.provider} /></dd></div>
                  <div><dt className="text-xs text-mist-500">Evaluator</dt><dd className="truncate text-xs text-mist-300"><Addr value={job.evaluator} /></dd></div>
                  <div><dt className="text-xs text-mist-500">Budget</dt><dd className="text-white">{formatJobAmount(job.budget, currency)}</dd></div>
                  <div><dt className="text-xs text-mist-500">Expiry</dt><dd className={expired && job.status < 3 ? "text-red-300" : "text-mist-300"}>{expiryText(job.expiredAt, height, job.status)}</dd></div>
                  {job.reviewDeadline !== undefined && (
                    <div>
                      <dt className="text-xs text-mist-500">Bitcoin review window</dt>
                      <dd className={review.canTimeout ? "text-amber-300" : "text-mist-300"}>
                        {reviewDeadlineText(job.reviewDeadline, burnHeight)}
                      </dd>
                    </div>
                  )}
                </dl>

                <ServiceFeeBreakdown job={job} />
                {job.serviceFee && !job.serviceFeeUnavailable && (permissions.canFund || permissions.canSubmit) && (
                  <label className="mt-3 flex items-start gap-2 text-sm text-mist-300">
                    <input type="checkbox" className="mt-1 accent-orange-500" checked={!!acceptedFees[feeAcceptanceKey(job, address)]} onChange={(event) => setAcceptedFees((previous) => ({ ...previous, [feeAcceptanceKey(job, address)]: event.target.checked }))} />
                    <span>I accept the displayed gross budget and 2% included earned fee: provider receives net on approval; client receives net on evaluated rejection. Gas is separate.</span>
                  </label>
                )}

                {Boolean(job.escrow) && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-bitcoin/25 bg-bitcoin/10 px-2.5 py-1 text-xs text-bitcoin-400">
                    <Bitcoin className="h-3.5 w-3.5" /> Escrow locked: <span className="font-mono">{formatJobAmount(job.escrow!, currency)}</span>
                  </div>
                )}

                {job.decision && (
                  <div className="mt-3 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 text-xs text-mist-300">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        Nayori decision: <strong className="text-violet-200">
                          {decisionLabel(job.decision.originalDecision)}
                        </strong>
                      </span>
                      <span>
                        Evidence <code className="text-mist-200">{job.decision.evidenceHash.slice(0, 12)}…</code>
                      </span>
                      <span>
                        Explanation <code className="text-mist-200">{job.decision.explanationHash.slice(0, 12)}…</code>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-mist-400">
                      {job.status === 7 && (
                        <span>{appealDeadlineText("Appeal", job.decision.appealDeadline, burnHeight)}</span>
                      )}
                      {job.status === 8 && (
                        <span>{appealDeadlineText("Resolution", job.decision.resolutionDeadline, burnHeight)}</span>
                      )}
                      {job.appealAuthority && (
                        <span>Human authority: <Addr value={job.appealAuthority} /></span>
                      )}
                    </div>
                    <p className="mt-2 text-mist-500">
                      Recording the decision did not move escrow. Settlement occurs only after the
                      appeal path reaches a terminal action.
                    </p>
                  </div>
                )}

                {job.reputationSyncPending && (
                  <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
                    Economic settlement is final. Reputation synchronization is pending
                    {job.reputationSyncLastError
                      ? ` (registry error u${job.reputationSyncLastError})`
                      : ""}
                    ; any connected wallet may retry it.
                  </div>
                )}

                {actionForm?.jobId === job.id && (
                  <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                    {actionForm.mode === "budget" && (
                      <InlineAction
                        type="number"
                        step={isSbtc ? "0.00000001" : "0.000001"}
                        placeholder={`Budget in ${unit}`}
                        value={actionForm.value}
                        onChange={(value) => setActionForm({ ...actionForm, value })}
                        onSubmit={() => handleSetBudget(job.id)}
                        onCancel={() => setActionForm(null)}
                      />
                    )}
                    {actionForm.mode === "provider" && (
                      <InlineAction
                        placeholder="Provider address"
                        value={actionForm.value}
                        onChange={(value) => setActionForm({ ...actionForm, value })}
                        onSubmit={() => handleAssignProvider(job.id)}
                        onCancel={() => setActionForm(null)}
                      />
                    )}
                    {actionForm.mode === "deliverable" && (
                      <>
                        <InlineAction
                          placeholder="Deliverable URL, IPFS CID or result reference"
                          value={actionForm.value}
                          onChange={(value) => setActionForm({ ...actionForm, value })}
                          onSubmit={() => void handleSubmitWork(job.id)}
                          onCancel={() => setActionForm(null)}
                        />
                        <p className="mt-2 text-xs text-mist-500">A SHA-256 commitment of this reference will be stored on-chain.</p>
                      </>
                    )}
                    {actionForm.mode === "appeal" && (
                      <>
                        <InlineAction
                          placeholder="Appeal evidence URL, CID or concise reference"
                          value={actionForm.value}
                          onChange={(value) => setActionForm({ ...actionForm, value })}
                          onSubmit={() => void handleAppealDecision(job)}
                          onCancel={() => setActionForm(null)}
                        />
                        <p className="mt-2 text-xs text-mist-500">
                          Only its SHA-256 commitment is submitted on-chain.
                        </p>
                      </>
                    )}
                    {(actionForm.mode === "resolve-approve" ||
                      actionForm.mode === "resolve-reject") && (
                      <>
                        <InlineAction
                          placeholder="Human resolution evidence URL, CID or reference"
                          value={actionForm.value}
                          onChange={(value) => setActionForm({ ...actionForm, value })}
                          onSubmit={() => void handleResolveAppeal(job)}
                          onCancel={() => setActionForm(null)}
                        />
                        <p className="mt-2 text-xs text-mist-500">
                          Final direction: {actionForm.mode === "resolve-approve" ? "approve" : "reject"}.
                          Settlement uses the exact live escrow and pinned recipients.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {ratingFor === job.id && canRate && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                    <span className="text-sm text-mist-300">Rate the provider</span>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button key={score} type="button" onClick={() => setRatingScore(score)} aria-label={`${score} stars`} className="p-0.5">
                        <Star className={`h-5 w-5 ${score <= ratingScore ? "fill-amber-300 text-amber-300" : "text-mist-500"}`} />
                      </button>
                    ))}
                    <button onClick={() => void handleRate(job.id)} className="btn-sm ml-auto bg-brand text-white hover:bg-brand-600">
                      Submit
                    </button>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                  {permissions.canSetBudget && (
                    <button onClick={() => setActionForm({ jobId: job.id, mode: "budget", value: "" })} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">Set Budget</button>
                  )}
                  {permissions.canFund && (
                    <button disabled={hasServiceFees(currency) && (!job.serviceFee || job.serviceFeeUnavailable || !acceptedFees[feeAcceptanceKey(job, address)])} onClick={() => void handleFundJob(job)} className="btn-sm border border-bitcoin/30 text-bitcoin-400 hover:bg-bitcoin/10 disabled:opacity-40">Fund with {unit}</button>
                  )}
                  {permissions.canAssign && (
                    <button onClick={() => setActionForm({ jobId: job.id, mode: "provider", value: "" })} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">Assign Provider</button>
                  )}
                  {permissions.canSubmit && (
                    <button disabled={hasServiceFees(currency) && (!job.serviceFee || job.serviceFeeUnavailable || !acceptedFees[feeAcceptanceKey(job, address)])} onClick={() => setActionForm({ jobId: job.id, mode: "deliverable", value: "" })} className="btn-sm bg-brand text-white hover:bg-brand-600 disabled:opacity-40">Submit Work</button>
                  )}
                  {review.canEvaluatorSettle && (
                    <>
                      <button onClick={() => void handleCompleteJob(job)} className="btn-sm border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">Complete</button>
                      <button onClick={() => void handleRejectJob(job)} className="btn-sm border border-red-500/25 text-red-300 hover:bg-red-500/10">Reject</button>
                    </>
                  )}
                  {review.canTimeout && (
                    <button onClick={() => void handleReviewTimeout(job)} className="btn-sm border border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
                      <Clock3 className="h-3.5 w-3.5" /> Pay provider after timeout
                    </button>
                  )}
                  {autonomous.canAppeal && (
                    <button
                      onClick={() => setActionForm({ jobId: job.id, mode: "appeal", value: "" })}
                      className="btn-sm border border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/10"
                    >
                      Appeal decision
                    </button>
                  )}
                  {autonomous.canFinalize && (
                    <button
                      onClick={() => void handleFinalizeDecision(job)}
                      className="btn-sm border border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
                    >
                      Finalize decision
                    </button>
                  )}
                  {autonomous.canResolve && (
                    <>
                      <button
                        onClick={() => setActionForm({ jobId: job.id, mode: "resolve-approve", value: "" })}
                        className="btn-sm border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                      >
                        Resolve: approve
                      </button>
                      <button
                        onClick={() => setActionForm({ jobId: job.id, mode: "resolve-reject", value: "" })}
                        className="btn-sm border border-red-500/30 text-red-300 hover:bg-red-500/10"
                      >
                        Resolve: reject
                      </button>
                    </>
                  )}
                  {autonomous.canSettleAppealTimeout && (
                    <button
                      onClick={() => void handleSettleAppealTimeout(job)}
                      className="btn-sm border border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                    >
                      <Clock3 className="h-3.5 w-3.5" /> Finalize after appeal timeout
                    </button>
                  )}
                  {canRetryReputation && (
                    <button onClick={() => void handleRetryReputation(job)} className="btn-sm border border-brand/30 text-brand-200 hover:bg-brand/10">
                      <RefreshCw className="h-3.5 w-3.5" /> Retry reputation sync
                    </button>
                  )}
                  {canExpire && (
                    <button onClick={() => void handleExpireJob(job)} className="btn-sm border border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
                      <Clock3 className="h-3.5 w-3.5" /> Expire & refund
                    </button>
                  )}
                  {canRate && (
                    <button onClick={() => setRatingFor(ratingFor === job.id ? null : job.id)} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">
                      <Star className="h-3.5 w-3.5" /> Rate provider
                    </button>
                  )}
                  {permissions.canRate && ratingState === "rated" && (
                    <span className="self-center text-xs text-emerald-300">
                      Rating submitted
                    </span>
                  )}
                  {permissions.canRate && ratingState === "checking" && (
                    <span className="self-center text-xs text-mist-500">
                      Checking rating…
                    </span>
                  )}
                  {permissions.canRate && ratingState === "unavailable" && (
                    <span
                      className="self-center text-xs text-amber-300"
                      title="Reload to retry the on-chain rating check"
                    >
                      Rating status unavailable
                    </span>
                  )}
                  {!hasActions && connected && (
                    <span className="self-center text-xs text-mist-500">No actions available for this wallet.</span>
                  )}
                  <Link href={jobHref(job.id, currency)} className="btn-sm ml-auto border border-white/[0.12] text-mist-300 hover:text-white">Details</Link>
                </div>
              </article>
            );
          })}
          {totalJobs > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
              <span className="text-sm text-mist-500">Page {page + 1} of {Math.ceil(totalJobs / PAGE_SIZE)}</span>
              <button className="btn-ghost" disabled={(page + 1) * PAGE_SIZE >= totalJobs} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InlineAction({
  type = "text",
  step,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  type?: string;
  step?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        type={type}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field flex-1"
      />
      <button onClick={onSubmit} className="btn-primary" type="button">Confirm</button>
      <button onClick={onCancel} className="btn-ghost" type="button">Cancel</button>
    </div>
  );
}
