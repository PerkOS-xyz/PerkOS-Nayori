"use client";
import { useEffect, useState } from "react";
import { estimatedDuration } from "../services/workflow-timing";
import { NETWORK_NAME } from "../constants/network";

interface Deadline { deadlineBurnHeight: number; remainingBurnBlocks: number; deadlinePassed: boolean }
interface Timing {
  network: string; asset: string; observedAt: string;
  confirmationPolicy: { workflowBurnBlocks: number; settlementBurnBlocks: number };
  contractWindows: { reviewWindowBurnBlocks: number; appealWindowBurnBlocks: number };
  job: null | { review: Deadline | null; appeal: Deadline | null; resolution: Deadline | null; originalDecision: number | null };
}
export default function WorkflowTiming({ asset, jobId }: { asset: "stx" | "sbtc"; jobId?: number }) {
  const [data, setData] = useState<Timing | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/v1/workflow-timing?asset=${asset}${jobId ? `&jobId=${jobId}` : ""}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw Error("unavailable");
        const next = await response.json();
        if (next.network !== NETWORK_NAME || next.asset !== asset) throw Error("wrong_network");
        if (!stopped) { setData(next); setFailed(false); }
      } catch { if (!stopped) { setData(null); setFailed(true); } }
      finally { inFlight = false; }
    };
    setData(null); setFailed(false); void refresh();
    const timer = setInterval(() => { void refresh(); }, 30000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [asset, jobId]);
  return <section aria-label="Workflow timing" className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 text-sm text-mist-300">
    <h3 className="font-semibold text-orange-400">Response and payment timing</h3>
    {!data ? <p role={failed ? "status" : undefined} className="mt-2">{failed ? "Timing unavailable. This does not mean zero wait or payment readiness. Refresh before accepting work." : "Reading timing from the configured Stacks contracts…"}</p> : <>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt>Operator confirmation baseline · workflow</dt><dd>{data.confirmationPolicy.workflowBurnBlocks} additional Bitcoin blocks · {estimatedDuration(data.confirmationPolicy.workflowBurnBlocks)}</dd></div>
        <div><dt>Operator confirmation baseline · settlement</dt><dd>{data.confirmationPolicy.settlementBurnBlocks} additional Bitcoin blocks · {estimatedDuration(data.confirmationPolicy.settlementBurnBlocks)}</dd></div>
        <div><dt>Maximum review window after submission</dt><dd>{data.contractWindows.reviewWindowBurnBlocks} Bitcoin blocks · {estimatedDuration(data.contractWindows.reviewWindowBurnBlocks)}</dd></div>
        <div><dt>Appeal window after a decision</dt><dd>{data.contractWindows.appealWindowBurnBlocks} Bitcoin blocks · {estimatedDuration(data.contractWindows.appealWindowBurnBlocks)}</dd></div>
      </dl>
      {data.job?.originalDecision && <p className="mt-3">Recorded feedback: {data.job.originalDecision === 1 ? "Approve" : "Reject"}. This is not confirmation of payout.</p>}
      {(["review", "appeal", "resolution"] as const).map(key => {
        const d = data.job?.[key];
        return d && <p key={key} className="mt-2 capitalize">{key} deadline #{d.deadlineBurnHeight}: {d.deadlinePassed ? "deadline passed; verify transaction eligibility" : `${d.remainingBurnBlocks} Bitcoin blocks until deadline has passed · ${estimatedDuration(d.remainingBurnBlocks)}`}.</p>;
      })}
      <p className="mt-3 text-xs">Contract windows are read on-chain and cannot be edited per job in this release. Feedback can arrive earlier; there is no guaranteed evaluation SLA. Estimates exclude mempool and evaluator latency.</p>
      <p className="mt-2 text-xs">The signer’s bound permit is authoritative. This operator baseline does not change your wallet, existing permits, x402/MPP settlement, or contract deadlines. Payment still requires a successful settlement transaction.</p>
      <p className="mt-2 text-xs text-mist-400">Observed {new Date(data.observedAt).toLocaleTimeString()} · refreshes every 30 seconds.</p>
    </>}
  </section>;
}
