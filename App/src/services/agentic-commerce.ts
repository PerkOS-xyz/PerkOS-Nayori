import { fetchCallReadOnlyFunction, cvToValue, Cl } from "@stacks/transactions";
import { NETWORK } from "../constants/network";
import {
  CONTRACT_ADDRESS,
  STX_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";
import { parseReputationSync, type ReputationSyncState } from "./reputation-sync";
import {
  parseAutonomousDecision,
  type AutonomousDecisionState,
} from "./autonomous-decision";

export interface Job {
  id: number;
  client: string;
  provider?: string;
  evaluator: string;
  appealAuthority?: string;
  description: string;
  budget: number;
  expiredAt: number;
  status: number;
  deliverable?: string;
  submittedAtBurn?: number;
  reviewDeadline?: number;
  reputationSyncPending?: boolean;
  reputationSyncLastError?: number;
  reputationSyncOutcome?: number;
  escrow?: number;
  decision?: AutonomousDecisionState;
}

export async function getJob(jobId: number): Promise<Job | null> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: STX_COMMERCE_CONTRACT_NAME,
      functionName: "get-job",
      functionArgs: [Cl.uint(jobId)],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });

    if (cv.type !== "ok") return null;
    const t: any = cvToValue(cv).value;

    return {
      id: jobId,
      client: t.client?.value ?? "",
      // provider is (optional principal): value is the inner principal CV or null
      provider: t.provider?.value ? t.provider.value.value : undefined,
      evaluator: t.evaluator?.value ?? "",
      appealAuthority: t["appeal-authority"]?.value ?? undefined,
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
    console.error("Error getting job:", error);
    return null;
  }
}

export async function getDecision(jobId: number): Promise<AutonomousDecisionState | null> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: STX_COMMERCE_CONTRACT_NAME,
      functionName: "get-decision",
      functionArgs: [Cl.uint(jobId)],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });
    return parseAutonomousDecision(cv);
  } catch {
    return null;
  }
}

export async function getJobCount(): Promise<number> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: STX_COMMERCE_CONTRACT_NAME,
      functionName: "get-job-count",
      functionArgs: [],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });

    if (cv.type !== "ok") return 0;
    return Number(cvToValue(cv).value);
  } catch (error) {
    console.error("Error getting job count:", error);
    return 0;
  }
}

export async function getEscrowBalance(jobId: number): Promise<number> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: STX_COMMERCE_CONTRACT_NAME,
      functionName: "get-escrow-balance",
      functionArgs: [Cl.uint(jobId)],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });

    if (cv.type !== "ok") return 0;
    return Number(cvToValue(cv).value);
  } catch (error) {
    console.error("Error getting escrow balance:", error);
    return 0;
  }
}

export async function getReputationSync(jobId: number): Promise<ReputationSyncState | null> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: STX_COMMERCE_CONTRACT_NAME,
      functionName: "get-reputation-sync",
      functionArgs: [Cl.uint(jobId)],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });
    return parseReputationSync(cv);
  } catch {
    return null;
  }
}

export async function hasRatedJob(
  jobId: number,
  rater: string
): Promise<boolean> {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: STX_COMMERCE_CONTRACT_NAME,
    functionName: "has-rated-job",
    functionArgs: [Cl.uint(jobId), Cl.principal(rater)],
    network: NETWORK,
    senderAddress: CONTRACT_ADDRESS,
  });
  return cvToValue(cv) === true;
}
