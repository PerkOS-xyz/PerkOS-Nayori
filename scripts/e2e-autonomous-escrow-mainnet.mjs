// Controlled role-by-role E2E for Nayori autonomous escrow on Stacks mainnet.
//
// The client/deployer, provider, evaluator and human appeal authority are persistent internal
// signers stored in separate external mode-0600 environments. Receipts contain public principals
// and transaction evidence only. This runner intentionally supports only immediate appealed
// canaries so no mainnet escrow is left pending for the 144-burn-block appeal window.
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import {
  Cl,
  ClarityType,
  Pc,
  PostConditionMode,
  broadcastTransaction,
  cvToValue,
  fetchCallReadOnlyFunction,
  fetchNonce,
  getAddressFromPrivateKey,
  makeContractCall,
  makeSTXTokenTransfer,
} from "@stacks/transactions";
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const EXPECTED_DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const CLIENT_ENV_PATH = process.env.AUTONOMOUS_ESCROW_MAINNET_ENV_PATH;
const ACTOR_ENV_PATH = process.env.AUTONOMOUS_ESCROW_MAINNET_ACTOR_ENV_PATH;
const APPEAL_ENV_PATH = process.env.AUTONOMOUS_ESCROW_MAINNET_APPEAL_ENV_PATH;
const ASSET = (process.env.AUTONOMOUS_ESCROW_MAINNET_E2E_ASSET || "stx").toLowerCase();
const SCENARIO = (
  process.env.AUTONOMOUS_ESCROW_MAINNET_E2E_SCENARIO ||
  "approve-appeal-resolve-reject"
).toLowerCase();
const RESULT_PATH =
  process.env.AUTONOMOUS_ESCROW_MAINNET_E2E_RESULT_PATH ||
  `/tmp/nayori-autonomous-${ASSET}-${SCENARIO}-mainnet.json`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const [SBTC_ADDRESS, SBTC_NAME] = SBTC.split(".");
const SBTC_ASSET_NAME = "sbtc-token";
const REPUTATION_NAME = "reputation-registry-v3";
const CONTRACT_NAME = ASSET === "stx" ? "agentic-commerce-v5" : "sbtc-commerce-v4";
const APPEAL_WINDOW_BURN_BLOCKS = 144n;
const REVIEW_WINDOW_BURN_BLOCKS = 12n;
const BUDGET = ASSET === "stx" ? 100_000n : 100n;
const MIN_ACTOR_BALANCE = 1_000_000n;
const TRANSFER_FEE = 150_000n;
const CALL_FEE = 200_000n;
const DECISION_APPROVE = 1n;
const DECISION_REJECT = 2n;
const STATUS_COMPLETED = 3n;
const STATUS_REJECTED = 4n;
const STATUS_SUBMITTED = 2n;
const STATUS_DECISION_PENDING = 7n;
const STATUS_DISPUTED = 8n;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const scenarios = new Set([
  "approve-appeal-resolve-reject",
  "reject-appeal-resolve-approve",
]);
const EXPECTED_SOURCE_HASHES = Object.freeze({
  "sip-010-trait": "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  "reputation-registry-v3": "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  "agentic-commerce-v5": "e5bf374aaf514903205a9f069a794a4c34eb0f1100fb144c13ccd397e80664e7",
  "sbtc-commerce-v4": "4ab54889b8f08835f2942bd8f0b9add4d6950b0307bcbf6f8691c0a0b4d8debc",
});

if (process.env.STACKS_NETWORK !== "mainnet") {
  throw new Error("Refusing E2E: STACKS_NETWORK must be mainnet.");
}
if (
  process.env.CONFIRM_AUTONOMOUS_ESCROW_MAINNET_E2E !==
  "execute-controlled-v5-v4-mainnet"
) {
  throw new Error(
    "Refusing E2E: set CONFIRM_AUTONOMOUS_ESCROW_MAINNET_E2E=execute-controlled-v5-v4-mainnet after reviewing roles, assets, scenarios, fees and post-conditions."
  );
}
if (!new Set(["stx", "sbtc"]).has(ASSET)) {
  throw new Error("AUTONOMOUS_ESCROW_MAINNET_E2E_ASSET must be stx or sbtc");
}
if (!scenarios.has(SCENARIO)) {
  throw new Error(`Unsupported AUTONOMOUS_ESCROW_MAINNET_E2E_SCENARIO: ${SCENARIO}`);
}
if (!isAbsolute(RESULT_PATH)) {
  throw new Error("AUTONOMOUS_ESCROW_MAINNET_E2E_RESULT_PATH must be absolute");
}
if (resolve(RESULT_PATH).startsWith(`${resolve(process.cwd())}/`)) {
  throw new Error("AUTONOMOUS_ESCROW_MAINNET_E2E_RESULT_PATH must be outside Git");
}

