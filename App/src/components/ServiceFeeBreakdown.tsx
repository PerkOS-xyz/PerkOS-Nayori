import type { CommerceJob } from "../services/commerce";
import { formatFeeAmount } from "../services/service-fees";
import Addr from "./Addr";

export default function ServiceFeeBreakdown({ job }: { job: CommerceJob }) {
  if (job.serviceFeeUnavailable)
    return (
      <p
        role="alert"
        className="mt-4 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300"
      >
        Fee policy unavailable. Refresh before funding, submitting work or
        settling a decision. Filing an appeal is not blocked.
      </p>
    );
  const f = job.serviceFee;
  if (!f) return null; // Existing deployed generations retain their original no-fee terms.
  const format = (n: bigint) => formatFeeAmount(n, job.currency);
  const s = f.settlement;
  const waived = !!f.waiver;
  const noServiceTerminal = job.status === 5 || job.status === 6;
  const fee = waived || noServiceTerminal ? BigInt(0) : f.potentialFee;
  return (
    <section
      aria-label="Earned service fee"
      className="mt-4 rounded-lg border border-bitcoin/30 bg-bitcoin/5 p-4 text-sm text-mist-300"
    >
      <h3 className="font-semibold text-bitcoin-400">
        Earned service fee · 2% included in budget
      </h3>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt>Gross budget</dt>
          <dd className="font-mono text-white">{format(f.gross)}</dd>
        </div>
        <div>
          <dt>
            {s
              ? "Fee actually collected"
              : noServiceTerminal
                ? "No evaluation fee"
                : "Potential fee at evaluated settlement"}
          </dt>
          <dd className="font-mono">{format(s ? s.chargedFee : fee)}</dd>
        </div>
        <div>
          <dt>
            {s
              ? job.status === 3
                ? "Original net provider payout"
                : "Original net client refund"
              : "Net on approval / evaluated rejection"}
          </dt>
          <dd className="font-mono">{format(s ? s.net : f.gross - fee)}</dd>
        </div>
        <div>
          <dt>Treasury pinned to this job</dt>
          <dd className="break-all">
            <Addr value={f.treasury} />
          </dd>
        </div>
        {s && (
          <>
            <div>
              <dt>Fee actually refunded</dt>
              <dd className="font-mono">{format(s.refundedFee)}</dd>
            </div>
            <div>
              <dt>Fee retained after refund</dt>
              <dd className="font-mono">
                {format(s.chargedFee - s.refundedFee)}
              </dd>
            </div>
            <div>
              <dt>Total delivered to economic recipient</dt>
              <dd className="font-mono">{format(s.net + s.refundedFee)}</dd>
            </div>
          </>
        )}
      </dl>
      {waived && (
        <p className="mt-3">
          Evidence-backed fee waiver recorded.
          {s && s.chargedFee > s.refundedFee
            ? " Refund outstanding: treasury must sign and fund the actual return."
            : ""}
        </p>
      )}
      {!s && !noServiceTerminal && (
        <p className="mt-3">
          This is a quote, not collected revenue. A recorded evaluation is
          charged once at final settlement: approval pays the provider net;
          evaluated rejection refunds the client net. No evaluation means no
          service fee.
        </p>
      )}
      {noServiceTerminal && (
        <p className="mt-3">
          Closed without an evaluated settlement; no service fee was collected.
        </p>
      )}
      <p className="mt-2 text-xs text-mist-400">
        Network gas is separate, in STX. Filing an appeal has no additional
        service fee. Any optional paid analysis requires a separate accepted
        quote; it is not available in this release.
      </p>
    </section>
  );
}
