import { NEXT_LIMITS, type NextAsset } from "../../constants/nayori-next";
import { formatSbtcCompact, formatStx } from "../../utils/format";
import {
  NEXT_STATUS,
  type NextApplication,
  type NextDecision,
  type NextJob,
  type NextStatusName,
  type NextSubmission,
} from "./parse";

export const NEXT_STATUS_LABELS: Record<NextStatusName, string> = {
  open: "Open",
  funded: "Funded",
  offered: "Offered",
  accepted: "Accepted",
  submitted: "Submitted",
  decided: "Decided",
  disputed: "Appealed",
  completed: "Completed",
  rejected: "Rejected",
  refunded: "Refunded",
  expired: "Closed",
};

export const NEXT_STATUS_HINTS: Record<NextStatusName, string> = {
  open: "Waiting for the client to fund the budget.",
  funded: "Funded. The client can offer the job to a provider.",
  offered: "Offered to a provider, waiting for acceptance.",
  accepted: "The provider accepted and is working on the delivery.",
  submitted: "Work submitted, waiting for the evaluator.",
  decided: "Decided. The other side can appeal until the appeal deadline.",
  disputed: "Appealed. The appeal authority reviews the decision.",
  completed: "Approved and paid to the provider.",
  rejected: "Rejected and returned to the client.",
  refunded: "Not delivered in time. The full budget went back to the client.",
  expired: "Never funded and closed after the deadline.",
};

export const NEXT_STATUS_TONE: Record<NextStatusName, "neutral" | "active" | "warn" | "good" | "bad"> = {
  open: "neutral",
  funded: "active",
  offered: "active",
  accepted: "active",
  submitted: "active",
  decided: "warn",
  disputed: "warn",
  completed: "good",
  rejected: "bad",
  refunded: "neutral",
  expired: "neutral",
};

/** Bitcoin produces a block about every 10 minutes. */
export const MINUTES_PER_BITCOIN_BLOCK = 10;

export function blocksToDuration(blocks: number): string {
  const minutes = Math.max(0, blocks) * MINUTES_PER_BITCOIN_BLOCK;
  if (minutes < 120) return `about ${Math.max(1, Math.round(minutes))} minutes`;
  const hours = minutes / 60;
  if (hours < 48) return `about ${Math.round(hours)} hours`;
  return `about ${Math.round(hours / 24)} days`;
}

export function durationToBitcoinBlocks(value: number, unit: "hours" | "days"): number {
  const hours = unit === "days" ? value * 24 : value;
  return Math.round((hours * 60) / MINUTES_PER_BITCOIN_BLOCK);
}

/**
 * Plain text for a Bitcoin block deadline. `inclusive` deadlines (review, appeal and resolution
 * windows) stay open at the deadline block itself; delivery deadlines close at it.
 */
export function deadlineText(deadline: number, height: number, inclusive = false): string {
  if (!height) return `Bitcoin block ${deadline.toLocaleString("en-US")}`;
  const left = deadline - height + (inclusive ? 1 : 0);
  if (left > 0) {
    return `${left.toLocaleString("en-US")} Bitcoin block${left === 1 ? "" : "s"} left (${blocksToDuration(left)})`;
  }
  return `Passed at Bitcoin block ${deadline.toLocaleString("en-US")}`;
}

/** Before acceptance the job deadline limits funding, offering and accepting; after, delivery. */
export function deadlineLabel(job: Pick<NextJob, "status">): string {
  return job.status <= NEXT_STATUS.offered ? "Deadline to fund, offer and accept" : "Delivery deadline";
}

export function formatNextAmount(amount: number, asset: NextAsset): string {
  return asset === "sbtc" ? formatSbtcCompact(amount) : `${formatStx(amount)} STX`;
}

/** The 2% fee charged on every decision (budget / 50); refunds without delivery pay no fee. */
export function quoteNextFee(budget: number) {
  const fee = Math.floor(budget / NEXT_LIMITS.feeDivisor);
  return { budget, fee, net: budget - fee };
}

export type NextActionKey =
  | "fund"
  | "name-provider"
  | "rate"
  | "accept"
  | "submit"
  | "decide"
  | "appeal"
  | "resolve-appeal"
  | "default-approval"
  | "settle"
  | "refund"
  | "close"
  | "retry-reputation";

export interface NextJobContext {
  job: NextJob;
  /** Connected wallet, or "" when no wallet is connected. */
  wallet: string;
  /** Current Bitcoin (burn) block height; 0 when unknown, which hides time-gated actions. */
  burnHeight: number;
  submission?: NextSubmission | null;
  decision?: NextDecision | null;
  escrow?: number;
  /** True once the client rated this completed job. */
  rated?: boolean;
  reputationPending?: boolean;
}

const same = (a?: string, b?: string) => Boolean(a && b && a.toUpperCase() === b.toUpperCase());

/** The losing side that may appeal: the client against an approval, the provider against a rejection. */
export function appellantFor(job: NextJob, decision: NextDecision): string | undefined {
  return decision.decision === "approve" ? job.client : job.provider;
}

/**
 * Actions the connected wallet can take now, mirroring the contract checks. The contract stays
 * the authority; this only hides buttons that would certainly fail.
 */
