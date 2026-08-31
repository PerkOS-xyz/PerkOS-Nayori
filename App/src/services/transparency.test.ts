import { describe, expect, it } from "vitest";

import type { EvidenceWalletClassification } from "../constants/evidence";
import type { Agent } from "./agent-registry";
import type { CommerceJob } from "./commerce";
import type { OnchainStats } from "./onchain-stats";
import {
  buildTransparencySnapshot,
  buildUnavailableTransparencySnapshot,
} from "./transparency";
import { NETWORK_NAME } from "../constants/network";

const TEAM = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const EXTERNAL_A = "SP000000000000000000002Q6VF78";
const EXTERNAL_B = "SP000000000000000000002Q6VF79";

const classifyWallet = (address?: string): EvidenceWalletClassification => {
  if (address === TEAM) return "team";
  if (address === EXTERNAL_A || address === EXTERNAL_B) return "external-attested";
  return "unattested";
};

const agents: Agent[] = [
  { id: 1, name: "Baseline", description: "", creator: TEAM, wallet: TEAM, active: true, endpoints: [] },
  { id: 2, name: "External A", description: "", creator: EXTERNAL_A, wallet: EXTERNAL_A, active: true, endpoints: [] },
  { id: 3, name: "Unattested", description: "", creator: EXTERNAL_B, wallet: EXTERNAL_B, active: true, endpoints: [] },
];

const jobs: CommerceJob[] = [
  { id: 1, currency: "sbtc", client: TEAM, provider: TEAM, evaluator: TEAM, description: "baseline", budget: 10_000, expiredAt: 1, status: 3 },
  { id: 2, currency: "sbtc", client: TEAM, provider: EXTERNAL_A, evaluator: TEAM, description: "external", budget: 20_000, expiredAt: 1, status: 3 },
  { id: 1, currency: "stx", client: EXTERNAL_B, provider: TEAM, evaluator: TEAM, description: "external", budget: 1_500_000, expiredAt: 1, status: 3 },
  { id: 2, currency: "stx", client: TEAM, evaluator: TEAM, description: "open", budget: 0, expiredAt: 1, status: 0 },
];

const stats: OnchainStats = {
  network: "mainnet",
  deployer: TEAM,
  totalTx: 30,
  contractCalls: 25,
  successfulContractCalls: 24,
  distinctWallets: 4,
  feesSTX: 0.25,
  indexedTransactions: 30,
  truncated: false,
  perContract: [{ name: "sbtc-commerce", total: 10 }],
  recent: [
    {
      txId: `0x${"a".repeat(64)}`,
      contract: "sbtc-commerce",
      fn: "complete-job",
      sender: EXTERNAL_A,
      status: "success",
      time: "2026-08-28T18:00:00.000Z",
      blockHeight: 1,
    },
  ],
};

describe("transparency snapshot", () => {
  it("separates observed totals, the M1 baseline and attested external adoption", () => {
    const snapshot = buildTransparencySnapshot({
      agents,
      jobs,
      stats,
      generatedAt: "2026-08-28T18:00:00.000Z",
      classifyWallet,
    });

    expect(snapshot.dataStatus.chain).toBe("live");
    expect(snapshot.observed).toMatchObject({
      registeredAgentsMainnet: 3,
      totalJobsMainnet: 4,
      completedSbtcJobsMainnet: 2,
      completedStxJobsMainnet: 1,
      settledSbtcSats: 30_000,
      settledStxMicrostx: 1_500_000,
      successfulContractCalls: 24,
    });
    expect(snapshot.milestone2.verified).toMatchObject(
      NETWORK_NAME === "testnet"
        ? {
            registeredAgentsMainnet: 0,
            completedSbtcJobsMainnet: 0,
            completedJobsFromNonTeamWallets: 0,
            participatingNonTeamWallets: 0,
          }
        : {
            registeredAgentsMainnet: 2,
            completedSbtcJobsMainnet: 1,
            completedJobsFromNonTeamWallets: 2,
            participatingNonTeamWallets: 2,
          },
    );
    expect(snapshot.transactions[0]).toMatchObject({
      senderClassification: "external-attested",
      blockHeight: 1,
    });
  });

  it("keeps a static baseline but marks live data unavailable on source failure", () => {
    const snapshot = buildUnavailableTransparencySnapshot("2026-08-28T18:00:00.000Z");
    expect(snapshot.dataStatus).toMatchObject({
      chain: "unavailable",
      code: "chain_source_unavailable",
    });
    expect(snapshot.observed).toBeNull();
    expect(snapshot.agents).toEqual([]);
    expect(snapshot.jobs).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.milestone1.status).toBe("approved");
  });
});
