import type { ClarityValue } from "@stacks/transactions";
import type { NextAsset } from "../../constants/nayori-next";

// Parsers for the read-only results of the next Nayori contracts. They take the ClarityValue
// returned by fetchCallReadOnlyFunction and fail loudly on an unexpected shape, so a contract
// mismatch never renders as a silently wrong job.

export const NEXT_STATUS = {
  open: 0,
  funded: 1,
  offered: 2,
  accepted: 3,
  submitted: 4,
  decided: 5,
  disputed: 6,
  completed: 7,
  rejected: 8,
  refunded: 9,
  expired: 10,
} as const;
export type NextStatusName = keyof typeof NEXT_STATUS;
export const NEXT_STATUS_NAMES = Object.keys(NEXT_STATUS) as NextStatusName[];

export type NextDecisionKind = "approve" | "reject";

export interface NextJob {
  id: number;
  asset: NextAsset;
  client: string;
  evaluator: string;
  provider?: string;
  treasury: string;
  appealAuthority: string;
  budget: number;
  description: string;
  /** Before acceptance: the deadline to fund, offer and accept. From acceptance: delivery deadline. */
  deliveryDeadline: number;
  deliveryBlocks: number;
  reviewBlocks: number;
  status: number;
  statusName: NextStatusName;
}

export interface NextSubmission {
  /** Hex without 0x. */
  deliverable: string;
  reviewDeadline: number;
}

export interface NextDecision {
  decision: NextDecisionKind;
  byDefault: boolean;
  evidenceHash: string;
  appealDeadline: number;
  appellant?: string;
  resolutionDeadline?: number;
}

export interface NextProviderStats {
  completed: number;
  rejected: number;
  notDelivered: number;
  completedValueSbtc: number;
  completedValueStx: number;
  distinctClients: number;
  ratingSum: number;
  ratingCount: number;
}

export interface NextApplication {
  applicant: string;
  deposit: number;
}

export interface NextAgent {
  wallet: string;
  name: string;
  uri: string;
  registeredAt: number;
}

/** A stored allowance in nayori-permissions. `until` absent means no expiry. */
export interface NextAllowance {
  until?: number;
}

export interface NextReputationPending {
  provider: string;
  client: string;
  completed: boolean;
  value: number;
}

type CV = ClarityValue | any;

function fail(context: string, expected: string): never {
  throw new Error(`Unexpected ${context}: expected ${expected}`);
}

/** none -> null, some -> inner value. */
export function optional(value: CV, context: string): CV | null {
  if (value?.type === "none") return null;
  if (value?.type === "some") return value.value;
  return fail(context, "an optional");
}

export function tupleOf(value: CV, context: string): Record<string, CV> {
  if (value?.type !== "tuple" || !value.value) fail(context, "a tuple");
  return value.value;
}

export function uintOf(value: CV, context: string): number {
  if (value?.type !== "uint") fail(context, "a uint");
  const parsed = Number(value.value);
  if (!Number.isSafeInteger(parsed)) fail(context, "a safe integer");
  return parsed;
}

export function principalOf(value: CV, context: string): string {
  if (value?.type !== "address" && value?.type !== "contract") fail(context, "a principal");
  return String(value.value);
}

export function boolOf(value: CV, context: string): boolean {
  if (value?.type === "true") return true;
  if (value?.type === "false") return false;
  return fail(context, "a bool");
}

export function asciiOf(value: CV, context: string): string {
  if (value?.type !== "ascii" && value?.type !== "utf8") fail(context, "a string");
  return String(value.value);
}

export function bufferOf(value: CV, context: string): string {
  if (value?.type !== "buffer") fail(context, "a buffer");
  return String(value.value).replace(/^0x/, "").toLowerCase();
}

export function statusName(code: number): NextStatusName {
  const name = NEXT_STATUS_NAMES[code];
  if (!name) throw new Error(`Unknown next-generation job status ${code}`);
  return name;
}

/** `get-job` of nayori-escrow-sbtc / nayori-escrow-stx (an optional tuple). */
export function parseNextJob(value: CV, asset: NextAsset, id: number): NextJob | null {
  const inner = optional(value, "get-job");
  if (!inner) return null;
  const t = tupleOf(inner, "get-job");
  const provider = optional(t.provider, "job.provider");
  const status = uintOf(t.status, "job.status");
  return {
    id,
    asset,
    client: principalOf(t.client, "job.client"),
    evaluator: principalOf(t.evaluator, "job.evaluator"),
    ...(provider ? { provider: principalOf(provider, "job.provider") } : {}),
    treasury: principalOf(t.treasury, "job.treasury"),
    appealAuthority: principalOf(t["appeal-authority"], "job.appeal-authority"),
    budget: uintOf(t.budget, "job.budget"),
    description: asciiOf(t.description, "job.description"),
    deliveryDeadline: uintOf(t["delivery-deadline"], "job.delivery-deadline"),
    deliveryBlocks: uintOf(t["delivery-blocks"], "job.delivery-blocks"),
    reviewBlocks: uintOf(t["review-blocks"], "job.review-blocks"),
    status,
    statusName: statusName(status),
  };
}

