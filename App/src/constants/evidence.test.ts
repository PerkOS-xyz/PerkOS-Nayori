import { describe, expect, it } from "vitest";
import {
  evidenceManifest,
  evidenceTransactionsCsv,
  evidenceWallets,
  classifyEvidenceWallet,
  m1SbtcLifecycle,
  m2Baseline,
} from "./evidence";

describe("public grant evidence", () => {
  it("keeps M1 baseline separate from verified M2 adoption", () => {
    expect(evidenceManifest.schemaVersion).toBe(2);
    expect(evidenceManifest.milestone1.completedJobs).toBe(1);
    expect(m2Baseline.registeredAgentsMainnet).toBe(1);
    expect(m2Baseline.completedSbtcJobsMainnet).toBe(1);
    expect(evidenceManifest.milestone2.verified.completedSbtcJobsMainnet).toBe(0);
    expect(evidenceManifest.milestone2.verified.participatingNonTeamWallets).toBe(0);
    expect(evidenceWallets.every((wallet) => wallet.classification === "team")).toBe(true);
  });

  it("never infers an external wallet from an unknown address", () => {
    expect(classifyEvidenceWallet(evidenceWallets[0].address.toLowerCase())).toBe("team");
    expect(classifyEvidenceWallet("SP000000000000000000002Q6VF78")).toBe("unattested");
    expect(classifyEvidenceWallet()).toBe("unattested");
  });

  it("publishes a complete explorer-verifiable M1 lifecycle", () => {
    expect(m1SbtcLifecycle.map((transaction) => transaction.function)).toEqual([
      "create-job",
      "set-budget",
      "fund-job",
      "assign-provider",
      "submit-work",
      "complete-job",
      "rate-provider",
    ]);
    for (const transaction of m1SbtcLifecycle) {
      expect(transaction.txId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(transaction.blockHeight).toBeGreaterThan(0);
    }
  });

  it("exports machine-readable CSV without changing classifications", () => {
    const csv = evidenceTransactionsCsv();
    expect(csv.split("\n")).toHaveLength(m1SbtcLifecycle.length + 1);
    expect(csv).toContain('"team"');
    expect(csv).not.toContain('"external-attested"');
  });
});
