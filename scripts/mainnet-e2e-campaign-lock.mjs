import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";

function fsyncParent(path) {
  const fd = openSync(dirname(path), constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function safeLock(path) {
  const stat = lstatSync(path);
  if (
    !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 ||
    stat.uid !== process.getuid()
  ) {
    throw new Error("Unsafe Nayori mainnet campaign lock");
  }
  return stat;
}

function processIsAlive(pid) {
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch (error) {
    if (error?.code === "EPERM") alive = true;
    else if (error?.code !== "ESRCH") throw error;
  }
  return alive;
}

export function executorLeasePath(globalLockPath) {
  return `${globalLockPath}.executor`;
}

function acquireRecoveryGuard(globalLockPath) {
  const path = `${globalLockPath}.recover`;
  let fd;
  try {
    fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    fsyncSync(fd);
    fsyncParent(path);
  } catch {
    throw new Error("Another operator is already reconciling the mainnet campaign lock");
  }
  let closed = false;
  return {
    release() {
      if (closed) return;
      closeSync(fd);
      unlinkSync(path);
      fsyncParent(path);
      closed = true;
    },
  };
}

export function acquireExecutorLease(globalLockPath, binding) {
  const path = executorLeasePath(globalLockPath);
  const recoveryGuard = acquireRecoveryGuard(globalLockPath);
  let fd;
  const token = randomBytes(32).toString("hex");
  const metadata = {
    ...binding,
    kind: "nayori-v6-v5-e2e-executor",
    token,
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
  };
  try {
    const globalBefore = validateCampaignLock(globalLockPath, binding.globalLockToken);
    if (
      globalBefore.reviewedSha !== binding.reviewedSha ||
      globalBefore.campaignId !== binding.campaignId
    ) {
      throw new Error("Mainnet campaign lock does not match the executor binding");
    }
    try {
      fd = openSync(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
    } catch {
      throw new Error(`Mainnet executor lease exists at ${path}; reconcile it before continuing`);
    }
    writeFileSync(fd, `${JSON.stringify(metadata)}\n`);
    fsyncSync(fd);
    safeLock(path);
    fsyncParent(path);
    const globalAfter = validateCampaignLock(globalLockPath, binding.globalLockToken);
    if (
      globalAfter.reviewedSha !== binding.reviewedSha ||
      globalAfter.campaignId !== binding.campaignId
    ) {
      throw new Error("Mainnet campaign lock changed while acquiring the executor lease");
    }
    closeSync(fd);
    fd = undefined;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    recoveryGuard.release();
    throw error;
  }
  recoveryGuard.release();
  let closed = false;
  return {
    token,
    validate() {
      const current = validateExecutorLease(path, token);
      if (current.pid !== process.pid) {
        throw new Error("Mainnet executor lease is no longer owned by this child process");
      }
      return current;
    },
    releaseSuccess() {
      if (closed) return;
      validateExecutorLease(path, token);
      unlinkSync(path);
      fsyncParent(path);
      closed = true;
    },
    preserveForReconciliation() {
      if (closed) return;
      closed = true;
    },
  };
}

export function validateExecutorLease(path, token) {
  safeLock(path);
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  if (
    metadata.kind !== "nayori-v6-v5-e2e-executor" ||
    !/^[a-f0-9]{64}$/.test(token || "") || metadata.token !== token
  ) {
    throw new Error("Mainnet executor lease token does not match its fixed lease");
  }
  return metadata;
}

export function acquireCampaignLock(path, binding) {
  let fd;
  try {
    fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
  } catch {
    throw new Error(
      `Mainnet account lock exists at ${path}; reconcile the prior campaign before continuing`,
    );
  }
  const token = randomBytes(32).toString("hex");
  const metadata = {
    ...binding,
    kind: "nayori-v6-v5-e2e-campaign",
    token,
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(fd, `${JSON.stringify(metadata)}\n`);
    fsyncSync(fd);
    safeLock(path);
    fsyncParent(path);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  let closed = false;
  return {
    token,
    releaseSuccess() {
      if (closed) return;
      closeSync(fd);
      closed = true;
      validateCampaignLock(path, token);
      unlinkSync(path);
      fsyncParent(path);
    },
    preserveForReconciliation() {
      if (closed) return;
      closeSync(fd);
      closed = true;
    },
  };
}

export function validateCampaignLock(path, token) {
  safeLock(path);
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  if (
    metadata.kind !== "nayori-v6-v5-e2e-campaign" ||
    !/^[a-f0-9]{64}$/.test(token || "") ||
    metadata.token !== token
  ) {
    throw new Error("Mainnet campaign lock token does not match its fixed lock");
  }
  return metadata;
}

export function adoptStoppedCampaignLock(path, expected) {
  const recoveryGuard = acquireRecoveryGuard(path);
  let token;
  try {
    safeLock(path);
    const bytes = readFileSync(path);
    const metadata = JSON.parse(bytes.toString("utf8"));
    if (
      metadata.kind !== "nayori-v6-v5-e2e-campaign" ||
      metadata.host !== hostname() ||
      !Number.isSafeInteger(metadata.pid) || metadata.pid <= 0 ||
      metadata.reviewedSha !== expected.reviewedSha ||
      metadata.campaignId !== expected.campaignId ||
      expected.lockSha256 !== createHash("sha256").update(bytes).digest("hex")
    ) {
      throw new Error("Preserved mainnet campaign lock does not match the typed resume binding");
    }
    if (processIsAlive(metadata.pid)) {
      throw new Error("Preserved mainnet campaign lock is still owned by a live process");
    }
    const executorPath = executorLeasePath(path);
    if (existsSync(executorPath)) {
      safeLock(executorPath);
      const executorBytes = readFileSync(executorPath);
      const executor = JSON.parse(executorBytes.toString("utf8"));
      if (
        executor.kind !== "nayori-v6-v5-e2e-executor" ||
        executor.host !== hostname() || !Number.isSafeInteger(executor.pid) ||
        executor.pid <= 0 || executor.reviewedSha !== expected.reviewedSha ||
        executor.campaignId !== expected.campaignId ||
        expected.executorPath !== executorPath ||
        expected.executorLockSha256 !==
          createHash("sha256").update(executorBytes).digest("hex")
      ) {
        throw new Error("Preserved executor lease does not match the typed resume binding");
      }
      if (processIsAlive(executor.pid)) {
        throw new Error("Preserved executor lease is still owned by a live child process");
      }
      unlinkSync(executorPath);
      fsyncParent(executorPath);
    }
    token = randomBytes(32).toString("hex");
    const replacement = `${path}.${process.pid}.resume`;
    const replacementFd = openSync(
      replacement,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(
        replacementFd,
        `${JSON.stringify({
          ...metadata,
          token,
          pid: process.pid,
          host: hostname(),
          resumedAt: new Date().toISOString(),
          resumedFromLockSha256: expected.lockSha256,
        })}\n`,
      );
      fsyncSync(replacementFd);
    } finally {
      closeSync(replacementFd);
    }
    renameSync(replacement, path);
    fsyncParent(path);
    safeLock(path);
  } catch (error) {
    recoveryGuard.release();
    throw error;
  }
  recoveryGuard.release();
  let closed = false;
  return {
    token,
    releaseSuccess() {
      if (closed) return;
      validateCampaignLock(path, token);
      unlinkSync(path);
      fsyncParent(path);
      closed = true;
    },
    preserveForReconciliation() {
      closed = true;
    },
  };
}
