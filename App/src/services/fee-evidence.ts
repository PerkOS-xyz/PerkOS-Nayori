import type { CommerceJob, Currency } from "./commerce";

type Amounts = { quoted: string; charged: string; refunded: string; retained: string; refundDue: string };
export type FeeEvidenceRow = Amounts & { jobId: number; treasury: string; settled: boolean; waived: boolean };
export type FeeEvidenceAsset = {
  currency: Currency;
  contract: string;
  status: "live" | "unavailable" | "not-supported";
  jobsRead: number;
  totals: Amounts | null;
  treasuries: Array<Amounts & { treasury: string }>;
  jobs: FeeEvidenceRow[];
};
export type FeeEvidence = {
  scope: "selected-contract-jobs";
  classification: "observed-accounting-not-external-revenue";
  assets: FeeEvidenceAsset[];
};
export type FeeEvidenceSelection = Record<Currency, { contract: string; enabled: boolean }>;
const zero = () => ({ quoted: BigInt(0), charged: BigInt(0), refunded: BigInt(0), retained: BigInt(0), refundDue: BigInt(0) });
type Totals = ReturnType<typeof zero>;
const keys = ["quoted", "charged", "refunded", "retained", "refundDue"] as const;
const strings = (totals: Totals): Amounts => ({ quoted: totals.quoted.toString(), charged: totals.charged.toString(),
  refunded: totals.refunded.toString(), retained: totals.retained.toString(), refundDue: totals.refundDue.toString() });
const validAmount = (n: unknown): n is bigint => typeof n === "bigint" && n >= BigInt(0) && n < BigInt(2) ** BigInt(128);

/** Uses only validated job reads; never fetches, signs or treats a quote as collected money. */
export function buildFeeEvidence(jobs: CommerceJob[], selection: FeeEvidenceSelection, sourceAvailable = true): FeeEvidence {
  return {
    scope: "selected-contract-jobs",
    classification: "observed-accounting-not-external-revenue",
    assets: (["stx", "sbtc"] as const).map(currency => {
      const empty: FeeEvidenceAsset = { currency, contract: selection[currency].contract,
        status: selection[currency].enabled ? "unavailable" : "not-supported",
        jobsRead: 0, totals: null, treasuries: [], jobs: [] };
      if (!selection[currency].enabled || !sourceAvailable) return empty;
      const totals = zero(), treasuries = new Map<string, Totals>(), ids = new Set<number>();
      const rows: FeeEvidenceRow[] = [];
      for (const job of jobs.filter(job => job.currency === currency)) {
        const fee = job.serviceFee;
        if (!Number.isSafeInteger(job.id) || job.id < 1 || !Number.isInteger(job.status) || job.status < 0 || job.status > 8 ||
          ids.has(job.id) || job.serviceFeeUnavailable || !fee ||
          !Number.isSafeInteger(job.budget) || job.budget < 0 || !validAmount(fee.gross) ||
          fee.gross !== BigInt(job.budget) || !validAmount(fee.potentialFee) || fee.potentialFee !== fee.gross / BigInt(50) ||
          !fee.treasury || fee.treasury !== job.treasury || fee.serviceRecorded !== [3, 4, 7, 8].includes(job.status) ||
          (fee.waiver !== undefined && (!/^[a-f\d]{64}$/i.test(fee.waiver) || /^0{64}$/.test(fee.waiver) || !fee.serviceRecorded))) return empty;
        ids.add(job.id);
        const ledger = fee.settlement;
        const charged = ledger?.chargedFee ?? BigInt(0), refunded = ledger?.refundedFee ?? BigInt(0);
        if (!validAmount(charged) || !validAmount(refunded) || refunded > charged ||
          (refunded > BigInt(0) && (!fee.waiver || refunded !== charged)) ||
          (!ledger && [3, 4].includes(job.status)) ||
          (ledger && (fee.gross === BigInt(0) || !fee.serviceRecorded || ![3, 4].includes(job.status) ||
            !validAmount(ledger.net) || ledger.gross !== fee.gross || ledger.net + charged !== fee.gross ||
            ledger.recipient !== (job.status === 3 ? job.provider : job.client) ||
            charged !== (fee.waiver && charged === BigInt(0) ? BigInt(0) : fee.potentialFee)))) return empty;
        const amounts: Totals = { quoted: fee.potentialFee, charged, refunded, retained: charged - refunded,
          refundDue: fee.waiver ? charged - refunded : BigInt(0) };
        const treasury = treasuries.get(fee.treasury) ?? zero();
        for (const key of keys) { totals[key] += amounts[key]; treasury[key] += amounts[key]; }
        treasuries.set(fee.treasury, treasury);
        rows.push({ jobId: job.id, treasury: fee.treasury, settled: Boolean(ledger), waived: Boolean(fee.waiver), ...strings(amounts) });
      }
      return { ...empty, status: "live", jobsRead: rows.length, totals: strings(totals), jobs: rows,
        treasuries: [...treasuries].sort(([a], [b]) => a.localeCompare(b)).map(([treasury, amounts]) => ({ treasury, ...strings(amounts) })) };
    }),
  };
}