function requireExternalSecretFile(path, label) {
  if (!path || !isAbsolute(path)) {
    throw new Error(`${label} must be an explicit absolute path outside Git`);
  }
  if (resolve(path).startsWith(`${resolve(process.cwd())}/`)) {
    throw new Error(`${label} must be outside the Git worktree`);
  }
  const permissions = statSync(path).mode & 0o777;
  if ((permissions & 0o077) !== 0) {
    throw new Error(`${label} must not be readable or writable by group/other`);
  }
}

function parseEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      })
  );
}

requireExternalSecretFile(CLIENT_ENV_PATH, "AUTONOMOUS_ESCROW_MAINNET_ENV_PATH");
requireExternalSecretFile(ACTOR_ENV_PATH, "AUTONOMOUS_ESCROW_MAINNET_ACTOR_ENV_PATH");
requireExternalSecretFile(APPEAL_ENV_PATH, "AUTONOMOUS_ESCROW_MAINNET_APPEAL_ENV_PATH");

const clientEnv = parseEnv(CLIENT_ENV_PATH);
const actorEnv = parseEnv(ACTOR_ENV_PATH);
const appealEnv = parseEnv(APPEAL_ENV_PATH);
const clientKey = clientEnv.DEPLOYER_PRIVATE_KEY;
const client = clientEnv.DEPLOYER_ADDRESS;
const providerKey = actorEnv.PROVIDER_PRIVATE_KEY;
const evaluatorKey = actorEnv.EVALUATOR_PRIVATE_KEY;
const appealAuthorityKey = appealEnv.MAINNET_APPEAL_AUTHORITY_PRIVATE_KEY;
const provider = providerKey && getAddressFromPrivateKey(providerKey, "mainnet");
const evaluator = evaluatorKey && getAddressFromPrivateKey(evaluatorKey, "mainnet");
const appealAuthority = appealEnv.MAINNET_APPEAL_AUTHORITY_ADDRESS;
if (
  !clientKey ||
  !client ||
  !providerKey ||
  !provider ||
  !evaluatorKey ||
  !evaluator ||
  !appealAuthorityKey ||
  !appealAuthority
) {
  throw new Error(
    "Missing client, provider, evaluator or appeal-authority signer fields"
  );
}
if (client !== EXPECTED_DEPLOYER) {
  throw new Error(`Mainnet client must be the reviewed deployer ${EXPECTED_DEPLOYER}`);
}
for (const [role, key, address] of [
  ["client", clientKey, client],
  ["provider", providerKey, provider],
  ["evaluator", evaluatorKey, evaluator],
  ["appeal authority", appealAuthorityKey, appealAuthority],
]) {
  if (!address.startsWith("SP") || getAddressFromPrivateKey(key, "mainnet") !== address) {
    throw new Error(`${role} signer does not match its Stacks mainnet address`);
  }
}
if (new Set([client, provider, evaluator, appealAuthority]).size !== 4) {
  throw new Error("Client, provider, evaluator and appeal authority must be separate principals");
}
if (process.env.CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOYER !== client) {
  throw new Error(`Set CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOYER=${client}`);
}
if (
  process.env.CONFIRM_AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY !== appealAuthority
) {
  throw new Error(
    `Set CONFIRM_AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY=${appealAuthority}`
  );
}

const escrowContract = `${client}.${CONTRACT_NAME}`;
const reputationContract = `${client}.${REPUTATION_NAME}`;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const output = {
  schemaVersion: 1,
  classification: "internal-team-operated-not-m2-adoption",
  network: "mainnet",
  sourceCommit,
  asset: ASSET,
  scenario: SCENARIO,
  client,
  provider,
  evaluator,
  appealAuthority,
  escrowContract,
  reputationContract,
  canonicalSbtc: ASSET === "sbtc" ? SBTC : undefined,
  budget: BUDGET.toString(),
  sourceHashes: EXPECTED_SOURCE_HASHES,
  startedAt: new Date().toISOString(),
  actors: {},
  job: {},
  transactions: {},
  checks: [],
  result: "running",
};