export function parseNextSubmission(value: CV): NextSubmission | null {
  const inner = optional(value, "get-submission");
  if (!inner) return null;
  const t = tupleOf(inner, "get-submission");
  return {
    deliverable: bufferOf(t.deliverable, "submission.deliverable"),
    reviewDeadline: uintOf(t["review-deadline"], "submission.review-deadline"),
  };
}

export function parseNextDecision(value: CV): NextDecision | null {
  const inner = optional(value, "get-decision");
  if (!inner) return null;
  const t = tupleOf(inner, "get-decision");
  const code = uintOf(t.decision, "decision.decision");
  if (code !== 1 && code !== 2) throw new Error(`Unknown decision ${code}`);
  const appellant = optional(t.appellant, "decision.appellant");
  const resolution = optional(t["resolution-deadline"], "decision.resolution-deadline");
  return {
    decision: code === 1 ? "approve" : "reject",
    byDefault: boolOf(t["by-default"], "decision.by-default"),
    evidenceHash: bufferOf(t["evidence-hash"], "decision.evidence-hash"),
    appealDeadline: uintOf(t["appeal-deadline"], "decision.appeal-deadline"),
    ...(appellant ? { appellant: principalOf(appellant, "decision.appellant") } : {}),
    ...(resolution ? { resolutionDeadline: uintOf(resolution, "decision.resolution-deadline") } : {}),
  };
}

export function parseNextReputationPending(value: CV): NextReputationPending | null {
  const inner = optional(value, "get-reputation-pending");
  if (!inner) return null;
  const t = tupleOf(inner, "get-reputation-pending");
  return {
    provider: principalOf(t.provider, "pending.provider"),
    client: principalOf(t.client, "pending.client"),
    completed: boolOf(t.completed, "pending.completed"),
    value: uintOf(t.value, "pending.value"),
  };
}

/** `get-provider-stats` is never none: an unknown provider reads as zeros. */
export function parseNextProviderStats(value: CV): NextProviderStats {
  const t = tupleOf(value, "get-provider-stats");
  return {
    completed: uintOf(t.completed, "stats.completed"),
    rejected: uintOf(t.rejected, "stats.rejected"),
    notDelivered: uintOf(t["not-delivered"], "stats.not-delivered"),
    completedValueSbtc: uintOf(t["completed-value-sbtc"], "stats.completed-value-sbtc"),
    completedValueStx: uintOf(t["completed-value-stx"], "stats.completed-value-stx"),
    distinctClients: uintOf(t["distinct-clients"], "stats.distinct-clients"),
    ratingSum: uintOf(t["rating-sum"], "stats.rating-sum"),
    ratingCount: uintOf(t["rating-count"], "stats.rating-count"),
  };
}

/** Average client rating, or null before the first rating. */
export function averageRating(stats: NextProviderStats): number | null {
  return stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : null;
}

function parseApplicationEntry(value: CV, context: string): NextApplication {
  const t = tupleOf(value, context);
  return {
    applicant: principalOf(t.applicant, `${context}.applicant`),
    deposit: uintOf(t.deposit, `${context}.deposit`),
  };
}

/** `get-applications`: sorted by deposit, highest first, ties by arrival. */
export function parseNextApplications(value: CV): NextApplication[] {
  if (value?.type !== "list" || !Array.isArray(value.value)) fail("get-applications", "a list");
  return value.value.map((entry: CV, index: number) =>
    parseApplicationEntry(entry, `applications[${index}]`)
  );
}

export function parseNextApplication(value: CV): NextApplication | null {
  const inner = optional(value, "get-application");
  return inner ? parseApplicationEntry(inner, "application") : null;
}

export function parseNextAgent(value: CV, wallet: string): NextAgent | null {
  const inner = optional(value, "get-agent");
  if (!inner) return null;
  const t = tupleOf(inner, "get-agent");
  return {
    wallet,
    name: asciiOf(t.name, "agent.name"),
    uri: asciiOf(t.uri, "agent.uri"),
    registeredAt: uintOf(t["registered-at"], "agent.registered-at"),
  };
}

/**
 * `get-allowance` of nayori-permissions: none when the helper is not allowed, some(none) for an
 * allowance with no expiry, some(some u) for one that ends at that Bitcoin block.
 */
export function parseNextAllowance(value: CV): NextAllowance | null {
  const inner = optional(value, "get-allowance");
  if (!inner) return null;
  const until = optional(inner, "allowance.until");
  return until ? { until: uintOf(until, "allowance.until") } : {};
}
