import { cvToValue, fetchCallReadOnlyFunction } from "@stacks/transactions";

import { getAgent, type Agent } from "./agent-registry";
import { getCommerceJob, type CommerceJob, type Currency } from "./commerce";
import { getOnchainStats, type OnchainStats } from "./onchain-stats";
import {
  classifyEvidenceWallet,
  evidenceManifest,
  evidenceWallets,
  externalSdkAdoptions,
  m2Baseline,
} from "../constants/evidence";
import {
  CONTRACT_ADDRESS,
  SBTC_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";
import { NETWORK, NETWORK_NAME } from "../constants/network";

const CHAIN_SOURCE =
  NETWORK_NAME === "testnet"
    ? "Stacks testnet contracts + Hiro API"
    : "Stacks mainnet contracts + Hiro API";
const CHAIN_PARAM = NETWORK_NAME === "testnet" ? "testnet" : "mainnet";

const JOB_STATUS = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
  "Timeout paid",
  "Decision pending",
  "Disputed",
] as const;

export interface TransparencyAgent {
  id: number;
  name: string;
  creator: string;
  wallet: string;
  active: boolean;
  classification: ReturnType<typeof classifyEvidenceWallet>;
}

export interface TransparencyJob {
  id: number;
  currency: Currency;
  status: number;
  statusLabel: string;
  budget: number;
  client: string;
  provider?: string;
  evaluator: string;
  description: string;
  classifications: {
    client: ReturnType<typeof classifyEvidenceWallet>;
    provider: ReturnType<typeof classifyEvidenceWallet>;
    evaluator: ReturnType<typeof classifyEvidenceWallet>;
  };
}

export interface TransparencyTransaction {
  txId: string;
  contract: string;
  function: string;
  sender: string;
  senderClassification: ReturnType<typeof classifyEvidenceWallet>;
  status: string;
  time?: string;
  blockHeight?: number;
  explorer: string;
}

export interface ObservedTransparencyMetrics {
  registeredAgentsMainnet: number;
  totalJobsMainnet: number;
  sbtcJobsMainnet: number;
  stxJobsMainnet: number;
  completedSbtcJobsMainnet: number;
  completedStxJobsMainnet: number;
  settledSbtcSats: number;
  settledStxMicrostx: number;
  contractTransactions: number;
  contractCalls: number;
  successfulContractCalls: number;
  distinctWallets: number;
  indexedTransactions: number;
  truncated: boolean;
}

export interface TransparencySnapshot {
  schemaVersion: number;
  generatedAt: string;
  product: string;
  network: string;
  explorer: string;
  policy: typeof evidenceManifest.policy;
  dataStatus: {
    chain: "live" | "unavailable";
    source: string;
    code?: "chain_source_unavailable";
  };
  milestone1: typeof evidenceManifest.milestone1;
  milestone2: {
    status: typeof evidenceManifest.milestone2.status;
    baseline: typeof evidenceManifest.milestone2.baseline;
    targets: typeof evidenceManifest.milestone2.targets;
    verified: {
      registeredAgentsMainnet: number;
      completedSbtcJobsMainnet: number;
      completedJobsFromNonTeamWallets: number;
      participatingNonTeamWallets: number;
      externalSdkAdoptions: number;
      sdkPublicDistribution: boolean;
    };
    distribution: typeof evidenceManifest.milestone2.distribution;
    externalSdkAdoptions: typeof externalSdkAdoptions;
  };
  observed: ObservedTransparencyMetrics | null;
  agents: TransparencyAgent[];
  jobs: TransparencyJob[];
  transactions: TransparencyTransaction[];
}

type SnapshotInput = {
  agents: Agent[];
  jobs: CommerceJob[];
  stats: OnchainStats;
  generatedAt?: string;
  classifyWallet?: typeof classifyEvidenceWallet;
};

function uniqueExternalParticipants(
  agents: Agent[],
  jobs: CommerceJob[],
  classifyWallet: typeof classifyEvidenceWallet,
): Set<string> {
  const participants = new Set<string>();
  const add = (address?: string) => {
    if (address && classifyWallet(address) === "external-attested") {
      participants.add(address.toUpperCase());
    }
  };
  for (const agent of agents) {
    add(agent.creator);
    add(agent.wallet);
  }
  for (const job of jobs) {
    add(job.client);
    add(job.provider);
    add(job.evaluator);
  }
  return participants;
}

function hasExternalParticipant(
  job: CommerceJob,
  classifyWallet: typeof classifyEvidenceWallet,
): boolean {
  return [job.client, job.provider, job.evaluator].some(
    (address) => classifyWallet(address) === "external-attested",
  );
}

