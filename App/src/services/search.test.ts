import { describe, expect, it } from "vitest";
import type { Agent } from "./agent-registry";
import { toAgentSearchResult } from "./search";

function agent(id: number, name: string): Agent {
  return {
    id,
    name,
    description: `${name} description`,
    creator: "ST000000000000000000002AMW42H",
    wallet: "ST000000000000000000002AMW42H",
    active: true,
    endpoints: [],
  };
}

describe("agent search results", () => {
  it("preserves each on-chain agent ID when results are fetched newest first", () => {
    const results = [
      toAgentSearchResult(agent(2, "Newest agent")),
      toAgentSearchResult(agent(1, "First agent")),
    ];

    expect(results.map(({ id, link }) => ({ id, link }))).toEqual([
      { id: "agent-2", link: "/agents/2" },
      { id: "agent-1", link: "/agents/1" },
    ]);
  });
});
