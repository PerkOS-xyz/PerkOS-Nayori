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
