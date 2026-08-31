// Controlled role-by-role E2E for Nayori autonomous escrow on Stacks testnet.
//
// The client/deployer, evaluator and appeal authority are persistent QA signers from an external
// mode-0600 environment. Providers are generated in memory per new job. Receipts persist public
// principals and transaction evidence only. Delayed scenarios are resumed with the same scenario
// and AUTONOMOUS_ESCROW_E2E_JOB_ID after the recorded burn-height deadline.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
  randomPrivateKey,
} from "@stacks/transactions";
import { STACKS_TESTNET as network } from "@stacks/network";

const API = "https://api.testnet.hiro.so";
const ENV_PATH = process.env.AUTONOMOUS_ESCROW_TESTNET_ENV_PATH || ".env";
const ASSET = (process.env.AUTONOMOUS_ESCROW_E2E_ASSET || "stx").toLowerCase();
const SCENARIO = (
  process.env.AUTONOMOUS_ESCROW_E2E_SCENARIO || "approve-no-appeal"
).toLowerCase();
const JOB_ID_INPUT = process.env.AUTONOMOUS_ESCROW_E2E_JOB_ID;
const RESULT_PATH =
  process.env.AUTONOMOUS_ESCROW_E2E_RESULT_PATH ||
  `/tmp/nayori-autonomous-${ASSET}-${SCENARIO}-testnet.json`;
const SBTC = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";
const [SBTC_ADDRESS, SBTC_NAME] = SBTC.split(".");
const SBTC_ASSET_NAME = "sbtc-token";
const REPUTATION_NAME = "reputation-registry-v3";
const CONTRACT_NAME = ASSET === "stx" ? "agentic-commerce-v5" : "sbtc-commerce-v4";
const APPEAL_WINDOW_BURN_BLOCKS = 3n;
const REVIEW_WINDOW_BURN_BLOCKS = 12n;
const BUDGET = ASSET === "stx" ? 100_000n : 1_000n;
const MIN_ACTOR_BALANCE = 600_000n;
const TRANSFER_FEE = 5_000n;
const CALL_FEE = 5_000n;
const DECISION_APPROVE = 1n;
const DECISION_REJECT = 2n;
const STATUS_SUBMITTED = 2n;
const STATUS_COMPLETED = 3n;
const STATUS_REJECTED = 4n;
const STATUS_TIMEOUT = 6n;
const STATUS_DECISION_PENDING = 7n;
const STATUS_DISPUTED = 8n;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const scenarios = new Set([
  "approve-no-appeal",
  "reject-no-appeal",
  "approve-appeal-resolve-reject",
  "reject-appeal-resolve-approve",
  "approve-appeal-timeout",
  "review-timeout",
]);
const delayedScenarios = new Set([
  "approve-no-appeal",
  "reject-no-appeal",
  "approve-appeal-timeout",
  "review-timeout",
]);

if (process.env.STACKS_NETWORK !== "testnet") {
  throw new Error("Refusing E2E: STACKS_NETWORK must be testnet.");
}
if (process.env.CONFIRM_AUTONOMOUS_ESCROW_TESTNET_E2E !== "yes") {
  throw new Error(
    "Refusing E2E: set CONFIRM_AUTONOMOUS_ESCROW_TESTNET_E2E=yes after reviewing roles, assets, scenarios, fees and post-conditions."
  );
}
if (!new Set(["stx", "sbtc"]).has(ASSET)) {
  throw new Error("AUTONOMOUS_ESCROW_E2E_ASSET must be stx or sbtc");
}
if (!scenarios.has(SCENARIO)) {
  throw new Error(`Unsupported AUTONOMOUS_ESCROW_E2E_SCENARIO: ${SCENARIO}`);
}
if (JOB_ID_INPUT && !/^\d+$/.test(JOB_ID_INPUT)) {
  throw new Error("AUTONOMOUS_ESCROW_E2E_JOB_ID must be an unsigned integer");
}
if (JOB_ID_INPUT && !delayedScenarios.has(SCENARIO)) {
  throw new Error(`${SCENARIO} completes in one run and cannot be resumed`);
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

const env = parseEnv(ENV_PATH);
const clientKey = env.DEPLOYER_PRIVATE_KEY;
const client = env.DEPLOYER_ADDRESS;
const evaluatorKey = env.QA_EVALUATOR_PRIVATE_KEY;
const evaluator = env.QA_EVALUATOR_ADDRESS;
const appealAuthorityKey = env.QA_APPEAL_AUTHORITY_PRIVATE_KEY;
const appealAuthority = env.QA_APPEAL_AUTHORITY_ADDRESS;
if (
  !clientKey ||
  !client ||
  !evaluatorKey ||
  !evaluator ||
  !appealAuthorityKey ||
  !appealAuthority
) {
  throw new Error(
    `Missing deployer/client, QA evaluator or QA appeal-authority signer fields in ${ENV_PATH}`
  );
}
for (const [role, key, address] of [
  ["client", clientKey, client],
  ["evaluator", evaluatorKey, evaluator],
  ["appeal authority", appealAuthorityKey, appealAuthority],
]) {
  if (!address.startsWith("ST") || getAddressFromPrivateKey(key, "testnet") !== address) {
    throw new Error(`${role} signer does not match its Stacks testnet address`);
  }
}
if (new Set([client, evaluator, appealAuthority]).size !== 3) {
  throw new Error("Client, evaluator and appeal authority must be separate principals");
}

const escrowContract = `${client}.${CONTRACT_NAME}`;
const reputationContract = `${client}.${REPUTATION_NAME}`;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const output = {
  schemaVersion: 1,
  classification: "internal-team-operated-not-m2-adoption",
  network: "testnet",
  sourceCommit,
  asset: ASSET,
  scenario: SCENARIO,
  client,
  evaluator,
  appealAuthority,
  escrowContract,
  reputationContract,
  canonicalSbtc: ASSET === "sbtc" ? SBTC : undefined,
  budget: BUDGET.toString(),
  startedAt: new Date().toISOString(),
  actors: {},
  job: {},
  transactions: {},
  checks: [],
  result: "running",
};

function saveReceipt() {
  writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));
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
    explorer: `https://explorer.hiro.so/txid/${txid}?chain=testnet`,
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

