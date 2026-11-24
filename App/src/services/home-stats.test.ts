import { describe, expect, it } from "vitest";
import { homeStatsFromSnapshot } from "./home-stats";

const observed = {
  registeredAgentsMainnet: 7,
  totalJobsMainnet: 12,
  sbtcJobsMainnet: 5,
  stxJobsMainnet: 7,
  completedSbtcJobsMainnet: 3,
  completedStxJobsMainnet: 4,
  settledSbtcSats: 3000,
  settledStxMicrostx: 400000,
  contractTransactions: 60,
  contractCalls: 55,
  successfulContractCalls: 50,
  distinctWallets: 9,
  indexedTransactions: 60,
  truncated: false,
  byContractSet: {
    nayori: { agents: 1, jobs: 3, sbtcJobs: 1, stxJobs: 2, completedSbtcJobs: 0, completedStxJobs: 1, settledSbtcSats: 0, settledStxMicrostx: 100000, contractTransactions: 10 },
    earlier: { agents: 6, jobs: 9, sbtcJobs: 4, stxJobs: 5, completedSbtcJobs: 3, completedStxJobs: 3, settledSbtcSats: 3000, settledStxMicrostx: 300000, contractTransactions: 50 },
  },
};

describe("home transparency stats", () => {
  it("uses the exact live evidence metrics instead of independent or static totals", () => {
    expect(homeStatsFromSnapshot({ dataStatus: { chain: "live", source: "test" }, observed }))
      .toEqual([
        { label: "Registered agents", value: 7 },
        { label: "All jobs", value: 12 },
        { label: "Successful contract calls", value: 50 },
        { label: "Distinct on-chain wallets", value: 9 },
      ]);
  });

  it("shows no numbers when the evidence source is unavailable", () => {
    expect(homeStatsFromSnapshot({
      dataStatus: { chain: "unavailable", source: "test", code: "chain_source_unavailable" },
      observed: null,
    })).toBeNull();
  });
});
