import { fetchCallReadOnlyFunction, cvToValue, Cl, Pc } from "@stacks/transactions";
import { request } from "@stacks/connect";
import { NETWORK, NETWORK_NAME } from "../constants/network";
import {
  CONTRACT_ADDRESS,
  SBTC_COMMERCE_HAS_REVIEW_TIMEOUT,
  SBTC_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";
import { SBTC_TOKEN } from "../constants/sbtc";
import { parseReputationSync } from "./reputation-sync";

const CONTRACT_NAME = SBTC_COMMERCE_CONTRACT_NAME;
export const SBTC_COMMERCE = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

function parseTokenContract(token: string) {
  const separator = token.lastIndexOf(".");
  const address = token.slice(0, separator);
  const name = token.slice(separator + 1);
  const validPrefix =
    NETWORK_NAME === "mainnet"
      ? address.startsWith("SP") || address.startsWith("SM")
      : address.startsWith("ST") || address.startsWith("SN");
  if (
    separator <= 0 ||
    !validPrefix ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(name)
  ) {
    throw new Error(`Invalid ${NETWORK_NAME} sBTC token contract: ${token}`);
  }
  return { address, name, contract: token as `${string}.${string}` };
}

// Every escrow-moving function takes a token trait. Versioned settlements use the
// token pinned to the funded job, not the mutable default for future funding.
const tokenArg = (token = SBTC_TOKEN) => {
  const parsed = parseTokenContract(token);
  return Cl.contractPrincipal(parsed.address, parsed.name);
};

export interface SbtcJob {
  id: number;
  client: string;
  provider?: string;
  evaluator: string;
  description: string;
  budget: number; // sats
  expiredAt: number;
  status: number;
  deliverable?: string;
  submittedAtBurn?: number;
  reviewDeadline?: number;
  reputationSyncPending?: boolean;
  reputationSyncLastError?: number;
  reputationSyncOutcome?: number;
  escrow?: number; // sats
}

async function read(functionName: string, functionArgs: any[] = []) {
  return fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    network: NETWORK,
    senderAddress: CONTRACT_ADDRESS,
  });
}

export async function getSbtcJob(jobId: number): Promise<SbtcJob | null> {
  try {
    const cv = await read("get-job", [Cl.uint(jobId)]);
    if (cv.type !== "ok") return null;
    const t: any = cvToValue(cv).value;
    return {
      id: jobId,
      client: t.client?.value ?? "",
      provider: t.provider?.value ? t.provider.value.value : undefined,
      evaluator: t.evaluator?.value ?? "",
      description: t.description?.value ?? "",
      budget: Number(t.budget?.value ?? 0),
      expiredAt: Number(t["expired-at"]?.value ?? 0),
      status: Number(t.status?.value ?? 0),
      deliverable: t.deliverable?.value ? t.deliverable.value.value : undefined,
      submittedAtBurn: t["submitted-at-burn"]?.value
        ? Number(t["submitted-at-burn"].value.value)
        : undefined,
      reviewDeadline: t["review-deadline"]?.value
        ? Number(t["review-deadline"].value.value)
        : undefined,
    };
  } catch (error) {
    console.error("Error getting sBTC job:", error);
    return null;
  }
}

export async function getSbtcJobCount(): Promise<number> {
  try {
    const cv = await read("get-job-count");
    return Number(cvToValue(cv).value ?? 0);
  } catch (error) {
    console.error("Error getting sBTC job count:", error);
    return 0;
  }
}

export async function getSbtcEscrowBalance(jobId: number): Promise<number> {
  try {
    const cv = await read("get-escrow-balance", [Cl.uint(jobId)]);
    return Number(cvToValue(cv).value ?? 0);
  } catch (error) {
    console.error("Error getting sBTC escrow balance:", error);
    return 0;
  }
}

export async function getSbtcReputationSync(jobId: number) {
  try {
    const cv = await read("get-reputation-sync", [Cl.uint(jobId)]);
    return parseReputationSync(cv);
  } catch {
    return null;
  }
}

// The token the on-chain contract will actually accept. Surfaced so the UI can warn if
// the deployment has not been wired to sBTC yet.
export async function getConfiguredPaymentToken(): Promise<string | null> {
  try {
    const cv = await read("get-payment-token");
    const v: any = cvToValue(cv);
    return v?.value ?? null;
  } catch (error) {
    console.error("Error getting payment token:", error);
    return null;
  }
}

export async function getSbtcJobPaymentToken(jobId: number): Promise<string | null> {
  try {
    const cv = await read("get-job-payment-token", [Cl.uint(jobId)]);
    if (cv.type !== "ok") return null;
    const value: any = cvToValue(cv);
    const token = value?.value;
    if (typeof token !== "string") return null;
    parseTokenContract(token);
    return token;
  } catch (error) {
    console.error("Error getting job payment token:", error);
    return null;
  }
}

