import { describe, expect, it } from "vitest";
import type { Agent } from "./agent-registry";
import type { NextJob } from "./nayori-next/parse";
import {
  nextAgentMatches,
  nextJobMatches,
  toAgentSearchResult,
  toNextAgentSearchResult,
  toNextJobSearchResult,
} from "./search";

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

const NAYORI_WALLET = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";

const nextJob = (id: number, asset: "sbtc" | "stx"): NextJob => ({
  id,
  asset,
  client: NAYORI_WALLET,
  evaluator: "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC",
  treasury: "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND",
  appealAuthority: "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0",
  budget: 1_000_000,
  description: "Summarize the Stacks DAO forum",
  deliveryDeadline: 100,
  deliveryBlocks: 144,
  reviewBlocks: 144,
  status: 0,
  statusName: "open",
});

describe("Nayori contract search results", () => {
  it("links Nayori jobs to the Nayori job page and labels the contract set", () => {
    const result = toNextJobSearchResult(nextJob(3, "stx"), { protocol: "STX", budget: "1 STX", status: "Open" });
    expect(result).toMatchObject({
      id: "job-nayori-stx-3",
      link: "/jobs/next/3?asset=stx",
      metadata: { contracts: "Nayori contracts", status: "Open" },
    });
    expect(toAgentSearchResult(agent(1, "First agent")).metadata.contracts).toBe("Earlier contracts");
  });

  it("matches Nayori jobs and agents by text or wallet, case insensitive", () => {
    expect(nextJobMatches(nextJob(1, "sbtc"), "dao forum")).toBe(true);
    expect(nextJobMatches(nextJob(1, "sbtc"), NAYORI_WALLET.toLowerCase())).toBe(true);
    expect(nextJobMatches(nextJob(1, "sbtc"), "unrelated")).toBe(false);
    const nextAgent = { wallet: NAYORI_WALLET, name: "Research Bot", uri: "https://example.com/agent.json", registeredAt: 1 };
    expect(nextAgentMatches(nextAgent, "research")).toBe(true);
    expect(toNextAgentSearchResult(nextAgent, "https://explorer.example/address")).toMatchObject({
      id: `agent-nayori-${NAYORI_WALLET}`,
      external: true,
      metadata: { contracts: "Nayori contracts", status: "Registered" },
    });
  });
});
