import { fetchCallReadOnlyFunction, cvToValue, Cl } from "@stacks/transactions";
import { NETWORK } from "../constants/network";
import {
  CONTRACT_ADDRESS,
  STX_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";

export interface Job {
  id: number;
  client: string;
  provider?: string;
  evaluator: string;
  description: string;
  budget: number;
  expiredAt: number;
  status: number;
  deliverable?: string;
  escrow?: number;
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
      description: t.description?.value ?? "",
      budget: Number(t.budget?.value ?? 0),
      expiredAt: Number(t["expired-at"]?.value ?? 0),
      status: Number(t.status?.value ?? 0),
      deliverable: t.deliverable?.value ? t.deliverable.value.value : undefined,
    };
  } catch (error) {
    console.error("Error getting job:", error);
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
