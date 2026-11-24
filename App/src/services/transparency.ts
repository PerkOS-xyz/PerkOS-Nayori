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
  STX_COMMERCE_HAS_SERVICE_FEES,
  SBTC_COMMERCE_HAS_SERVICE_FEES,
} from "../constants/contract";
import { NETWORK, NETWORK_NAME } from "../constants/network";
import { buildFeeEvidence, type FeeEvidence, type FeeEvidenceSelection } from "./fee-evidence";
import { createTtlCache } from "./snapshot-cache";
import { CONTRACT_SETS, earlierJobHref, nextJobHref, type ContractSet } from "./nayori-next/contract-sets";
import { getNextAgentsFor, getNextJobsOverview, nextIsCompleted } from "./nayori-next/overview";
import type { NextAgent, NextJob } from "./nayori-next/parse";
import { getNextAgentCount } from "./nayori-next/reads";
import { NEXT_STATUS_LABELS, NEXT_STATUS_TONE } from "./nayori-next/status";

const feeSelection: FeeEvidenceSelection = {
  stx: { contract: `${CONTRACT_ADDRESS}.${STX_COMMERCE_CONTRACT_NAME}`, enabled: STX_COMMERCE_HAS_SERVICE_FEES },
  sbtc: { contract: `${CONTRACT_ADDRESS}.${SBTC_COMMERCE_CONTRACT_NAME}`, enabled: SBTC_COMMERCE_HAS_SERVICE_FEES },
};

const CHAIN_SOURCE =
  NETWORK_NAME === "testnet"
    ? "Stacks testnet Nayori and earlier contracts + Hiro API"
    : "Stacks mainnet Nayori and earlier contracts + Hiro API";
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

export type StatusTone = "neutral" | "active" | "warn" | "good" | "bad";

export interface TransparencyAgent {
  /** Agent id on agent-registry; null on nayori-agents, where the wallet is the identity. */
  id: number | null;
  contractSet: ContractSet;
  /** Where the agent opens: its page for agent-registry, the explorer for nayori-agents. */
  href: string;
  name: string;
  creator: string;
  wallet: string;
  active: boolean;
  classification: ReturnType<typeof classifyEvidenceWallet>;
}

export interface TransparencyJob {
  id: number;
  contractSet: ContractSet;
  currency: Currency;
  /** Status code of the job's own contract set; read `statusLabel`, `completed` and `tone` across sets. */
  status: number;
  statusLabel: string;
  completed: boolean;
  tone: StatusTone;
  href: string;
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
  contractId: string;
  contractSet: ContractSet;
  function: string;
  sender: string;
  senderClassification: ReturnType<typeof classifyEvidenceWallet>;
  status: string;
  time?: string;
  blockHeight?: number;
  explorer: string;
}

/** One contract set's share of the observed totals. */
export interface ContractSetMetrics {
  agents: number;
  jobs: number;
  sbtcJobs: number;
  stxJobs: number;
  completedSbtcJobs: number;
  completedStxJobs: number;
  settledSbtcSats: number;
  settledStxMicrostx: number;
  contractTransactions: number;
}

/** Totals combine the Nayori contracts and the earlier contracts; `byContractSet` splits them. */
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
  byContractSet: Record<ContractSet, ContractSetMetrics>;
}

export interface TransparencySnapshot {
  serviceFees: FeeEvidence;
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
    /** How this snapshot's chain data was obtained: read now, served from the short server cache, or the last good read after a failed refresh. */
    cache?: "fresh" | "cached" | "stale";
    /** When the chain was actually read for this snapshot. */
    readAt?: string;
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
  /** Agents on agent-registry (earlier contracts). */
  agents: Agent[];
  /** Jobs on the earlier escrow contracts. */
  jobs: CommerceJob[];
  /** Agents found on nayori-agents. */
  nayoriAgents?: NextAgent[];
  /** get-agent-count of nayori-agents; defaults to the agents found. */
  nayoriAgentCount?: number;
  /** Jobs on nayori-escrow-sbtc and nayori-escrow-stx. */
  nayoriJobs?: NextJob[];
  stats: OnchainStats;
  generatedAt?: string;
  classifyWallet?: typeof classifyEvidenceWallet;
  /** Whether the jobs list is read from the contract that holds the approved M1 baseline job. */
  baselineIncludedInSbtcJobs?: boolean;
};

