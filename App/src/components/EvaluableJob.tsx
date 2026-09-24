"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, FileCheck2, Loader2, ShieldCheck } from "lucide-react";

import type { CommerceJob, Currency } from "../services/commerce";
import {
  type EvaluableJobContext,
  buildCommittedSubmission,
  buildEvaluationRequest,
  committedEvidenceHash,
  hasCriteriaCommitment,
  parseEvaluableDescription,
} from "../services/evaluable-jobs";
import type { EvaluationEvidence } from "../services/evaluation-commitments";
import { AGENTIC_COMMERCE_CONTRACT, CONTRACT_ADDRESS, NAYORI_EVALUATOR_ADDRESS, SBTC_COMMERCE_CONTRACT_NAME } from "../constants/contract";
import { NETWORK_NAME } from "../constants/network";

export function evaluableContext(job: CommerceJob, currency: Currency): EvaluableJobContext {
  return {
    network: NETWORK_NAME === "mainnet" ? "mainnet" : "testnet",
    asset: currency,
    contract: currency === "sbtc" ? `${CONTRACT_ADDRESS}.${SBTC_COMMERCE_CONTRACT_NAME}` : AGENTIC_COMMERCE_CONTRACT,
    client: job.client,
    evaluator: job.evaluator,
  };
}

const evidenceKey = (currency: Currency, jobId: number) => `nayori:evidence:${NETWORK_NAME}:${currency}:${jobId}`;

function rememberEvidence(currency: Currency, jobId: number, uri: string) {
  try {
    window.localStorage.setItem(evidenceKey(currency, jobId), uri);
  } catch {
    /* per-viewer convenience only */
  }
}

function recallEvidence(currency: Currency, jobId: number): string {
  try {
    return window.localStorage.getItem(evidenceKey(currency, jobId)) ?? "";
  } catch {
    return "";
  }
}

async function inspectEvidence(uri: string): Promise<EvaluationEvidence> {
  const response = await fetch("/api/evidence/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri }),
  });
  const payload = (await response.json()) as { message?: string; uri?: string; sha256?: string; sizeBytes?: number; mediaType?: string };
  if (!response.ok || !payload.sha256 || !payload.uri || payload.sizeBytes === undefined || !payload.mediaType) {
    throw new Error(payload.message ?? "The evidence could not be inspected.");
  }
  return { id: "deliverable", uri: payload.uri, sha256: payload.sha256, mediaType: payload.mediaType, sizeBytes: payload.sizeBytes };
}