function saveReceipt() {
  writeFileSync(RESULT_PATH, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
}

function recordCheck(name, passed, detail = "") {
  output.checks.push({ name, passed: Boolean(passed), detail });
  console.log(`  ${passed ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  saveReceipt();
  return Boolean(passed);
}

function requireCheck(name, passed, detail = "") {
  if (!recordCheck(name, passed, detail)) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

function scalar(value) {
  if (value && typeof value === "object" && "value" in value) return scalar(value.value);
  return value;
}

function responseValue(value) {
  if (value?.type !== ClarityType.ResponseOk) {
    throw new Error(`Expected an ok Clarity response, received ${JSON.stringify(cvToValue(value))}`);
  }
  const decoded = cvToValue(value);
  if (!decoded || typeof decoded !== "object" || !("value" in decoded)) {
    throw new Error(`Expected an ok Clarity response, received ${JSON.stringify(decoded)}`);
  }
  return decoded.value;
}

function uint(value) {
  return BigInt(scalar(value));
}

function digest(label) {
  return Cl.bufferFromHex(createHash("sha256").update(label).digest("hex"));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitFor(txid, label) {
  const normalized = txid.startsWith("0x") ? txid : `0x${txid}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { response, data } = await fetchJson(`${API}/extended/v1/tx/${normalized}`).catch(
      () => ({ response: { ok: false }, data: {} })
    );
    if (response.ok && data.tx_status && data.tx_status !== "pending") {
      console.log(`  ↳ ${label}: ${data.tx_status} ${data.tx_result?.repr || ""}`);
      return data;
    }
    await sleep(10_000);
  }
  throw new Error(`${label} confirmation timed out`);
}

async function send(transaction, label) {
  const result = await broadcastTransaction({ transaction, network });
  if (result.error) throw new Error(`${label} rejected: ${result.reason || result.error}`);
  const txid = result.txid.startsWith("0x") ? result.txid : `0x${result.txid}`;
  console.log(`  → ${label}: ${txid}`);
  const receipt = await waitFor(txid, label);
  output.transactions[label] = {
    txid,
    status: receipt.tx_status,
    result: receipt.tx_result?.repr,
    blockHeight: receipt.block_height,
    burnBlockHeight: receipt.burn_block_height,
    explorer: `https://explorer.hiro.so/txid/${txid}?chain=mainnet`,
  };
  saveReceipt();
  return receipt;
}

async function call({
  functionName,
  functionArgs,
  senderKey,
  senderAddress,
  label,
  postConditions = [],
  expectedResult = "(ok true)",
}) {
  const nonce = await fetchNonce({ address: senderAddress, network });
  const transaction = await makeContractCall({
    contractAddress: client,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderKey,
    network,
    nonce,
    fee: CALL_FEE,
    postConditionMode: PostConditionMode.Deny,
    postConditions,
  });
  const receipt = await send(transaction, label);
  const matchesResult =
    expectedResult === "job-id"
      ? /^\(ok u\d+\)$/.test(receipt.tx_result?.repr ?? "")
      : receipt.tx_result?.repr === expectedResult;
  requireCheck(
    `${label} succeeds`,
    receipt.tx_status === "success" && matchesResult,
    `${receipt.tx_status} ${receipt.tx_result?.repr}`
  );
  return receipt;
}

async function read(contractName, functionName, functionArgs = []) {
  return fetchCallReadOnlyFunction({
    contractAddress: client,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: client,
  });
}

async function balances(address) {
  const { response, data } = await fetchJson(`${API}/extended/v1/address/${address}/balances`);
  if (!response.ok) throw new Error(`Unable to read balances for ${address}`);
  return data;
}

async function stxBalance(address) {
  return BigInt((await balances(address)).stx?.balance ?? 0);
}

async function sbtcBalance(address) {
  return BigInt(
    (await balances(address)).fungible_tokens?.[`${SBTC}::${SBTC_ASSET_NAME}`]?.balance ?? 0
  );
}

async function assetBalance(address) {
  return ASSET === "stx" ? stxBalance(address) : sbtcBalance(address);
}

async function stacksTipHeight() {
  const { response, data } = await fetchJson(`${API}/v2/info`);
  if (!response.ok) throw new Error("Unable to read Stacks mainnet chain info");
  return BigInt(data.stacks_tip_height);
}

async function getJob(jobId) {
  return responseValue(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]));
}

