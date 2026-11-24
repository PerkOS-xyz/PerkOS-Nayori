import { describe, expect, it } from "vitest";

import type { EvidenceWalletClassification } from "../constants/evidence";
import type { Agent } from "./agent-registry";
import type { CommerceJob } from "./commerce";
import type { OnchainStats } from "./onchain-stats";
import type { NextAgent, NextJob } from "./nayori-next/parse";
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
  nayoriDeployer: "SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X",
  totalTx: 30,
  contractCalls: 25,
  successfulContractCalls: 24,
  distinctWallets: 4,
  feesSTX: 0.25,
  indexedTransactions: 30,
  truncated: false,
  perContract: [{ name: "sbtc-commerce", id: `${TEAM}.sbtc-commerce`, set: "earlier", total: 10 }],
  nayoriAgentCandidates: [],
  recent: [
    {
      txId: `0x${"a".repeat(64)}`,
      contract: "sbtc-commerce",
      contractId: `${TEAM}.sbtc-commerce`,
      set: "earlier",
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
      baselineIncludedInSbtcJobs: true,
    });

    expect(snapshot.dataStatus.chain).toBe("live");
    expect(snapshot.serviceFees.scope).toBe("selected-contract-jobs");
    expect(() => JSON.stringify(snapshot)).not.toThrow();
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

  it("does not subtract the M1 baseline job when reading a newer sBTC contract generation", () => {
    const snapshot = buildTransparencySnapshot({
      agents,
      jobs: jobs.filter((job) => !(job.currency === "sbtc" && job.id === 1)),
      stats,
      generatedAt: "2026-09-24T00:00:00.000Z",
      classifyWallet,
      baselineIncludedInSbtcJobs: false,
    });
    expect(snapshot.observed?.completedSbtcJobsMainnet).toBe(1);
    if (NETWORK_NAME !== "testnet") {
      expect(snapshot.milestone2.verified.completedSbtcJobsMainnet).toBe(1);
      expect(snapshot.milestone2.verified.registeredAgentsMainnet).toBe(2);
    }
  });

  it("combines the Nayori contracts with the earlier ones and keeps a per-set split", () => {
    const nayoriJob = (id: number, asset: "sbtc" | "stx", status: number, statusName: NextJob["statusName"], provider?: string): NextJob => ({
      id,
      asset,
      client: TEAM,
      evaluator: TEAM,
      ...(provider ? { provider } : {}),
      treasury: TEAM,
      appealAuthority: TEAM,
      budget: asset === "sbtc" ? 5_000 : 2_000_000,
      description: "nayori",
      deliveryDeadline: 10,
      deliveryBlocks: 144,
      reviewBlocks: 144,
      status,
      statusName,
    });
    const nayoriJobs = [
      nayoriJob(2, "stx", 7, "completed", EXTERNAL_A),
      nayoriJob(1, "stx", 1, "funded"),
      nayoriJob(1, "sbtc", 6, "disputed", TEAM),
    ];
    const nayoriAgents: NextAgent[] = [{ wallet: EXTERNAL_B, name: "Nayori agent", uri: "", registeredAt: 5 }];
    const snapshot = buildTransparencySnapshot({
      agents,
      jobs,
      nayoriAgents,
      nayoriAgentCount: 2,
      nayoriJobs,
      stats: {
        ...stats,
        perContract: [
          ...stats.perContract,
          { name: "nayori-escrow-stx", id: "SPX.nayori-escrow-stx", set: "nayori", total: 7 },
        ],
      },
      generatedAt: "2026-11-24T00:00:00.000Z",
      classifyWallet,
      baselineIncludedInSbtcJobs: false,
    });

    expect(snapshot.observed).toMatchObject({
      registeredAgentsMainnet: 5,
      totalJobsMainnet: 7,
      sbtcJobsMainnet: 3,
      stxJobsMainnet: 4,
      completedSbtcJobsMainnet: 2,
      completedStxJobsMainnet: 2,
      settledStxMicrostx: 3_500_000,
    });
    expect(snapshot.observed?.byContractSet.nayori).toEqual({
      agents: 2,
      jobs: 3,
      sbtcJobs: 1,
      stxJobs: 2,
      completedSbtcJobs: 0,
      completedStxJobs: 1,
      settledSbtcSats: 0,
      settledStxMicrostx: 2_000_000,
      contractTransactions: 7,
    });
    expect(snapshot.observed?.byContractSet.earlier).toMatchObject({ agents: 3, jobs: 4, contractTransactions: 10 });
    expect(snapshot.jobs[0]).toMatchObject({
      contractSet: "nayori",
      statusLabel: "Completed",
      completed: true,
      tone: "good",
      href: "/jobs/next/2?asset=stx",
    });
    expect(snapshot.jobs[2]).toMatchObject({ statusLabel: "Appealed", tone: "warn", href: "/jobs/next/1?asset=sbtc" });
    expect(snapshot.jobs[3]).toMatchObject({ contractSet: "earlier", href: "/jobs/1?currency=sbtc", completed: true });
    expect(snapshot.agents[0]).toMatchObject({ id: null, contractSet: "nayori", wallet: EXTERNAL_B });
    expect(snapshot.agents[1]).toMatchObject({ id: 1, contractSet: "earlier", href: "/agents/1" });
    if (NETWORK_NAME !== "testnet") {
      // EXTERNAL_A completed a Nayori job too: three completed jobs with an attested wallet.
      expect(snapshot.milestone2.verified.completedJobsFromNonTeamWallets).toBe(3);
    }
  });

  it("keeps a static baseline but marks live data unavailable on source failure", () => {
    const snapshot = buildUnavailableTransparencySnapshot("2026-08-28T18:00:00.000Z");
    expect(snapshot.dataStatus).toMatchObject({
      chain: "unavailable",
      code: "chain_source_unavailable",
    });
    expect(snapshot.observed).toBeNull();
    expect(snapshot.serviceFees.assets.every(asset => asset.totals === null)).toBe(true);
    expect(snapshot.agents).toEqual([]);
    expect(snapshot.jobs).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.milestone1.status).toBe("approved");
  });
});
