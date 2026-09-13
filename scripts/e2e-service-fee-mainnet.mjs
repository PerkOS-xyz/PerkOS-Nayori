// Controlled role-by-role E2E for the active Nayori v6/v5 service-fee generation.
//
// Preflight is signer-free. Execution requires separate external mode-0600 signer files,
// a clean reviewed merge on origin/main and exact typed confirmations. The fixed immediate
// reject -> provider appeal -> authority approve path exercises both economic roles without
// leaving mainnet escrow locked for the 144-burn-block appeal deadline.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
import {
  Cl,
  ClarityType,
  Pc,
  PostConditionMode,
  broadcastTransaction,
  cvToValue,
  deserializeCV,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  makeContractCall,
  makeSTXTokenTransfer,
  serializeCV,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import {
  API,
  APPEAL_WINDOW,
  AUTHORITY,
  CONTRACTS,
  DEPLOYER,
  REPUTATION,
  REVIEW_WINDOW,
  SBTC,
  SERVICE_FEE_BPS,
  SOURCE_HASHES,
  TREASURY,
  GLOBAL_LOCK_PATH,
  RUNTIME_ATTESTATION_VERSION,
  ensure,
  plain,
  sha256,
  source,
} from "./service-fee-mainnet-core.mjs";
import {
  acquireCampaignLock,
  acquireExecutorLease,
  executorLeasePath,
  validateCampaignLock,
} from "./mainnet-e2e-campaign-lock.mjs";
import { canonicalExternalPath } from "./mainnet-e2e-external-path.mjs";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const ACTION = process.env.SERVICE_FEE_MAINNET_E2E_ACTION || "preflight";
const ASSET = (process.env.SERVICE_FEE_MAINNET_E2E_ASSET || "stx").toLowerCase();
const REVIEWED_SHA = process.env.SERVICE_FEE_MAINNET_E2E_REVIEWED_SHA || "";
const LOCK_HASH = sha256(readFileSync(resolve(ROOT, "package-lock.json")));
const CONTRACT_NAME = CONTRACTS[ASSET];
const CONTRACT = CONTRACT_NAME ? `${DEPLOYER}.${CONTRACT_NAME}` : "";
const [SBTC_ADDRESS, SBTC_NAME] = SBTC.split(".");
const SBTC_ASSET_NAME = "sbtc-token";
const BUDGET = ASSET === "stx" ? 100_000n : 1_000n;
const FEE = BUDGET / 50n;
const NET = BUDGET - FEE;
const CALL_FEE = 200_000n;
const TOP_UP_TRANSFER_FEE = 150_000n;
const MAX_CAMPAIGN_TOP_UP = 900_000n;
// Two assets x eight contract calls x 200k, plus at most one bounded provider
// top-up transfer per asset x 150k. This is an authorization ceiling, not a quote.
const MAX_CAMPAIGN_NETWORK_FEES = 3_500_000n;
const PROVIDER_POST_CAMPAIGN_RESERVE = 500_000n;
// Evaluator and authority each make exactly two campaign calls. From a known 800k balance,
// two fixed 200k fees leave 400k, which exceeds this independently enforced 300k reserve.
const ACTOR_POST_CAMPAIGN_RESERVE = 300_000n;
const EXPECTED_EVALUATOR = "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3";
const FINALITY_DEPTH = 2n;
const STATUS_OPEN = 0n;
const STATUS_FUNDED = 1n;
const STATUS_SUBMITTED = 2n;
const STATUS_COMPLETED = 3n;
const STATUS_DECISION_PENDING = 7n;
const STATUS_DISPUTED = 8n;
const DECISION_REJECT = 2n;
const DECISION_APPROVE = 1n;
const EXPECTED_SOURCE_HASHES = Object.freeze({
  "sip-010-trait":
    "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  "reputation-registry-v3":
    "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  "agentic-commerce-v6":
    "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
  "sbtc-commerce-v5":
    "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
});

const sleep = (milliseconds) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

export function deadlineOpen(currentHeight, deadlineHeight, inclusive) {
  const current = BigInt(currentHeight);
  const deadline = BigInt(deadlineHeight);
  return inclusive ? current <= deadline : current < deadline;
}

async function resilientFetch(input, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(input, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 429 || attempt === 2) return response;
    await response.body?.cancel();
    await sleep(5_000 * 2 ** attempt);
  }
  throw new Error("Mainnet request retry limit reached");
}

const network = {
  ...STACKS_MAINNET,
  client: { ...STACKS_MAINNET.client, baseUrl: API, fetch: resilientFetch },
};

async function get(path, allow404 = false) {
  const response = await resilientFetch(`${API}${path}`, {
    headers: { accept: "application/json" },
  });
  if (allow404 && response.status === 404) return null;
  ensure(response.ok, `Mainnet API returned HTTP ${response.status}`);
  return response.json();
}

async function read(name, functionName, functionArgs = []) {
  ensure(
    name === REPUTATION || Object.values(CONTRACTS).includes(name),
    "Contract read is outside the v6/v5 E2E allowlist",
  );
  return fetchCallReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName: name,
    functionName,
    functionArgs,
    senderAddress: DEPLOYER,
    network,
    client: { baseUrl: API, fetch: resilientFetch },
  });
}

function ok(value, label) {
  ensure(value?.type === ClarityType.ResponseOk, `${label} did not return (ok ...)`);
  return plain(cvToValue(value));
}

function uint(value) {
  return BigInt(value);
}

function digest(label) {
  return Cl.bufferFromHex(createHash("sha256").update(label).digest("hex"));
}