async function getDecision(jobId) {
  return responseValue(await read(CONTRACT_NAME, "get-decision", [Cl.uint(jobId)]));
}

async function getEscrow(jobId) {
  return uint(responseValue(await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)])));
}

function tokenArgument() {
  return Cl.contractPrincipal(SBTC_ADDRESS, SBTC_NAME);
}

function tokenArguments() {
  return ASSET === "sbtc" ? [tokenArgument()] : [];
}

function fundingPostCondition(amount) {
  return ASSET === "stx"
    ? Pc.principal(client).willSendEq(amount).ustx()
    : Pc.principal(client).willSendEq(amount).ft(SBTC, SBTC_ASSET_NAME);
}

function settlementPostCondition(amount) {
  return ASSET === "stx"
    ? Pc.principal(escrowContract).willSendEq(amount).ustx()
    : Pc.principal(escrowContract).willSendEq(amount).ft(SBTC, SBTC_ASSET_NAME);
}

async function ensureActorFunding(address, label) {
  const balance = await stxBalance(address);
  if (balance >= MIN_ACTOR_BALANCE) {
    recordCheck(`${label} has fee balance`, true, `${balance} micro-STX`);
    return;
  }
  const amount = MIN_ACTOR_BALANCE - balance;
  const nonce = await fetchNonce({ address: client, network });
  const transaction = await makeSTXTokenTransfer({
    recipient: address,
    amount,
    senderKey: clientKey,
    network,
    nonce,
    fee: TRANSFER_FEE,
    memo: `nayori-${label}`.slice(0, 34),
  });
  const receipt = await send(transaction, `fund-${label}`);
  requireCheck(`fund-${label} succeeds`, receipt.tx_status === "success", receipt.tx_status);
}

async function verifyRelease() {
  for (const name of ["sip-010-trait", REPUTATION_NAME, "agentic-commerce-v5", "sbtc-commerce-v4"]) {
    const expected = readFileSync(`contracts/${name}.clar`, "utf8");
    const localHash = createHash("sha256").update(expected).digest("hex");
    requireCheck(`${name} frozen source hash`, localHash === EXPECTED_SOURCE_HASHES[name], localHash);
    const { response, data } = await fetchJson(`${API}/v2/contracts/source/${client}/${name}`);
    requireCheck(`${name} source is deployed`, response.ok);
    requireCheck(
      `${name} source matches release`,
      String(data.source ?? "").replaceAll("\r\n", "\n") ===
        expected.replaceAll("\r\n", "\n")
    );
  }
  const config = responseValue(await read(CONTRACT_NAME, "get-protocol-config"));
  requireCheck("protocol is configured", Boolean(scalar(config.configured)));
  requireCheck("review window is 12 burn blocks", uint(config["review-window"]) === REVIEW_WINDOW_BURN_BLOCKS);
  requireCheck("appeal window is 144 burn blocks", uint(config["appeal-window"]) === APPEAL_WINDOW_BURN_BLOCKS);
  requireCheck("appeal authority is pinned", String(scalar(config["appeal-authority"])) === appealAuthority);
  if (ASSET === "sbtc") {
    requireCheck(
      "canonical PoX-5 mainnet sBTC is pinned",
      String(scalar(responseValue(await read(CONTRACT_NAME, "get-payment-token")))) === SBTC
    );
  }
  const allowed = cvToValue(
    await read(REPUTATION_NAME, "is-registered-caller", [
      Cl.contractPrincipal(client, CONTRACT_NAME),
    ])
  );
  requireCheck(`${CONTRACT_NAME} is authorized for reputation`, allowed === true);
}

