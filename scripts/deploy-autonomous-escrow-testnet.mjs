// Deploy and configure Nayori's autonomous-decision escrow generation on Stacks testnet.
//
// The runner has no mainnet branch. It accepts only the approved QA appeal window, verifies
// existing source byte-for-byte, and refuses to read signer material until both explicit guards
// pass. Its receipt contains only public addresses, transaction IDs and verification results.
import { readFileSync, writeFileSync } from "node:fs";
import {
  Cl,
  ClarityType,
  PostConditionMode,
  broadcastTransaction,
  cvToValue,
  fetchCallReadOnlyFunction,
  fetchNonce,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
} from "@stacks/transactions";
import { STACKS_TESTNET as network } from "@stacks/network";

const API = "https://api.testnet.hiro.so";
const ENV_PATH = process.env.AUTONOMOUS_ESCROW_TESTNET_ENV_PATH || ".env";
const RESULT_PATH =
  process.env.AUTONOMOUS_ESCROW_TESTNET_RESULT_PATH ||
  "/tmp/nayori-autonomous-escrow-testnet.json";
const SBTC_TESTNET = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token";
const APPEAL_WINDOW_BURN_BLOCKS = 3n;
const REVIEW_WINDOW_BURN_BLOCKS = 12n;
const DEPLOY_FEE = 1_000_000n;
const CALL_FEE = 200_000n;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const CONTRACTS = [
  { name: "sip-010-trait", file: "sip-010-trait.clar" },
  { name: "reputation-registry-v3", file: "reputation-registry-v3.clar" },
  { name: "agentic-commerce-v5", file: "agentic-commerce-v5.clar" },
  { name: "sbtc-commerce-v4", file: "sbtc-commerce-v4.clar" },
];
const OWNED_CONTRACTS = CONTRACTS.filter(({ name }) => name !== "sip-010-trait");

if (process.env.STACKS_NETWORK !== "testnet") {
  throw new Error("Refusing deployment: STACKS_NETWORK must be testnet.");
}
if (process.env.CONFIRM_AUTONOMOUS_ESCROW_TESTNET_DEPLOY !== "yes") {
  throw new Error(
    "Refusing deployment: set CONFIRM_AUTONOMOUS_ESCROW_TESTNET_DEPLOY=yes after reviewing sources, roles and maximum fees."
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
          line.slice(separator + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      })
  );
}

const env = loadEnv(ENV_PATH);
const senderKey = env.DEPLOYER_PRIVATE_KEY;
const deployer = env.DEPLOYER_ADDRESS;
const appealAuthority = env.QA_APPEAL_AUTHORITY_ADDRESS;
if (!senderKey || !deployer || !appealAuthority) {
  throw new Error(
    `Missing DEPLOYER_PRIVATE_KEY, DEPLOYER_ADDRESS or QA_APPEAL_AUTHORITY_ADDRESS in ${ENV_PATH}`
  );
}
if (!deployer.startsWith("ST") || !appealAuthority.startsWith("ST")) {
  throw new Error(`${ENV_PATH} must contain Stacks testnet principals`);
}
if (getAddressFromPrivateKey(senderKey, "testnet") !== deployer) {
  throw new Error(`The private key in ${ENV_PATH} does not match ${deployer}`);
}
if (appealAuthority === deployer) {
  throw new Error("The QA appeal authority must be separate from the deployer/owner");
}