async function burnHeight() {
  const { response, data } = await fetchJson(`${API}/v2/info`);
  if (!response.ok) throw new Error("Unable to read Stacks testnet chain info");
  return BigInt(data.burn_block_height);
}

async function stacksTipHeight() {
  const { response, data } = await fetchJson(`${API}/v2/info`);
  if (!response.ok) throw new Error("Unable to read Stacks testnet chain info");
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
    const { response, data } = await fetchJson(`${API}/v2/contracts/source/${client}/${name}`);
    requireCheck(`${name} source is deployed`, response.ok);
    requireCheck(
      `${name} source matches release`,
      String(data.source ?? "").replaceAll("\r\n", "\n") === expected
    );
  }
  const config = responseValue(await read(CONTRACT_NAME, "get-protocol-config"));
  requireCheck("protocol is configured", Boolean(scalar(config.configured)));
  requireCheck("review window is 12 burn blocks", uint(config["review-window"]) === REVIEW_WINDOW_BURN_BLOCKS);
  requireCheck("appeal window is 3 burn blocks", uint(config["appeal-window"]) === APPEAL_WINDOW_BURN_BLOCKS);
  requireCheck("appeal authority is pinned", String(scalar(config["appeal-authority"])) === appealAuthority);
  if (ASSET === "sbtc") {
    requireCheck(
      "canonical PoX-5 testnet sBTC is pinned",
      String(scalar(responseValue(await read(CONTRACT_NAME, "get-payment-token")))) === SBTC
    );
  }
}

async function verifyTerminal(jobId, expectedStatus, expectedDecision) {
  const job = await getJob(jobId);
  requireCheck("terminal status matches scenario", uint(job.status) === expectedStatus, String(uint(job.status)));
  requireCheck("terminal escrow is zero", (await getEscrow(jobId)) === 0n);
  if (expectedDecision !== undefined) {
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
  } else {
    const decision = await read(CONTRACT_NAME, "get-decision", [Cl.uint(jobId)]);
    const reputation = await read(CONTRACT_NAME, "get-reputation-sync", [Cl.uint(jobId)]);
    requireCheck(
      "review timeout has no evaluator decision",
      decision.type === ClarityType.ResponseErr && BigInt(decision.value.value) === 829n
    );
    requireCheck(
      "review timeout does not fabricate a reputation decision",
      reputation.type === ClarityType.ResponseErr && BigInt(reputation.value.value) === 823n
    );
  }
  output.job.status = expectedStatus.toString();
  output.job.escrow = "0";
  output.result = "passed";
  output.completedAt = new Date().toISOString();
  saveReceipt();
}