function releaseIdentity(requireMerged) {
  ensure(/^[a-f0-9]{40}$/.test(REVIEWED_SHA), "Exact reviewed mainnet E2E SHA required");
  const git = (...args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const current = git("rev-parse", "HEAD");
  ensure(current === REVIEWED_SHA, "HEAD differs from the reviewed mainnet E2E SHA");
  ensure(git("status", "--porcelain") === "", "Mainnet E2E requires a clean tree");
  if (requireMerged) {
    execFileSync("git", ["merge-base", "--is-ancestor", current, "origin/main"], {
      cwd: ROOT,
      stdio: "pipe",
    });
  }
  for (const [name, expected] of Object.entries(EXPECTED_SOURCE_HASHES)) {
    ensure(SOURCE_HASHES[name] === expected, `Reviewed source allowlist drifted for ${name}`);
    ensure(sha256(source(name)) === expected, `Local source hash drifted for ${name}`);
  }
  return current;
}

async function verifyPublicRelease() {
  const chain = await get("/v2/info");
  ensure(
    chain.network_id === 1 &&
      chain.is_fully_synced === true &&
      Number.isSafeInteger(chain.stacks_tip_height) &&
      Number.isSafeInteger(chain.burn_block_height),
    "Canonical Stacks mainnet node identity was not verified",
  );
  for (const [name, expectedHash] of Object.entries(EXPECTED_SOURCE_HASHES)) {
    const deployed = await get(`/v2/contracts/source/${DEPLOYER}/${name}?proof=0`);
    ensure(
      sha256(String(deployed.source ?? "").replaceAll("\r\n", "\n")) === expectedHash,
      `On-chain source mismatch for ${name}`,
    );
  }
  const policies = {};
  const jobCounts = {};
  for (const name of Object.values(CONTRACTS)) {
    ensure(ok(await read(name, "get-owner"), `${name}.get-owner`) === DEPLOYER,
      `${name} owner differs from the reviewed deployer`);
    ensure(ok(await read(name, "get-pending-owner"), `${name}.get-pending-owner`) === null,
      `${name} has a pending owner proposal`);
    ensure(
      ok(
        await read(name, "get-pending-appeal-authority"),
        `${name}.get-pending-appeal-authority`,
      ) === null,
      `${name} has a pending appeal-authority proposal`,
    );
    const config = ok(await read(name, "get-protocol-config"), `${name}.get-protocol-config`);
    ensure(
      config.configured === true &&
        config.treasury === TREASURY &&
        config["appeal-authority"] === AUTHORITY &&
        config["review-window"] === String(REVIEW_WINDOW) &&
        config["appeal-window"] === String(APPEAL_WINDOW) &&
        config["service-fee-bps"] === String(SERVICE_FEE_BPS),
      `${name} policy differs from the reviewed mainnet configuration`,
    );
    const allowed = cvToValue(
      await read(REPUTATION, "is-registered-caller", [
        Cl.contractPrincipal(DEPLOYER, name),
      ]),
    );
    ensure(allowed === true, `${name} is not authorized for reputation updates`);
    policies[name] = config;
    jobCounts[name] = ok(await read(name, "get-job-count"), `${name}.get-job-count`);
  }
  ensure(
    ok(await read(CONTRACTS.sbtc, "get-payment-token"), "get-payment-token") === SBTC,
    "sBTC v5 does not pin canonical mainnet PoX-5 sBTC",
  );
  return {
    stacksTipHeight: chain.stacks_tip_height,
    burnBlockHeight: chain.burn_block_height,
    policies,
    jobCounts,
  };
}

function outsideWorktree(path, label) {
  return canonicalExternalPath(ROOT, path, label);
}

function secretFile(path, label) {
  const candidate = outsideWorktree(path, label);
  const stat = lstatSync(candidate);
  ensure(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  ensure((stat.mode & 0o777) === 0o600, `${label} must have exact mode 0600`);
  ensure(stat.uid === process.getuid(), `${label} must be owned by the current operator`);
  return realpathSync(candidate);
}

function receiptPath(path) {
  const candidate = outsideWorktree(path, "SERVICE_FEE_MAINNET_E2E_RESULT_PATH");
  if (existsSync(candidate)) {
    ensure(
      process.env.SERVICE_FEE_MAINNET_E2E_RESUME === "reconcile-existing-receipt" &&
        process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_RESULT_PATH === candidate,
      "Existing receipt requires exact reconcile-existing-receipt confirmation",
    );
    const stat = lstatSync(candidate);
    ensure(
      stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 &&
        stat.uid === process.getuid(),
      "Existing mainnet E2E receipt must be an operator-owned mode-0600 regular file",
    );
  }
  const parent = lstatSync(realpathSync(dirname(candidate)));
  ensure(parent.isDirectory() && parent.uid === process.getuid(),
    "Mainnet E2E receipt parent must be an operator-owned directory");
  return candidate;
}

function executionLock() {
  const inheritedToken = process.env.SERVICE_FEE_MAINNET_E2E_CAMPAIGN_LOCK_TOKEN;
  const campaignId = process.env.SERVICE_FEE_MAINNET_E2E_CAMPAIGN_ID || "single-asset";
  let campaignToken = inheritedToken;
  let campaignLock;
  if (inheritedToken) {
    const metadata = validateCampaignLock(GLOBAL_LOCK_PATH, inheritedToken);
    ensure(
      metadata.reviewedSha === REVIEWED_SHA && metadata.campaignId === campaignId,
      "Inherited mainnet campaign lock belongs to another release",
    );
  } else {
    campaignLock = acquireCampaignLock(GLOBAL_LOCK_PATH, {
      reviewedSha: REVIEWED_SHA,
      campaignId,
      asset: ASSET,
      executionMode: "single-asset",
    });
    campaignToken = campaignLock.token;
  }
  const leasePath = executorLeasePath(GLOBAL_LOCK_PATH);
  const executorLease = acquireExecutorLease(GLOBAL_LOCK_PATH, {
    globalLockToken: campaignToken,
    reviewedSha: REVIEWED_SHA,
    campaignId,
    asset: ASSET,
  });
  const assertOwned = () => {
    ensure(
      !existsSync(`${GLOBAL_LOCK_PATH}.recover`),
      "Mainnet campaign recovery is in progress; executor may not broadcast",
    );
    const global = validateCampaignLock(GLOBAL_LOCK_PATH, campaignToken);
    const executor = executorLease.validate();
    ensure(
      global.reviewedSha === REVIEWED_SHA && global.campaignId === campaignId &&
        executor.globalLockToken === campaignToken && executor.reviewedSha === REVIEWED_SHA &&
        executor.campaignId === campaignId && executor.asset === ASSET,
      "Mainnet executor lease no longer matches this exact campaign asset",
    );
    ensure(
      !existsSync(`${GLOBAL_LOCK_PATH}.recover`),
      "Mainnet campaign recovery began while validating the executor lease",
    );
  };
  assertOwned();
  return {
    inherited: Boolean(inheritedToken),
    assertOwned,
    close() {
      assertOwned();
      executorLease.releaseSuccess();
      campaignLock?.releaseSuccess();
    },
  };
}

function parseEnv(path) {
  const output = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    ensure(separator > 0, "Signer environment contains an invalid line");
    const key = line.slice(0, separator).trim();
    ensure(/^[A-Z][A-Z0-9_]*$/.test(key) && !(key in output),
      "Signer environment contains an invalid or duplicate key");
    output[key] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  }
  return output;
}

function requireSigner(environment, keyName, addressName, expectedAddress) {
  const key = environment[keyName];
  ensure(key, `Missing ${keyName} signer field`);
  const derivedAddress = getAddressFromPrivateKey(key, "mainnet");
  const declaredAddress = environment[addressName];
  if (declaredAddress) {
    ensure(declaredAddress.startsWith("SP") && declaredAddress === derivedAddress,
      `${addressName} does not match its private key`);
  }
  const address = declaredAddress || derivedAddress;
  if (expectedAddress) ensure(address === expectedAddress, `${addressName} differs from policy`);
  return { key, address };
}

async function account(address) {
  const data = await get(`/extended/v1/address/${address}/balances`);
  return {
    stx: BigInt(data.stx?.balance ?? "0"),
    sbtc: BigInt(data.fungible_tokens?.[`${SBTC}::${SBTC_ASSET_NAME}`]?.balance ?? "0"),
  };
}

async function nextNonce(address) {
  const pending = await get(`/extended/v1/tx/mempool?address=${address}&limit=1`);
  ensure(pending.total === 0, `Mainnet signer ${address} has a pending transaction`);
  const data = await get(`/extended/v1/address/${address}/nonces`);
  const expected = data.last_executed_tx_nonce == null ? 0 : data.last_executed_tx_nonce + 1;
  ensure(
    Number.isSafeInteger(data.possible_next_nonce) &&
      data.possible_next_nonce === expected &&
      data.detected_missing_nonces?.length === 0 &&
      data.detected_mempool_nonces?.length === 0,
    `Mainnet signer ${address} nonce is not contiguous and idle`,
  );
  return BigInt(data.possible_next_nonce);
}

async function waitForTransaction(txid) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const transaction = await get(`/extended/v1/tx/${txid}`, true);
    if (transaction && transaction.tx_status !== "pending") return transaction;
    await sleep(10_000);
  }
  throw new Error("Mainnet transaction unresolved; preserve the receipt for reconciliation");
}

