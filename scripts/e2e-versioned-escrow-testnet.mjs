// Fail-closed end-to-end validation for Nayori's versioned escrow contracts.
//
// This runner has no mainnet branch. It uses one reviewed client key from an
// external env file and generates provider/evaluator keys only in memory. The
// secret-free receipt contains public principals, state and transaction IDs,
// never private keys.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  Cl,
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
const ENV_PATH = process.env.VERSIONED_ESCROW_TESTNET_ENV_PATH || ".env";
const ASSET = (process.env.VERSIONED_ESCROW_E2E_ASSET || "stx").toLowerCase();
const SCENARIO = (
  process.env.VERSIONED_ESCROW_E2E_SCENARIO || "complete"
).toLowerCase();
const JOB_ID_INPUT = process.env.VERSIONED_ESCROW_E2E_JOB_ID;
const RESULT_PATH =
  process.env.VERSIONED_ESCROW_E2E_RESULT_PATH ||
  `/tmp/nayori-versioned-${ASSET}-${SCENARIO}-testnet.json`;
const SBTC = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";
const [SBTC_ADDRESS, SBTC_NAME] = SBTC.split(".");
const SBTC_ASSET_NAME = "sbtc-token";
const REPUTATION_NAME = "reputation-registry-v3";
const CONTRACT_NAME = ASSET === "stx" ? "agentic-commerce-v3" : "sbtc-commerce-v2";
const BUDGET = ASSET === "stx" ? 100_000n : 1_000n;
const ACTOR_FUNDING = 1_000_000n;
const TRANSFER_FEE = 150_000n;
const CALL_FEE = 200_000n;
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

if (process.env.STACKS_NETWORK !== "testnet") {
  throw new Error(
    "Refusing E2E: set STACKS_NETWORK=testnet explicitly. This runner has no mainnet mode."
  );
}
if (process.env.CONFIRM_VERSIONED_ESCROW_TESTNET_E2E !== "yes") {
  throw new Error(
    "Refusing E2E: set CONFIRM_VERSIONED_ESCROW_TESTNET_E2E=yes after reviewing actors, asset, amounts, fees and post-conditions."
  );
}
if (!new Set(["stx", "sbtc"]).has(ASSET)) {
  throw new Error("VERSIONED_ESCROW_E2E_ASSET must be stx or sbtc");
}
if (!new Set(["complete", "prepare-timeout", "settle-timeout"]).has(SCENARIO)) {
  throw new Error(
    "VERSIONED_ESCROW_E2E_SCENARIO must be complete, prepare-timeout or settle-timeout"
  );
}
if (SCENARIO === "settle-timeout" && !/^\d+$/.test(JOB_ID_INPUT || "")) {
  throw new Error(
    "VERSIONED_ESCROW_E2E_JOB_ID is required for settle-timeout"
  );
}

function loadEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      })
  );
}

const env = loadEnv(ENV_PATH);
const clientKey = env.DEPLOYER_PRIVATE_KEY;
const client = env.DEPLOYER_ADDRESS;
if (!clientKey || !client) {
  throw new Error(`Missing DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS in ${ENV_PATH}`);
}
if (!client.startsWith("ST")) {
  throw new Error(`${ENV_PATH} does not contain a Stacks testnet client`);
}
if (getAddressFromPrivateKey(clientKey, "testnet") !== client) {
  throw new Error(`The private key in ${ENV_PATH} does not match ${client}`);
}

const escrowContract = `${client}.${CONTRACT_NAME}`;
const reputationContract = `${client}.${REPUTATION_NAME}`;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const output = {
  network: "testnet",
  sourceCommit,
  asset: ASSET,
  scenario: SCENARIO,
  client,
  escrowContract,
  reputationContract,
  canonicalSbtc: ASSET === "sbtc" ? SBTC : undefined,
  budget: BUDGET.toString(),
  actorFundingMicroStx: ACTOR_FUNDING.toString(),
  startedAt: new Date().toISOString(),
  contractsVerified: [],
  actors: {},
  job: {},
  transactions: {},
  checks: [],
  result: "running",
};

