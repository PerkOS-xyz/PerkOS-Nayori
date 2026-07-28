import { fetchCallReadOnlyFunction, cvToValue, Cl } from "@stacks/transactions";
import { NETWORK } from "../constants/network";
import { CONTRACT_ADDRESS } from "../constants/contract";

const CONTRACT_NAME = "reputation-registry-v2";

export interface ReputationV2 {
  totalScore: number;
  ratingCount: number;
  /** Average on the 1..5 scale, already un-scaled from the on-chain x100 integer. */
  averageScore: number;
  completedJobs: number;
  disputedJobs: number;
}

const ZERO: ReputationV2 = {
  totalScore: 0,
  ratingCount: 0,
  averageScore: 0,
  completedJobs: 0,
  disputedJobs: 0,
};

export async function getReputationV2(agentAddress: string): Promise<ReputationV2> {
  try {
    const cv = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
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
      // Stored x100 on-chain so 4.5 is not truncated to 4.
      averageScore: Number(t["average-score-x100"]?.value ?? 0) / 100,
      completedJobs: Number(t["completed-jobs"]?.value ?? 0),
      disputedJobs: Number(t["disputed-jobs"]?.value ?? 0),
    };
  } catch (error) {
    console.error("Error getting reputation v2:", error);
    return ZERO;
  }
}
