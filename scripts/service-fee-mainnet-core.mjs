// Mainnet-only operational helpers for the immutable v6/v5 service-fee promotion.
// Importing this module performs no I/O. Preflight never reads a signer file or
// constructs a transaction.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnchorMode,
  AuthType,
  Cl,
  ClarityVersion,
  ClarityType,
  PayloadType,
  PostConditionMode,
  broadcastTransaction,
  createAddress,
  cvToValue,
  deserializeTransaction,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
  serializeCV,
  serializeTransaction,
  validateStacksAddress,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const API = "https://api.hiro.so";
export const NETWORK_ID = 1;
export const NETWORK = {
  ...STACKS_MAINNET,
  client: { ...STACKS_MAINNET.client, baseUrl: API },
};
export const DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
export const AUTHORITY = "SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH";
export const TREASURY = "SP2G44NF8281MWN4ARNXW2B1KJ5A7J9HTZGFSE0NY";
export const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
export const REPUTATION = "reputation-registry-v3";
export const CONTRACTS = Object.freeze({
  stx: "agentic-commerce-v6",
  sbtc: "sbtc-commerce-v5",
});
export const SOURCE_HASHES = Object.freeze({
  "sip-010-trait":
    "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  [REPUTATION]:
    "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  [CONTRACTS.stx]:
    "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
  [CONTRACTS.sbtc]:
    "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
});
export const APPEAL_WINDOW = 144n;
export const REVIEW_WINDOW = 12n;
export const SERVICE_FEE_BPS = 200n;
export const CALL_FEE = 200_000n;
export const DEPLOY_FEE = 1_000_000n;
export const MAXIMUM_TOTAL_FEES = 3_000_000n;
export const RESERVE = 5_000_000n;
export const FINALITY_STACKS_DEPTH = 2;
export const RUNTIME_ATTESTATION_VERSION = "ephemeral-npm-ci-ignore-scripts-v1";
export const CAMPAIGN_STATE_FILENAME = "v6-v5-campaign.json";
export const GLOBAL_LOCK_PATH =
  "/private/tmp/nayori-service-fee-mainnet-SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.lock";

export class SafetyError extends Error {}
export function ensure(condition, message) {
  if (!condition) throw new SafetyError(message);
}
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const lockfileHash = () =>
  sha256(readFileSync(`${ROOT}/package-lock.json`));
