import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acquireCampaignLock,
  acquireExecutorLease,
  adoptStoppedCampaignLock,
  executorLeasePath,
  validateCampaignLock,
} from "../scripts/mainnet-e2e-campaign-lock.mjs";
import { canonicalExternalPath } from "../scripts/mainnet-e2e-external-path.mjs";
import { deadlineOpen } from "../scripts/e2e-service-fee-mainnet.mjs";
import {
  receiptChecksPassed,
  validateRecordedAssets,
} from "../scripts/run-service-fee-mainnet-e2e-campaign.mjs";

describe("mainnet E2E campaign lock", () => {
  it("excludes a second process owner until the first campaign releases", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-lock-"));
    const path = join(directory, "campaign.lock");
    const first = acquireCampaignLock(path, { reviewedSha: "a".repeat(40) });
    expect(validateCampaignLock(path, first.token).reviewedSha).toBe("a".repeat(40));
    expect(() => acquireCampaignLock(path, { reviewedSha: "b".repeat(40) }))
      .toThrow("lock exists");
    first.releaseSuccess();
    const second = acquireCampaignLock(path, { reviewedSha: "b".repeat(40) });
    second.releaseSuccess();
  });

  it("atomically transfers a stopped lock and rejects a concurrent adoption", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-adopt-"));
    const path = join(directory, "campaign.lock");
    const reviewedSha = "c".repeat(40);
    const campaignId = "d".repeat(64);
    writeFileSync(path, JSON.stringify({
      kind: "nayori-v6-v5-e2e-campaign",
      token: "e".repeat(64),
      pid: 2_147_483_647,
      host: hostname(),
      reviewedSha,
      campaignId,
    }), { mode: 0o600 });
    const firstHash = createHash("sha256").update(readFileSync(path)).digest("hex");
    const first = adoptStoppedCampaignLock(path, {
      reviewedSha,
      campaignId,
      lockSha256: firstHash,
    });
    const currentHash = createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(() => adoptStoppedCampaignLock(path, {
      reviewedSha,
      campaignId,
      lockSha256: currentHash,
    })).toThrow("still owned by a live process");
    first.releaseSuccess();
  });

  it("refuses takeover while an orphaned coordinator still has a live executor", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-orphan-"));
    const path = join(directory, "campaign.lock");
    const reviewedSha = "1".repeat(40);
    const campaignId = "2".repeat(64);
    const globalToken = "3".repeat(64);
    writeFileSync(path, JSON.stringify({
      kind: "nayori-v6-v5-e2e-campaign",
      token: globalToken,
      pid: 2_147_483_647,
      host: hostname(),
      reviewedSha,
      campaignId,
    }), { mode: 0o600 });
    const executor = acquireExecutorLease(path, {
      globalLockToken: globalToken,
      reviewedSha,
      campaignId,
      asset: "stx",
    });
    const lockSha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
    const executorPath = executorLeasePath(path);
    const executorLockSha256 = createHash("sha256")
      .update(readFileSync(executorPath)).digest("hex");
    expect(() => adoptStoppedCampaignLock(path, {
      reviewedSha,
      campaignId,
      lockSha256,
      executorPath,
      executorLockSha256,
    })).toThrow("live child process");
    executor.releaseSuccess();
    const adopted = adoptStoppedCampaignLock(path, {
      reviewedSha,
      campaignId,
      lockSha256,
    });
    adopted.releaseSuccess();
  });

  it("serializes executor acquisition with the recovery guard", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-executor-race-"));
    const path = join(directory, "campaign.lock");
    const reviewedSha = "4".repeat(40);
    const campaignId = "5".repeat(64);
    const campaign = acquireCampaignLock(path, { reviewedSha, campaignId });
    writeFileSync(`${path}.recover`, "recovery", { mode: 0o600 });
    expect(() => acquireExecutorLease(path, {
      globalLockToken: campaign.token,
      reviewedSha,
      campaignId,
      asset: "stx",
    })).toThrow("already reconciling");
    unlinkSync(`${path}.recover`);
    campaign.releaseSuccess();
  });

  it("rejects an external-looking path whose parent symlink resolves into Git", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-path-"));
    const link = join(directory, "outside");
    symlinkSync(process.cwd(), link, "dir");
    expect(() => canonicalExternalPath(process.cwd(), join(link, "receipt.json"), "receipt"))
      .toThrow(/symlink|outside Git/);
  });

  it("refuses to rerun an asset whose passed manifest entry lost its receipt", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-missing-receipt-"));
    const stxReceipt = join(directory, "stx.json");
    const sbtcReceipt = join(directory, "sbtc.json");
    const campaignId = "f".repeat(64);
    const manifest = {
      schemaVersion: 1,
      classification: "internal-team-operated-not-m2-adoption",
      assets: {
        stx: {
          state: "passed",
          topUpUsed: "0",
          networkFeesUsed: "1600000",
          receiptSha256: "0".repeat(64),
        },
      },
      aggregateTopUpUsed: "0",
      aggregateNetworkFeesUsed: "1600000",
    };
    expect(() => validateRecordedAssets(manifest, [
      ["stx", "stx-first", stxReceipt],
      ["sbtc", "sbtc-second", sbtcReceipt],
    ], campaignId)).toThrow("immutable receipt is missing");
  });

  it("requires every started stage and partial receipt to remain mutually bound", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-stage-marker-"));
    const receipt = join(directory, "stx.json");
    const campaignId = "7".repeat(64);
    const marker = {
      state: "started",
      receiptPath: receipt,
      campaignStage: "stx-first",
      remainingTopUpBeforeAsset: "900000",
      remainingNetworkFeesBeforeAsset: "3500000",
    };
    const manifest = {
      schemaVersion: 1,
      classification: "internal-team-operated-not-m2-adoption",
      assets: { stx: marker },
      aggregateTopUpUsed: "0",
      aggregateNetworkFeesUsed: "0",
    };
    expect(() => validateRecordedAssets(
      manifest,
      [["stx", "stx-first", receipt]],
      campaignId,
    )).toThrow("lost its exact receipt");
    writeFileSync(receipt, JSON.stringify({
      schemaVersion: 1,
      classification: "internal-team-operated-not-m2-adoption",
      result: "running",
      checks: [],
      binding: {
        asset: "stx",
        campaignId,
        campaignStage: "stx-first",
        remainingTopUpBeforeAsset: "900000",
        remainingNetworkFeesBeforeAsset: "3500000",
      },
    }), { mode: 0o600 });
    expect(validateRecordedAssets(
      manifest,
      [["stx", "stx-first", receipt]],
      campaignId,
    )).toEqual({ topUpUsed: 0n, networkFeesUsed: 0n });
  });

  it("rejects an unmarked receipt instead of treating it as a fresh asset", () => {
    const directory = mkdtempSync(join(tmpdir(), "nayori-mainnet-unmarked-receipt-"));
    const receipt = join(directory, "stx.json");
    writeFileSync(receipt, "{}", { mode: 0o600 });
    expect(() => validateRecordedAssets({
      schemaVersion: 1,
      classification: "internal-team-operated-not-m2-adoption",
      assets: {},
      aggregateTopUpUsed: "0",
      aggregateNetworkFeesUsed: "0",
    }, [["stx", "stx-first", receipt]], "8".repeat(64))).toThrow(
      "without an immutable campaign stage marker",
    );
  });

  it("never treats a receipt with a historical failed check as passed", () => {
    expect(receiptChecksPassed({ checks: [{ passed: false }, { passed: true }] })).toBe(false);
    expect(receiptChecksPassed({ checks: [{ passed: true }] })).toBe(true);
    expect(receiptChecksPassed({ checks: [] })).toBe(false);
  });

  it("rejects a campaign manifest whose internal evidence classification was changed", () => {
    expect(() => validateRecordedAssets({
      schemaVersion: 1,
      classification: "external-adoption",
      assets: {},
      aggregateTopUpUsed: "0",
      aggregateNetworkFeesUsed: "0",
    }, [], "6".repeat(64))).toThrow("internal-only classification");
    expect(() => validateRecordedAssets({
      schemaVersion: 2,
      classification: "internal-team-operated-not-m2-adoption",
      assets: {},
      aggregateTopUpUsed: "0",
      aggregateNetworkFeesUsed: "0",
    }, [], "6".repeat(64))).toThrow("schema");
  });

  it("matches strict Stacks expiry and inclusive burn-deadline boundaries", () => {
    expect(deadlineOpen(99, 100, false)).toBe(true);
    expect(deadlineOpen(100, 100, false)).toBe(false);
    expect(deadlineOpen(100, 100, true)).toBe(true);
    expect(deadlineOpen(101, 100, true)).toBe(false);
  });
});
