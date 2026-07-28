import type { Agent } from "./agent-registry";

export interface SearchResult {
  id: string;
  type: "agent" | "job";
  title: string;
  description: string;
  link: string;
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
      wallet: agent.wallet,
      status: agent.active ? "Active" : "Inactive",
    },
  };
}