export const BASELINE_SBTC_CONTRACT_NAME = evidenceManifest.milestone1.contract.split(".")[1] ?? "";
export const SBTC_JOBS_INCLUDE_BASELINE = SBTC_COMMERCE_CONTRACT_NAME === BASELINE_SBTC_CONTRACT_NAME;

const EARLIER_COMPLETED = 3;

function earlierTone(status: number): StatusTone {
  if (status === EARLIER_COMPLETED) return "good";
  if (status === 4 || status === 5) return "bad";
  if (status === 1 || status === 2 || status === 7 || status === 8) return "active";
  return "neutral";
}

type Classify = typeof classifyEvidenceWallet;

const classificationsOf = (job: { client: string; provider?: string; evaluator: string }, classifyWallet: Classify) => ({
  client: classifyWallet(job.client),
  provider: classifyWallet(job.provider),
  evaluator: classifyWallet(job.evaluator),
});

function earlierJobView(job: CommerceJob, classifyWallet: Classify): TransparencyJob {
  return {
    id: job.id,
    contractSet: "earlier",
    currency: job.currency,
    status: job.status,
    statusLabel: JOB_STATUS[job.status] ?? `Unknown (${job.status})`,
    completed: job.status === EARLIER_COMPLETED,
    tone: earlierTone(job.status),
    href: earlierJobHref(job.id, job.currency),
    budget: job.budget,
    client: job.client,
    provider: job.provider,
    evaluator: job.evaluator,
    description: job.description,
    classifications: classificationsOf(job, classifyWallet),
  };
}

function nayoriJobView(job: NextJob, classifyWallet: Classify): TransparencyJob {
  return {
    id: job.id,
    contractSet: "nayori",
    currency: job.asset,
    status: job.status,
    statusLabel: NEXT_STATUS_LABELS[job.statusName],
    completed: nextIsCompleted(job),
    tone: NEXT_STATUS_TONE[job.statusName],
    href: nextJobHref(job.id, job.asset),
    budget: job.budget,
    client: job.client,
    provider: job.provider,
    evaluator: job.evaluator,
    description: job.description,
    classifications: classificationsOf(job, classifyWallet),
  };
}

function earlierAgentView(agent: Agent, classifyWallet: Classify): TransparencyAgent {
  return {
    id: agent.id,
    contractSet: "earlier",
    href: `/agents/${agent.id}`,
    name: agent.name,
    creator: agent.creator,
    wallet: agent.wallet,
    active: agent.active,
    classification: classifyWallet(agent.wallet),
  };
}

function nayoriAgentView(agent: NextAgent, classifyWallet: Classify): TransparencyAgent {
  return {
    id: null,
    contractSet: "nayori",
    href: `https://explorer.hiro.so/address/${agent.wallet}?chain=${CHAIN_PARAM}`,
    name: agent.name,
    creator: agent.wallet,
    wallet: agent.wallet,
    // nayori-agents has no deactivation: a registered agent stays registered.
    active: true,
    classification: classifyWallet(agent.wallet),
  };
}

