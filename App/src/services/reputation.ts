import { request } from "@stacks/connect";
import { fetchCallReadOnlyFunction, cvToValue, Cl } from "@stacks/transactions";
import { CONTRACT_ADDRESS } from "../constants/contract";
import { NETWORK, NETWORK_NAME } from "../constants/network";

const REPUTATION_CONTRACT = `${CONTRACT_ADDRESS}.reputation-registry` as `${string}.${string}`;

export interface Reputation {
  totalScore: number;
  ratingCount: number;
  averageScore: number;
  completedJobs: number;
  disputedJobs: number;
}

export interface Rating {
  score: number;
  jobId: number;
  comment: string;
}

const ZERO: Reputation = {
  totalScore: 0,
  ratingCount: 0,
  averageScore: 0,
  completedJobs: 0,
  disputedJobs: 0,
};

export async function getReputation(agentAddress: string): Promise<Reputation> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: "reputation-registry",
      functionName: "get-reputation",
      functionArgs: [Cl.principal(agentAddress)],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });
    if (cv.type !== "ok") return ZERO;
    const t: any = cvToValue(cv).value;
    return {
      totalScore: Number(t["total-score"]?.value ?? 0),
      ratingCount: Number(t["rating-count"]?.value ?? 0),
      averageScore: Number(t["average-score"]?.value ?? 0),
      completedJobs: Number(t["completed-jobs"]?.value ?? 0),
      disputedJobs: Number(t["disputed-jobs"]?.value ?? 0),
    };
  } catch (error) {
    console.error("Error getting reputation:", error);
    return ZERO;
  }
}

export async function hasRated(agentAddress: string, raterAddress: string): Promise<boolean> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: "reputation-registry",
      functionName: "has-rated",
      functionArgs: [Cl.principal(agentAddress), Cl.principal(raterAddress)],
      network: NETWORK,
      senderAddress: CONTRACT_ADDRESS,
    });
    return cvToValue(cv) === true;
  } catch (error) {
    console.error("Error checking rating:", error);
    return false;
  }
}

export async function rateAgent(
  agentAddress: string,
  score: number,
  jobId: number,
  comment: string
): Promise<any> {
  return request("stx_callContract", {
    contract: REPUTATION_CONTRACT,
    functionName: "rate-agent",
    functionArgs: [
      Cl.principal(agentAddress),
      Cl.uint(score),
      Cl.uint(jobId),
      Cl.stringAscii(comment),
    ],
    network: NETWORK_NAME,
  });
}
