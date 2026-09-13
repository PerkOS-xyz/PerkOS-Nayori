// Asset-independent coordinator for one controlled v6/v5 mainnet E2E campaign.
// Preflight is signer-free. Armed execution holds one global lock, one aggregate top-up
// budget and one external manifest while it runs STX and then sBTC.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GLOBAL_LOCK_PATH } from "./service-fee-mainnet-core.mjs";
import {
  acquireCampaignLock,
  adoptStoppedCampaignLock,
  executorLeasePath,
} from "./mainnet-e2e-campaign-lock.mjs";
import { canonicalExternalPath } from "./mainnet-e2e-external-path.mjs";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const ACTION = process.env.SERVICE_FEE_MAINNET_E2E_ACTION || "preflight";
const MAX_CAMPAIGN_TOP_UP = 900_000n;
const MAX_CAMPAIGN_NETWORK_FEES = 3_500_000n;
const INTERNAL_CLASSIFICATION = "internal-team-operated-not-m2-adoption";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function externalPath(path, label) {
  const candidate = canonicalExternalPath(ROOT, path, label);
  const parent = lstatSync(realpathSync(dirname(candidate)));
  ensure(parent.isDirectory() && parent.uid === process.getuid(),
    `${label} parent must be an operator-owned directory`);
  return candidate;
}