export function plain(value) {
  if (value && typeof value === "object" && "type" in value && "value" in value)
    return plain(value.value);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plain(item)]),
    );
  return value;
}
export function ok(value) {
  ensure(
    value.type === ClarityType.ResponseOk,
    "Expected successful read-only response",
  );
  return plain(cvToValue(value));
}
export function principal(address) {
  let version;
  try {
    version = createAddress(address).version;
  } catch {
    /* handled below */
  }
  ensure(
    typeof address === "string" &&
      address.startsWith("SP") &&
      validateStacksAddress(address) &&
      version === 22,
    "Expected a standard single-signature mainnet principal",
  );
  return address;
}
export function roles(treasury) {
  principal(treasury);
  const addresses = [DEPLOYER, AUTHORITY, treasury];
  ensure(
    new Set(addresses).size === addresses.length,
    "Mainnet owner, appeal authority and treasury must be distinct",
  );
  return { owner: DEPLOYER, authority: AUTHORITY, treasury };
}
export function guard(env, kind = "deploy") {
  ensure(
    env.STACKS_NETWORK === "mainnet",
    "STACKS_NETWORK must explicitly be mainnet",
  );
  const action = env.SERVICE_FEE_MAINNET_ACTION || "preflight";
  ensure(
    ["preflight", kind].includes(action),
    "Unsupported mainnet service-fee action",
  );
  ensure(
    env.SERVICE_FEE_MAINNET_TREASURY_ADDRESS === TREASURY,
    "Mainnet treasury differs from the reviewed immutable production treasury",
  );
  roles(TREASURY);
  if (action !== "preflight") {
    ensure(
      env.CONFIRM_SERVICE_FEE_MAINNET === "deploy-v6-v5-mainnet",
      "Missing exact mainnet deployment confirmation",
    );
    ensure(
      env.CONFIRM_SERVICE_FEE_MAINNET_DEPLOYER === DEPLOYER,
      "Mainnet deployer is not explicitly confirmed",
    );
    ensure(
      env.CONFIRM_SERVICE_FEE_MAINNET_AUTHORITY === AUTHORITY,
      "Mainnet appeal authority is not explicitly confirmed",
    );
    ensure(
      env.CONFIRM_SERVICE_FEE_MAINNET_TREASURY ===
        env.SERVICE_FEE_MAINNET_TREASURY_ADDRESS,
      "Mainnet treasury is not explicitly confirmed",
    );
    ensure(
      typeof env.SERVICE_FEE_MAINNET_TREASURY_ENV_PATH === "string" &&
        env.SERVICE_FEE_MAINNET_TREASURY_ENV_PATH.length > 0 &&
        env.CONFIRM_SERVICE_FEE_MAINNET_TREASURY_ENV_PATH ===
        env.SERVICE_FEE_MAINNET_TREASURY_ENV_PATH,
      "Mainnet treasury custody path is not explicitly confirmed",
    );
    ensure(
      typeof env.SERVICE_FEE_MAINNET_STATE_DIR === "string" &&
        env.SERVICE_FEE_MAINNET_STATE_DIR.length > 0 &&
        env.CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR === env.SERVICE_FEE_MAINNET_STATE_DIR,
      "Mainnet campaign-state directory is not explicitly confirmed",
    );
    ensure(
      typeof env.SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH === "string" &&
        env.SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH.length > 0 &&
        typeof env.SERVICE_FEE_MAINNET_RECEIPT_PATH === "string" &&
        env.SERVICE_FEE_MAINNET_RECEIPT_PATH.length > 0 &&
        env.CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH ===
          env.SERVICE_FEE_MAINNET_RECEIPT_PATH,
      "Mainnet signer and receipt paths are required",
    );
    ensure(
      env.CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX ===
        String(MAXIMUM_TOTAL_FEES),
      "The fixed maximum mainnet fee budget is not explicitly confirmed",
    );
    ensure(
      /^[a-f0-9]{40}$/.test(env.SERVICE_FEE_MAINNET_REVIEWED_SHA || ""),
      "Reviewed mainnet release SHA required",
    );
  }
  return action;
}
export function source(name) {
  ensure(
    Object.hasOwn(SOURCE_HASHES, name),
    "Contract is not on the mainnet source allowlist",
  );
  const text = readFileSync(`${ROOT}/contracts/${name}.clar`, "utf8");
  ensure(
    sha256(text) === SOURCE_HASHES[name],
    `Frozen source mismatch: ${name}`,
  );
  return text;
}
export function verifyRuntimeAttestation(
  env,
  current,
  dependencyLockHash,
  releaseRoot,
  runtimeEnvironment = process.env,
  currentDirectory = process.cwd(),
) {
  ensure(
    /^\/private\/tmp\/nayori-mainnet-release-[A-Za-z0-9._-]+$/.test(releaseRoot) &&
      currentDirectory === releaseRoot,
    "Mainnet execution requires the confirmed ephemeral release root",
  );
  ensure(
    env.CONFIRM_SERVICE_FEE_MAINNET_EPHEMERAL_ROOT === releaseRoot,
    "Ephemeral release root is not explicitly confirmed",
  );
  ensure(
    !runtimeEnvironment.NODE_OPTIONS &&
      !runtimeEnvironment.NODE_PATH &&
      !runtimeEnvironment.NPM_CONFIG_NODE_OPTIONS &&
      !runtimeEnvironment.npm_config_node_options,
    "Mainnet signing runtime must not inherit Node preload options",
  );
  ensure(
    env.SERVICE_FEE_MAINNET_RUNTIME_ATTESTATION ===
      `${RUNTIME_ATTESTATION_VERSION}:${current}:${dependencyLockHash}:${releaseRoot}`,
    "Mainnet runtime attestation is absent or differs from the rebuilt release",
  );
  return true;
}
export function release(env, execute) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const current = git("rev-parse", "HEAD");
  Object.keys(SOURCE_HASHES).forEach(source);
  const dependencyLockHash = lockfileHash();
  if (execute) {
    const releaseRoot = realpathSync(ROOT);
    ensure(
      current === env.SERVICE_FEE_MAINNET_REVIEWED_SHA,
      "HEAD differs from the reviewed mainnet release",
    );
    verifyRuntimeAttestation(env, current, dependencyLockHash, releaseRoot);
    ensure(
      git("status", "--porcelain") === "",
      "Mainnet execution requires a clean tree, including untracked files",
    );
    execFileSync("git", ["merge-base", "--is-ancestor", current, "origin/main"], {
      cwd: ROOT,
      stdio: "pipe",
    });
    ensure(
      env.SERVICE_FEE_MAINNET_LOCKFILE_SHA256 === dependencyLockHash,
      "package-lock.json differs from the reviewed mainnet dependency lock",
    );
    const validationEnvironment = {
      PATH: process.env.PATH,
      CI: "true",
      NODE_ENV: "test",
      NO_COLOR: "1",
    };
    execFileSync("npm", ["run", "security:gate"], {
      cwd: ROOT,
      stdio: "inherit",
      env: validationEnvironment,
    });
    execFileSync("npm", ["test", "--", "--silent"], {
      cwd: ROOT,
      stdio: "inherit",
      env: validationEnvironment,
    });
    ensure(
      git("status", "--porcelain") === "",
      "Validation modified the reviewed mainnet release",
    );
  }
  return current;
}
export function parseEnv(text) {
  const env = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    ensure(match && !Object.hasOwn(env, match[1]), "Invalid or duplicate env field");
    env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}