async function waitForFinality(transaction) {
  const required = BigInt(transaction.block_height) + FINALITY_DEPTH;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const chain = await get("/v2/info");
    if (BigInt(chain.stacks_tip_height) >= required) {
      const final = await get(`/extended/v1/tx/${transaction.tx_id}`);
      ensure(
        final.canonical === true &&
          final.microblock_canonical === true &&
          final.block_hash === transaction.block_hash &&
          final.tx_status === "success",
        "Settlement changed before required finality depth",
      );
      return { required: String(required), observed: String(chain.stacks_tip_height) };
    }
    await sleep(10_000);
  }
  throw new Error("Mainnet settlement did not reach the required finality depth");
}

function createJournal(path, binding) {
  const existing = existsSync(path);
  const data = existing
    ? JSON.parse(readFileSync(path, "utf8"))
    : {
        schemaVersion: 1,
        classification: "internal-team-operated-not-m2-adoption",
        binding,
        transactions: {},
        checks: [],
        result: "running",
        startedAt: new Date().toISOString(),
      };
  if (existing) {
    ensure(data.schemaVersion === 1, "Existing receipt schema is unsupported");
    ensure(
      data.classification === "internal-team-operated-not-m2-adoption" &&
        JSON.stringify(data.binding) === JSON.stringify(binding),
      "Existing receipt binding differs from this exact mainnet E2E",
    );
    ensure(data.result !== "passed", "Completed receipt is immutable and cannot be resumed");
    ensure(
      Array.isArray(data.checks) && data.checks.every((entry) => entry.passed === true),
      "Existing receipt contains a failed check and can never be promoted to passed",
    );
  }
  const save = () => {
    const temporary = `${path}.${process.pid}.tmp`;
    const fd = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    const parentFd = openSync(dirname(path), constants.O_RDONLY);
    try {
      fsyncSync(parentFd);
    } finally {
      closeSync(parentFd);
    }
    ensure((lstatSync(path).mode & 0o777) === 0o600, "Receipt mode changed from 0600");
  };
  const check = (name, condition, detail = "") => {
    data.checks.push({ name, passed: Boolean(condition), detail });
    save();
    ensure(condition, name);
  };
  data.result = "running";
  data.resumedAt = existing ? new Date().toISOString() : undefined;
  save();
  return { data, save, check };
}

function tokenArgs() {
  return ASSET === "sbtc" ? [Cl.contractPrincipal(SBTC_ADDRESS, SBTC_NAME)] : [];
}

function fundingPostCondition(clientAddress) {
  return ASSET === "stx"
    ? Pc.principal(clientAddress).willSendEq(BUDGET).ustx()
    : Pc.principal(clientAddress).willSendEq(BUDGET).ft(SBTC, SBTC_ASSET_NAME);
}

function settlementPostCondition() {
  return ASSET === "stx"
    ? Pc.principal(CONTRACT).willSendEq(BUDGET).ustx()
    : Pc.principal(CONTRACT).willSendEq(BUDGET).ft(SBTC, SBTC_ASSET_NAME);
}

async function allEvents(transaction) {
  ensure(
    Number.isSafeInteger(transaction.event_count) &&
      transaction.event_count >= 0 &&
      transaction.event_count <= 2_000,
    "Unexpected settlement event count",
  );
  const events = [...(transaction.events ?? [])];
  while (events.length < transaction.event_count) {
    const page = await get(
      `/extended/v1/tx/${transaction.tx_id}?event_limit=200&event_offset=${events.length}`,
    );
    ensure(page.tx_id === transaction.tx_id && page.canonical === true && page.events?.length,
      "Incomplete canonical event page");
    events.push(...page.events);
  }
  ensure(
    events.length === transaction.event_count &&
      new Set(events.map((event) => event.event_index)).size === events.length,
    "Incomplete or duplicate settlement events",
  );
  return events;
}

function selectedAssetTransfer(event) {
  if (ASSET === "stx") return event.event_type === "stx_asset" ? event.asset : null;
  return event.event_type === "fungible_token_asset" &&
    event.asset?.asset_id === `${SBTC}::${SBTC_ASSET_NAME}`
    ? event.asset
    : null;
}

