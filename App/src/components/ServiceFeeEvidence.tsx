import Link from "next/link";
import type { FeeEvidence } from "../services/fee-evidence";

export default function ServiceFeeEvidence({ evidence, loading = false }: { evidence?: FeeEvidence; loading?: boolean }) {
  return <section className="mt-12" aria-labelledby="service-fee-evidence">
    <h2 id="service-fee-evidence" className="text-xl font-semibold">Escrow service-fee accounting</h2>
    <p className="mt-1 text-sm text-mist-500">Selected contracts only; not lifetime totals, treasury balances or verified external revenue.
      Quotes are not charges. Waivers are not refunds. Internal QA activity does not count as adoption.</p>
    {loading || !evidence ? <p className="mt-4 text-sm text-mist-400">{loading ? "Loading fee accounting…" : "Fee accounting unavailable."}</p> :
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{evidence.assets.map(asset => <article key={asset.currency} className="card min-w-0 p-5">
        <h3 className="font-semibold">{asset.currency === "stx" ? "STX · micro-STX" : "sBTC · satoshis"}</h3>
        <p className="mt-1 break-all font-mono text-xs text-mist-500">{asset.contract}</p>
        {asset.status !== "live" || !asset.totals ? <p className="mt-4 text-sm text-mist-400">
          {asset.status === "not-supported" ? "Service fees are not enabled for this contract generation." : "Required chain accounting is unavailable; totals are not reported as zero."}
        </p> : <>
          <p className="mt-3 text-xs text-mist-500">{asset.jobsRead} jobs read · all amounts in atomic units</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{([
            ["Quoted potential (not collected)", asset.totals.quoted], ["Actually charged", asset.totals.charged],
            ["Actually refunded", asset.totals.refunded], ["Retained after refunds", asset.totals.retained],
            ["Waived refund outstanding", asset.totals.refundDue],
          ] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-mist-500">{label}</dt><dd className="break-all font-mono text-brand-300">{value}</dd></div>)}</dl>
          {asset.treasuries.map(treasury => <div key={treasury.treasury} className="mt-4 border-t border-white/10 pt-3 text-xs">
            <p className="break-all text-mist-400">Pinned treasury: {treasury.treasury}</p>
            <p className="mt-1 break-words">Charged {treasury.charged} · refunded {treasury.refunded} · retained {treasury.retained} · refund due {treasury.refundDue}</p>
          </div>)}
          <details className="mt-4 text-xs"><summary className="cursor-pointer text-brand-300">Per-job fee ledgers</summary>
            <ul className="mt-3 space-y-2">{asset.jobs.map(job => <li key={job.jobId} className="break-words">
              <Link className="text-brand-300 underline" href={`/jobs/${job.jobId}?currency=${asset.currency}`}>Job #{job.jobId}</Link>
              {" · "}{job.settled ? "settled" : "no fee settlement"}{job.waived ? " · waived" : ""}
              {" · charged "}{job.charged}{" · refunded "}{job.refunded}{" · retained "}{job.retained}{" · refund due "}{job.refundDue}
            </li>)}</ul>
          </details>
        </>}
      </article>)}</div>}
  </section>;
}