export function buildTransparencySnapshot({
  agents,
  jobs,
  stats,
  generatedAt = new Date().toISOString(),
  classifyWallet = classifyEvidenceWallet,
}: SnapshotInput): TransparencySnapshot {
  const sbtcJobs = jobs.filter((job) => job.currency === "sbtc");
  const stxJobs = jobs.filter((job) => job.currency === "stx");
  const completedSbtcJobs = sbtcJobs.filter((job) => job.status === 3);
  const completedStxJobs = stxJobs.filter((job) => job.status === 3);
  const completedExternalJobs = jobs.filter(
    (job) => job.status === 3 && hasExternalParticipant(job, classifyWallet),
  );
  const externalParticipants = uniqueExternalParticipants(agents, jobs, classifyWallet);

  const observed: ObservedTransparencyMetrics = {
    registeredAgentsMainnet: agents.length,
    totalJobsMainnet: jobs.length,
    sbtcJobsMainnet: sbtcJobs.length,
    stxJobsMainnet: stxJobs.length,
    completedSbtcJobsMainnet: completedSbtcJobs.length,
    completedStxJobsMainnet: completedStxJobs.length,
    settledSbtcSats: completedSbtcJobs.reduce((sum, job) => sum + job.budget, 0),
    settledStxMicrostx: completedStxJobs.reduce((sum, job) => sum + job.budget, 0),
    contractTransactions: stats.totalTx,
    contractCalls: stats.contractCalls,
    successfulContractCalls: stats.successfulContractCalls,
    distinctWallets: stats.distinctWallets,
    indexedTransactions: stats.indexedTransactions,
    truncated: stats.truncated,
  };

  const verified =
    NETWORK_NAME === "testnet"
      ? { ...evidenceManifest.milestone2.verified }
      : {
          registeredAgentsMainnet: Math.max(
            0,
            observed.registeredAgentsMainnet - m2Baseline.registeredAgentsMainnet,
          ),
          completedSbtcJobsMainnet: Math.max(
            0,
            observed.completedSbtcJobsMainnet - m2Baseline.completedSbtcJobsMainnet,
          ),
          completedJobsFromNonTeamWallets: completedExternalJobs.length,
          participatingNonTeamWallets: externalParticipants.size,
          externalSdkAdoptions: externalSdkAdoptions.length,
          sdkPublicDistribution: evidenceManifest.milestone2.verified.sdkPublicDistribution,
        };

  return {
    schemaVersion: evidenceManifest.schemaVersion,
    generatedAt,
    product: evidenceManifest.product,
    network: evidenceManifest.network,
    explorer: evidenceManifest.explorer,
    policy: evidenceManifest.policy,
    dataStatus: {
      chain: "live",
      source: CHAIN_SOURCE,
    },
    milestone1: evidenceManifest.milestone1,
    milestone2: {
      ...evidenceManifest.milestone2,
      verified,
    },
    observed,
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      creator: agent.creator,
      wallet: agent.wallet,
      active: agent.active,
      classification: classifyWallet(agent.wallet),
    })),
    jobs: jobs.map((job) => ({
      id: job.id,
      currency: job.currency,
      status: job.status,
      statusLabel: JOB_STATUS[job.status] ?? `Unknown (${job.status})`,
      budget: job.budget,
      client: job.client,
      provider: job.provider,
      evaluator: job.evaluator,
      description: job.description,
      classifications: {
        client: classifyWallet(job.client),
        provider: classifyWallet(job.provider),
        evaluator: classifyWallet(job.evaluator),
      },
    })),
    transactions: stats.recent.map((transaction) => ({
      txId: transaction.txId,
      contract: transaction.contract,
      function: transaction.fn,
      sender: transaction.sender,
      senderClassification: classifyWallet(transaction.sender),
      status: transaction.status,
      time: transaction.time,
      blockHeight: transaction.blockHeight,
      explorer: `https://explorer.hiro.so/txid/${transaction.txId}?chain=${CHAIN_PARAM}`,
    })),
  };
}

export function buildUnavailableTransparencySnapshot(
  generatedAt = new Date().toISOString(),
): TransparencySnapshot {
  return {
    schemaVersion: evidenceManifest.schemaVersion,
    generatedAt,
    product: evidenceManifest.product,
    network: evidenceManifest.network,
    explorer: evidenceManifest.explorer,
    policy: evidenceManifest.policy,
    dataStatus: {
      chain: "unavailable",
      source: CHAIN_SOURCE,
      code: "chain_source_unavailable",
    },
    milestone1: evidenceManifest.milestone1,
    milestone2: evidenceManifest.milestone2,
    observed: null,
    agents: [],
    jobs: [],
    transactions: [],
  };
}

async function readCount(contractName: string, functionName: string): Promise<number> {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName,
    functionName,
    functionArgs: [],
    network: NETWORK,
    senderAddress: CONTRACT_ADDRESS,
  });
  if (cv.type !== "ok") throw new Error(`${contractName}.${functionName} returned an error.`);
  const count = Number(cvToValue(cv).value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${contractName}.${functionName} returned an invalid count.`);
  }
  return count;
}

async function loadAgents(count: number): Promise<Agent[]> {
  const agents = await Promise.all(
    Array.from({ length: count }, (_, index) => getAgent(index + 1)),
  );
  if (agents.some((agent) => agent === null)) {
    throw new Error("The agent registry returned an incomplete snapshot.");
  }
  return agents as Agent[];
}

async function loadJobs(currency: Currency, count: number): Promise<CommerceJob[]> {
  const jobs = await Promise.all(
    Array.from({ length: count }, (_, index) => getCommerceJob(index + 1, currency)),
  );
  if (jobs.some((job) => job === null)) {
    throw new Error(`The ${currency} job registry returned an incomplete snapshot.`);
  }
  return jobs as CommerceJob[];
}

export async function loadTransparencySnapshot(): Promise<TransparencySnapshot> {
  try {
    const [agentCount, sbtcJobCount, stxJobCount, stats] = await Promise.all([
      readCount("agent-registry", "get-agent-count"),
      readCount(SBTC_COMMERCE_CONTRACT_NAME, "get-job-count"),
      readCount(STX_COMMERCE_CONTRACT_NAME, "get-job-count"),
      getOnchainStats({ strict: true, recentLimit: 50 }),
    ]);
    const [agents, sbtcJobs, stxJobs] = await Promise.all([
      loadAgents(agentCount),
      loadJobs("sbtc", sbtcJobCount),
      loadJobs("stx", stxJobCount),
    ]);
    return buildTransparencySnapshot({
      agents,
      jobs: [...sbtcJobs, ...stxJobs],
      stats,
    });
  } catch (error) {
    console.error("Transparency snapshot unavailable:", error);
    return buildUnavailableTransparencySnapshot();
  }
}

export const transparencyTeamWallets = evidenceWallets;
