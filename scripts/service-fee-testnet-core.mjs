// Testnet-only operational helpers. Importing this module performs no I/O.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
  fstatSync,
  constants,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  Cl,
  ClarityType,
  Pc,
  PostConditionMode,
  broadcastTransaction,
  createAddress,
  cvToValue,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
  serializeCV,
  validateStacksAddress,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const API = "https://api.testnet.hiro.so";
export const NETWORK_ID = 2147483648;
export const NETWORK = {
  ...STACKS_TESTNET,
  client: { ...STACKS_TESTNET.client, baseUrl: API },
};
export const DEPLOYER = "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5";
export const EVALUATOR = "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4";
export const AUTHORITY = "ST256E5DAXM7RDFZ76ECCTPTBYHRXXJQ29H16DN69";
export const SBTC = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";
export const REPUTATION = "reputation-registry-v3";
export const CONTRACTS = {
  stx: "agentic-commerce-v6",
  sbtc: "sbtc-commerce-v5",
};
export const SOURCE_HASHES = {
  "sip-010-trait":
    "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  [REPUTATION]:
    "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  [CONTRACTS.stx]:
    "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
  [CONTRACTS.sbtc]:
    "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
};
export const CALL_FEE = 5000n;
export const DEPLOY_FEE = 1000000n;
export const RESERVE = 500000n;
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export class SafetyError extends Error {}
export function ensure(condition, message) {
  if (!condition) throw new SafetyError(message);
}
export function plain(value) {
  if (value && typeof value === "object" && "type" in value && "value" in value)
    return plain(value.value);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)]),
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
  ensure(
    typeof address === "string" &&
      validateStacksAddress(address) &&
      createAddress(address).version === 26,
    "Expected a standard testnet principal",
  );
  return address;
}
export function roles(treasury, provider) {
  const addresses = [DEPLOYER, EVALUATOR, AUTHORITY, principal(treasury)];
  if (provider !== undefined) addresses.push(principal(provider));
  ensure(
    new Set(addresses).size === addresses.length,
    "Every QA role must be distinct",
  );
  return {
    client: DEPLOYER,
    evaluator: EVALUATOR,
    authority: AUTHORITY,
    treasury,
    ...(provider ? { provider } : {}),
  };
}
export function guard(env, kind) {
  ensure(
    env.STACKS_NETWORK === "testnet",
    "STACKS_NETWORK must explicitly be testnet",
  );
  const action = env.SERVICE_FEE_ACTION || "preflight";
  ensure(
    ["preflight", kind].includes(action),
    "Unsupported service-fee action",
  );
  if (action !== "preflight") {
    ensure(
      env.CONFIRM_SERVICE_FEE_TESTNET === `${kind}-v6-v5-testnet`,
      "Missing exact testnet execution confirmation",
    );
    ensure(
      /^[a-f0-9]{40}$/.test(env.SERVICE_FEE_REVIEWED_SHA || ""),
      "Reviewed release SHA required",
    );
    ensure(
      env.CONFIRM_SERVICE_FEE_TREASURY === env.SERVICE_FEE_TREASURY_ADDRESS,
      "Confirm the immutable QA treasury address",
    );
  }
  return action;
}
export function source(name) {
  ensure(
    Object.hasOwn(SOURCE_HASHES, name),
    "Contract is not on the source allowlist",
  );
  const text = readFileSync(`${ROOT}/contracts/${name}.clar`, "utf8");
  ensure(
    sha256(text) === SOURCE_HASHES[name],
    `Frozen source mismatch: ${name}`,
  );
  return text;
}
export function release(env, execute) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const sha = git("rev-parse", "HEAD");
  Object.keys(SOURCE_HASHES).forEach(source);
  if (execute) {
    ensure(
      sha === env.SERVICE_FEE_REVIEWED_SHA,
      "HEAD differs from the reviewed release",
    );
    ensure(
      git("status", "--porcelain") === "",
      "Execution requires a clean tree, including untracked files",
    );
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/qa"], {
      cwd: ROOT,
      stdio: "pipe",
    });
    execFileSync("npm", ["run", "security:gate"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    execFileSync("npm", ["test", "--", "--silent"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    ensure(
      git("status", "--porcelain") === "",
      "Tests modified the reviewed tree",
    );
  }
  return sha;
}
export function parseEnv(text) {
  const env = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    ensure(
      match && !Object.hasOwn(env, match[1]),
      "Invalid or duplicate env field",
    );
    env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}
export function signer(path, address, keyField) {
  ensure(
    isAbsolute(path || "") && realpathSync(path) === path,
    "Signer path must be absolute and not a symlink",
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
    ensure(!tracked, "Signer file must never be tracked by Git");
    try {
      execFileSync("git", ["check-ignore", "--quiet", "--stdin", "-z"], {
        cwd: repository,
        input: `${file}\0`,
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch {
      throw new SafetyError("Signer inside a Git worktree must be ignored");
    }
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    ensure(
      stat.isFile() &&
        (stat.mode & 0o777) === 0o600 &&
        stat.uid === process.getuid(),
      "Signer must be an owned mode-0600 file",
    );
    const env = parseEnv(readFileSync(fd, "utf8"));
    const key = env[keyField];
    let matches = false;
    try {
      matches =
        !!key &&
        getAddressFromPrivateKey(key, "testnet") === principal(address);
    } catch {
      /* never print secret inputs */
    }
    ensure(matches, "Signer does not match its expected testnet role");
    return key;
  } finally {
    closeSync(fd);
  }
}
export async function get(path, allow404 = false) {
  const response = await fetch(API + path, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (allow404 && response.status === 404) return null;
  ensure(response.ok, `Testnet API HTTP ${response.status}`);
  return response.json();
}
export async function info() {
  const data = await get("/v2/info");
  ensure(
    data.network_id === NETWORK_ID &&
      Number.isSafeInteger(data.burn_block_height),
    "Testnet node identity not verified",
  );
  return data;
}
export async function account(address) {
  principal(address);
  const data = await get(`/extended/v1/address/${address}/balances`);
  ensure(/^\d+$/.test(data.stx?.balance || ""), "Missing STX balance");
  return {
    stx: BigInt(data.stx.balance),
    sbtc: BigInt(data.fungible_tokens?.[`${SBTC}::sbtc-token`]?.balance || "0"),
  };
}
export async function nonce(address) {
  principal(address);
  const pending = await get(
    `/extended/v1/tx/mempool?address=${address}&limit=1`,
  );
  ensure(
    pending.total === 0,
    "Signer has pending transactions; do not race its nonce",
  );
  const data = await get(`/extended/v1/address/${address}/nonces`);
  const next =
    data.last_executed_tx_nonce == null ? 0 : data.last_executed_tx_nonce + 1;
  ensure(
    Number.isSafeInteger(data.possible_next_nonce) &&
      data.possible_next_nonce >= 0 &&
      data.possible_next_nonce === next &&
      data.detected_missing_nonces?.length === 0 &&
      data.detected_mempool_nonces?.length === 0,
    "Nonce is not contiguous and idle",
  );
  return BigInt(data.possible_next_nonce);
}
export async function read(name, fn, args = []) {
  ensure(Object.hasOwn(SOURCE_HASHES, name), "Read contract not allowlisted");
  return fetchCallReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName: name,
    functionName: fn,
    functionArgs: args,
    senderAddress: DEPLOYER,
    network: NETWORK,
  });
}
export async function sources(requireCandidates) {
  const deployed = {};
  for (const name of Object.keys(SOURCE_HASHES)) {
    const data = await get(
      `/v2/contracts/source/${DEPLOYER}/${name}?proof=0`,
      true,
    );
    deployed[name] = data !== null;
    if (!data)
      ensure(
        !requireCandidates && Object.values(CONTRACTS).includes(name),
        `Required source missing: ${name}`,
      );
    else
      ensure(
        sha256(data.source) === sha256(source(name)),
        `On-chain source mismatch: ${name}`,
      );
  }
  return deployed;
}
export function verifyConfig(config, treasury) {
  ensure(
    config.configured === true &&
      config.treasury === treasury &&
      config["appeal-authority"] === AUTHORITY &&
      config["appeal-window"] === "3" &&
      config["review-window"] === "12" &&
      config["service-fee-bps"] === "200",
    "Existing protocol configuration differs from approved QA policy",
  );
}
export function tokenArgs(asset) {
  return asset === "sbtc" ? [Cl.principal(SBTC)] : [];
}
export function exactOutflow(asset, sender, amount) {
  ensure(amount > 0n, "Exact outflow must be positive");
  return asset === "stx"
    ? Pc.principal(sender).willSendEq(amount).ustx()
    : Pc.principal(sender).willSendEq(amount).ft(SBTC, "sbtc-token");
}
export function transfers(events, asset) {
  const type = asset === "stx" ? "stx_asset" : "fungible_token_asset";
  // All monetary events must be transfers of the one permitted asset; reject hidden legs/mints.
  const monetary = events.filter((e) =>
    [
      "stx_asset",
      "stx_lock",
      "fungible_token_asset",
      "non_fungible_token_asset",
    ].includes(e.event_type),
  );
  return monetary.map((event) => {
    ensure(event.event_type === type, "Unexpected asset event");
    const data = event.asset;
    ensure(
      data && typeof data === "object",
      "Missing Hiro asset event payload",
    );
    ensure(
      data.asset_event_type === "transfer" &&
        (asset === "stx" || data.asset_id === `${SBTC}::sbtc-token`),
      "Unexpected monetary event",
    );
    return {
      sender: data.sender,
      recipient: data.recipient,
      amount: String(data.amount),
    };
  });
}
export function verifyTransfers(events, asset, expected) {
  const normalize = (items) => items.map((x) => JSON.stringify(x)).sort();
  ensure(
    JSON.stringify(normalize(transfers(events, asset))) ===
      JSON.stringify(normalize(expected)),
    "Exact transfer legs do not match",
  );
}
export function externalPath(path) {
  ensure(
    isAbsolute(path || ""),
    "An absolute external receipt path is required",
  );
  ensure(
    realpathSync(dirname(path)) === dirname(path),
    "Receipt parent must not be a symlink",
  );
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
  ensure(!gitRoot, "Receipts must be outside every Git repository");
  if (existsSync(path))
    ensure(
      lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
      "Unsafe receipt path",
    );
  return path;
}
export class Journal {
  constructor(path, binding) {
    this.path = externalPath(path);
    this.lock = `${path}.lock`;
    this.fd = openSync(this.lock, "wx", 0o600);
    try {
      this.accountLock = resolve(
        tmpdir(),
        `nayori-service-fee-testnet-${DEPLOYER}.lock`,
      );
      this.accountFd = openSync(this.accountLock, "wx", 0o600);
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
        "Journal belongs to a different reviewed run",
      );
      this.save();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  save() {
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(tmp, this.path);
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
export function callIntent(name, fn, args, sender, outflow) {
  ensure(Object.hasOwn(SOURCE_HASHES, name), "Call contract not allowlisted");
  return {
    kind: "call",
    name,
    fn,
    args: args.map(serializeCV),
    sender,
    fee: String(CALL_FEE),
    ...(outflow
      ? { outflow: { ...outflow, amount: String(outflow.amount) } }
      : {}),
  };
}
export function validateTransaction(tx, id, intent) {
  ensure(
    tx.tx_id === id &&
      tx.canonical === true &&
      tx.is_unanchored === false &&
      tx.tx_status === "success",
    "Transaction is not canonical anchored success",
  );
  ensure(
    tx.sender_address === intent.sender &&
      String(tx.fee_rate) === intent.fee &&
      tx.sponsored === false &&
      tx.post_condition_mode === "deny",
    "Sender or fee mismatch",
  );
  if (intent.kind === "deploy")
    ensure(
      tx.tx_type === "smart_contract" &&
        tx.smart_contract?.contract_id === `${DEPLOYER}.${intent.name}`,
      "Wrong contract deployment",
    );
  else {
    ensure(
      tx.tx_type === "contract_call" &&
        tx.contract_call?.contract_id === `${DEPLOYER}.${intent.name}` &&
        tx.contract_call?.function_name === intent.fn,
      "Wrong contract call",
    );
    ensure(
      JSON.stringify(
        tx.contract_call.function_args.map((a) => a.hex.replace(/^0x/, "")),
      ) === JSON.stringify(intent.args.map((a) => a.replace(/^0x/, ""))),
      "On-chain arguments differ",
    );
  }
}
export async function confirmed(id) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const tx = await get(`/extended/v1/tx/${id}`, true);
    if (tx && tx.tx_status !== "pending") return tx;
    if (attempt === 59) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw Error(
    "Transaction unresolved; preserve journal and inspect, never automatically rebroadcast",
  );
}
export async function send(
  journal,
  label,
  intent,
  build,
  io = { info, nonce, confirmed, broadcast: broadcastTransaction },
) {
  const hash = intentHash(intent);
  let entry = journal.data.transactions[label];
  if (entry)
    ensure(
      entry.intentHash === hash,
      "Recorded intent changed; stop for review",
    );
  else {
    await io.info();
    const n = await io.nonce(intent.sender);
    const transaction = await build(n);
    ensure(
      transaction.chainId === NETWORK_ID &&
        transaction.postConditionMode === PostConditionMode.Deny,
      "Transaction network/post-condition mode mismatch",
    );
    const id = `0x${transaction.txid().replace(/^0x/, "")}`;
    entry = {
      txid: id,
      intent,
      intentHash: hash,
      nonce: String(n),
      state: "broadcast-intent-recorded",
    };
    journal.data.transactions[label] = entry;
    journal.save(); // durable BEFORE external broadcast; ambiguity never causes a second send.
    let result;
    try {
      result = await io.broadcast({ transaction, network: NETWORK });
    } catch {
      throw Error("Broadcast uncertain; txid saved, inspect before resuming");
    }
    ensure(
      !result.error && `0x${result.txid?.replace(/^0x/, "")}` === id,
      "Broadcast rejected or mismatched; inspect saved txid",
    );
    console.log(`${label}: ${id}`);
  }
  const tx = await io.confirmed(entry.txid);
  entry.observedStatus = tx.tx_status;
  entry.observedResult = tx.tx_result?.repr;
  journal.save();
  validateTransaction(tx, entry.txid, intent);
  entry.state = "confirmed";
  entry.blockHeight = tx.block_height;
  entry.burnBlockHeight = tx.burn_block_height;
  entry.result = tx.tx_result?.repr;
  journal.save();
  return tx;
}
export async function call(journal, label, intent, key, args) {
  return send(journal, label, intent, (n) =>
    makeContractCall({
      contractAddress: DEPLOYER,
      contractName: intent.name,
      functionName: intent.fn,
      functionArgs: args,
      senderKey: key,
      network: NETWORK,
      nonce: n,
      fee: BigInt(intent.fee),
      postConditionMode: PostConditionMode.Deny,
      postConditions: intent.outflow
        ? [
            exactOutflow(
              intent.outflow.asset,
              intent.outflow.sender,
              BigInt(intent.outflow.amount),
            ),
          ]
        : [],
    }),
  );
}
export async function deploy(journal, name, key) {
  return send(
    journal,
    `deploy-${name}`,
    {
      kind: "deploy",
      name,
      sourceHash: SOURCE_HASHES[name],
      sender: DEPLOYER,
      fee: String(DEPLOY_FEE),
    },
    (n) =>
      makeContractDeploy({
        contractName: name,
        codeBody: source(name),
        senderKey: key,
        network: NETWORK,
        nonce: n,
        fee: DEPLOY_FEE,
        clarityVersion: 2,
        postConditionMode: PostConditionMode.Deny,
      }),
  );
}