async function execute(publicState) {
  const campaignStage = process.env.SERVICE_FEE_MAINNET_E2E_CAMPAIGN_STAGE || "single-asset";
  ensure(
    ["single-asset", "stx-first", "sbtc-second"].includes(campaignStage),
    "Unsupported mainnet E2E campaign stage",
  );
  const remainingTopUpText =
    process.env.SERVICE_FEE_MAINNET_E2E_REMAINING_TOP_UP_MICRO_STX;
  ensure(/^\d+$/.test(remainingTopUpText || ""),
    "Exact remaining aggregate campaign top-up budget is required");
  const remainingTopUp = BigInt(remainingTopUpText);
  ensure(
    remainingTopUp <= MAX_CAMPAIGN_TOP_UP,
    "Remaining top-up exceeds the reviewed campaign cap",
  );
  const remainingNetworkFeesText =
    process.env.SERVICE_FEE_MAINNET_E2E_REMAINING_NETWORK_FEES_MICRO_STX;
  ensure(/^\d+$/.test(remainingNetworkFeesText || ""),
    "Exact remaining aggregate campaign network-fee budget is required");
  const remainingNetworkFees = BigInt(remainingNetworkFeesText);
  ensure(
    remainingNetworkFees <= MAX_CAMPAIGN_NETWORK_FEES,
    "Remaining network-fee budget exceeds the reviewed campaign cap",
  );
  ensure(
    process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E === "execute-controlled-v6-v5-mainnet",
    "Missing exact v6/v5 mainnet E2E confirmation",
  );
  ensure(process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_DEPLOYER === DEPLOYER,
    "Mainnet E2E deployer/client is not explicitly confirmed");
  ensure(process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_AUTHORITY === AUTHORITY,
    "Mainnet E2E appeal authority is not explicitly confirmed");
  ensure(process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_TREASURY === TREASURY,
    "Mainnet E2E treasury is not explicitly confirmed");
  ensure(
    process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX ===
      String(MAX_CAMPAIGN_TOP_UP),
    `Mainnet E2E aggregate campaign top-up cap must be explicitly confirmed as ${MAX_CAMPAIGN_TOP_UP}`,
  );
  ensure(
    process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX ===
      String(MAX_CAMPAIGN_NETWORK_FEES),
    `Mainnet E2E network-fee cap must be explicitly confirmed as ${MAX_CAMPAIGN_NETWORK_FEES}`,
  );
  ensure(process.env.SERVICE_FEE_MAINNET_E2E_LOCKFILE_SHA256 === LOCK_HASH,
    "package-lock.json differs from the reviewed E2E release");
  ensure(
    ROOT.startsWith("/private/tmp/nayori-mainnet-e2e-release-") &&
      process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_EPHEMERAL_ROOT === ROOT &&
      process.env.SERVICE_FEE_MAINNET_E2E_RUNTIME_ATTESTATION ===
        `${RUNTIME_ATTESTATION_VERSION}:${REVIEWED_SHA}:${LOCK_HASH}:${ROOT}`,
    "Armed E2E requires the exact ephemeral npm-ci runtime attestation",
  );
  ensure(
    !process.env.NODE_OPTIONS && !process.env.NODE_PATH && !process.env.NPM_CONFIG_NODE_OPTIONS,
    "Mainnet E2E must not inherit Node preload options",
  );

  execFileSync("npm", ["run", "security:gate"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { PATH: process.env.PATH, CI: "true", NODE_ENV: "test", NO_COLOR: "1" },
  });
  execFileSync("npm", ["test", "--", "--silent"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { PATH: process.env.PATH, CI: "true", NODE_ENV: "test", NO_COLOR: "1" },
  });
  ensure(
    execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim() === "",
    "Validation changed the reviewed E2E tree",
  );

  const resultPath = receiptPath(process.env.SERVICE_FEE_MAINNET_E2E_RESULT_PATH);
  // The fixed, asset-independent lock is acquired before signer files are opened. A campaign
  // coordinator holds it across STX and sBTC; the single-asset primitive acquires it itself.
  const accountLock = executionLock();

  // Signer files are deliberately opened only after release, chain and local gates pass.
  const clientEnv = parseEnv(secretFile(
    process.env.SERVICE_FEE_MAINNET_E2E_CLIENT_ENV_PATH,
    "SERVICE_FEE_MAINNET_E2E_CLIENT_ENV_PATH",
  ));
  const actorEnv = parseEnv(secretFile(
    process.env.SERVICE_FEE_MAINNET_E2E_ACTOR_ENV_PATH,
    "SERVICE_FEE_MAINNET_E2E_ACTOR_ENV_PATH",
  ));
  const authorityEnv = parseEnv(secretFile(
    process.env.SERVICE_FEE_MAINNET_E2E_AUTHORITY_ENV_PATH,
    "SERVICE_FEE_MAINNET_E2E_AUTHORITY_ENV_PATH",
  ));
  const client = requireSigner(clientEnv, "CLIENT_PRIVATE_KEY", "CLIENT_ADDRESS");
  const provider = requireSigner(actorEnv, "PROVIDER_PRIVATE_KEY", "PROVIDER_ADDRESS");
  const evaluator = requireSigner(
    actorEnv,
    "EVALUATOR_PRIVATE_KEY",
    "EVALUATOR_ADDRESS",
    EXPECTED_EVALUATOR,
  );
  const authority = requireSigner(
    authorityEnv,
    "MAINNET_APPEAL_AUTHORITY_PRIVATE_KEY",
    "MAINNET_APPEAL_AUTHORITY_ADDRESS",
    AUTHORITY,
  );
  ensure(
    new Set([
      client.address,
      provider.address,
      evaluator.address,
      authority.address,
      TREASURY,
      DEPLOYER,
    ]).size === 6,
    "Client, contract owner, provider, evaluator, authority and treasury must be distinct",
  );
  ensure(process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_CLIENT === client.address,
    "Mainnet E2E client is not explicitly confirmed");
  ensure(process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_PROVIDER === provider.address,
    "Mainnet E2E provider is not explicitly confirmed");
  ensure(process.env.CONFIRM_SERVICE_FEE_MAINNET_E2E_EVALUATOR === evaluator.address,
    "Mainnet E2E evaluator is not explicitly confirmed");

  const journal = createJournal(resultPath, {
    network: "mainnet",
    reviewedSha: REVIEWED_SHA,
    lockfileSha256: LOCK_HASH,
    asset: ASSET,
    scenario: "reject-appeal-resolve-approve",
    contract: CONTRACT,
    sourceHash: EXPECTED_SOURCE_HASHES[CONTRACT_NAME],
    client: client.address,
    provider: provider.address,
    evaluator: evaluator.address,
    appealAuthority: authority.address,
    treasury: TREASURY,
    canonicalSbtc: ASSET === "sbtc" ? SBTC : undefined,
    gross: String(BUDGET),
    net: String(NET),
    serviceFee: String(FEE),
    campaignId: process.env.SERVICE_FEE_MAINNET_E2E_CAMPAIGN_ID || "single-asset",
    campaignStage,
    aggregateTopUpCap: String(MAX_CAMPAIGN_TOP_UP),
    remainingTopUpBeforeAsset: String(remainingTopUp),
    aggregateNetworkFeeCap: String(MAX_CAMPAIGN_NETWORK_FEES),
    remainingNetworkFeesBeforeAsset: String(remainingNetworkFees),
  });

  const balances = {
    client: await account(client.address),
    provider: await account(provider.address),
    evaluator: await account(evaluator.address),
    authority: await account(authority.address),
  };
  const hasTransaction = (label) => Boolean(journal.data.transactions[label]);
  const requireStacksExpiryOpen = async (job, label) => {
    const chain = await get("/v2/info");
    ensure(
      Number.isSafeInteger(chain.stacks_tip_height) &&
        deadlineOpen(chain.stacks_tip_height, uint(job["expired-at"]), false),
      `${label}: job expiration reached; do not sign or transmit`,
    );
  };
  const requireBurnDeadlineOpen = async (deadline, label) => {
    const chain = await get("/v2/info");
    ensure(
      Number.isSafeInteger(chain.burn_block_height) &&
        deadlineOpen(chain.burn_block_height, uint(deadline), true),
      `${label} passed; do not sign or transmit`,
    );
  };
  const remainingCalls = (labels, future) =>
    BigInt(labels.filter((label) => !hasTransaction(label)).length + future);
  const futureAsset = campaignStage === "stx-first" ? 1 : 0;
  const providerRequired =
    PROVIDER_POST_CAMPAIGN_RESERVE +
    remainingCalls(["submit-work", "appeal-decision"], futureAsset * 2) * CALL_FEE;
  const plannedTopUp = journal.data.topUp
    ? BigInt(journal.data.topUp.amount)
    : balances.provider.stx < providerRequired
      ? providerRequired - balances.provider.stx
      : 0n;
  if (!journal.data.topUp) {
    journal.data.topUp = {
      aggregateCap: String(MAX_CAMPAIGN_TOP_UP),
      remainingBeforeAsset: String(remainingTopUp),
      amount: String(plannedTopUp),
      remainingAfterAsset: String(remainingTopUp - plannedTopUp),
    };
    journal.save();
  }
  journal.check(
    "provider top-up stays within the remaining aggregate campaign cap",
    plannedTopUp <= remainingTopUp &&
      journal.data.topUp.remainingBeforeAsset === String(remainingTopUp) &&
      journal.data.topUp.remainingAfterAsset === String(remainingTopUp - plannedTopUp),
    `${plannedTopUp}/${remainingTopUp}/${MAX_CAMPAIGN_TOP_UP} micro-STX`,
  );
  const expectedAssetNetworkFees =
    8n * CALL_FEE + (plannedTopUp > 0n ? TOP_UP_TRANSFER_FEE : 0n);
  journal.check(
    "all asset transaction fees fit the remaining aggregate campaign fee cap",
    expectedAssetNetworkFees <= remainingNetworkFees,
    `${expectedAssetNetworkFees}/${remainingNetworkFees}/${MAX_CAMPAIGN_NETWORK_FEES} micro-STX`,
  );
  const evaluatorRequired =
    ACTOR_POST_CAMPAIGN_RESERVE +
    remainingCalls(["record-decision"], futureAsset) * CALL_FEE;
  const authorityRequired =
    ACTOR_POST_CAMPAIGN_RESERVE +
    remainingCalls(["resolve-appeal"], futureAsset) * CALL_FEE;
  journal.check(
    "evaluator has bounded gas reserve for every remaining campaign call",
    balances.evaluator.stx >= evaluatorRequired,
    `${balances.evaluator.stx}/${evaluatorRequired} micro-STX`,
  );
  journal.check(
    "authority has bounded gas reserve for every remaining campaign call",
    balances.authority.stx >= authorityRequired,
    `${balances.authority.stx}/${authorityRequired} micro-STX`,
  );
  const remainingClientCalls = remainingCalls(
    ["create-job", "set-budget", "fund-job", "assign-provider"],
    futureAsset * 4,
  );
  const clientPostCampaignReserve = 500_000n;
  const freshTopUp = hasTransaction("top-up-provider-gas") ? 0n : plannedTopUp;
  const clientRequiredStx =
    clientPostCampaignReserve + remainingClientCalls * CALL_FEE + freshTopUp +
    (freshTopUp > 0n ? TOP_UP_TRANSFER_FEE : 0n) +
    (ASSET === "stx" && !hasTransaction("fund-job") ? BUDGET : 0n);
  journal.check(
    "client has escrow assets and bounded reserve for every remaining campaign call",
    balances.client.stx >= clientRequiredStx &&
      (campaignStage !== "stx-first" || balances.client.sbtc >= 1_000n) &&
      (ASSET !== "sbtc" || balances.client.sbtc >= BUDGET),
    `STX=${balances.client.stx}/${clientRequiredStx}; sBTC=${balances.client.sbtc}`,
  );

  async function call(label, functionName, functionArgs, signer, options = {}) {
    const postConditions = options.postConditions ?? [];
    const encodedArgs = functionArgs.map((argument) => serializeCV(argument));
    const existing = journal.data.transactions[label];
    if (!existing) {
      const roleReserve =
        signer.address === evaluator.address || signer.address === authority.address
          ? ACTOR_POST_CAMPAIGN_RESERVE
          : 500_000n;
      const liveSigner = await account(signer.address);
      const stxAssetOutflow =
        ASSET === "stx" && functionName === "fund-job" ? BUDGET : 0n;
      ensure(
        liveSigner.stx >= CALL_FEE + roleReserve + stxAssetOutflow,
        `${label} signer no longer has the fixed fee plus post-call reserve`,
      );
    }
    const nonce = existing ? BigInt(existing.nonce) : await nextNonce(signer.address);
    const transaction = await makeContractCall({
      contractAddress: DEPLOYER,
      contractName: CONTRACT_NAME,
      functionName,
      functionArgs,
      senderKey: signer.key,
      network,
      nonce,
      fee: CALL_FEE,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    });
    const serialized = serializeTransaction(transaction).replace(/^0x/, "");
    const txid = `0x${transaction.txid().replace(/^0x/, "")}`;
    const serializedSha256 = sha256(Buffer.from(serialized, "hex"));
    if (existing) {
      ensure(
        existing.txid === txid &&
          existing.sender === signer.address &&
          existing.nonce === String(nonce) &&
          existing.fee === String(CALL_FEE) &&
          existing.contract === CONTRACT &&
          existing.functionName === functionName &&
          JSON.stringify(existing.args) === JSON.stringify(encodedArgs) &&
          existing.postConditionMode === "deny" &&
          existing.postConditionCount === postConditions.length &&
          existing.serializedSha256 === serializedSha256 &&
          existing.serializedLengthBytes === serialized.length / 2,
        `${label} receipt intent differs from the deterministically reconstructed transaction`,
      );
    } else {
      journal.data.transactions[label] = {
        state: "signed-intent",
        txid,
        sender: signer.address,
        nonce: String(nonce),
        fee: String(CALL_FEE),
        contract: CONTRACT,
        functionName,
        args: encodedArgs,
        postConditionMode: "deny",
        postConditionCount: postConditions.length,
        serializedSha256,
        serializedLengthBytes: serialized.length / 2,
      };
      journal.save();
      accountLock.assertOwned();
      let broadcast;
      try {
        broadcast = await broadcastTransaction({ transaction, network });
      } catch {
        journal.data.transactions[label].state = "broadcast-uncertain";
        journal.save();
        throw new Error("Mainnet broadcast uncertain; reconcile the preserved txid and intent hash");
      }
      const broadcastTxid =
        typeof broadcast.txid === "string" ? `0x${broadcast.txid.replace(/^0x/, "")}` : "";
      ensure(!broadcast.error && broadcastTxid === txid,
        `${label} broadcast was rejected or returned a different txid`);
      journal.data.transactions[label].state = "broadcast-accepted";
      journal.save();
    }
    const observed = existing ? await get(`/extended/v1/tx/${txid}`, true) : null;
    if (existing) {
      ensure(
        observed && observed.tx_status !== "pending",
        `${label} is missing or pending; no automatic retransmission is allowed`,
      );
    }
    const confirmed = observed || await waitForTransaction(txid);
    const expectedResult = options.jobId ? /^\(ok u\d+\)$/ : /^\(ok true\)$/;
    ensure(
      confirmed.tx_id === txid &&
        confirmed.canonical === true &&
        confirmed.microblock_canonical === true &&
        confirmed.is_unanchored === false &&
        confirmed.tx_status === "success" &&
        expectedResult.test(confirmed.tx_result?.repr ?? "") &&
        confirmed.sender_address === signer.address &&
        String(confirmed.nonce) === String(nonce) &&
        String(confirmed.fee_rate) === String(CALL_FEE) &&
        confirmed.sponsored === false &&
        confirmed.anchor_mode === "any" &&
        confirmed.post_condition_mode === "deny" &&
        confirmed.post_conditions?.length === postConditions.length &&
        confirmed.contract_call?.contract_id === CONTRACT &&
        confirmed.contract_call?.function_name === functionName,
      `${label} did not confirm as the exact canonical deny-mode intent`,
    );
    Object.assign(journal.data.transactions[label], {
      state: "canonical-success",
      result: confirmed.tx_result.repr,
      blockHeight: confirmed.block_height,
      burnBlockHeight: confirmed.burn_block_height,
      blockHash: confirmed.block_hash,
      explorer: `https://explorer.hiro.so/txid/${txid}?chain=mainnet`,
    });
    journal.save();
    return confirmed;
  }

  async function topUpProvider(amount) {
    if (amount === 0n) {
      journal.check(
        "provider requires no automatic top-up",
        balances.provider.stx >= providerRequired,
        `${balances.provider.stx}/${providerRequired} micro-STX`,
      );
      return;
    }
    const label = "top-up-provider-gas";
    const existing = journal.data.transactions[label];
    const nonce = existing ? BigInt(existing.nonce) : await nextNonce(client.address);
    const postConditions = [Pc.principal(client.address).willSendEq(amount).ustx()];
    const transaction = await makeSTXTokenTransfer({
      recipient: provider.address,
      amount,
      senderKey: client.key,
      network,
      nonce,
      fee: TOP_UP_TRANSFER_FEE,
      memo: "nayori-v6v5-e2e-provider",
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    });
    const serialized = serializeTransaction(transaction).replace(/^0x/, "");
    const txid = `0x${transaction.txid().replace(/^0x/, "")}`;
    const serializedSha256 = sha256(Buffer.from(serialized, "hex"));
    if (existing) {
      ensure(
        existing.txid === txid && existing.sender === client.address &&
          existing.recipient === provider.address && existing.amount === String(amount) &&
          existing.nonce === String(nonce) && existing.fee === String(TOP_UP_TRANSFER_FEE) &&
          existing.postConditionMode === "deny" && existing.postConditionCount === 1 &&
          existing.serializedSha256 === serializedSha256 &&
          existing.serializedLengthBytes === serialized.length / 2,
        "Existing provider top-up differs from its deterministic receipt intent",
      );
    } else {
      journal.data.transactions[label] = {
        state: "signed-intent",
        txid,
        sender: client.address,
        recipient: provider.address,
        amount: String(amount),
        nonce: String(nonce),
        fee: String(TOP_UP_TRANSFER_FEE),
        postConditionMode: "deny",
        postConditionCount: postConditions.length,
        serializedSha256,
        serializedLengthBytes: serialized.length / 2,
      };
      journal.save();
      accountLock.assertOwned();
      let broadcast;
      try {
        broadcast = await broadcastTransaction({ transaction, network });
      } catch {
        journal.data.transactions[label].state = "broadcast-uncertain";
        journal.save();
        throw new Error("Mainnet top-up broadcast uncertain; reconcile the txid and intent hash");
      }
      const broadcastTxid =
        typeof broadcast.txid === "string" ? `0x${broadcast.txid.replace(/^0x/, "")}` : "";
      ensure(!broadcast.error && broadcastTxid === txid,
        "Provider top-up was rejected or returned a different txid");
      journal.data.transactions[label].state = "broadcast-accepted";
      journal.save();
    }
    const observed = existing ? await get(`/extended/v1/tx/${txid}`, true) : null;
    if (existing) {
      ensure(
        observed && observed.tx_status !== "pending",
        "Provider top-up is missing or pending; no automatic retransmission is allowed",
      );
    }
    const confirmed = observed || await waitForTransaction(txid);
    ensure(
      confirmed.tx_id === txid &&
        confirmed.canonical === true &&
        confirmed.microblock_canonical === true &&
        confirmed.is_unanchored === false &&
        confirmed.tx_status === "success" &&
        confirmed.sender_address === client.address &&
        String(confirmed.nonce) === String(nonce) &&
        String(confirmed.fee_rate) === String(TOP_UP_TRANSFER_FEE) &&
        confirmed.sponsored === false &&
        confirmed.anchor_mode === "any" &&
        confirmed.post_condition_mode === "deny" &&
        confirmed.post_conditions?.length === 1 &&
        confirmed.token_transfer?.recipient_address === provider.address &&
        BigInt(confirmed.token_transfer?.amount ?? 0) === amount,
      "Provider top-up did not confirm as the exact canonical deny-mode intent",
    );
    Object.assign(journal.data.transactions[label], {
      state: "canonical-success",
      result: confirmed.tx_result?.repr,
      blockHeight: confirmed.block_height,
      burnBlockHeight: confirmed.burn_block_height,
      blockHash: confirmed.block_hash,
      explorer: `https://explorer.hiro.so/txid/${txid}?chain=mainnet`,
    });
    journal.save();
    const fundedProvider = await account(provider.address);
    journal.check(
      "provider reaches the bounded gas reserve after one exact top-up",
      fundedProvider.stx >= providerRequired &&
        (existing || fundedProvider.stx - balances.provider.stx === amount),
      `${fundedProvider.stx}/${providerRequired} micro-STX`,
    );
  }

  await topUpProvider(plannedTopUp);

  const tip = await get("/v2/info");
  const description = "Controlled mainnet validation: signed data-quality report";
  if (!journal.data.jobTerms) {
    journal.data.jobTerms = {
      description,
      expiredAt: String(BigInt(tip.stacks_tip_height) + 500n),
    };
    journal.save();
  }
  ensure(
    journal.data.jobTerms.description === description &&
      /^\d+$/.test(journal.data.jobTerms.expiredAt),
    "Existing receipt job terms differ from the fixed scenario",
  );
  const expiredAt = BigInt(journal.data.jobTerms.expiredAt);
  if (!hasTransaction("create-job")) {
    const chain = await get("/v2/info");
    ensure(
      Number.isSafeInteger(chain.stacks_tip_height) &&
        deadlineOpen(chain.stacks_tip_height, expiredAt, false),
      "Persisted job expiration reached before create-job; do not sign or transmit",
    );
  }
  const created = await call(
    "create-job",
    "create-job",
    [
      Cl.none(),
      Cl.principal(evaluator.address),
      Cl.uint(expiredAt),
      Cl.stringAscii(description),
    ],
    client,
    { jobId: true },
  );
  const jobMatch = created.tx_result.repr.match(/^\(ok u(\d+)\)$/);
  ensure(jobMatch, "create-job did not return a job identifier");
  const jobId = BigInt(jobMatch[1]);
  journal.data.jobId = String(jobId);
  const createdJob = ok(
    await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]),
    "get-job after create",
  );
  const observedCount = uint(
    ok(await read(CONTRACT_NAME, "get-job-count"), "get-job-count after create"),
  );
  journal.check(
    "returned job id identifies this exact client/evaluator/terms on-chain",
    jobId > 0n && observedCount >= jobId && createdJob.client === client.address &&
      createdJob.evaluator === evaluator.address && createdJob.description === description &&
      uint(createdJob["expired-at"]) === expiredAt,
    `job=${jobId}; count=${observedCount}`,
  );

  if (!hasTransaction("set-budget")) {
    ensure(
      uint(createdJob.status) === STATUS_OPEN && createdJob.client === client.address &&
        createdJob.evaluator === evaluator.address && uint(createdJob["expired-at"]) === expiredAt,
      "Pre-budget job state, roles or terms changed",
    );
    await requireStacksExpiryOpen(createdJob, "Budget stage");
  }
  await call("set-budget", "set-budget", [Cl.uint(jobId), Cl.uint(BUDGET)], client);
  if (!hasTransaction("fund-job")) {
    const preFundJob = ok(
      await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]),
      "get-job before fund",
    );
    const preFundEscrow = uint(ok(
      await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]),
      "get-escrow-balance before fund",
    ));
    ensure(
      uint(preFundJob.status) === STATUS_OPEN && preFundJob.client === client.address &&
        preFundJob.evaluator === evaluator.address && uint(preFundJob.budget) === BUDGET &&
        preFundEscrow === 0n,
      "Pre-fund job state, roles, budget or escrow changed",
    );
    await requireStacksExpiryOpen(preFundJob, "Funding stage");
  }
  await call(
    "fund-job",
    "fund-job",
    [Cl.uint(jobId), ...tokenArgs()],
    client,
    { postConditions: [fundingPostCondition(client.address)] },
  );
  const fundedEscrow = uint(
    ok(await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]), "get-escrow-balance"),
  );
  if (!hasTransaction("assign-provider")) {
    journal.check(
      "funding creates exact gross escrow",
      fundedEscrow === BUDGET,
      `${fundedEscrow}/${BUDGET} atomic units`,
    );
  }
  if (ASSET === "sbtc") {
    journal.check(
      "job pins canonical mainnet sBTC",
      ok(await read(CONTRACT_NAME, "get-job-payment-token", [Cl.uint(jobId)]), "get-job-payment-token") === SBTC,
    );
  }
  if (!hasTransaction("assign-provider")) {
    const preAssignJob = ok(
      await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]),
      "get-job before assign",
    );
    ensure(
      uint(preAssignJob.status) === STATUS_FUNDED && preAssignJob.client === client.address &&
        preAssignJob.evaluator === evaluator.address && preAssignJob.provider === null &&
        fundedEscrow === BUDGET,
      "Pre-assign job state, roles or escrow changed",
    );
    await requireStacksExpiryOpen(preAssignJob, "Assignment stage");
  }
  await call(
    "assign-provider",
    "assign-provider",
    [Cl.uint(jobId), Cl.principal(provider.address)],
    client,
  );
  if (!hasTransaction("submit-work")) {
    const preSubmitJob = ok(
      await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]),
      "get-job before submit",
    );
    const preSubmitEscrow = uint(ok(
      await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]),
      "get-escrow-balance before submit",
    ));
    ensure(
      uint(preSubmitJob.status) === STATUS_FUNDED && preSubmitJob.client === client.address &&
        preSubmitJob.evaluator === evaluator.address && preSubmitJob.provider === provider.address &&
        preSubmitEscrow === BUDGET,
      "Pre-submit job state, roles or escrow changed",
    );
    await requireStacksExpiryOpen(preSubmitJob, "Submission stage");
  }
  await call(
    "submit-work",
    "submit-work",
    [Cl.uint(jobId), digest(`nayori-mainnet-deliverable:${ASSET}:${jobId}`)],
    provider,
  );
  let job = ok(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]), "get-job");
  if (!hasTransaction("record-decision")) {
    journal.check("provider submission reaches u2", uint(job.status) === STATUS_SUBMITTED);
    journal.check(
      "submission preserves gross escrow",
      uint(ok(await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]), "get-escrow-balance")) === BUDGET,
    );
    ensure(
      job.client === client.address && job.provider === provider.address &&
        job.evaluator === evaluator.address,
      "Pre-decision job roles changed",
    );
    await requireBurnDeadlineOpen(job["review-deadline"], "Review deadline");
  }

  await call(
    "record-decision",
    "record-decision",
    [
      Cl.uint(jobId),
      Cl.uint(DECISION_REJECT),
      digest(`nayori-mainnet-evidence:${ASSET}:${jobId}`),
      digest(`nayori-mainnet-explanation:${ASSET}:${jobId}`),
    ],
    evaluator,
  );
  job = ok(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]), "get-job");
  if (!hasTransaction("appeal-decision")) {
    const pendingFee = ok(
      await read(CONTRACT_NAME, "get-job-service-fee", [Cl.uint(jobId)]),
      "get-job-service-fee",
    );
    journal.check(
      "decision records service without settlement",
      uint(job.status) === STATUS_DECISION_PENDING &&
        pendingFee["service-recorded"] === true &&
        pendingFee.settlement === null,
    );
  }
  const decision = ok(await read(CONTRACT_NAME, "get-decision", [Cl.uint(jobId)]), "get-decision");
  if (!hasTransaction("appeal-decision")) {
    const appealEscrow = uint(ok(
      await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]),
      "get-escrow-balance before appeal",
    ));
    ensure(
      uint(job.status) === STATUS_DECISION_PENDING && job.provider === provider.address &&
        decision["original-decision"] === String(DECISION_REJECT) &&
        decision["appealed-by"] === null && appealEscrow === BUDGET,
      "Pre-appeal job, decision or escrow changed",
    );
    await requireBurnDeadlineOpen(decision["appeal-deadline"], "Appeal deadline");
  }

  await call(
    "appeal-decision",
    "appeal-decision",
    [Cl.uint(jobId), digest(`nayori-mainnet-appeal:${ASSET}:${jobId}`)],
    provider,
  );
  job = ok(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]), "get-job");
  if (!hasTransaction("resolve-appeal")) {
    journal.check("provider appeal reaches u8", uint(job.status) === STATUS_DISPUTED);
    journal.check(
      "appeal preserves gross escrow",
      uint(ok(await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]), "get-escrow-balance")) === BUDGET,
    );
    const disputedDecision = ok(
      await read(CONTRACT_NAME, "get-decision", [Cl.uint(jobId)]),
      "get-decision before resolution",
    );
    ensure(
      job.client === client.address && job.provider === provider.address &&
        job.evaluator === evaluator.address && job["appeal-authority"] === authority.address &&
        disputedDecision["original-decision"] === String(DECISION_REJECT) &&
        disputedDecision["appealed-by"] === provider.address,
      "Pre-resolution job roles or appealed decision changed",
    );
    await requireBurnDeadlineOpen(
      disputedDecision["resolution-deadline"],
      "Resolution deadline",
    );
  }

  if (!journal.data.preSettlementBalances) {
    const providerBefore = await account(provider.address);
    const treasuryBefore = await account(TREASURY);
    journal.data.preSettlementBalances = {
      provider: String(providerBefore[ASSET]),
      treasury: String(treasuryBefore[ASSET]),
    };
    journal.save();
  }
  ensure(
    /^\d+$/.test(journal.data.preSettlementBalances.provider) &&
      /^\d+$/.test(journal.data.preSettlementBalances.treasury),
    "Pre-settlement balance snapshots are invalid",
  );
  if (!journal.data.transactions["resolve-appeal"]) {
    const providerNow = await account(provider.address);
    const treasuryNow = await account(TREASURY);
    ensure(
      providerNow[ASSET] === BigInt(journal.data.preSettlementBalances.provider) &&
        treasuryNow[ASSET] === BigInt(journal.data.preSettlementBalances.treasury),
      "Settlement participants changed balances after the persisted pre-settlement snapshot",
    );
  }
  const settlement = await call(
    "resolve-appeal",
    "resolve-appeal",
    [
      Cl.uint(jobId),
      Cl.uint(DECISION_APPROVE),
      digest(`nayori-mainnet-resolution:${ASSET}:${jobId}`),
      ...tokenArgs(),
    ],
    authority,
    { postConditions: [settlementPostCondition()] },
  );
  const finality = await waitForFinality(settlement);
  journal.data.finality = finality;
  journal.save();
  const providerAfter = await account(provider.address);
  const treasuryAfter = await account(TREASURY);
  const providerDelta =
    providerAfter[ASSET] - BigInt(journal.data.preSettlementBalances.provider);
  const treasuryDelta =
    treasuryAfter[ASSET] - BigInt(journal.data.preSettlementBalances.treasury);
  journal.check("provider receives exact 98% net", providerDelta === NET, String(providerDelta));
  journal.check("treasury receives exact 2% fee", treasuryDelta === FEE, String(treasuryDelta));

  const events = await allEvents(settlement);
  const escrowTransfers = events
    .map(selectedAssetTransfer)
    .filter((asset) => asset?.sender === CONTRACT);
  const providerTransfers = escrowTransfers.filter(
    (asset) => asset.recipient === provider.address && BigInt(asset.amount) === NET,
  );
  const treasuryTransfers = escrowTransfers.filter(
    (asset) => asset.recipient === TREASURY && BigInt(asset.amount) === FEE,
  );
  journal.check(
    "settlement has one net payout and one fee transfer only",
    escrowTransfers.length === 2 && providerTransfers.length === 1 && treasuryTransfers.length === 1,
  );
  const feePrints = events
    .filter(
      (event) =>
        event.event_type === "smart_contract_log" &&
        event.contract_log?.contract_id === CONTRACT,
    )
    .map((event) => plain(cvToValue(deserializeCV(event.contract_log.value.hex))))
    .filter(
      (event) =>
        event.event === "service-fee-settled" && event["job-id"] === String(jobId),
    );
  journal.check("one service-fee-settled event is indexed", feePrints.length === 1);

  job = ok(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]), "get-job");
  const escrow = uint(
    ok(await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]), "get-escrow-balance"),
  );
  const finalDecision = ok(
    await read(CONTRACT_NAME, "get-decision", [Cl.uint(jobId)]),
    "get-decision",
  );
  const feeLedger = ok(
    await read(CONTRACT_NAME, "get-job-service-fee", [Cl.uint(jobId)]),
    "get-job-service-fee",
  );
  const reputation = ok(
    await read(CONTRACT_NAME, "get-reputation-sync", [Cl.uint(jobId)]),
    "get-reputation-sync",
  );
  journal.check("terminal job is completed with zero escrow",
    uint(job.status) === STATUS_COMPLETED && escrow === 0n);
  journal.check("appeal preserves reject and resolves approve",
    finalDecision["original-decision"] === String(DECISION_REJECT) &&
      finalDecision["final-decision"] === String(DECISION_APPROVE));
  journal.check("service-fee ledger conserves gross exactly",
    feeLedger.treasury === TREASURY &&
      feeLedger["basis-points"] === String(SERVICE_FEE_BPS) &&
      feeLedger["fee-amount"] === String(FEE) &&
      feeLedger["service-recorded"] === true &&
      feeLedger.waiver === null &&
      feeLedger.settlement?.gross === String(BUDGET) &&
      feeLedger.settlement?.recipient === provider.address &&
      feeLedger.settlement?.net === String(NET) &&
      feeLedger.settlement?.["charged-fee"] === String(FEE) &&
      feeLedger.settlement?.["refunded-fee"] === "0");
  journal.check("reputation synchronization completed once",
    reputation.pending === false &&
      reputation.outcome === String(DECISION_APPROVE) &&
      reputation["last-error"] === "0");
  journal.check(
    "every operation has a unique canonical transaction",
    new Set(Object.values(journal.data.transactions).map((entry) => entry.txid)).size ===
      Object.keys(journal.data.transactions).length,
  );
  const actualNetworkFees = Object.values(journal.data.transactions)
    .reduce((total, entry) => total + BigInt(entry.fee), 0n);
  journal.data.networkFees = {
    campaignCap: String(MAX_CAMPAIGN_NETWORK_FEES),
    remainingBeforeAsset: String(remainingNetworkFees),
    expectedAsset: String(expectedAssetNetworkFees),
    actual: String(actualNetworkFees),
  };
  journal.save();
  journal.check(
    "asset network fees equal the pre-authorized exact total",
    actualNetworkFees === expectedAssetNetworkFees && actualNetworkFees <= remainingNetworkFees,
    `${actualNetworkFees}/${expectedAssetNetworkFees}/${remainingNetworkFees} micro-STX`,
  );
  ensure(
    journal.data.checks.length > 0 &&
      journal.data.checks.every((entry) => entry.passed === true),
    "Receipt contains an unresolved failed check and cannot be promoted to passed",
  );
  journal.data.result = "passed";
  journal.data.completedAt = new Date().toISOString();
  journal.save();
  console.log(`PASS ${journal.data.checks.length}/${journal.data.checks.length}`);
  console.log(`Receipt: ${resultPath}`);
  console.log(`Receipt SHA-256: ${sha256(readFileSync(resultPath))}`);
  accountLock.close();
}

