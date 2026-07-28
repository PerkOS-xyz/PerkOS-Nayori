import { getJob, getJobCount, getEscrowBalance, Job } from "./agentic-commerce";
import {
  getSbtcJob,
  getSbtcJobCount,
  getSbtcEscrowBalance,
  SbtcJob,
} from "./sbtc-commerce";
import { formatSbtcCompact, formatStx } from "../utils/format";
import { NETWORK_NAME } from "../constants/network";
import { STX_COMMERCE_IS_HARDENED } from "../constants/contract";

export type Currency = "sbtc" | "stx";
export type CommerceJob = (Job | SbtcJob) & { currency: Currency };

export const currencyLabel = (currency: Currency) =>
  currency === "sbtc" ? "sBTC" : "STX";

export const currencyProtocolLabel = (currency: Currency) =>
  currency === "sbtc" ? "sBTC · Recommended" : "STX";

export const currencyDescription = (currency: Currency) =>
  currency === "sbtc"
    ? "Recommended · Bitcoin-denominated"
    : "STX-denominated";

export const formatJobAmount = (amount: number, currency: Currency) =>
  currency === "sbtc" ? formatSbtcCompact(amount) : `${formatStx(amount)} STX`;

export const jobHref = (jobId: number, currency: Currency) =>
  `/jobs/${jobId}?currency=${currency}`;

export function parseCurrency(value?: string | null): Currency {
  return value === "stx" ? "stx" : "sbtc";
}

export async function getCommerceJob(
  jobId: number,
  currency: Currency
): Promise<CommerceJob | null> {
  const job = currency === "sbtc" ? await getSbtcJob(jobId) : await getJob(jobId);
  return job ? { ...job, currency } : null;
}

export async function getCommerceJobCount(currency: Currency): Promise<number> {
  return currency === "sbtc" ? getSbtcJobCount() : getJobCount();
}

export async function getCommerceEscrow(jobId: number, currency: Currency): Promise<number> {
  return currency === "sbtc"
    ? getSbtcEscrowBalance(jobId)
    : getEscrowBalance(jobId);
}

export async function getCommerceJobs(
  currency: Currency,
  options: { limit?: number; offset?: number; newestFirst?: boolean; includeEscrow?: boolean } = {}
): Promise<CommerceJob[]> {
  const count = await getCommerceJobCount(currency);
  const newestFirst = options.newestFirst ?? true;
  let ids = Array.from({ length: count }, (_, i) => i + 1);
  if (newestFirst) ids.reverse();
  const offset = options.offset ?? 0;
  if (offset) ids = ids.slice(offset);
  if (options.limit) ids = ids.slice(0, options.limit);

  const jobs = await Promise.all(
    ids.map(async (id) => {
      const job = await getCommerceJob(id, currency);
      if (job && options.includeEscrow) {
        job.escrow = await getCommerceEscrow(id, currency);
      }
      return job;
    })
  );
  return jobs.filter(Boolean) as CommerceJob[];
}

export async function getAllCommerceJobs(
  options: { limitPerCurrency?: number; includeEscrow?: boolean } = {}
): Promise<CommerceJob[]> {
  const [sbtc, stx] = await Promise.all([
    getCommerceJobs("sbtc", {
      limit: options.limitPerCurrency,
      includeEscrow: options.includeEscrow,
    }),
    getCommerceJobs("stx", {
      limit: options.limitPerCurrency,
      includeEscrow: options.includeEscrow,
    }),
  ]);
  return [...sbtc, ...stx];
}

export const sameAddress = (a?: string, b?: string) =>
  Boolean(a && b && a.toUpperCase() === b.toUpperCase());

export function jobPermissions(job: CommerceJob, address?: string) {
  const isClient = sameAddress(job.client, address);
  const isProvider = sameAddress(job.provider, address);
  const isEvaluator = sameAddress(job.evaluator, address);
  return {
    isClient,
    isProvider,
    isEvaluator,
    canSetBudget: job.status === 0 && isClient,
    canFund: job.status === 0 && job.budget > 0 && isClient,
    canAssign: job.status === 1 && !job.provider && isClient,
    canSubmit: job.status === 1 && Boolean(job.provider) && isProvider,
    canSettle: job.status === 2 && isEvaluator,
    canRate:
      (job.currency === "sbtc" || STX_COMMERCE_IS_HARDENED) &&
      job.status === 3 &&
      (isClient || isEvaluator),
  };
}

export const STACKS_BLOCK_SECONDS = 5;

export function durationToBlocks(amount: number, unit: "hours" | "days") {
  const seconds = amount * (unit === "days" ? 86_400 : 3_600);
  return Math.max(1, Math.ceil(seconds / STACKS_BLOCK_SECONDS));
}

export function expiryText(expiredAt: number, currentHeight: number, status?: number) {
  if (status === 3) return "Closed · completed";
  if (status === 4) return "Closed · rejected";
  if (status === 5) return "Expired";
  if (!currentHeight) return `Block #${expiredAt}`;
  const remaining = expiredAt - currentHeight;
  if (remaining <= 0) return "Expired";
  const seconds = remaining * STACKS_BLOCK_SECONDS;
  if (seconds < 3_600) return `~${Math.max(1, Math.ceil(seconds / 60))} min left`;
  if (seconds < 86_400) return `~${Math.ceil(seconds / 3_600)} hr left`;
  return `~${Math.ceil(seconds / 86_400)} days left`;
}

export function isValidStacksAddress(address: string, currency?: Currency) {
  const normalized = address.trim();
  if (!/^(SP|ST)[A-Z0-9]{28,41}$/.test(normalized)) return false;
  return NETWORK_NAME === "mainnet"
    ? normalized.startsWith("SP")
    : normalized.startsWith("ST");
}
