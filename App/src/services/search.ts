import type { Agent } from "./agent-registry";
import type { NextAgent, NextJob } from "./nayori-next/parse";
import { CONTRACT_SET_LABELS, nextJobHref } from "./nayori-next/contract-sets";

export interface SearchResult {
  id: string;
  type: "agent" | "job";
  title: string;
  description: string;
  link: string;
  /** The link leaves the app (opens in a new tab). */
  external?: boolean;
  metadata: Record<string, string>;
}

export function toAgentSearchResult(agent: Agent): SearchResult {
  return {
    id: `agent-${agent.id}`,
    type: "agent",
    title: agent.name,
    description: agent.description,
    link: `/agents/${agent.id}`,
    metadata: {
      contracts: CONTRACT_SET_LABELS.earlier,
      wallet: agent.wallet,
      status: agent.active ? "Active" : "Inactive",
    },
  };
}

/** Agents on nayori-agents are keyed by wallet; the result opens the wallet on the explorer. */
export function toNextAgentSearchResult(agent: NextAgent, explorerUrl: string): SearchResult {
  return {
    id: `agent-nayori-${agent.wallet}`,
    type: "agent",
    title: agent.name,
    description: agent.uri,
    link: explorerUrl,
    external: true,
    metadata: {
      contracts: CONTRACT_SET_LABELS.nayori,
      wallet: agent.wallet,
      status: "Registered",
    },
  };
}

export function toNextJobSearchResult(
  job: NextJob,
  labels: { protocol: string; budget: string; status: string }
): SearchResult {
  return {
    id: `job-nayori-${job.asset}-${job.id}`,
    type: "job",
    title: `Job #${job.id}`,
    description: job.description,
    link: nextJobHref(job.id, job.asset),
    metadata: { contracts: CONTRACT_SET_LABELS.nayori, ...labels },
  };
}

const includes = (value: string | undefined, query: string) => Boolean(value && value.toLowerCase().includes(query));

export const nextAgentMatches = (agent: NextAgent, query: string) =>
  includes(agent.name, query) || includes(agent.uri, query) || includes(agent.wallet, query);

export const nextJobMatches = (job: NextJob, query: string) =>
  includes(job.description, query) ||
  includes(job.client, query) ||
  includes(job.provider, query) ||
  includes(job.evaluator, query);