export async function main() {
  ensure(process.env.STACKS_NETWORK === "mainnet", "STACKS_NETWORK must explicitly be mainnet");
  ensure(["preflight", "execute"].includes(ACTION), "Unsupported mainnet E2E action");
  ensure(["stx", "sbtc"].includes(ASSET), "SERVICE_FEE_MAINNET_E2E_ASSET must be stx or sbtc");
  ensure(REVIEW_WINDOW === 12n && APPEAL_WINDOW === 144n && SERVICE_FEE_BPS === 200n,
    "Imported mainnet economic policy drifted");
  ensure(new Set([DEPLOYER, AUTHORITY, TREASURY]).size === 3,
    "Deployer, appeal authority and treasury must be distinct");
  const sourceCommit = releaseIdentity(ACTION === "execute");
  const publicState = await verifyPublicRelease();
  const preflight = {
    schemaVersion: 1,
    action: ACTION,
    network: "mainnet",
    signerFilesOpened: false,
    classification: "internal-team-operated-not-m2-adoption",
    sourceCommit,
    dependencyLockSha256: LOCK_HASH,
    sourceHashes: EXPECTED_SOURCE_HASHES,
    asset: ASSET,
    scenario: "reject-appeal-resolve-approve",
    contract: CONTRACT,
    gross: String(BUDGET),
    net: String(NET),
    serviceFee: String(FEE),
    treasury: TREASURY,
    appealAuthority: AUTHORITY,
    publicState,
    executionFundingRequirements: {
      dedicatedClient: {
        minimumMicroStxWithMaximumTopUp: "3250000",
        minimumSbtcSats: "1000",
        mustDifferFromContractOwner: true,
      },
      provider: {
        minimumMicroStxBeforeMaximumTopUp: "400000",
        targetMicroStxBeforeBothAssets: "1300000",
      },
      evaluator: { address: EXPECTED_EVALUATOR, minimumMicroStx: "700000" },
      appealAuthority: { address: AUTHORITY, minimumMicroStx: "700000" },
      fixedContractCallFeeMicroStx: String(CALL_FEE),
      aggregateTopUpCapMicroStx: String(MAX_CAMPAIGN_TOP_UP),
      aggregateNetworkFeeCapMicroStx: String(MAX_CAMPAIGN_NETWORK_FEES),
    },
    ready: true,
  };
  console.log(JSON.stringify(preflight, null, 2));
  if (ACTION === "preflight") return preflight;
  await execute(publicState);
  return preflight;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error?.message ||
        "Mainnet v6/v5 E2E stopped; inspect the external receipt before any recovery",
    );
    process.exitCode = 1;
  });
}
