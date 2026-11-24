import { Cl, fetchCallReadOnlyFunction, type ClarityValue } from "@stacks/transactions";
import {
  NAYORI_NEXT,
  NEXT_HIRO_API,
  NEXT_STACKS_NETWORK,
  nextEscrowContract,
  type ContractId,
  type NextAsset,
} from "../../constants/nayori-next";
import { hiroFetch } from "../hiro-fetch";
import {
  parseNextAgent,
  parseNextAllowance,
  parseNextApplication,
  parseNextApplications,
  parseNextDecision,
  parseNextJob,
  parseNextProviderStats,
  parseNextReputationPending,
  parseNextSubmission,
  tupleOf,
  optional,
  boolOf,
  uintOf,
  type NextJob,
} from "./parse";

// Read-only calls against the Nayori contracts of the live deployment on the app network. Jobs on
// the earlier contracts (agentic-commerce-v6, sbtc-commerce-v5) are read by services/commerce.

async function read(contract: ContractId, functionName: string, functionArgs: ClarityValue[] = []) {
  const [contractAddress, contractName] = contract.split(".");
  return fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    network: NEXT_STACKS_NETWORK,
    senderAddress: contractAddress,
  });
}

const escrow = (asset: NextAsset) => nextEscrowContract(asset);

export async function getNextJobCount(asset: NextAsset): Promise<number> {
  return uintOf(await read(escrow(asset), "get-job-count"), "get-job-count");
}

export async function getNextJob(asset: NextAsset, jobId: number): Promise<NextJob | null> {
  return parseNextJob(await read(escrow(asset), "get-job", [Cl.uint(jobId)]), asset, jobId);
}

/** Newest first, one page at a time. */
export async function getNextJobs(
  asset: NextAsset,
  options: { limit: number; offset: number }
): Promise<{ jobs: NextJob[]; total: number }> {
  const total = await getNextJobCount(asset);
  const first = total - options.offset;
  const ids = Array.from({ length: Math.max(0, Math.min(options.limit, first)) }, (_, i) => first - i);
  const jobs = await Promise.all(ids.map((id) => getNextJob(asset, id)));
  return { jobs: jobs.filter((job): job is NextJob => Boolean(job)), total };
}

export async function getNextSubmission(asset: NextAsset, jobId: number) {
  return parseNextSubmission(await read(escrow(asset), "get-submission", [Cl.uint(jobId)]));
}

export async function getNextDecision(asset: NextAsset, jobId: number) {
  return parseNextDecision(await read(escrow(asset), "get-decision", [Cl.uint(jobId)]));
}

export async function getNextEscrowBalance(asset: NextAsset, jobId: number): Promise<number> {
  return uintOf(await read(escrow(asset), "get-escrow-balance", [Cl.uint(jobId)]), "get-escrow-balance");
}

export async function getNextReputationPending(asset: NextAsset, jobId: number) {
  return parseNextReputationPending(
    await read(escrow(asset), "get-reputation-pending", [Cl.uint(jobId)])
  );
}

/** Whether the client already rated this job (false when no outcome is recorded yet). */
export async function getNextJobRated(asset: NextAsset, jobId: number): Promise<boolean> {
  const value = await read(NAYORI_NEXT.contracts.reputation, "get-outcome", [
    Cl.principal(escrow(asset)),
    Cl.uint(jobId),
  ]);
  const outcome = optional(value, "get-outcome");
  return outcome ? boolOf(tupleOf(outcome, "get-outcome").rated, "outcome.rated") : false;
}

export async function getNextProviderStats(provider: string) {
  return parseNextProviderStats(
    await read(NAYORI_NEXT.contracts.reputation, "get-provider-stats", [Cl.principal(provider)])
  );
}

export async function getNextApplications(jobId: number) {
  return parseNextApplications(
    await read(NAYORI_NEXT.contracts.applications, "get-applications", [Cl.uint(jobId)])
  );
}

export async function getNextApplication(jobId: number, applicant: string) {
  return parseNextApplication(
    await read(NAYORI_NEXT.contracts.applications, "get-application", [
      Cl.uint(jobId),
      Cl.principal(applicant),
    ])
  );
}

export async function getNextAgent(wallet: string) {
  return parseNextAgent(await read(NAYORI_NEXT.contracts.agents, "get-agent", [Cl.principal(wallet)]), wallet);
}

export async function getNextAgentCount(): Promise<number> {
  return uintOf(await read(NAYORI_NEXT.contracts.agents, "get-agent-count"), "get-agent-count");
}

/**
 * One allowance of nayori-permissions: may `caller` act for `party` on `target`? The map has no
 * index, so allowances are checked one helper and target at a time, never listed.
 */
export async function getNextAllowance(party: string, caller: ContractId, target: ContractId) {
  return parseNextAllowance(
    await read(NAYORI_NEXT.contracts.permissions, "get-allowance", [
      Cl.principal(party),
      Cl.principal(caller),
      Cl.principal(target),
    ])
  );
}

/** Bitcoin height as seen by the next deployment's Stacks network; 0 when unknown. */
export async function getNextBurnHeight(): Promise<number> {
  try {
    const response = await hiroFetch(`${NEXT_HIRO_API}/v2/info`, { cache: "no-store" });
    if (!response.ok) return 0;
    const info = await response.json();
    return Number(info.burn_block_height ?? 0);
  } catch {
    return 0;
  }
}

export interface NextJobDetail {
  job: NextJob;
  submission: Awaited<ReturnType<typeof getNextSubmission>>;
  decision: Awaited<ReturnType<typeof getNextDecision>>;
  escrow: number;
  rated: boolean;
  reputationPending: boolean;
}

/** Everything the detail page needs for one job, read in parallel. */
export async function getNextJobDetail(asset: NextAsset, jobId: number): Promise<NextJobDetail | null> {
  const job = await getNextJob(asset, jobId);
  if (!job) return null;
  const [submission, decision, escrowBalance, rated, pending] = await Promise.all([
    getNextSubmission(asset, jobId),
    getNextDecision(asset, jobId),
    getNextEscrowBalance(asset, jobId),
    job.status === 7 ? getNextJobRated(asset, jobId) : Promise.resolve(false),
    getNextReputationPending(asset, jobId),
  ]);
  return {
    job,
    submission,
    decision,
    escrow: escrowBalance,
    rated,
    reputationPending: Boolean(pending),
  };
}