async function verifyTerminal(jobId, expectedStatus, expectedDecision) {
  const job = await getJob(jobId);
  requireCheck("terminal status matches scenario", uint(job.status) === expectedStatus, String(uint(job.status)));
  requireCheck("terminal escrow is zero", (await getEscrow(jobId)) === 0n);
  const decision = await getDecision(jobId);
  requireCheck(
    "final decision matches scenario",
    uint(decision["final-decision"]) === expectedDecision,
    String(uint(decision["final-decision"]))
  );
  const reputation = responseValue(
    await read(CONTRACT_NAME, "get-reputation-sync", [Cl.uint(jobId)])
  );
  requireCheck("reputation update is not pending", scalar(reputation.pending) === false);
  requireCheck("reputation update has no error", uint(reputation["last-error"]) === 0n);
  const outcome = responseValue(
    await read(REPUTATION_NAME, "get-job-outcome", [
      Cl.contractPrincipal(client, CONTRACT_NAME),
      Cl.uint(jobId),
    ])
  );
  requireCheck(
    "reputation outcome matches final decision",
    expectedDecision === DECISION_APPROVE
      ? scalar(outcome.completed) === true && scalar(outcome.disputed) === false
      : scalar(outcome.completed) === false && scalar(outcome.disputed) === true
  );
  output.job.status = expectedStatus.toString();
  output.job.escrow = "0";
  output.result = "passed";
  output.completedAt = new Date().toISOString();
  saveReceipt();
}