function uniqueExternalParticipants(
  agents: TransparencyAgent[],
  jobs: TransparencyJob[],
  classifyWallet: Classify,
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

function hasExternalParticipant(job: TransparencyJob, classifyWallet: Classify): boolean {
  return [job.client, job.provider, job.evaluator].some(
    (address) => classifyWallet(address) === "external-attested",
  );
}

function setMetrics(jobs: TransparencyJob[], agents: number, contractTransactions: number): ContractSetMetrics {
  const completed = (currency: Currency) => jobs.filter((job) => job.currency === currency && job.completed);
  return {
    agents,
    jobs: jobs.length,
    sbtcJobs: jobs.filter((job) => job.currency === "sbtc").length,
    stxJobs: jobs.filter((job) => job.currency === "stx").length,
    completedSbtcJobs: completed("sbtc").length,
    completedStxJobs: completed("stx").length,
    settledSbtcSats: completed("sbtc").reduce((sum, job) => sum + job.budget, 0),
    settledStxMicrostx: completed("stx").reduce((sum, job) => sum + job.budget, 0),
    contractTransactions,
  };
}

export function buildTransparencySnapshot({
  agents,
  jobs,
  nayoriAgents = [],
  nayoriAgentCount = nayoriAgents.length,
  nayoriJobs = [],
  stats,
  generatedAt = new Date().toISOString(),
  classifyWallet = classifyEvidenceWallet,
  baselineIncludedInSbtcJobs = SBTC_JOBS_INCLUDE_BASELINE,
}: SnapshotInput): TransparencySnapshot {
  // The Nayori contracts first, newest first; then the earlier contracts as before.
  const jobViews = [
    ...nayoriJobs.map((job) => nayoriJobView(job, classifyWallet)),
    ...jobs.map((job) => earlierJobView(job, classifyWallet)),
  ];
  const agentViews = [
    ...nayoriAgents.map((agent) => nayoriAgentView(agent, classifyWallet)),
    ...agents.map((agent) => earlierAgentView(agent, classifyWallet)),
  ];
  const transactionsOf = (set: ContractSet) =>
    stats.perContract.filter((contract) => contract.set === set).reduce((sum, contract) => sum + contract.total, 0);
  const byContractSet = Object.fromEntries(
    CONTRACT_SETS.map((set) => [
      set,
      setMetrics(
        jobViews.filter((job) => job.contractSet === set),
        set === "nayori" ? nayoriAgentCount : agents.length,
        transactionsOf(set),
      ),
    ]),
  ) as Record<ContractSet, ContractSetMetrics>;
  const both = (pick: (metrics: ContractSetMetrics) => number) =>
    CONTRACT_SETS.reduce((sum, set) => sum + pick(byContractSet[set]), 0);

  const completedExternalJobs = jobViews.filter(
    (job) => job.completed && hasExternalParticipant(job, classifyWallet),
  );
  const externalParticipants = uniqueExternalParticipants(agentViews, jobViews, classifyWallet);

  // Agents count once per wallet across both registries: a wallet with an agent on each is one
  // participant. Nayori agents beyond the listed ones (the list reads recent history only) cannot
  // overlap-check and are added as they are.
  const uniqueAgentWallets = new Set(agentViews.map((agent) => agent.wallet)).size;
  const unlistedNayoriAgents = Math.max(0, nayoriAgentCount - nayoriAgents.length);
  const observed: ObservedTransparencyMetrics = {
    registeredAgentsMainnet: uniqueAgentWallets + unlistedNayoriAgents,
    totalJobsMainnet: both((m) => m.jobs),
    sbtcJobsMainnet: both((m) => m.sbtcJobs),
    stxJobsMainnet: both((m) => m.stxJobs),
    completedSbtcJobsMainnet: both((m) => m.completedSbtcJobs),
    completedStxJobsMainnet: both((m) => m.completedStxJobs),
    settledSbtcSats: both((m) => m.settledSbtcSats),
    settledStxMicrostx: both((m) => m.settledStxMicrostx),
    contractTransactions: stats.totalTx,
    contractCalls: stats.contractCalls,
    successfulContractCalls: stats.successfulContractCalls,
    distinctWallets: stats.distinctWallets,
    indexedTransactions: stats.indexedTransactions,
    truncated: stats.truncated,
    byContractSet,
  };

  const verified =
    NETWORK_NAME === "testnet"
      ? { ...evidenceManifest.milestone2.verified }
      : {
          registeredAgentsMainnet: Math.max(
            0,
            observed.registeredAgentsMainnet - m2Baseline.registeredAgentsMainnet,
          ),
          // The M1 baseline job lives on the original `sbtc-commerce` contract. Subtract it only
          // when that contract is the one being read; otherwise the observed count never includes it.
          completedSbtcJobsMainnet: Math.max(
            0,
            observed.completedSbtcJobsMainnet -
              (baselineIncludedInSbtcJobs ? m2Baseline.completedSbtcJobsMainnet : 0),
          ),
          completedJobsFromNonTeamWallets: completedExternalJobs.length,
          participatingNonTeamWallets: externalParticipants.size,
          externalSdkAdoptions: externalSdkAdoptions.length,
          sdkPublicDistribution: evidenceManifest.milestone2.verified.sdkPublicDistribution,
        };

  return {
    // Service fees are a feature of the earlier contracts; the Nayori contracts charge a fixed 2%.
    serviceFees: buildFeeEvidence(jobs, feeSelection),
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
    agents: agentViews,
    jobs: jobViews,
    transactions: stats.recent.map((transaction) => ({
      txId: transaction.txId,
      contract: transaction.contract,
      contractId: transaction.contractId,
      contractSet: transaction.set,
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
    serviceFees: buildFeeEvidence([], feeSelection, false),
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

export interface SnapshotOptions {
  /** Wallets attested through the participant registry (upper-cased); classified `external-attested`. */
  attestedWallets?: Set<string>;
}

/** The static classification plus the registry: a wallet registered by its owner counts as external. */
export function classifyWithRegistry(attestedWallets?: Set<string>): typeof classifyEvidenceWallet {
  if (!attestedWallets || attestedWallets.size === 0) return classifyEvidenceWallet;
  return (address?: string) => {
    const base = classifyEvidenceWallet(address);
    if (base !== "unattested") return base;
    return address && attestedWallets.has(address.toUpperCase()) ? "external-attested" : "unattested";
  };
}

const SNAPSHOT_TTL_MS = Number(process.env.TRANSPARENCY_CACHE_MS ?? 60_000);
const SNAPSHOT_STALE_MS = Number(process.env.TRANSPARENCY_STALE_MS ?? 30 * 60_000);

async function readChain(): Promise<SnapshotInput> {
  const [agentCount, sbtcJobCount, stxJobCount, stats] = await Promise.all([
    readCount("agent-registry", "get-agent-count"),
    readCount(SBTC_COMMERCE_CONTRACT_NAME, "get-job-count"),
    readCount(STX_COMMERCE_CONTRACT_NAME, "get-job-count"),
    getOnchainStats({ strict: true, recentLimit: 50 }),
  ]);
  const [agents, sbtcJobs, stxJobs, nayori, nayoriAgents, nayoriAgentCount] = await Promise.all([
    loadAgents(agentCount),
    loadJobs("sbtc", sbtcJobCount),
    loadJobs("stx", stxJobCount),
    getNextJobsOverview({ strict: true }),
    getNextAgentsFor(stats.nayoriAgentCandidates, { strict: true }),
    getNextAgentCount(),
  ]);
  return {
    agents,
    jobs: [...sbtcJobs, ...stxJobs],
    nayoriAgents,
    nayoriAgentCount,
    nayoriJobs: nayori.jobs,
    stats,
  };
}

type Global = typeof globalThis & { __nayoriChainCache?: ReturnType<typeof createTtlCache<SnapshotInput>> };
function chainCache() {
  const g = globalThis as Global;
  if (!g.__nayoriChainCache) g.__nayoriChainCache = createTtlCache<SnapshotInput>({ ttlMs: SNAPSHOT_TTL_MS, staleMs: SNAPSHOT_STALE_MS, load: readChain });
  return g.__nayoriChainCache;
}

/**
 * One chain read per minute per process, shared by every page and endpoint; concurrent requests
 * share the read. If Hiro fails (rate limit, outage) the last good read is served for up to 30
 * minutes, flagged `cache: "stale"` with its real `readAt`, instead of an empty snapshot.
 */
export async function loadTransparencySnapshot(options: SnapshotOptions = {}): Promise<TransparencySnapshot> {
  try {
    const read = await chainCache().get();
    const snapshot = buildTransparencySnapshot({
      ...read.value,
      generatedAt: read.readAt.toISOString(),
      classifyWallet: classifyWithRegistry(options.attestedWallets),
    });
    snapshot.dataStatus.cache = read.status;
    snapshot.dataStatus.readAt = read.readAt.toISOString();
    return snapshot;
  } catch (error) {
    console.error("Transparency snapshot unavailable:", error);
    return buildUnavailableTransparencySnapshot();
  }
}

export const transparencyTeamWallets = evidenceWallets;