export async function hasRatedJob(jobId: number, rater: string): Promise<boolean> {
  const cv = await read("has-rated-job", [Cl.uint(jobId), Cl.principal(rater)]);
  return cvToValue(cv) === true;
}

// ============================================
// Writes
// ============================================
function call(functionName: string, functionArgs: any[], extra: Record<string, any> = {}) {
  return request("stx_callContract", {
    contract: SBTC_COMMERCE,
    functionName,
    functionArgs,
    network: NETWORK_NAME,
    ...extra,
  } as any);
}

export function createSbtcJob(
  evaluator: string,
  expiredAt: number,
  description: string,
  provider?: string
) {
  return call("create-job", [
    provider ? Cl.some(Cl.principal(provider)) : Cl.none(),
    Cl.principal(evaluator),
    Cl.uint(expiredAt),
    Cl.stringAscii(description),
  ]);
}

export function setSbtcBudget(jobId: number, sats: number) {
  return call("set-budget", [Cl.uint(jobId), Cl.uint(sats)]);
}

// Funding moves sBTC out of the user's wallet, so it carries an explicit post-condition:
// exactly `sats` and nothing more may leave.
export function fundSbtcJob(jobId: number, sats: number, sender: string) {
  const pc = Pc.principal(sender).willSendEq(sats).ft(SBTC_TOKEN as any, "sbtc-token");
  return call("fund-job", [Cl.uint(jobId), tokenArg()], {
    postConditions: [pc],
    postConditionMode: "deny",
  });
}

export function assignSbtcProvider(jobId: number, provider: string) {
  return call("assign-provider", [Cl.uint(jobId), Cl.principal(provider)]);
}

export function submitSbtcWork(jobId: number, deliverable: string) {
  return call("submit-work", [Cl.uint(jobId), Cl.bufferFromAscii(deliverable.slice(0, 64))]);
}

// Settlement moves sBTC held by the contract, not by the caller. Constrain the exact
// contract outflow so a wallet never authorizes an unspecified token transfer.
function settlementOptions(sats: number, token: string, allowZero: boolean) {
  if (!Number.isSafeInteger(sats) || sats < 0 || (!allowZero && sats === 0)) {
    throw new Error(
      allowZero
        ? "Settlement amount must be a non-negative safe integer number of satoshis."
        : "Settlement amount must be a positive safe integer number of satoshis."
    );
  }
  if (sats === 0) {
    return { postConditions: [], postConditionMode: "deny" as const };
  }
  const parsed = parseTokenContract(token);
  const pc = Pc.principal(SBTC_COMMERCE)
    .willSendEq(sats)
    .ft(parsed.contract as any, "sbtc-token");
  return { postConditions: [pc], postConditionMode: "deny" as const };
}

async function settlementToken(jobId: number, sats: number) {
  if (!SBTC_COMMERCE_HAS_REVIEW_TIMEOUT || sats === 0) return SBTC_TOKEN;
  const pinned = await getSbtcJobPaymentToken(jobId);
  if (!pinned) {
    throw new Error("Could not verify the sBTC token pinned to this funded job.");
  }
  return pinned;
}

async function settleSbtcJob(
  functionName: "complete-job" | "reject-job" | "expire-job" | "settle-review-timeout",
  jobId: number,
  sats: number,
  allowZero = false
) {
  const token = await settlementToken(jobId, sats);
  return call(
    functionName,
    [Cl.uint(jobId), tokenArg(token)],
    settlementOptions(sats, token, allowZero)
  );
}

export function completeSbtcJob(jobId: number, sats: number) {
  return settleSbtcJob("complete-job", jobId, sats);
}

export function rejectSbtcJob(jobId: number, sats: number) {
  return settleSbtcJob("reject-job", jobId, sats);
}

export function expireSbtcJob(jobId: number, sats: number) {
  return settleSbtcJob("expire-job", jobId, sats, true);
}

export function settleSbtcReviewTimeout(jobId: number, sats: number) {
  return settleSbtcJob("settle-review-timeout", jobId, sats);
}

export function retrySbtcReputationSync(jobId: number) {
  return call("retry-reputation-sync", [Cl.uint(jobId)], {
    postConditionMode: "deny",
  });
}

export function rateSbtcProvider(jobId: number, score: number, comment: string) {
  return call("rate-provider", [Cl.uint(jobId), Cl.uint(score), Cl.stringAscii(comment.slice(0, 256))]);
}