async function createScenarioJob() {
  requireCheck("all four E2E roles are distinct", new Set([client, provider, evaluator, appealAuthority]).size === 4);
  output.actors = {
    provider,
    evaluator,
    appealAuthority,
    classification: "internal-team-operated-not-m2-adoption",
  };
  saveReceipt();

  const clientStx = await stxBalance(client);
  requireCheck("client has STX for fees and isolated actors", clientStx >= 8_000_000n, `${clientStx} micro-STX`);
  if (ASSET === "sbtc") {
    const available = await sbtcBalance(client);
    requireCheck("client has mainnet sBTC for exact escrow", available >= BUDGET, `${available} atomic units`);
  }

  await ensureActorFunding(provider, "provider");
  await ensureActorFunding(evaluator, "evaluator");
  await ensureActorFunding(appealAuthority, "appeal-authority");

  const expiredAt = (await stacksTipHeight()) + 500n;
  const created = await call({
    functionName: "create-job",
    functionArgs: [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(expiredAt),
      Cl.stringAscii(`Nayori controlled mainnet ${ASSET} ${SCENARIO}`.slice(0, 256)),
    ],
    senderKey: clientKey,
    senderAddress: client,
    label: "create-job",
    expectedResult: "job-id",
  });
  const match = created.tx_result?.repr?.match(/^\(ok u(\d+)\)$/);
  requireCheck("create-job returns a job id", Boolean(match), created.tx_result?.repr);
  const jobId = BigInt(match[1]);
  output.job.id = jobId.toString();
  saveReceipt();

  await call({
    functionName: "set-budget",
    functionArgs: [Cl.uint(jobId), Cl.uint(BUDGET)],
    senderKey: clientKey,
    senderAddress: client,
    label: "set-budget",
  });
  await call({
    functionName: "fund-job",
    functionArgs: [Cl.uint(jobId), ...tokenArguments()],
    senderKey: clientKey,
    senderAddress: client,
    label: "fund-job",
    postConditions: [fundingPostCondition(BUDGET)],
  });
  requireCheck("escrow equals exact budget", (await getEscrow(jobId)) === BUDGET);
  if (ASSET === "sbtc") {
    requireCheck(
      "job pins canonical mainnet sBTC",
      String(
        scalar(responseValue(await read(CONTRACT_NAME, "get-job-payment-token", [Cl.uint(jobId)])))
      ) === SBTC
    );
  }

  await call({
    functionName: "assign-provider",
    functionArgs: [Cl.uint(jobId), Cl.principal(provider)],
    senderKey: clientKey,
    senderAddress: client,
    label: "assign-provider",
  });
  await call({
    functionName: "submit-work",
    functionArgs: [Cl.uint(jobId), digest(`deliverable:${ASSET}:${SCENARIO}:${jobId}`)],
    senderKey: providerKey,
    senderAddress: provider,
    label: "submit-work",
  });
  const submittedJob = await getJob(jobId);
  requireCheck("provider submission reaches u2", uint(submittedJob.status) === STATUS_SUBMITTED);
  requireCheck("submission preserves exact escrow", (await getEscrow(jobId)) === BUDGET);

  const originalDecision = SCENARIO.startsWith("reject") ? DECISION_REJECT : DECISION_APPROVE;
  await call({
    functionName: "record-decision",
    functionArgs: [
      Cl.uint(jobId),
      Cl.uint(originalDecision),
      digest(`evidence:${ASSET}:${SCENARIO}:${jobId}`),
      digest(`explanation:${ASSET}:${SCENARIO}:${jobId}`),
    ],
    senderKey: evaluatorKey,
    senderAddress: evaluator,
    label: "record-decision",
  });
  const pendingJob = await getJob(jobId);
  requireCheck("decision reaches u7 without settling", uint(pendingJob.status) === STATUS_DECISION_PENDING);
  requireCheck("decision preserves exact escrow", (await getEscrow(jobId)) === BUDGET);
  const pendingDecision = await getDecision(jobId);
  requireCheck("on-chain original decision matches", uint(pendingDecision["original-decision"]) === originalDecision);

  const appellantIsClient = originalDecision === DECISION_APPROVE;
  await call({
    functionName: "appeal-decision",
    functionArgs: [Cl.uint(jobId), digest(`appeal:${ASSET}:${SCENARIO}:${jobId}`)],
    senderKey: appellantIsClient ? clientKey : providerKey,
    senderAddress: appellantIsClient ? client : provider,
    label: "appeal-decision",
  });
  const disputedJob = await getJob(jobId);
  const disputedDecision = await getDecision(jobId);
  requireCheck("appeal reaches u8 without settling", uint(disputedJob.status) === STATUS_DISPUTED);
  requireCheck("appeal preserves exact escrow", (await getEscrow(jobId)) === BUDGET);
  output.job.resolutionDeadline = uint(disputedDecision["resolution-deadline"]).toString();

  const finalDecision =
    SCENARIO === "approve-appeal-resolve-reject" ? DECISION_REJECT : DECISION_APPROVE;
  const recipient = finalDecision === DECISION_APPROVE ? provider : client;
  const recipientBefore = await assetBalance(recipient);
  const resolution = await call({
    functionName: "resolve-appeal",
    functionArgs: [
      Cl.uint(jobId),
      Cl.uint(finalDecision),
      digest(`resolution:${ASSET}:${SCENARIO}:${jobId}`),
      ...tokenArguments(),
    ],
    senderKey: appealAuthorityKey,
    senderAddress: appealAuthority,
    label: "resolve-appeal",
    postConditions: [settlementPostCondition(BUDGET)],
  });
  const recipientAfter = await assetBalance(recipient);
  requireCheck(
    "terminal recipient receives the exact escrow amount",
    recipientAfter - recipientBefore === BUDGET,
    `${recipientAfter - recipientBefore} received`
  );
  const transfers = (resolution.events ?? []).filter((event) => {
    const asset = event.asset;
    return (
      asset?.asset_event_type === "transfer" &&
      asset.sender === escrowContract &&
      asset.recipient === recipient &&
      BigInt(asset.amount ?? 0) === BUDGET &&
      (ASSET === "stx"
        ? event.event_type === "stx_asset"
        : event.event_type === "fungible_token_asset" &&
          asset.asset_id === `${SBTC}::${SBTC_ASSET_NAME}`)
    );
  });
  requireCheck("resolution emits exactly one escrow transfer", transfers.length === 1);
  await verifyTerminal(
    jobId,
    finalDecision === DECISION_APPROVE ? STATUS_COMPLETED : STATUS_REJECTED,
    finalDecision
  );
}

console.log("Nayori autonomous escrow E2E — Stacks mainnet only");
console.log("Asset:", ASSET);
console.log("Scenario:", SCENARIO);
console.log("Classification:", output.classification);
try {
  await verifyRelease();
  await createScenarioJob();
  console.log(`E2E PASS: ${output.checks.length}/${output.checks.length}`);
} catch (error) {
  output.result = "error";
  output.error = error instanceof Error ? error.message : String(error);
  output.completedAt = new Date().toISOString();
  saveReceipt();
  throw error;
}
console.log(`Secret-free receipt: ${RESULT_PATH}`);