function safeExisting(path, label) {
  const stat = lstatSync(path);
  ensure(
    stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 &&
      stat.uid === process.getuid(),
    `${label} must be an operator-owned mode-0600 regular file`,
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

export function receiptChecksPassed(receipt) {
  return Array.isArray(receipt?.checks) && receipt.checks.length > 0 &&
    receipt.checks.every((entry) => entry?.passed === true);
}

function atomicSave(path, data, fresh = false) {
  const bytes = `${JSON.stringify(data, null, 2)}\n`;
  if (fresh) {
    const fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } else {
    const temporary = `${path}.${process.pid}.tmp`;
    const fd = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  }
  const parentFd = openSync(dirname(path), constants.O_RDONLY);
  try {
    fsyncSync(parentFd);
  } finally {
    closeSync(parentFd);
  }
  ensure((lstatSync(path).mode & 0o777) === 0o600, "Campaign manifest mode changed");
}

export function validateRecordedAssets(manifest, stages, campaignId) {
  ensure(
    manifest.schemaVersion === 1 && manifest.classification === INTERNAL_CLASSIFICATION,
    "Campaign manifest schema or internal-only classification is invalid",
  );
  ensure(
    Object.keys(manifest.assets || {}).every((asset) => asset === "stx" || asset === "sbtc"),
    "Campaign manifest contains an unsupported asset stage",
  );
  let topUpUsed = 0n;
  let networkFeesUsed = 0n;
  let gapSeen = false;
  for (const [asset, stage, receipt] of stages) {
    const recorded = manifest.assets?.[asset];
    if (!recorded) {
      ensure(
        !existsSync(receipt),
        `${asset} receipt exists without an immutable campaign stage marker`,
      );
      gapSeen = true;
      continue;
    }
    ensure(!gapSeen, "Campaign manifest cannot record a later asset before an earlier asset");
    if (recorded.state === "started") {
      ensure(
        existsSync(receipt) && recorded.receiptPath === receipt &&
          recorded.campaignStage === stage &&
          recorded.remainingTopUpBeforeAsset === String(MAX_CAMPAIGN_TOP_UP - topUpUsed) &&
          recorded.remainingNetworkFeesBeforeAsset ===
            String(MAX_CAMPAIGN_NETWORK_FEES - networkFeesUsed),
        `${asset} started stage lost its exact receipt or campaign-cap binding`,
      );
      const prior = safeExisting(receipt, `${asset} partial receipt`);
      ensure(
        prior.schemaVersion === 1 && prior.classification === INTERNAL_CLASSIFICATION &&
          ["running", "passed"].includes(prior.result) && prior.binding?.asset === asset &&
          prior.binding?.campaignId === campaignId && prior.binding?.campaignStage === stage &&
          prior.binding?.remainingTopUpBeforeAsset === recorded.remainingTopUpBeforeAsset &&
          prior.binding?.remainingNetworkFeesBeforeAsset ===
            recorded.remainingNetworkFeesBeforeAsset,
        `${asset} partial receipt does not match its immutable started marker`,
      );
      ensure(
        prior.result === "passed"
          ? receiptChecksPassed(prior)
          : Array.isArray(prior.checks) &&
            prior.checks.every((entry) => entry?.passed === true),
        `${asset} partial receipt retains a failed check and cannot resume`,
      );
      gapSeen = true;
      continue;
    }
    ensure(
      recorded.state === "passed" && existsSync(receipt),
      `${asset} campaign stage is recorded but its immutable receipt is missing`,
    );
    const receiptBytes = readFileSync(receipt);
    const prior = safeExisting(receipt, `${asset} receipt`);
    const priorTopUp = BigInt(prior.topUp?.amount ?? "-1");
    const priorNetworkFees = BigInt(prior.networkFees?.actual ?? "-1");
    ensure(
      prior.schemaVersion === 1 && prior.classification === INTERNAL_CLASSIFICATION &&
        prior.result === "passed" && prior.binding?.asset === asset &&
        prior.binding?.campaignId === campaignId && prior.binding?.campaignStage === stage &&
        recorded.receiptSha256 === sha256(receiptBytes) &&
        recorded.topUpUsed === String(priorTopUp) &&
        recorded.networkFeesUsed === String(priorNetworkFees) &&
        priorTopUp >= 0n && priorNetworkFees >= 0n,
      `${asset} campaign manifest does not match its immutable receipt`,
    );
    ensure(receiptChecksPassed(prior), `${asset} immutable receipt retains failed checks`);
    topUpUsed += priorTopUp;
    networkFeesUsed += priorNetworkFees;
  }
  ensure(
    manifest.aggregateTopUpUsed === String(topUpUsed) &&
      manifest.aggregateNetworkFeesUsed === String(networkFeesUsed),
    "Campaign aggregate accounting does not match its recorded asset receipts",
  );
  return { topUpUsed, networkFeesUsed };
}

function runAsset(
  asset,
  stage,
  receipt,
  campaignId,
  lockToken,
  remainingTopUp,
  remainingNetworkFees,
) {
  const resume = existsSync(receipt);
  const child = spawnSync(process.execPath, ["scripts/e2e-service-fee-mainnet.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      SERVICE_FEE_MAINNET_E2E_ACTION: "execute",
      SERVICE_FEE_MAINNET_E2E_ASSET: asset,
      SERVICE_FEE_MAINNET_E2E_RESULT_PATH: receipt,
      SERVICE_FEE_MAINNET_E2E_CAMPAIGN_ID: campaignId,
      SERVICE_FEE_MAINNET_E2E_CAMPAIGN_STAGE: stage,
      SERVICE_FEE_MAINNET_E2E_CAMPAIGN_LOCK_TOKEN: lockToken,
      SERVICE_FEE_MAINNET_E2E_REMAINING_TOP_UP_MICRO_STX: String(remainingTopUp),
      SERVICE_FEE_MAINNET_E2E_REMAINING_NETWORK_FEES_MICRO_STX:
        String(remainingNetworkFees),
      ...(resume
        ? {
            SERVICE_FEE_MAINNET_E2E_RESUME: "reconcile-existing-receipt",
            CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_RESULT_PATH: receipt,
          }
        : {}),
    },
  });
  ensure(child.status === 0, `${asset} E2E stopped; preserve lock, manifest and receipt`);
  const result = safeExisting(receipt, `${asset} receipt`);
  ensure(
    result.schemaVersion === 1 && result.classification === INTERNAL_CLASSIFICATION &&
      result.result === "passed" && result.binding?.asset === asset &&
      result.binding?.campaignId === campaignId &&
      result.binding?.campaignStage === stage &&
      result.binding?.remainingTopUpBeforeAsset === String(remainingTopUp) &&
      result.binding?.remainingNetworkFeesBeforeAsset === String(remainingNetworkFees),
    `${asset} receipt did not close with the exact campaign binding`,
  );
  ensure(receiptChecksPassed(result), `${asset} receipt retains a failed or empty check set`);
  const used = BigInt(result.topUp?.amount ?? "-1");
  ensure(used >= 0n && used <= remainingTopUp, `${asset} top-up exceeds campaign remainder`);
  const networkFees = BigInt(result.networkFees?.actual ?? "-1");
  ensure(
    networkFees >= 0n && networkFees <= remainingNetworkFees,
    `${asset} network fees exceed campaign remainder`,
  );
  return { used, networkFees, receiptSha256: sha256(readFileSync(receipt)) };
}

function runPreflight() {
  for (const asset of ["stx", "sbtc"]) {
    const child = spawnSync(process.execPath, ["scripts/e2e-service-fee-mainnet.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        SERVICE_FEE_MAINNET_E2E_ACTION: "preflight",
        SERVICE_FEE_MAINNET_E2E_ASSET: asset,
      },
    });
    ensure(child.status === 0, `${asset} signer-free preflight failed`);
  }
}