async function settleDelayedJob(jobId) {
  const job = await getJob(jobId);
  const escrow = await getEscrow(jobId);
  requireCheck("resume job escrow equals exact budget", escrow === BUDGET, String(escrow));

  let deadline;
  let functionName;
  let expectedStatus;
  let expectedDecision;
  if (SCENARIO === "review-timeout") {
    requireCheck("review-timeout job is submitted", uint(job.status) === STATUS_SUBMITTED, String(uint(job.status)));
    deadline = uint(job["review-deadline"]);
    functionName = "settle-review-timeout";
    expectedStatus = STATUS_TIMEOUT;
  } else {
    const decision = await getDecision(jobId);
    if (SCENARIO === "approve-appeal-timeout") {
      requireCheck("appeal-timeout job is disputed", uint(job.status) === STATUS_DISPUTED, String(uint(job.status)));
      deadline = uint(decision["resolution-deadline"]);
      functionName = "settle-appeal-timeout";
      expectedStatus = STATUS_COMPLETED;
      expectedDecision = DECISION_APPROVE;
    } else {
      requireCheck("unappealed job is decision-pending", uint(job.status) === STATUS_DECISION_PENDING, String(uint(job.status)));
      deadline = uint(decision["appeal-deadline"]);
      functionName = "finalize-decision";
      expectedDecision = SCENARIO === "approve-no-appeal" ? DECISION_APPROVE : DECISION_REJECT;
      expectedStatus = expectedDecision === DECISION_APPROVE ? STATUS_COMPLETED : STATUS_REJECTED;
    }
  }

  const currentBurn = await burnHeight();
  output.job = {
    id: jobId.toString(),
    deadlineBurnHeight: deadline.toString(),
    observedBurnHeight: currentBurn.toString(),
    escrow: escrow.toString(),
  };
  if (currentBurn <= deadline) {
    output.result = "awaiting-deadline";
    output.job.blocksRemaining = (deadline - currentBurn + 1n).toString();
    saveReceipt();
    console.log(
      `Awaiting burn height ${deadline + 1n}; ${output.job.blocksRemaining} block(s) remain. No transaction transmitted.`
    );
    return;
  }

  await call({
    functionName,
    functionArgs: [Cl.uint(jobId), ...tokenArguments()],
    senderKey: clientKey,
    senderAddress: client,
    label: functionName,
    postConditions: [settlementPostCondition(escrow)],
  });
  await verifyTerminal(jobId, expectedStatus, expectedDecision);
}

async function createScenarioJob() {
  const providerKey = randomPrivateKey();
  const provider = getAddressFromPrivateKey(providerKey, "testnet");
  requireCheck("all four E2E roles are distinct", new Set([client, provider, evaluator, appealAuthority]).size === 4);
  output.actors = { provider };
  saveReceipt();

  const clientStx = await stxBalance(client);
  requireCheck("client has STX for fees and isolated actors", clientStx >= 4_000_000n, `${clientStx} micro-STX`);
  if (ASSET === "sbtc") {
    const available = await sbtcBalance(client);
    requireCheck("client has testnet sBTC for exact escrow", available >= BUDGET, `${available} atomic units`);
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
      Cl.stringAscii(`Nayori QA ${ASSET} ${SCENARIO}`.slice(0, 256)),
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
      "job pins canonical testnet sBTC",
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

  if (SCENARIO === "review-timeout") {
    output.job.reviewDeadline = uint(submittedJob["review-deadline"]).toString();
    output.result = "awaiting-deadline";
    saveReceipt();
    return;
  }

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

  if (SCENARIO === "approve-no-appeal" || SCENARIO === "reject-no-appeal") {
    output.job.appealDeadline = uint(pendingDecision["appeal-deadline"]).toString();
    output.result = "awaiting-deadline";
    saveReceipt();
    return;
  }

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

  if (SCENARIO === "approve-appeal-timeout") {
    output.result = "awaiting-deadline";
    saveReceipt();
    return;
  }

  const finalDecision =
    SCENARIO === "approve-appeal-resolve-reject" ? DECISION_REJECT : DECISION_APPROVE;
  await call({
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
  await verifyTerminal(
    jobId,
    finalDecision === DECISION_APPROVE ? STATUS_COMPLETED : STATUS_REJECTED,
    finalDecision
  );
}

console.log("Nayori autonomous escrow E2E — Stacks testnet only");
console.log("Asset:", ASSET);
console.log("Scenario:", SCENARIO);
console.log("Classification:", output.classification);
await verifyRelease();

if (JOB_ID_INPUT) {
  await settleDelayedJob(BigInt(JOB_ID_INPUT));
} else {
  await createScenarioJob();
}

if (output.result === "awaiting-deadline") {
  const jobId = output.job.id;
  const deadline =
    output.job.reviewDeadline || output.job.appealDeadline || output.job.resolutionDeadline;
  console.log(`Prepared job ${jobId}; resume ${SCENARIO} after burn height ${deadline}.`);
}
console.log(`Secret-free receipt: ${RESULT_PATH}`);