function saveReceipt() {
  writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));
}

function recordCheck(name, condition, detail = "") {
  output.checks.push({ name, passed: Boolean(condition), detail });
  console.log(`  ${condition ? "✓" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  saveReceipt();
  return condition;
}

function requireCheck(name, condition, detail = "") {
  if (!recordCheck(name, condition, detail)) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

function responseValue(clarityValue) {
  const decoded = cvToValue(clarityValue);
  if (!decoded || typeof decoded !== "object" || !("value" in decoded)) {
    throw new Error(`Expected an ok Clarity response, received ${JSON.stringify(decoded)}`);
  }
  return decoded.value;
}

function scalar(value) {
  if (value && typeof value === "object" && "value" in value) {
    return scalar(value.value);
  }
  return value;
}

function uint(value) {
  return BigInt(scalar(value));
}

function bool(value) {
  return Boolean(scalar(value));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitFor(txid, label) {
  const normalized = txid.startsWith("0x") ? txid : `0x${txid}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { response, data } = await fetchJson(
      `${API}/extended/v1/tx/${normalized}`
    ).catch(() => ({ response: { ok: false }, data: {} }));
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
  if (result.error) {
    throw new Error(`${label} rejected: ${result.reason || result.error}`);
  }
  const txid = result.txid.startsWith("0x") ? result.txid : `0x${result.txid}`;
  console.log(`  → ${label}: ${txid}`);
  const receipt = await waitFor(txid, label);
  output.transactions[label] = {
    txid,
    status: receipt.tx_status,
    result: receipt.tx_result?.repr,
    blockHeight: receipt.block_height,
    explorer: `https://explorer.hiro.so/txid/${txid}?chain=testnet`,
  };
  saveReceipt();
  return receipt;
}

async function call({
  contractName,
  functionName,
  functionArgs,
  senderKey,
  nonce,
  label,
  postConditions = [],
}) {
  const transaction = await makeContractCall({
    contractAddress: client,
    contractName,
    functionName,
    functionArgs,
    senderKey,
    network,
    nonce,
    fee: CALL_FEE,
    postConditionMode: PostConditionMode.Deny,
    postConditions,
  });
  return send(transaction, label);
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
  const { response, data } = await fetchJson(
    `${API}/extended/v1/address/${address}/balances`
  );
  if (!response.ok) throw new Error(`Unable to read balances for ${address}`);
  return data;
}

async function stxBalance(address) {
  return BigInt((await balances(address)).stx?.balance ?? 0);
}

async function sbtcBalance(address) {
  return BigInt(
    (await balances(address)).fungible_tokens?.[`${SBTC}::${SBTC_ASSET_NAME}`]
      ?.balance ?? 0
  );
}

async function assetBalance(address) {
  return ASSET === "stx" ? stxBalance(address) : sbtcBalance(address);
}

function tokenArgument() {
  return Cl.contractPrincipal(SBTC_ADDRESS, SBTC_NAME);
}

function fundingPostCondition(amount) {
  if (ASSET === "stx") {
    return Pc.principal(client).willSendEq(amount).ustx();
  }
  return Pc.principal(client)
    .willSendEq(amount)
    .ft(SBTC, SBTC_ASSET_NAME);
}

function settlementPostCondition(amount) {
  if (ASSET === "stx") {
    return Pc.principal(escrowContract).willSendEq(amount).ustx();
  }
  return Pc.principal(escrowContract)
    .willSendEq(amount)
    .ft(SBTC, SBTC_ASSET_NAME);
}

function settlementArguments(jobId) {
  return ASSET === "stx"
    ? [Cl.uint(jobId)]
    : [Cl.uint(jobId), tokenArgument()];
}

async function verifySources() {
  const names = [
    "sip-010-trait",
    REPUTATION_NAME,
    "agentic-commerce-v3",
    "sbtc-commerce-v2",
  ];
  for (const name of names) {
    const expected = readFileSync(`contracts/${name}.clar`, "utf8");
    const { response, data } = await fetchJson(
      `${API}/v2/contracts/source/${client}/${name}`
    );
    requireCheck(
      `${name} source matches reviewed local file`,
      response.ok && String(data.source ?? "").replaceAll("\r\n", "\n") === expected,
      response.ok ? "exact source" : `HTTP ${response.status}`
    );
    output.contractsVerified.push({
      principal: `${client}.${name}`,
      sha256: createHash("sha256").update(expected).digest("hex"),
    });
  }
  const reviewWindow = uint(responseValue(await read(CONTRACT_NAME, "get-review-window")));
  requireCheck("review window is 144 Bitcoin blocks", reviewWindow === 144n, String(reviewWindow));
  if (ASSET === "sbtc") {
    const paymentToken = String(
      scalar(responseValue(await read(CONTRACT_NAME, "get-payment-token")))
    );
    requireCheck("canonical testnet sBTC is configured", paymentToken === SBTC, paymentToken);
  }
}

async function chainInfo() {
  const { response, data } = await fetchJson(`${API}/v2/info`);
  if (!response.ok) throw new Error("Unable to read Stacks testnet chain info");
  return data;
}

async function fundActor(recipient, nonce, label) {
  return send(
    await makeSTXTokenTransfer({
      recipient,
      amount: ACTOR_FUNDING,
      senderKey: clientKey,
      network,
      nonce,
      fee: TRANSFER_FEE,
    }),
    label
  );
}

async function getJob(jobId) {
  return responseValue(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]));
}