/** Task, numbered acceptance criteria and the on-chain commitment of an evaluable job. */
export function JobCriteria({ description, compact = false }: { description: string; compact?: boolean }) {
  if (!hasCriteriaCommitment(description)) return null;
  const parsed = parseEvaluableDescription(description);
  if (!parsed) {
    return (
      <p className={`${compact ? "mt-2" : "mt-4"} inline-flex items-center gap-1.5 text-xs text-violet-300`}>
        <ShieldCheck className="h-3.5 w-3.5" /> Acceptance criteria committed on-chain (manifest held by the client, SDK or MCP job).
      </p>
    );
  }
  return (
    <div className={`${compact ? "mt-2" : "mt-4"} rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-3 text-xs`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-violet-200">
        <span className="inline-flex items-center gap-1.5 font-medium"><ClipboardList className="h-3.5 w-3.5" /> Acceptance criteria</span>
        <span className="font-mono text-[11px] text-mist-500" title={parsed.criteriaHash}>commitment {parsed.criteriaHash.slice(0, 12)}…</span>
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-mist-300">
        {parsed.criteria.map((criterion, index) => (
          <li key={index}>{criterion}</li>
        ))}
      </ol>
      <p className="mt-2 text-mist-500">
        Nayori&apos;s evaluator checks the delivered evidence against these criteria and records the decision on-chain.
      </p>
    </div>
  );
}

/** Task text without the criteria block, for cards that render the criteria separately. */
export function jobTaskText(description: string): string {
  return parseEvaluableDescription(description)?.task ?? description;
}

export function CommittedSubmitForm({
  job,
  currency,
  provider,
  busy,
  onSubmit,
  onCancel,
}: {
  job: CommerceJob;
  currency: Currency;
  provider: string;
  busy: boolean;
  onSubmit: (deliverable: Uint8Array, evidence: EvaluationEvidence) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [uri, setUri] = useState("");
  const [inspected, setInspected] = useState<EvaluationEvidence | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function inspect() {
    setWorking(true);
    setError(null);
    try {
      setInspected(await inspectEvidence(uri.trim()));
    } catch (reason) {
      setInspected(null);
      setError(reason instanceof Error ? reason.message : "The evidence could not be inspected.");
    } finally {
      setWorking(false);
    }
  }

  async function submit() {
    if (!inspected) return;
    setWorking(true);
    setError(null);
    try {
      const submission = await buildCommittedSubmission({
        ...evaluableContext(job, currency),
        jobId: job.id,
        provider,
        description: job.description,
        evidence: [inspected],
      });
      rememberEvidence(currency, job.id, inspected.uri);
      await onSubmit(submission.deliverable, inspected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The submission could not be prepared.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-mist-400">
        Publish your deliverable as a public text file (nayori.ai, a GitHub raw file or a public Gist, up to 8 KB), paste its URL,
        inspect it, then submit. Only the evidence commitment goes on-chain.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          placeholder="https://gist.githubusercontent.com/…/raw/…/deliverable.txt"
          value={uri}
          onChange={(event) => { setUri(event.target.value); setInspected(null); }}
          className="field flex-1 font-mono text-xs"
        />
        <button type="button" onClick={() => void inspect()} disabled={working || !uri.trim()} className="btn-ghost disabled:opacity-40">
          {working && !inspected ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inspect"}
        </button>
        <button type="button" onClick={() => void submit()} disabled={!inspected || working || busy} className="btn-primary disabled:opacity-40">
          Submit on-chain
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
      {inspected && (
        <p className="inline-flex flex-wrap items-center gap-x-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> {inspected.sizeBytes} bytes · {inspected.mediaType}
          <span className="font-mono text-mist-400">sha256 {inspected.sha256.slice(0, 16)}…</span>
        </p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

type RelayState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "queued"; evaluationId: string }
  | { kind: "manual"; request: unknown }
  | { kind: "error"; message: string };

/** After a committed submission: asks Nayori's evaluator to decide the job. */
export function RequestEvaluationPanel({ job, currency }: { job: CommerceJob; currency: Currency }) {
  const [uri, setUri] = useState("");
  const [state, setState] = useState<RelayState>({ kind: "idle" });

  useEffect(() => {
    setUri(recallEvidence(currency, job.id));
  }, [currency, job.id]);

  const parsed = parseEvaluableDescription(job.description);
  const onChainEvidenceHash = committedEvidenceHash(job.deliverable);
  if (job.status !== 2 || !parsed || !onChainEvidenceHash || !job.provider) return null;
  if (job.evaluator.toUpperCase() !== NAYORI_EVALUATOR_ADDRESS.toUpperCase()) return null;

  async function requestEvaluation() {
    setState({ kind: "working" });
    try {
      const evidence = await inspectEvidence(uri.trim());
      const submission = await buildCommittedSubmission({
        ...evaluableContext(job, currency),
        jobId: job.id,
        provider: job.provider!,
        description: job.description,
        evidence: [evidence],
      });
      if (submission.evidenceHash !== onChainEvidenceHash) {
        throw new Error("This evidence does not match the commitment submitted on-chain. Use the exact file that was submitted.");
      }
      const body = await buildEvaluationRequest({
        context: evaluableContext(job, currency),
        jobId: job.id,
        provider: job.provider!,
        description: job.description,
        reviewDeadlineBurn: job.reviewDeadline ?? 0,
        evidence: [evidence],
      });
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { evaluationId?: string; message?: string; request?: unknown; error?: string };
      if (response.status === 503 && payload.request) {
        setState({ kind: "manual", request: payload.request });
      } else if (response.status === 200 || response.status === 201 || response.status === 202) {
        setState({ kind: "queued", evaluationId: payload.evaluationId ?? body.evaluationId });
      } else {
        setState({ kind: "error", message: payload.message ?? `The evaluator answered HTTP ${response.status}.` });
      }
    } catch (reason) {
      setState({ kind: "error", message: reason instanceof Error ? reason.message : "The evaluation could not be requested." });
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 text-xs text-mist-300">
      <div className="flex items-center gap-1.5 text-violet-200">
        <FileCheck2 className="h-3.5 w-3.5" /> <span className="font-medium">Evidence committed on-chain</span>
        <span className="font-mono text-[11px] text-mist-500" title={onChainEvidenceHash}>{onChainEvidenceHash.slice(0, 12)}…</span>
      </div>
      <p className="mt-1 text-mist-400">
        Ask Nayori&apos;s evaluator to decide this job. It downloads the evidence, checks the commitment and records the
        decision on-chain within the Bitcoin review window.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          placeholder="Evidence URL submitted with the work"
          value={uri}
          onChange={(event) => setUri(event.target.value)}
          className="field flex-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void requestEvaluation()}
          disabled={state.kind === "working" || !uri.trim()}
          className="btn-sm border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 disabled:opacity-40"
        >
          {state.kind === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Request evaluation"}
        </button>
      </div>
      {state.kind === "queued" && (
        <p className="mt-2 text-emerald-300">Evaluation queued (id {state.evaluationId}). The decision appears here once it is recorded on-chain.</p>
      )}
      {state.kind === "manual" && (
        <div className="mt-2">
          <p className="text-amber-300">The evaluator relay is not enabled on this deployment. Send this request body to the Nayori operator:</p>
          <textarea readOnly className="field mt-1 h-32 w-full font-mono text-[11px]" value={JSON.stringify(state.request, null, 2)} />
        </div>
      )}
      {state.kind === "error" && <p className="mt-2 text-red-300">{state.message}</p>}
    </div>
  );
}