const sources = new Map(
  CONTRACTS.map(({ name, file }) => [name, readFileSync(`contracts/${file}`, "utf8")])
);
const output = {
  schemaVersion: 1,
  network: "testnet",
  deployer,
  appealAuthority,
  appealWindowBurnBlocks: APPEAL_WINDOW_BURN_BLOCKS.toString(),
  reviewWindowBurnBlocks: REVIEW_WINDOW_BURN_BLOCKS.toString(),
  canonicalSbtc: SBTC_TESTNET,
  contracts: Object.fromEntries(CONTRACTS.map(({ name }) => [name, `${deployer}.${name}`])),
  existingContracts: [],
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
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
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

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function inspectSource(name, expectedSource) {
  const { response, data } = await fetchJson(`${API}/v2/contracts/source/${deployer}/${name}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Unable to inspect ${deployer}.${name}: HTTP ${response.status}`);
  if (String(data.source ?? "").replaceAll("\r\n", "\n") !== expectedSource) {
    throw new Error(`${deployer}.${name} exists but differs from the reviewed source`);
  }
  output.existingContracts.push(name);
  return true;
}

async function accountBalance() {
  const { response, data } = await fetchJson(`${API}/extended/v1/address/${deployer}/balances`);
  if (!response.ok) throw new Error("Unable to read the testnet deployer balance");
  return BigInt(data.stx?.balance ?? 0);
}

async function transactionStatus(txid) {
  const { response, data } = await fetchJson(`${API}/extended/v1/tx/${txid}`);
  return response.ok ? data : { tx_status: "pending" };
}

async function waitFor(txid, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await transactionStatus(txid).catch(() => ({ tx_status: "pending" }));
    if (receipt.tx_status === "success") {
      console.log(`  ✓ ${label} confirmed`);
      return receipt;
    }
    if (String(receipt.tx_status).startsWith("abort") || receipt.tx_status === "dropped_replace_by_fee") {
      throw new Error(`${label} failed with ${receipt.tx_status}: ${receipt.tx_result?.repr ?? ""}`);
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
  };
  saveReceipt();
  return receipt;
}

async function deployContract(name, nonce) {
  const transaction = await makeContractDeploy({
    contractName: name,
    codeBody: sources.get(name),
    senderKey,
    network,
    nonce,
    fee: DEPLOY_FEE,
    clarityVersion: 2,
    postConditionMode: PostConditionMode.Deny,
  });
  await send(transaction, `deploy-${name}`);
}

async function callContract(contractName, functionName, functionArgs, nonce, label) {
  const transaction = await makeContractCall({
    contractAddress: deployer,
    contractName,
    functionName,
    functionArgs,
    senderKey,
    network,
    nonce,
    fee: CALL_FEE,
    postConditionMode: PostConditionMode.Deny,
  });
  const receipt = await send(transaction, label);
  recordCheck(`${label} returned ok true`, receipt.tx_result?.repr === "(ok true)", receipt.tx_result?.repr);
}

async function read(contractName, functionName, functionArgs = []) {
  return fetchCallReadOnlyFunction({
    contractAddress: deployer,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: deployer,
  });
}

console.log("Nayori autonomous escrow deployment — Stacks testnet only");
console.log("Deployer:", deployer);
console.log("Appeal authority:", appealAuthority);

const existing = new Map();
for (const { name } of CONTRACTS) {
  existing.set(name, await inspectSource(name, sources.get(name)));
}

const missingCount = [...existing.values()].filter((value) => !value).length;
const maximumRequired = BigInt(missingCount) * DEPLOY_FEE + 5n * CALL_FEE;
const balance = await accountBalance();
console.log(`Balance: ${Number(balance) / 1e6} STX`);
console.log(`Maximum remaining fees: ${Number(maximumRequired) / 1e6} STX`);
recordCheck("deployer has the reviewed maximum fee balance", balance >= maximumRequired);

let nonce = await fetchNonce({ address: deployer, network });
for (const { name } of CONTRACTS) {
  if (existing.get(name)) {
    console.log(`  ↷ ${name} already exists with reviewed source`);
  } else {
    await deployContract(name, nonce++);
  }
}

for (const contractName of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const config = responseValue(await read(contractName, "get-protocol-config"));
  if (!Boolean(scalar(config.configured))) {
    await callContract(
      contractName,
      "initialize-protocol",
      [Cl.uint(APPEAL_WINDOW_BURN_BLOCKS), Cl.principal(appealAuthority)],
      nonce++,
      `initialize-${contractName}`
    );
  }
}

const [sbtcAddress, sbtcName] = SBTC_TESTNET.split(".");
const configuredToken = String(scalar(responseValue(await read("sbtc-commerce-v4", "get-payment-token"))));
if (configuredToken !== SBTC_TESTNET) {
  await callContract(
    "sbtc-commerce-v4",
    "set-payment-token",
    [Cl.contractPrincipal(sbtcAddress, sbtcName)],
    nonce++,
    "set-canonical-sbtc"
  );
}

for (const caller of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const allowed = cvToValue(
    await read("reputation-registry-v3", "is-registered-caller", [
      Cl.contractPrincipal(deployer, caller),
    ])
  );
  if (allowed !== true) {
    await callContract(
      "reputation-registry-v3",
      "add-protocol-caller",
      [Cl.contractPrincipal(deployer, caller)],
      nonce++,
      `allow-${caller}`
    );
  }
}

for (const contractName of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const config = responseValue(await read(contractName, "get-protocol-config"));
  recordCheck(`${contractName} is configured`, Boolean(scalar(config.configured)));
  recordCheck(
    `${contractName} review window is 12 burn blocks`,
    BigInt(scalar(config["review-window"])) === REVIEW_WINDOW_BURN_BLOCKS
  );
  recordCheck(
    `${contractName} appeal window is 3 burn blocks`,
    BigInt(scalar(config["appeal-window"])) === APPEAL_WINDOW_BURN_BLOCKS
  );
  recordCheck(
    `${contractName} pins the separate appeal authority`,
    String(scalar(config["appeal-authority"])) === appealAuthority
  );
}

recordCheck(
  "sbtc-commerce-v4 pins canonical testnet sBTC",
  String(scalar(responseValue(await read("sbtc-commerce-v4", "get-payment-token")))) === SBTC_TESTNET
);

for (const { name } of OWNED_CONTRACTS) {
  recordCheck(
    `${name} owner matches deployer`,
    String(scalar(responseValue(await read(name, "get-owner")))) === deployer
  );
}

output.result = "passed";
output.completedAt = new Date().toISOString();
saveReceipt();
console.log(`Secret-free receipt: ${RESULT_PATH}`);
