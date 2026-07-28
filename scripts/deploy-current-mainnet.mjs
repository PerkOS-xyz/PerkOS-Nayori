// Deploy the current PerkOS product stack to Stacks mainnet.
//
// This script is intentionally idempotent: an existing contract is skipped only when its
// on-chain source matches the reviewed local source exactly. It never deploys the legacy
// reputation-registry or agentic-commerce contract names.
import { readFileSync, writeFileSync } from "node:fs";
import {
  Cl,
  PostConditionMode,
  broadcastTransaction,
  cvToValue,
  fetchCallReadOnlyFunction,
  fetchNonce,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
} from "@stacks/transactions";
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const ENV_PATH = process.env.MAINNET_ENV_PATH || ".env.mainnet";
const RESULT_PATH = "/tmp/perkos-mainnet-promotion.json";
const SBTC_MAINNET =
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const DEPLOY_FEE = 1_000_000n;
const CALL_FEE = 200_000n;
const EXPECTED_CALLS = 3n;
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const CONTRACTS = [
  { name: "agent-registry", file: "agent-registry.clar" },
  { name: "validation-registry", file: "validation-registry.clar" },
  { name: "sip-010-trait", file: "sip-010-trait.clar" },
  { name: "reputation-registry-v2", file: "reputation-registry-v2.clar" },
  { name: "agentic-commerce-v2", file: "agentic-commerce.clar" },
  { name: "sbtc-commerce", file: "sbtc-commerce.clar" },
];

if (process.env.CONFIRM_PERKOS_MAINNET_DEPLOY !== "yes") {
  throw new Error(
    "Refusing to spend mainnet STX. Set CONFIRM_PERKOS_MAINNET_DEPLOY=yes after reviewing the deployer, contracts and fees."
  );
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
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

const senderKey = env.DEPLOYER_PRIVATE_KEY;
const deployer = env.DEPLOYER_ADDRESS;
if (!senderKey || !deployer) {
  throw new Error(`Missing DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS in ${ENV_PATH}`);
}
if (!deployer.startsWith("SP")) {
  throw new Error(`${ENV_PATH} does not contain a Stacks mainnet deployer`);
}
if (getAddressFromPrivateKey(senderKey, "mainnet") !== deployer) {
  throw new Error(`The private key in ${ENV_PATH} does not match ${deployer}`);
}

const sources = new Map(
  CONTRACTS.map(({ name, file }) => [
    name,
    readFileSync(`contracts/${file}`, "utf8"),
  ])
);
const output = {
  network: "mainnet",
  deployer,
  sbtcToken: SBTC_MAINNET,
  contracts: Object.fromEntries(
    CONTRACTS.map(({ name }) => [name, `${deployer}.${name}`])
  ),
  transactions: {},
  existingContracts: [],
};

function saveReceipt() {
  writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function contractExistsWithReviewedSource(name) {
  const { response, data } = await fetchJson(
    `${API}/v2/contracts/source/${deployer}/${name}`
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Unable to inspect ${deployer}.${name}: HTTP ${response.status}`);
  }
  if (String(data.source ?? "").replaceAll("\r\n", "\n") !== sources.get(name)) {
    throw new Error(
      `${deployer}.${name} already exists but its source differs from the reviewed local contract`
    );
  }
  output.existingContracts.push(name);
  return true;
}

async function accountBalance() {
  const { response, data } = await fetchJson(
    `${API}/extended/v1/address/${deployer}/balances`
  );
  if (!response.ok) throw new Error(`Unable to read the deployer balance`);
  return BigInt(data.stx?.balance ?? 0);
}

async function transactionStatus(txid) {
  const { response, data } = await fetchJson(
    `${API}/extended/v1/tx/${txid}`
  );
  return response.ok ? data.tx_status : "pending";
}

async function waitFor(txid, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await transactionStatus(txid).catch(() => "pending");
    if (status === "success") {
      console.log(`  ✓ ${label} confirmed`);
      return;
    }
    if (String(status).startsWith("abort") || status === "dropped_replace_by_fee") {
      throw new Error(`${label} failed with ${status}`);
    }
    await sleep(10_000);
  }
  throw new Error(`${label} confirmation timed out`);
}

async function sendDeploy(name, nonce) {
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
  const result = await broadcastTransaction({ transaction, network });
  if (result.error) {
    throw new Error(
      `${name} broadcast rejected: ${result.reason || result.error}`
    );
  }
  output.transactions[name] = result.txid;
  saveReceipt();
  console.log(`  → ${name}: ${result.txid}`);
  await waitFor(result.txid, name);
}

async function sendCall(key, contractName, functionName, functionArgs, nonce) {
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
  const result = await broadcastTransaction({ transaction, network });
  if (result.error) {
    throw new Error(
      `${key} broadcast rejected: ${result.reason || result.error}`
    );
  }
  output.transactions[key] = result.txid;
  saveReceipt();
  console.log(`  → ${key}: ${result.txid}`);
  await waitFor(result.txid, key);
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

console.log("PerkOS mainnet deployer:", deployer);
console.log("Canonical mainnet sBTC:", SBTC_MAINNET);
console.log(`Maximum configured fees: ${CONTRACTS.length + Number(EXPECTED_CALLS) * 0.2} STX`);

const existing = new Map();
for (const { name } of CONTRACTS) {
  existing.set(name, await contractExistsWithReviewedSource(name));
}
const missingCount = [...existing.values()].filter((value) => !value).length;
const required =
  BigInt(missingCount) * DEPLOY_FEE + EXPECTED_CALLS * CALL_FEE;
const balance = await accountBalance();
console.log(`Balance: ${Number(balance) / 1e6} STX`);
console.log(`Maximum remaining fees: ${Number(required) / 1e6} STX`);
if (balance < required) {
  throw new Error(`Insufficient STX balance for the reviewed maximum fees`);
}

let nonce = await fetchNonce({ address: deployer, network });
console.log("Starting nonce:", nonce.toString());

for (const { name } of CONTRACTS) {
  if (existing.get(name)) {
    console.log(`  ↷ ${name} already exists with the reviewed source`);
    continue;
  }
  await sendDeploy(name, nonce++);
}

const [sbtcAddress, sbtcName] = SBTC_MAINNET.split(".");
const paymentToken = cvToValue(
  await read("sbtc-commerce", "get-payment-token")
).value;
if (paymentToken !== SBTC_MAINNET) {
  await sendCall(
    "set-payment-token",
    "sbtc-commerce",
    "set-payment-token",
    [Cl.contractPrincipal(sbtcAddress, sbtcName)],
    nonce++
  );
} else {
  console.log("  ↷ canonical sBTC payment token already configured");
}

for (const caller of ["agentic-commerce-v2", "sbtc-commerce"]) {
  const callerPrincipal = Cl.contractPrincipal(deployer, caller);
  const isAllowed = cvToValue(
    await read(
      "reputation-registry-v2",
      "is-registered-caller",
      [callerPrincipal]
    )
  );
  if (isAllowed === true) {
    console.log(`  ↷ ${caller} already allow-listed`);
    continue;
  }
  await sendCall(
    `allow-${caller}`,
    "reputation-registry-v2",
    "add-protocol-caller",
    [callerPrincipal],
    nonce++
  );
}

saveReceipt();
console.log("PerkOS mainnet promotion complete.");
console.log(`Receipt: ${RESULT_PATH}`);