async function getEscrow(jobId) {
  return uint(
    responseValue(await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)]))
  );
}

async function settlePreparedTimeout() {
  const jobId = BigInt(JOB_ID_INPUT);
  const job = await getJob(jobId);
  const status = uint(job.status);
  const reviewDeadline = uint(job["review-deadline"]);
  const info = await chainInfo();
  const burnHeight = BigInt(info.burn_block_height);
  const escrow = await getEscrow(jobId);
  output.job = {
    id: jobId.toString(),
    reviewDeadline: reviewDeadline.toString(),
    burnHeight: burnHeight.toString(),
    escrow: escrow.toString(),
  };
  requireCheck("prepared job is submitted", status === 2n, `status=${status}`);
  requireCheck(
    "Bitcoin review deadline has passed",
    burnHeight > reviewDeadline,
    `burn=${burnHeight}, deadline=${reviewDeadline}`
  );
  requireCheck("prepared escrow is non-zero", escrow > 0n, String(escrow));

  const nonce = await fetchNonce({ address: client, network });
  const receipt = await call({
    contractName: CONTRACT_NAME,
    functionName: "settle-review-timeout",
    functionArgs: settlementArguments(jobId),
    senderKey: clientKey,
    nonce,
    label: "settle-review-timeout",
    postConditions: [settlementPostCondition(escrow)],
  });
  requireCheck(
    "timeout settlement succeeds",
    receipt.tx_status === "success" && receipt.tx_result?.repr === "(ok true)",
    `${receipt.tx_status} ${receipt.tx_result?.repr}`
  );
  const settled = await getJob(jobId);
  requireCheck("timeout state is u6", uint(settled.status) === 6n, String(uint(settled.status)));
  requireCheck("timeout clears escrow", (await getEscrow(jobId)) === 0n);
}