export function nextJobActions(ctx: NextJobContext): NextActionKey[] {
  const { job, wallet, burnHeight: height } = ctx;
  const actions: NextActionKey[] = [];
  const known = height > 0;
  const beforeDeadline = known && height < job.deliveryDeadline;
  const pastDeadline = known && height >= job.deliveryDeadline;
  const isClient = same(wallet, job.client);
  const isProvider = same(wallet, job.provider);
  const fullEscrow = ctx.escrow === undefined || ctx.escrow === job.budget;

  switch (job.status) {
    case NEXT_STATUS.open:
      if (isClient && beforeDeadline) actions.push("fund");
      if (pastDeadline) actions.push("close");
      break;
    case NEXT_STATUS.funded:
    case NEXT_STATUS.offered:
      if (isClient && beforeDeadline) actions.push("name-provider");
      if (job.status === NEXT_STATUS.offered && isProvider && beforeDeadline) actions.push("accept");
      if (pastDeadline && fullEscrow) actions.push("refund");
      break;
    case NEXT_STATUS.accepted:
      if (isProvider && beforeDeadline) actions.push("submit");
      if (pastDeadline && fullEscrow) actions.push("refund");
      break;
    case NEXT_STATUS.submitted:
      if (ctx.submission && known) {
        if (same(wallet, job.evaluator) && height <= ctx.submission.reviewDeadline) actions.push("decide");
        if (height > ctx.submission.reviewDeadline) actions.push("default-approval");
      }
      break;
    case NEXT_STATUS.decided:
      if (ctx.decision && known) {
        if (same(wallet, appellantFor(job, ctx.decision)) && height <= ctx.decision.appealDeadline) {
          actions.push("appeal");
        }
        if (height > ctx.decision.appealDeadline && fullEscrow) actions.push("settle");
      }
      break;
    case NEXT_STATUS.disputed:
      if (ctx.decision?.resolutionDeadline !== undefined && known) {
        if (same(wallet, job.appealAuthority) && height <= ctx.decision.resolutionDeadline) {
          actions.push("resolve-appeal");
        }
        if (height > ctx.decision.resolutionDeadline && fullEscrow) actions.push("settle");
      }
      break;
    case NEXT_STATUS.completed:
      if (isClient && ctx.rated === false) actions.push("rate");
      break;
  }
  if (ctx.reputationPending && (job.status === NEXT_STATUS.completed || job.status === NEXT_STATUS.rejected)) {
    actions.push("retry-reputation");
  }
  return actions;
}

/** Who receives what if the job settles with this decision (net to the winner, fee to the treasury). */
export function settlementPreview(job: NextJob, decision: "approve" | "reject") {
  const { fee, net } = quoteNextFee(job.budget);
  return {
    winner: decision === "approve" ? job.provider : job.client,
    net,
    fee,
    treasury: job.treasury,
  };
}

/** The job still takes applications: open, funded or offered, and before its deadline. */
export function acceptsApplications(job: NextJob, height: number): boolean {
  return (
    job.asset === "sbtc" &&
    job.status <= NEXT_STATUS.offered &&
    height > 0 &&
    height < job.deliveryDeadline
  );
}

export type NextApplicationAction = "register" | "apply" | "withdraw" | "decline" | "release" | "offer";

export interface NextApplicationsContext {
  job: NextJob;
  wallet: string;
  burnHeight: number;
  applications: NextApplication[];
  /** The connected wallet is a registered agent. */
  isAgent: boolean;
}

/** Actions on the whole list for the connected wallet. */
export function nextApplicationActions(ctx: NextApplicationsContext): NextApplicationAction[] {
  const { job, wallet } = ctx;
  if (job.asset !== "sbtc") return [];
  const actions: NextApplicationAction[] = [];
  const mine = ctx.applications.find((entry) => same(entry.applicant, wallet));
  const ineligible = [job.client, job.evaluator, job.treasury, job.appealAuthority].some((party) =>
    same(party, wallet)
  );
  if (wallet && !mine && !ineligible && acceptsApplications(job, ctx.burnHeight)) {
    // Only registered agents may apply; anyone else is offered the one-time registration first.
    actions.push(ctx.isAgent ? "apply" : "register");
  }
  if (mine) actions.push("withdraw");
  return actions;
}

/** Actions on one entry of the list for the connected wallet. */
export function nextApplicationEntryActions(
  ctx: Omit<NextApplicationsContext, "applications" | "isAgent">,
  entry: NextApplication
): NextApplicationAction[] {
  const { job, wallet, burnHeight } = ctx;
  if (job.asset !== "sbtc") return [];
  const actions: NextApplicationAction[] = [];
  const isClient = same(wallet, job.client);
  const accepting = job.status <= NEXT_STATUS.offered;
  if (isClient && accepting) {
    if (
      (job.status === NEXT_STATUS.funded || job.status === NEXT_STATUS.offered) &&
      burnHeight > 0 &&
      burnHeight < job.deliveryDeadline &&
      !same(entry.applicant, job.provider)
    ) {
      actions.push("offer");
    }
    actions.push("decline");
  }
  if (!accepting && wallet) actions.push("release");
  return actions;
}
