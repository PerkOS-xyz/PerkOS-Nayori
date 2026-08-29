import { fetchCallReadOnlyFunction, cvToValue, Cl, Pc } from "@stacks/transactions";
import { request } from "@stacks/connect";
import { NETWORK, NETWORK_NAME } from "../constants/network";
import { CONTRACT_ADDRESS } from "../constants/contract";
import { SBTC_TOKEN, SBTC_ADDRESS, SBTC_NAME } from "../constants/sbtc";

const CONTRACT_NAME = "sbtc-commerce";
export const SBTC_COMMERCE = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

// The token argument every escrow-moving function takes, so the contract can verify it
// against the sBTC principal it was configured with.
const tokenArg = () => Cl.contractPrincipal(SBTC_ADDRESS, SBTC_NAME);

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
function settlementOptions(sats: number) {
  if (!Number.isSafeInteger(sats) || sats <= 0) {
    throw new Error("Settlement amount must be a positive safe integer number of satoshis.");
  }
  const pc = Pc.principal(SBTC_COMMERCE)
    .willSendEq(sats)
    .ft(SBTC_TOKEN as any, "sbtc-token");
  return { postConditions: [pc], postConditionMode: "deny" as const };
}

export function completeSbtcJob(jobId: number, sats: number) {
  return call("complete-job", [Cl.uint(jobId), tokenArg()], settlementOptions(sats));
}

export function rejectSbtcJob(jobId: number, sats: number) {
  return call("reject-job", [Cl.uint(jobId), tokenArg()], settlementOptions(sats));
}

export function expireSbtcJob(jobId: number, sats: number) {
  return call("expire-job", [Cl.uint(jobId), tokenArg()], settlementOptions(sats));
}

export function rateSbtcProvider(jobId: number, score: number, comment: string) {
  return call("rate-provider", [Cl.uint(jobId), Cl.uint(score), Cl.stringAscii(comment.slice(0, 256))]);
}