async function createAndRunJob() {
  const providerKey = randomPrivateKey();
  const provider = getAddressFromPrivateKey(providerKey, "testnet");
  const evaluatorKey = randomPrivateKey();
  const evaluator = getAddressFromPrivateKey(evaluatorKey, "testnet");
  output.actors = { provider, evaluator };
  saveReceipt();

  const clientStx = await stxBalance(client);
  requireCheck(
    "client has STX for isolated actors and fees",
    clientStx >= 8_000_000n,
    `${clientStx} micro-STX`
  );
  if (ASSET === "sbtc") {
    const available = await sbtcBalance(client);
    requireCheck(
      "client has sBTC testnet for escrow",
      available >= BUDGET,
      `${available} units available; ${BUDGET} required`
    );
  }

  let clientNonce = await fetchNonce({ address: client, network });
  await fundActor(provider, clientNonce++, "fund-provider-fees");
  await fundActor(evaluator, clientNonce++, "fund-evaluator-fees");

  const info = await chainInfo();
  const expiredAt = BigInt(info.stacks_tip_height) + 500n;
  const created = await call({
    contractName: CONTRACT_NAME,
    functionName: "create-job",
    functionArgs: [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(expiredAt),
      Cl.stringAscii(`Nayori ${ASSET} versioned escrow E2E`),
    ],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "create-job",
  });
  const match = created.tx_result?.repr?.match(/^\(ok u(\d+)\)$/);
  requireCheck("create-job returns a job id", Boolean(match), created.tx_result?.repr);
  const jobId = BigInt(match[1]);
  output.job.id = jobId.toString();

  const budgetSet = await call({
    contractName: CONTRACT_NAME,
    functionName: "set-budget",
    functionArgs: [Cl.uint(jobId), Cl.uint(BUDGET)],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "set-budget",
  });
  requireCheck("set-budget succeeds", budgetSet.tx_result?.repr === "(ok true)");

  const clientBeforeFunding = await assetBalance(client);
  const funded = await call({
    contractName: CONTRACT_NAME,
    functionName: "fund-job",
    functionArgs:
      ASSET === "stx"
        ? [Cl.uint(jobId)]
        : [Cl.uint(jobId), tokenArgument()],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "fund-job",
    postConditions: [fundingPostCondition(BUDGET)],
  });
  requireCheck("fund-job succeeds", funded.tx_result?.repr === "(ok true)");
  requireCheck("escrow equals exact budget", (await getEscrow(jobId)) === BUDGET);
  const clientAfterFunding = await assetBalance(client);
  const expectedClientDebit =
    ASSET === "stx" ? BUDGET + CALL_FEE : BUDGET;
  requireCheck(
    ASSET === "stx"
      ? "client STX debit equals exact budget plus declared transaction fee"
      : "client sBTC outflow equals exact budget",
    clientBeforeFunding - clientAfterFunding === expectedClientDebit,
    `${clientBeforeFunding - clientAfterFunding}; expected ${expectedClientDebit}`
  );
  if (ASSET === "sbtc") {
    const pinned = String(
      scalar(
        responseValue(
          await read(CONTRACT_NAME, "get-job-payment-token", [Cl.uint(jobId)])
        )
      )
    );
    requireCheck("funded job pins canonical sBTC", pinned === SBTC, pinned);
  }

  const assigned = await call({
    contractName: CONTRACT_NAME,
    functionName: "assign-provider",
    functionArgs: [Cl.uint(jobId), Cl.principal(provider)],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "assign-provider",
  });
  requireCheck("assign-provider succeeds", assigned.tx_result?.repr === "(ok true)");

  const submitted = await call({
    contractName: CONTRACT_NAME,
    functionName: "submit-work",
    functionArgs: [
      Cl.uint(jobId),
      Cl.bufferFromAscii(`nayori-${ASSET}-e2e-${jobId}`),
    ],
    senderKey: providerKey,
    nonce: 0,
    label: "submit-work",
  });
  requireCheck("submit-work succeeds", submitted.tx_result?.repr === "(ok true)");
  const submittedJob = await getJob(jobId);
  const submittedAtBurn = uint(submittedJob["submitted-at-burn"]);
  const reviewDeadline = uint(submittedJob["review-deadline"]);
  output.job.submittedAtBurn = submittedAtBurn.toString();
  output.job.reviewDeadline = reviewDeadline.toString();
  requireCheck("job state is submitted u2", uint(submittedJob.status) === 2n);
  requireCheck(
    "deadline is exactly 144 Bitcoin blocks",
    reviewDeadline - submittedAtBurn === 144n,
    `${submittedAtBurn} -> ${reviewDeadline}`
  );

  const earlyTimeout = await call({
    contractName: CONTRACT_NAME,
    functionName: "settle-review-timeout",
    functionArgs: settlementArguments(jobId),
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "settle-review-timeout-too-early",
    postConditions: [settlementPostCondition(BUDGET)],
  });
  const expectedEarlyError = ASSET === "stx" ? "(err u618)" : "(err u718)";
  requireCheck(
    "timeout is rejected before Bitcoin deadline",
    String(earlyTimeout.tx_status).startsWith("abort") &&
      earlyTimeout.tx_result?.repr === expectedEarlyError,
    `${earlyTimeout.tx_status} ${earlyTimeout.tx_result?.repr}`
  );
  requireCheck("early timeout preserves escrow", (await getEscrow(jobId)) === BUDGET);

  if (SCENARIO === "prepare-timeout") {
    output.job.readyAfterBurnBlock = (reviewDeadline + 1n).toString();
    console.log(
      `Prepared job ${jobId}. Resume after burn block ${reviewDeadline} with VERSIONED_ESCROW_E2E_SCENARIO=settle-timeout.`
    );
    return;
  }

  const providerBefore = await assetBalance(provider);
  const completed = await call({
    contractName: CONTRACT_NAME,
    functionName: "complete-job",
    functionArgs: settlementArguments(jobId),
    senderKey: evaluatorKey,
    nonce: 0,
    label: "complete-job",
    postConditions: [settlementPostCondition(BUDGET)],
  });
  requireCheck(
    "complete-job succeeds",
    completed.tx_status === "success" && completed.tx_result?.repr === "(ok true)",
    `${completed.tx_status} ${completed.tx_result?.repr}`
  );
  const completedJob = await getJob(jobId);
  requireCheck("job state is completed u3", uint(completedJob.status) === 3n);
  requireCheck("completion clears escrow", (await getEscrow(jobId)) === 0n);
  const providerAfter = await assetBalance(provider);
  requireCheck(
    `provider receives exact ${ASSET} budget`,
    providerAfter - providerBefore === BUDGET,
    String(providerAfter - providerBefore)
  );

  const sync = responseValue(
    await read(CONTRACT_NAME, "get-reputation-sync", [Cl.uint(jobId)])
  );
  requireCheck("reputation sync is not pending", !bool(sync.pending));
  requireCheck("reputation sync has no error", uint(sync["last-error"]) === 0n);
  const outcome = responseValue(
    await read(REPUTATION_NAME, "get-job-outcome", [
      Cl.contractPrincipal(client, CONTRACT_NAME),
      Cl.uint(jobId),
    ])
  );
  requireCheck("job outcome records completion", bool(outcome.completed));
  requireCheck("job outcome is not disputed", !bool(outcome.disputed));

  const rated = await call({
    contractName: CONTRACT_NAME,
    functionName: "rate-provider",
    functionArgs: [
      Cl.uint(jobId),
      Cl.uint(5),
      Cl.stringAscii(`Nayori ${ASSET} E2E complete`),
    ],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "rate-provider",
  });
  requireCheck("rate-provider succeeds", rated.tx_result?.repr === "(ok true)");
  const hasRated = cvToValue(
    await read(CONTRACT_NAME, "has-rated-job", [
      Cl.uint(jobId),
      Cl.principal(client),
    ])
  );
  requireCheck("client rating is persisted", hasRated === true);
}

console.log("Nayori versioned escrow E2E — testnet only");
console.log("Source:", sourceCommit);
console.log("Asset:", ASSET);
console.log("Scenario:", SCENARIO);
console.log("Escrow:", escrowContract);
console.log("Budget:", BUDGET.toString());
saveReceipt();

try {
  await verifySources();
  if (SCENARIO === "settle-timeout") {
    await settlePreparedTimeout();
  } else {
    await createAndRunJob();
  }
  const failed = output.checks.filter(({ passed }) => !passed).length;
  output.result = failed === 0 ? "pass" : "fail";
  output.completedAt = new Date().toISOString();
  saveReceipt();
  console.log(
    `E2E ${output.result.toUpperCase()}: ${output.checks.length - failed} passed, ${failed} failed`
  );
  console.log(`Secret-free receipt: ${RESULT_PATH}`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (error) {
  output.result = "error";
  output.error = error instanceof Error ? error.message : String(error);
  output.completedAt = new Date().toISOString();
  saveReceipt();
  throw error;
}