function runCampaign() {
  ensure(
    process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX ===
      String(MAX_CAMPAIGN_TOP_UP),
    `Aggregate campaign top-up cap must be exactly confirmed as ${MAX_CAMPAIGN_TOP_UP}`,
  );
  ensure(
    process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX ===
      String(MAX_CAMPAIGN_NETWORK_FEES),
    `Aggregate campaign network-fee cap must be exactly confirmed as ${MAX_CAMPAIGN_NETWORK_FEES}`,
  );
  const reviewedSha = process.env.SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA || "";
  ensure(/^[a-f0-9]{40}$/.test(reviewedSha), "Exact reviewed campaign SHA required");
  const stxReceipt = externalPath(
    process.env.SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH,
    "SERVICE_FEE_MAINNET_E2E_STX_RESULT_PATH",
  );
  const sbtcReceipt = externalPath(
    process.env.SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH,
    "SERVICE_FEE_MAINNET_E2E_SBTC_RESULT_PATH",
  );
  const manifestPath = externalPath(
    process.env.SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH,
    "SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH",
  );
  ensure(new Set([stxReceipt, sbtcReceipt, manifestPath]).size === 3,
    "Campaign manifest and asset receipts must use distinct paths");
  const binding = {
    schemaVersion: 1,
    network: "mainnet",
    reviewedSha,
    aggregateTopUpCap: String(MAX_CAMPAIGN_TOP_UP),
    aggregateNetworkFeeCap: String(MAX_CAMPAIGN_NETWORK_FEES),
    order: ["stx", "sbtc"],
    stxReceipt,
    sbtcReceipt,
  };
  const campaignId = sha256(JSON.stringify(binding));
  const stages = [
    ["stx", "stx-first", stxReceipt],
    ["sbtc", "sbtc-second", sbtcReceipt],
  ];
  let manifest;
  let resuming = false;
  if (existsSync(manifestPath)) {
    resuming = true;
    ensure(
      process.env.SERVICE_FEE_MAINNET_E2E_RESUME === "reconcile-existing-campaign" &&
        process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_CAMPAIGN_PATH === manifestPath,
      "Existing campaign requires exact reconcile-existing-campaign confirmation",
    );
    manifest = safeExisting(manifestPath, "Campaign manifest");
    ensure(
      manifest.schemaVersion === 1 && manifest.classification === INTERNAL_CLASSIFICATION &&
        JSON.stringify(manifest.binding) === JSON.stringify(binding) &&
        manifest.campaignId === campaignId &&
        ["running", "reconciliation-required", "transactions-complete"].includes(manifest.result),
      "Existing campaign binding differs or is already complete",
    );
  } else {
    manifest = {
      schemaVersion: 1,
      classification: INTERNAL_CLASSIFICATION,
      campaignId,
      binding,
      assets: {},
      aggregateTopUpUsed: "0",
      aggregateNetworkFeesUsed: "0",
      result: "running",
      startedAt: new Date().toISOString(),
    };
    atomicSave(manifestPath, manifest, true);
  }
  validateRecordedAssets(manifest, stages, campaignId);

  let lock;
  const executorPath = executorLeasePath(GLOBAL_LOCK_PATH);
  if (existsSync(GLOBAL_LOCK_PATH)) {
    ensure(
      resuming &&
        process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_PATH ===
          GLOBAL_LOCK_PATH,
      "A preserved campaign lock requires an exact, bound resume confirmation",
    );
    const lockSha256 = sha256(readFileSync(GLOBAL_LOCK_PATH));
    ensure(
      process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_GLOBAL_LOCK_SHA256 ===
        lockSha256,
      "Preserved campaign lock SHA-256 is not explicitly confirmed",
    );
    let executorLockSha256;
    if (existsSync(executorPath)) {
      executorLockSha256 = sha256(readFileSync(executorPath));
      ensure(
        process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_PATH ===
          executorPath &&
          process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_SHA256 ===
            executorLockSha256,
        "Preserved executor lease requires exact path and SHA-256 confirmations",
      );
    }
    lock = adoptStoppedCampaignLock(GLOBAL_LOCK_PATH, {
      reviewedSha,
      campaignId,
      lockSha256,
      executorPath: existsSync(executorPath) ? executorPath : undefined,
      executorLockSha256,
    });
  } else {
    ensure(
      !existsSync(executorPath),
      "Executor lease exists without its campaign lock; manual reconciliation is required",
    );
    lock = acquireCampaignLock(GLOBAL_LOCK_PATH, {
      reviewedSha,
      campaignId,
      manifestSha256: sha256(readFileSync(manifestPath)),
    });
  }
  try {
    let used = 0n;
    let networkFeesUsed = 0n;
    for (const [asset, stage, receipt] of stages) {
      if (existsSync(receipt)) {
        const prior = safeExisting(receipt, `${asset} receipt`);
        if (prior.result === "passed") {
          ensure(
            prior.schemaVersion === 1 && prior.classification === INTERNAL_CLASSIFICATION &&
              receiptChecksPassed(prior),
            `${asset} receipt schema, classification or checks are invalid`,
          );
          ensure(
            prior.binding?.campaignId === campaignId && prior.binding?.campaignStage === stage &&
              prior.binding?.remainingTopUpBeforeAsset === String(MAX_CAMPAIGN_TOP_UP - used),
            `${asset} completed receipt does not belong to this campaign position`,
          );
          const priorUsed = BigInt(prior.topUp?.amount ?? "-1");
          const priorNetworkFees = BigInt(prior.networkFees?.actual ?? "-1");
          ensure(priorUsed >= 0n && used + priorUsed <= MAX_CAMPAIGN_TOP_UP,
            `${asset} prior receipt violates the aggregate top-up cap`);
          ensure(
            prior.binding?.remainingNetworkFeesBeforeAsset ===
              String(MAX_CAMPAIGN_NETWORK_FEES - networkFeesUsed) &&
              priorNetworkFees >= 0n &&
              networkFeesUsed + priorNetworkFees <= MAX_CAMPAIGN_NETWORK_FEES,
            `${asset} prior receipt violates the aggregate network-fee cap`,
          );
          used += priorUsed;
          networkFeesUsed += priorNetworkFees;
          manifest.assets[asset] = {
            state: "passed",
            topUpUsed: String(priorUsed),
            networkFeesUsed: String(priorNetworkFees),
            receiptSha256: sha256(readFileSync(receipt)),
          };
          manifest.aggregateTopUpUsed = String(used);
          manifest.aggregateNetworkFeesUsed = String(networkFeesUsed);
          atomicSave(manifestPath, manifest);
          continue;
        }
      }
      const recorded = manifest.assets[asset];
      if (!recorded) {
        manifest.assets[asset] = {
          state: "started",
          receiptPath: receipt,
          campaignStage: stage,
          remainingTopUpBeforeAsset: String(MAX_CAMPAIGN_TOP_UP - used),
          remainingNetworkFeesBeforeAsset: String(MAX_CAMPAIGN_NETWORK_FEES - networkFeesUsed),
          startedAt: new Date().toISOString(),
        };
        // The stage marker must be durable before the child can open signers or create a receipt.
        atomicSave(manifestPath, manifest);
      } else {
        ensure(
          recorded.state === "started" && recorded.receiptPath === receipt &&
            recorded.campaignStage === stage &&
            recorded.remainingTopUpBeforeAsset === String(MAX_CAMPAIGN_TOP_UP - used) &&
            recorded.remainingNetworkFeesBeforeAsset ===
              String(MAX_CAMPAIGN_NETWORK_FEES - networkFeesUsed),
          `${asset} resume stage differs from its immutable campaign marker`,
        );
      }
      const result = runAsset(
        asset,
        stage,
        receipt,
        campaignId,
        lock.token,
        MAX_CAMPAIGN_TOP_UP - used,
        MAX_CAMPAIGN_NETWORK_FEES - networkFeesUsed,
      );
      used += result.used;
      networkFeesUsed += result.networkFees;
      ensure(used <= MAX_CAMPAIGN_TOP_UP, "Aggregate campaign top-up cap exceeded");
      ensure(
        networkFeesUsed <= MAX_CAMPAIGN_NETWORK_FEES,
        "Aggregate campaign network-fee cap exceeded",
      );
      manifest.assets[asset] = {
        state: "passed",
        topUpUsed: String(result.used),
        networkFeesUsed: String(result.networkFees),
        receiptSha256: result.receiptSha256,
      };
      manifest.aggregateTopUpUsed = String(used);
      manifest.aggregateNetworkFeesUsed = String(networkFeesUsed);
      atomicSave(manifestPath, manifest);
    }
    // Durable crash boundary: receipts are complete, but terminal status is written only after
    // the global/executor locks are gone. Resume revalidates the receipts without rebroadcast.
    manifest.result = "transactions-complete";
    manifest.transactionsCompletedAt = new Date().toISOString();
    atomicSave(manifestPath, manifest);
    lock.releaseSuccess();
    manifest.result = "passed";
    manifest.completedAt = new Date().toISOString();
    atomicSave(manifestPath, manifest);
    console.log(`PASS v6/v5 mainnet campaign; aggregate top-up ${used}/${MAX_CAMPAIGN_TOP_UP}`);
    console.log(
      `Network fees: ${networkFeesUsed}/${MAX_CAMPAIGN_NETWORK_FEES} micro-STX authorized`,
    );
    console.log(`Campaign: ${manifestPath}`);
    console.log(`Campaign SHA-256: ${sha256(readFileSync(manifestPath))}`);
  } catch (error) {
    manifest.result = "reconciliation-required";
    manifest.lastError = String(error?.message || "Campaign stopped");
    manifest.stoppedAt = new Date().toISOString();
    atomicSave(manifestPath, manifest);
    lock.preserveForReconciliation();
    throw error;
  }
}

export function main() {
  ensure(process.env.STACKS_NETWORK === "mainnet", "STACKS_NETWORK must explicitly be mainnet");
  ensure(["preflight", "execute"].includes(ACTION), "Unsupported campaign action");
  if (ACTION === "preflight") return runPreflight();
  return runCampaign();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || "Mainnet v6/v5 campaign stopped");
    process.exitCode = 1;
  }
}