export function loadRoleKey(path, expectedAddress, addressField, keyField, role) {
  ensure(
    isAbsolute(path || "") && realpathSync(path) === path,
    `${role} path must be absolute and not a symlink`,
  );
  let repository;
  try {
    repository = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(path),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* outside Git */
  }
  if (repository) {
    const file = relative(repository, path);
    const tracked = execFileSync(
      "git",
      ["--literal-pathspecs", "ls-files", "--", file],
      {
        cwd: repository,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    ensure(!tracked, `${role} file must never be tracked by Git`);
    try {
      execFileSync("git", ["check-ignore", "--quiet", "--stdin", "-z"], {
        cwd: repository,
        input: `${file}\0`,
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch {
      throw new SafetyError(`${role} inside a Git worktree must be ignored`);
    }
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    ensure(
      stat.isFile() &&
        (stat.mode & 0o777) === 0o600 &&
        stat.uid === process.getuid(),
      `${role} must be an owned mode-0600 file`,
    );
    const env = parseEnv(readFileSync(fd, "utf8"));
    ensure(env[addressField] === expectedAddress, `${role} address differs`);
    let matches = false;
    try {
      matches =
        !!env[keyField] &&
        getAddressFromPrivateKey(env[keyField], "mainnet") === expectedAddress;
    } catch {
      /* never print secret input */
    }
    ensure(matches, `${role} key does not match its confirmed mainnet address`);
    return env[keyField];
  } finally {
    closeSync(fd);
  }
}
export function signer(path) {
  return loadRoleKey(
    path,
    DEPLOYER,
    "DEPLOYER_ADDRESS",
    "DEPLOYER_PRIVATE_KEY",
    "Mainnet deployer signer",
  );
}
export function verifyTreasuryCustody(path, treasury) {
  loadRoleKey(
    path,
    principal(treasury),
    "NAYORI_MAINNET_TREASURY_ADDRESS",
    "NAYORI_MAINNET_TREASURY_PRIVATE_KEY",
    "Mainnet treasury signer",
  );
  return true;
}

export function createReadTransport({
  fetchFn = (...args) => fetch(...args),
  now = Date.now,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
} = {}) {
  let queue = Promise.resolve();
  let lastStart = -Infinity;
  const functions = new Set([
    "get-owner",
    "get-pending-owner",
    "get-protocol-config",
    "get-pending-appeal-authority",
    "get-job-count",
    "is-registered-caller",
    "get-payment-token",
  ]);
  return async (input, options = {}) => {
    const url = new URL(input);
    const method = (options.method || "GET").toUpperCase();
    ensure(
      url.origin === API && !url.username && !url.password && !url.hash,
      "Read transport requires canonical mainnet origin",
    );
    const parts = url.pathname.split("/");
    const sourceRead =
      parts.length === 6 &&
      parts.slice(0, 4).join("/") === "/v2/contracts/source" &&
      parts[4] === DEPLOYER &&
      Object.hasOwn(SOURCE_HASHES, parts[5]) &&
      (url.search === "" || url.search === "?proof=0");
    const contractRead =
      parts.length === 7 &&
      parts.slice(0, 4).join("/") === "/v2/contracts/call-read" &&
      parts[4] === DEPLOYER &&
      Object.hasOwn(SOURCE_HASHES, parts[5]) &&
      functions.has(parts[6]) &&
      url.search === "";
    const accountRead =
      (url.pathname === `/extended/v1/address/${DEPLOYER}/balances` ||
        url.pathname === `/extended/v1/address/${DEPLOYER}/nonces`) &&
      url.search === "";
    const mempoolRead =
      url.pathname === "/extended/v1/tx/mempool" &&
      url.searchParams.get("address") === DEPLOYER &&
      url.searchParams.get("limit") === "1" &&
      [...url.searchParams].length === 2;
    const txRead =
      /^\/extended\/v1\/tx\/0x[a-f0-9]{64}$/.test(url.pathname) &&
      url.search === "";
    const infoRead = url.pathname === "/v2/info" && url.search === "";
    ensure(
      (method === "GET" &&
        options.body === undefined &&
        (sourceRead || accountRead || mempoolRead || txRead || infoRead)) ||
        (method === "POST" && contractRead && typeof options.body === "string"),
      "Only allowlisted public mainnet reads may use retry transport",
    );
    const run = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        options.signal?.throwIfAborted();
        const spacing = Math.max(0, lastStart + 3000 - now());
        if (spacing) await sleep(spacing);
        options.signal?.throwIfAborted();
        lastStart = now();
        const timeout = AbortSignal.timeout(20_000);
        const response = await fetchFn(url.href, {
          ...options,
          method,
          redirect: "error",
          signal: options.signal
            ? AbortSignal.any([options.signal, timeout])
            : timeout,
        });
        if (response.status !== 429 || attempt === 2) return response;
        const retryAfter = response.headers.get("retry-after");
        const parsed = retryAfter !== null && /^\d+(\.\d+)?$/.test(retryAfter.trim())
          ? Math.ceil(Number(retryAfter) * 1000)
          : Number.NaN;
        const delay = Math.max(5000 * 2 ** attempt, Number.isNaN(parsed) ? 60_000 : parsed);
        await response.body?.cancel();
        ensure(delay <= 60_000, "Mainnet read retry exceeds the safe wait bound");
        await sleep(delay);
      }
    };
    const task = queue.then(run);
    queue = task.catch(() => undefined);
    return task;
  };
}
const readTransport = createReadTransport();
export async function get(path, allow404 = false) {
  const response = await readTransport(API + path);
  if (allow404 && response.status === 404) return null;
  ensure(response.ok, `Mainnet API HTTP ${response.status}`);
  return response.json();
}
export function verifyNodeInfo(data) {
  ensure(
    data.network_id === NETWORK_ID &&
      data.is_fully_synced === true &&
      Number.isSafeInteger(data.burn_block_height) &&
      data.burn_block_height > 0 &&
      Number.isSafeInteger(data.stacks_tip_height) &&
      data.stacks_tip_height > 0 &&
      /^[a-f0-9]{64}$/.test(data.stacks_tip || ""),
    "Mainnet node identity not verified",
  );
  return data;
}
export async function info() {
  return verifyNodeInfo(await get("/v2/info"));
}
export async function account() {
  const data = await get(`/extended/v1/address/${DEPLOYER}/balances`);
  ensure(/^\d+$/.test(data.stx?.balance || ""), "Missing deployer STX balance");
  return BigInt(data.stx.balance);
}
export async function nonce() {
  const pending = await get(
    `/extended/v1/tx/mempool?address=${DEPLOYER}&limit=1`,
  );
  ensure(pending.total === 0, "Mainnet deployer has pending transactions");
  const data = await get(`/extended/v1/address/${DEPLOYER}/nonces`);
  const next = data.last_executed_tx_nonce == null
    ? 0
    : data.last_executed_tx_nonce + 1;
  ensure(
    Number.isSafeInteger(data.possible_next_nonce) &&
      data.possible_next_nonce >= 0 &&
      data.possible_next_nonce === next &&
      data.detected_missing_nonces?.length === 0 &&
      data.detected_mempool_nonces?.length === 0,
    "Mainnet deployer nonce is not contiguous and idle",
  );
  return BigInt(data.possible_next_nonce);
}
export async function read(name, fn, args = []) {
  ensure(Object.hasOwn(SOURCE_HASHES, name), "Read contract is not allowlisted");
  return fetchCallReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName: name,
    functionName: fn,
    functionArgs: args,
    senderAddress: DEPLOYER,
    network: NETWORK,
    client: { baseUrl: API, fetch: readTransport },
  });
}
export async function sources() {
  const deployed = {};
  for (const name of Object.keys(SOURCE_HASHES)) {
    const data = await get(
      `/v2/contracts/source/${DEPLOYER}/${name}?proof=0`,
      true,
    );
    deployed[name] = data !== null;
    if (!data) {
      ensure(
        Object.values(CONTRACTS).includes(name),
        `Required mainnet prerequisite is missing: ${name}`,
      );
    } else {
      ensure(
        sha256(data.source) === sha256(source(name)),
        `On-chain source mismatch: ${name}`,
      );
    }
  }
  return deployed;
}
export function verifyConfig(config, treasury) {
  ensure(
    config.configured === true &&
      config.treasury === treasury &&
      config["appeal-authority"] === AUTHORITY &&
      config["appeal-window"] === String(APPEAL_WINDOW) &&
      config["review-window"] === String(REVIEW_WINDOW) &&
      config["service-fee-bps"] === String(SERVICE_FEE_BPS),
    "Existing mainnet protocol configuration differs from approved policy",
  );
}

export function operationCatalog(treasury) {
  roles(treasury);
  return [
    { label: `deploy-${CONTRACTS.stx}`, kind: "deploy", name: CONTRACTS.stx },
    {
      label: `authorize-${CONTRACTS.stx}`,
      kind: "call",
      name: REPUTATION,
      fn: "add-protocol-caller",
      args: [Cl.principal(`${DEPLOYER}.${CONTRACTS.stx}`)],
    },
    {
      label: `initialize-${CONTRACTS.stx}`,
      kind: "call",
      name: CONTRACTS.stx,
      fn: "initialize-protocol",
      args: [Cl.uint(APPEAL_WINDOW), Cl.principal(AUTHORITY), Cl.principal(treasury)],
    },
    { label: `deploy-${CONTRACTS.sbtc}`, kind: "deploy", name: CONTRACTS.sbtc },
    {
      label: "set-canonical-sbtc",
      kind: "call",
      name: CONTRACTS.sbtc,
      fn: "set-payment-token",
      args: [Cl.principal(SBTC)],
    },
    {
      label: `authorize-${CONTRACTS.sbtc}`,
      kind: "call",
      name: REPUTATION,
      fn: "add-protocol-caller",
      args: [Cl.principal(`${DEPLOYER}.${CONTRACTS.sbtc}`)],
    },
    {
      label: `initialize-${CONTRACTS.sbtc}`,
      kind: "call",
      name: CONTRACTS.sbtc,
      fn: "initialize-protocol",
      args: [Cl.uint(APPEAL_WINDOW), Cl.principal(AUTHORITY), Cl.principal(treasury)],
    },
  ];
}
export function intentForOperation(operation) {
  return operation.kind === "deploy"
    ? {
        kind: "deploy",
        name: operation.name,
        sourceHash: SOURCE_HASHES[operation.name],
        sender: DEPLOYER,
        fee: String(DEPLOY_FEE),
      }
    : callIntent(operation.name, operation.fn, operation.args);
}

export async function deploymentPlan(treasury) {
  roles(treasury);
  const catalog = new Map(operationCatalog(treasury).map((operation) => [operation.label, operation]));
  const chain = await info();
  const occupied = await sources();
  ensure(ok(await read(REPUTATION, "get-owner")) === DEPLOYER, "Reputation owner differs");
  const needed = new Set();
  ensure(ok(await read(REPUTATION, "get-pending-owner")) === null, "Reputation has a pending owner proposal");
  for (const name of Object.values(CONTRACTS)) {
    let config;
    if (!occupied[name]) {
      needed.add(`deploy-${name}`);
    } else {
      ensure(ok(await read(name, "get-owner")) === DEPLOYER, "Escrow owner differs");
      ensure(ok(await read(name, "get-job-count")) === "0", "Candidate contract already has jobs");
      ensure(ok(await read(name, "get-pending-owner")) === null, "Candidate has a pending owner proposal");
      ensure(
        ok(await read(name, "get-pending-appeal-authority")) === null,
        "Candidate has a pending appeal-authority proposal",
      );
      config = ok(await read(name, "get-protocol-config"));
    }
    if (!config?.configured) {
      if (occupied[name])
        ensure(ok(await read(name, "get-job-count")) === "0", "Unconfigured candidate already has jobs");
      needed.add(`initialize-${name}`);
    } else verifyConfig(config, treasury);
    if (
      name === CONTRACTS.sbtc &&
      (!occupied[name] || ok(await read(name, "get-payment-token")) !== SBTC)
    ) {
      if (occupied[name])
        ensure(ok(await read(name, "get-job-count")) === "0", "Refusing to change token for a used contract");
      needed.add("set-canonical-sbtc");
    }
    const allowed = cvToValue(
      await read(REPUTATION, "is-registered-caller", [
        Cl.principal(`${DEPLOYER}.${name}`),
      ]),
    );
    if (allowed !== true) {
      needed.add(`authorize-${name}`);
    }
  }
  const operations = [...catalog.values()].filter(({ label }) => needed.has(label));
  const balance = await account();
  const nextNonce = await nonce();
  const fees = operations.reduce(
    (sum, operation) => sum + (operation.kind === "deploy" ? DEPLOY_FEE : CALL_FEE),
    0n,
  );
  ensure(fees <= MAXIMUM_TOTAL_FEES, "Deployment plan exceeds the immutable fee cap");
  return {
    operations,
    report: {
      network: "mainnet",
      deployer: DEPLOYER,
      appealAuthority: AUTHORITY,
      treasury,
      sbtcToken: SBTC,
      appealWindowBurnBlocks: String(APPEAL_WINDOW),
      reviewWindowBurnBlocks: String(REVIEW_WINDOW),
      serviceFeeBasisPoints: String(SERVICE_FEE_BPS),
      burnBlockHeight: chain.burn_block_height,
      stacksTipHeight: chain.stacks_tip_height,
      sourceHashes: SOURCE_HASHES,
      occupied,
      nonce: String(nextNonce),
      balanceMicroStx: String(balance),
      maximumFeesMicroStx: String(fees),
      hardFeeCapMicroStx: String(MAXIMUM_TOTAL_FEES),
      reserveMicroStx: String(RESERVE),
      requiredMicroStx: String(fees + RESERVE),
      ready: balance >= fees + RESERVE,
      operations: operations.map(({ label, kind, name, fn }) => ({ label, kind, name, fn })),
    },
  };
}

export function externalPath(path) {
  ensure(isAbsolute(path || ""), "An absolute external receipt path is required");
  ensure(realpathSync(dirname(path)) === dirname(path), "Receipt parent must not be a symlink");
  let gitRoot;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(path),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* outside Git */
  }
  ensure(!gitRoot, "Mainnet receipts must be outside every Git repository");
  if (existsSync(path)) {
    const stat = lstatSync(path);
    ensure(
      stat.isFile() &&
        !stat.isSymbolicLink() &&
        (stat.mode & 0o777) === 0o600 &&
        stat.uid === process.getuid(),
      "Unsafe mainnet receipt path",
    );
  }
  return path;
}
export function campaignStateDirectory(path) {
  ensure(isAbsolute(path || ""), "An absolute external campaign-state directory is required");
  const real = realpathSync(path);
  const stat = lstatSync(real);
  ensure(
    real === path &&
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o777) === 0o700 &&
      stat.uid === process.getuid(),
    "Unsafe mainnet campaign-state directory",
  );
  let gitRoot;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: real,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* outside Git */
  }
  ensure(!gitRoot, "Mainnet campaign state must be outside every Git repository");
  return real;
}
export function bindCampaignState(directory, receiptPath, binding) {
  const statePath = `${campaignStateDirectory(directory)}/${CAMPAIGN_STATE_FILENAME}`;
  const expected = {
    schemaVersion: 1,
    campaign: "nayori-mainnet-service-fee-v6-v5",
    receiptPath,
    sourceCommit: binding.sourceCommit,
    dependencyLockHash: binding.dependencyLockHash,
    maximumFeesMicroStx: String(MAXIMUM_TOTAL_FEES),
    treasury: binding.treasury,
  };
  if (!existsSync(statePath)) {
    const descriptor = openSync(statePath, "wx", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify(expected, null, 2) + "\n");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const directoryDescriptor = openSync(directory, constants.O_RDONLY);
    fsyncSync(directoryDescriptor);
    closeSync(directoryDescriptor);
  }
  const stat = lstatSync(statePath);
  ensure(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o777) === 0o600 &&
      stat.uid === process.getuid(),
    "Unsafe mainnet campaign-state marker",
  );
  ensure(
    JSON.stringify(JSON.parse(readFileSync(statePath, "utf8"))) === JSON.stringify(expected),
    "Mainnet campaign is already bound to a different receipt or release",
  );
  return statePath;
}
export class Journal {
  constructor(path, binding, options = {}) {
    this.path = externalPath(path);
    ensure(options.campaignStateDir, "Mainnet campaign-state directory is required");
    this.campaignStatePath = bindCampaignState(
      options.campaignStateDir,
      this.path,
      binding,
    );
    this.lock = `${path}.lock`;
    this.fd = openSync(this.lock, "wx", 0o600);
    try {
      this.accountLock = options.accountLockPath || GLOBAL_LOCK_PATH;
      this.accountFd = openSync(this.accountLock, "wx", 0o600);
      const lockMetadata = JSON.stringify({
        pid: process.pid,
        host: hostname(),
        startedAt: new Date().toISOString(),
        receipt: this.path,
        sourceCommit: binding.sourceCommit,
      }) + "\n";
      writeFileSync(this.fd, lockMetadata);
      fsyncSync(this.fd);
      writeFileSync(
        this.accountFd,
        lockMetadata,
      );
      fsyncSync(this.accountFd);
      this.data = existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : {
            schemaVersion: 1,
            binding,
            classification: "internal-team-operated-not-m2-adoption",
            transactions: {},
            checks: [],
            result: "running",
          };
      ensure(
        JSON.stringify(this.data.binding) === JSON.stringify(binding),
        "Journal belongs to a different reviewed mainnet run",
      );
      this.save();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  save() {
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    const fileDescriptor = openSync(temporary, constants.O_RDONLY | constants.O_NOFOLLOW);
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    renameSync(temporary, this.path);
    const directoryDescriptor = openSync(dirname(this.path), constants.O_RDONLY);
    fsyncSync(directoryDescriptor);
    closeSync(directoryDescriptor);
  }
  check(name, condition) {
    this.data.checks.push({ name, passed: Boolean(condition) });
    this.save();
    ensure(condition, name);
  }
  close() {
    if (this.accountFd !== undefined) {
      closeSync(this.accountFd);
      this.accountFd = undefined;
      unlinkSync(this.accountLock);
    }
    if (this.fd !== undefined) {
      closeSync(this.fd);
      this.fd = undefined;
      unlinkSync(this.lock);
    }
  }
}
export const intentHash = (intent) => sha256(JSON.stringify(intent));
export function callIntent(name, fn, args) {
  ensure(Object.hasOwn(SOURCE_HASHES, name), "Call contract not allowlisted");
  return {
    kind: "call",
    name,
    fn,
    args: args.map(serializeCV),
    sender: DEPLOYER,
    fee: String(CALL_FEE),
  };
}
export function validateBuiltTransaction(transaction, intent, expectedNonce) {
  const serialized = serializeTransaction(transaction);
  const decoded = deserializeTransaction(serialized);
  const spending = decoded.auth?.spendingCondition;
  const deployerAddress = createAddress(DEPLOYER);
  const signerAddress = createAddress(principal(intent.sender));
  ensure(
    decoded.transactionVersion === 0 &&
      decoded.chainId === NETWORK_ID &&
      decoded.auth?.authType === AuthType.Standard &&
      spending?.signer === signerAddress.hash160 &&
      spending?.nonce === BigInt(expectedNonce) &&
      spending?.fee === BigInt(intent.fee) &&
      decoded.anchorMode === AnchorMode.Any &&
      decoded.postConditionMode === PostConditionMode.Deny &&
      decoded.postConditions?.values?.length === 0,
    "Signed transaction envelope differs from the approved mainnet intent",
  );
  if (intent.kind === "deploy") {
    ensure(
      decoded.payload?.payloadType === PayloadType.VersionedSmartContract &&
        decoded.payload?.clarityVersion === ClarityVersion.Clarity2 &&
        decoded.payload?.contractName?.content === intent.name &&
        sha256(decoded.payload?.codeBody?.content || "") === intent.sourceHash &&
        decoded.payload?.codeBody?.content === source(intent.name),
      "Signed deployment payload/source differs from the approved mainnet intent",
    );
  } else {
    ensure(
      decoded.payload?.payloadType === PayloadType.ContractCall &&
        decoded.payload?.contractAddress?.version === deployerAddress.version &&
        decoded.payload?.contractAddress?.hash160 === deployerAddress.hash160 &&
        decoded.payload?.contractName?.content === intent.name &&
        decoded.payload?.functionName?.content === intent.fn &&
        JSON.stringify(decoded.payload?.functionArgs?.map(serializeCV)) ===
          JSON.stringify(intent.args),
      "Signed call payload/arguments differ from the approved mainnet intent",
    );
  }
  const serializedHex = serialized.replace(/^0x/, "");
  return {
    txid: `0x${decoded.txid().replace(/^0x/, "")}`,
    serializedHex,
    serializedSha256: sha256(Buffer.from(serializedHex, "hex")),
  };
}
export function validateTransaction(transaction, id, intent, expectedNonce) {
  ensure(
    transaction.tx_id === id &&
      transaction.canonical === true &&
      transaction.microblock_canonical === true &&
      transaction.is_unanchored === false &&
      transaction.tx_status === "success" &&
      transaction.tx_result?.repr === "(ok true)" &&
      Number.isSafeInteger(transaction.block_height) &&
      transaction.block_height > 0 &&
      Number.isSafeInteger(transaction.burn_block_height) &&
      transaction.burn_block_height > 0 &&
      /^0x[a-f0-9]{64}$/.test(transaction.block_hash || ""),
    "Mainnet transaction is not canonical anchored success",
  );
  ensure(
    transaction.sender_address === intent.sender &&
      String(transaction.nonce) === String(expectedNonce) &&
      String(transaction.fee_rate) === intent.fee &&
      transaction.sponsored === false &&
      transaction.anchor_mode === "any" &&
      transaction.post_condition_mode === "deny" &&
      Array.isArray(transaction.post_conditions) &&
      transaction.post_conditions.length === 0,
    "Mainnet sender, nonce, fee, sponsorship, anchor or post-conditions differ",
  );
  ensure(
    !(transaction.events || []).some((event) =>
      [
        "stx_asset",
        "stx_lock",
        "fungible_token_asset",
        "non_fungible_token_asset",
      ].includes(event.event_type),
    ),
    "Administrative mainnet promotion transaction moved an asset",
  );
  if (intent.kind === "deploy") {
    ensure(
      transaction.tx_type === "smart_contract" &&
        transaction.smart_contract?.contract_id === `${intent.sender}.${intent.name}` &&
        transaction.smart_contract?.clarity_version === 2 &&
        sha256(transaction.smart_contract?.source_code || "") === intent.sourceHash &&
        transaction.smart_contract?.source_code === source(intent.name),
      "Wrong mainnet contract deployment",
    );
  } else {
    ensure(
      transaction.tx_type === "contract_call" &&
        transaction.contract_call?.contract_id === `${DEPLOYER}.${intent.name}` &&
        transaction.contract_call?.function_name === intent.fn,
      "Wrong mainnet contract call",
    );
    ensure(
      JSON.stringify(
        transaction.contract_call.function_args.map((argument) => argument.hex.replace(/^0x/, "")),
      ) === JSON.stringify(intent.args.map((argument) => argument.replace(/^0x/, ""))),
      "Confirmed mainnet arguments differ from the recorded intent",
    );
  }
}
export async function transactionStatus(id) {
  return get(`/extended/v1/tx/${id}`, true);
}
export async function confirmed(id) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const transaction = await transactionStatus(id);
    if (transaction && transaction.tx_status !== "pending") return transaction;
    if (attempt === 179) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
  }
  throw Error("Mainnet transaction unresolved; preserve journal and never rebroadcast automatically");
}
export function validateJournalEntry(entry, intent) {
  ensure(
    entry.intentHash === intentHash(intent) &&
      JSON.stringify(entry.intent) === JSON.stringify(intent) &&
      /^\d+$/.test(entry.nonce || "") &&
      /^[a-f0-9]+$/.test(entry.serializedTransaction || "") &&
      entry.serializedTransaction.length % 2 === 0,
    "Recorded signed mainnet intent changed or is incomplete",
  );
  const signed = deserializeTransaction(
    entry.serializedTransaction,
  );
  const built = validateBuiltTransaction(signed, intent, BigInt(entry.nonce));
  ensure(
    built.txid === entry.txid &&
      built.serializedHex === entry.serializedTransaction &&
      built.serializedSha256 === entry.serializedSha256,
    "Persisted signed mainnet bytes differ from the recorded txid/hash",
  );
  return signed;
}
export async function settleRecordedEntry(
  journal,
  label,
  intent,
  io = {
    lookup: transactionStatus,
    confirmed,
    broadcast: broadcastTransaction,
  },
) {
  const entry = journal.data.transactions[label];
  const signed = validateJournalEntry(entry, intent);
  ensure(entry.state !== "broadcast-rejected", "A rejected mainnet broadcast requires manual review");
  let observed = await io.lookup(entry.txid);
  if (!observed) {
    ensure(
      Number(entry.broadcastAttempts || 0) < 3,
      "Exact mainnet transaction reached the bounded rebroadcast limit",
    );
    entry.broadcastAttempts = Number(entry.broadcastAttempts || 0) + 1;
    entry.state = "broadcast-attempt-recorded";
    entry.broadcastAttemptedAt = new Date().toISOString();
    journal.save();
    let result;
    try {
      result = await io.broadcast({ transaction: signed, network: NETWORK });
    } catch {
      entry.state = "broadcast-uncertain";
      journal.save();
      throw Error("Mainnet broadcast uncertain; exact signed bytes are preserved for reconciliation");
    }
    if (result.error || `0x${result.txid?.replace(/^0x/, "")}` !== entry.txid) {
      entry.state = "broadcast-rejected";
      entry.broadcastError = {
        error: String(result.error || "mismatched-txid").slice(0, 160),
        reason: String(result.reason || "").slice(0, 160),
      };
      journal.save();
      throw new SafetyError("Mainnet broadcast was rejected; journal is fail-closed");
    }
    entry.state = "broadcast-accepted";
    journal.save();
    console.log(`${label}: ${entry.txid}`);
    observed = null;
  }
  const transaction =
    observed && observed.tx_status !== "pending"
      ? observed
      : await io.confirmed(entry.txid);
  entry.observedStatus = transaction.tx_status;
  entry.observedResult = transaction.tx_result?.repr;
  journal.save();
  validateTransaction(transaction, entry.txid, intent, entry.nonce);
  entry.state = "confirmed";
  entry.blockHeight = transaction.block_height;
  entry.burnBlockHeight = transaction.burn_block_height;
  entry.result = transaction.tx_result?.repr;
  journal.save();
  return transaction;
}
export async function send(
  journal,
  label,
  intent,
  build,
  io = {
    info,
    nonce,
    lookup: transactionStatus,
    confirmed,
    broadcast: broadcastTransaction,
  },
) {
  let entry = journal.data.transactions[label];
  if (!entry) {
    await io.info();
    const nextNonce = await io.nonce();
    const transaction = await build(nextNonce);
    const built = validateBuiltTransaction(transaction, intent, nextNonce);
    entry = {
      txid: built.txid,
      intent,
      intentHash: intentHash(intent),
      nonce: String(nextNonce),
      serializedTransaction: built.serializedHex,
      serializedSha256: built.serializedSha256,
      state: "signed-bytes-recorded",
    };
    journal.data.transactions[label] = entry;
    journal.save();
  }
  return settleRecordedEntry(journal, label, intent, io);
}
export async function reconcileJournal(
  journal,
  treasury,
  io = {
    lookup: transactionStatus,
    confirmed,
    broadcast: broadcastTransaction,
  },
) {
  const catalog = new Map(
    operationCatalog(treasury).map((operation) => [
      operation.label,
      intentForOperation(operation),
    ]),
  );
  for (const [label, entry] of Object.entries(journal.data.transactions)) {
    const expected = catalog.get(label);
    ensure(expected, `Journal contains an unapproved mainnet operation: ${label}`);
    await settleRecordedEntry(journal, label, expected, io);
  }
}
export function campaignFeeTotal(journal, operations) {
  const fees = new Map();
  for (const [label, entry] of Object.entries(journal.data.transactions)) {
    ensure(/^\d+$/.test(entry.intent?.fee || ""), `Missing recorded fee for ${label}`);
    fees.set(label, BigInt(entry.intent.fee));
  }
  for (const operation of operations) {
    const expected = intentForOperation(operation);
    const existing = fees.get(operation.label);
    ensure(
      existing === undefined || existing === BigInt(expected.fee),
      `Campaign fee changed for ${operation.label}`,
    );
    fees.set(operation.label, BigInt(expected.fee));
  }
  const total = [...fees.values()].reduce((sum, fee) => sum + fee, 0n);
  ensure(total <= MAXIMUM_TOTAL_FEES, "Cumulative mainnet campaign fees exceed the hard cap");
  return total;
}
export async function waitForFinality(
  journal,
  io = { info, lookup: transactionStatus },
) {
  const entries = Object.entries(journal.data.transactions);
  if (entries.length === 0) return;
  const maximumBlock = Math.max(
    ...entries.map(([, entry]) => {
      ensure(Number.isSafeInteger(entry.blockHeight), "Confirmed mainnet block height missing");
      return entry.blockHeight;
    }),
  );
  const requiredTip = maximumBlock + FINALITY_STACKS_DEPTH;
  let chain;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    chain = await io.info();
    if (chain.stacks_tip_height >= requiredTip) break;
    ensure(attempt < 59, "Mainnet finality depth was not reached in the bounded wait");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
  }
  for (const [label, entry] of entries) {
    const transaction = await io.lookup(entry.txid);
    ensure(transaction, `Finality receipt missing for ${label}`);
    validateTransaction(transaction, entry.txid, entry.intent, entry.nonce);
  }
  journal.data.finality = {
    stacksDepth: FINALITY_STACKS_DEPTH,
    requiredTip,
    observedTip: chain.stacks_tip_height,
    revalidatedTransactions: entries.map(([label, entry]) => ({ label, txid: entry.txid })),
  };
  journal.save();
}
export async function call(journal, operation, key) {
  const intent = callIntent(operation.name, operation.fn, operation.args);
  return send(journal, operation.label, intent, (nextNonce) =>
    makeContractCall({
      contractAddress: DEPLOYER,
      contractName: operation.name,
      functionName: operation.fn,
      functionArgs: operation.args,
      senderKey: key,
      network: NETWORK,
      nonce: nextNonce,
      fee: CALL_FEE,
      postConditionMode: PostConditionMode.Deny,
      postConditions: [],
    }),
  );
}
export async function deploy(journal, name, key) {
  const intent = intentForOperation({ kind: "deploy", name });
  return send(journal, `deploy-${name}`, intent, (nextNonce) =>
    makeContractDeploy({
      contractName: name,
      codeBody: source(name),
      senderKey: key,
      network: NETWORK,
      nonce: nextNonce,
      fee: DEPLOY_FEE,
      clarityVersion: 2,
      postConditionMode: PostConditionMode.Deny,
    }),
  );
}
