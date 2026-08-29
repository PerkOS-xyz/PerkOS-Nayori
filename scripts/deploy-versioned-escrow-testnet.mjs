// Deploy the versioned Nayori escrow candidate to Stacks testnet only.
//
// This script intentionally has no mainnet branch. It is source-aware and
// resumable: an existing contract is accepted only when its source exactly
// matches the reviewed local file. It never reads credentials unless both the
// explicit network and typed confirmation guards pass.
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
import { STACKS_TESTNET as network } from "@stacks/network";

const API = "https://api.testnet.hiro.so";
const ENV_PATH = process.env.VERSIONED_ESCROW_TESTNET_ENV_PATH || ".env";
const RESULT_PATH = "/tmp/nayori-versioned-escrow-testnet.json";
const SBTC_TESTNET =
  "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token";
const DEPLOY_FEE = 1_000_000n;
const CALL_FEE = 200_000n;
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const CONTRACTS = [
  { name: "reputation-registry-v3", file: "reputation-registry-v3.clar" },
  { name: "agentic-commerce-v3", file: "agentic-commerce-v3.clar" },
  { name: "sbtc-commerce-v2", file: "sbtc-commerce-v2.clar" },
];

if (process.env.STACKS_NETWORK !== "testnet") {
  throw new Error(
    "Refusing to deploy: set STACKS_NETWORK=testnet explicitly. This candidate script has no mainnet mode."
  );
}
if (process.env.CONFIRM_VERSIONED_ESCROW_TESTNET_DEPLOY !== "yes") {
  throw new Error(
    "Refusing to deploy: set CONFIRM_VERSIONED_ESCROW_TESTNET_DEPLOY=yes after reviewing the testnet deployer, sources and fees."
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
if (!deployer.startsWith("ST")) {
  throw new Error(`${ENV_PATH} does not contain a Stacks testnet deployer`);
}
if (getAddressFromPrivateKey(senderKey, "testnet") !== deployer) {
  throw new Error(`The private key in ${ENV_PATH} does not match ${deployer}`);
}

const sources = new Map(
  CONTRACTS.map(({ name, file }) => [
    name,
    readFileSync(`contracts/${file}`, "utf8"),
  ])
);
const sip010Source = readFileSync("contracts/sip-010-trait.clar", "utf8");
const output = {
  network: "testnet",
  deployer,
  sbtcToken: SBTC_TESTNET,
  contracts: Object.fromEntries(
    CONTRACTS.map(({ name }) => [name, `${deployer}.${name}`])
  ),
  transactions: {},
  existingContracts: [],
  appEnv: {
    NEXT_PUBLIC_STACKS_NETWORK: "testnet",
    NEXT_PUBLIC_CONTRACT_ADDRESS: deployer,
    NEXT_PUBLIC_STX_COMMERCE_CONTRACT: "agentic-commerce-v3",
    NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT: "sbtc-commerce-v2",
    NEXT_PUBLIC_REPUTATION_CONTRACT: "reputation-registry-v3",
  },
};

function saveReceipt() {
  writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function inspectSource(name, expectedSource, required = false) {
  const { response, data } = await fetchJson(
    `${API}/v2/contracts/source/${deployer}/${name}`
  );
  if (response.status === 404) {
    if (required) {
      throw new Error(
        `${deployer}.${name} is required before this candidate can deploy`
      );
    }
    return false;
  }
  if (!response.ok) {
    throw new Error(`Unable to inspect ${deployer}.${name}: HTTP ${response.status}`);
  }
  if (String(data.source ?? "").replaceAll("\r\n", "\n") !== expectedSource) {
    throw new Error(
      `${deployer}.${name} already exists but its source differs from the reviewed local contract`
    );
  }
  if (!required) output.existingContracts.push(name);
  return true;
}

async function accountBalance() {
  const { response, data } = await fetchJson(
    `${API}/extended/v1/address/${deployer}/balances`
  );
  if (!response.ok) throw new Error("Unable to read the testnet deployer balance");
  return BigInt(data.stx?.balance ?? 0);
}

async function transactionStatus(txid) {
  const { response, data } = await fetchJson(`${API}/extended/v1/tx/${txid}`);
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
  const result = await broadcastTransaction({ transaction, network });
  if (result.error) {
    throw new Error(`${name} rejected: ${result.reason || result.error}`);
  }
  output.transactions[name] = result.txid;
  saveReceipt();
  console.log(`  → ${name}: ${result.txid}`);
  await waitFor(result.txid, name);
}

async function callContract(key, contractName, functionName, functionArgs, nonce) {
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
    throw new Error(`${key} rejected: ${result.reason || result.error}`);
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

console.log("Nayori versioned escrow candidate — testnet only");
console.log("Deployer:", deployer);
console.log("Canonical testnet sBTC:", SBTC_TESTNET);

await inspectSource("sip-010-trait", sip010Source, true);

const existing = new Map();
for (const { name } of CONTRACTS) {
  existing.set(name, await inspectSource(name, sources.get(name)));
}

const missingCount = [...existing.values()].filter((value) => !value).length;
const maximumRequired = BigInt(missingCount) * DEPLOY_FEE + 3n * CALL_FEE;
const balance = await accountBalance();
console.log(`Balance: ${Number(balance) / 1e6} STX`);
console.log(`Maximum remaining fees: ${Number(maximumRequired) / 1e6} STX`);
if (balance < maximumRequired) {
  throw new Error("Insufficient testnet STX for the reviewed maximum fees");
}

let nonce = await fetchNonce({ address: deployer, network });
for (const { name } of CONTRACTS) {
  if (existing.get(name)) {
    console.log(`  ↷ ${name} already exists with the reviewed source`);
    continue;
  }
  await deployContract(name, nonce++);
}

const [sbtcAddress, sbtcName] = SBTC_TESTNET.split(".");
const configuredToken = cvToValue(
  await read("sbtc-commerce-v2", "get-payment-token")
).value;
if (configuredToken !== SBTC_TESTNET) {
  await callContract(
    "set-payment-token",
    "sbtc-commerce-v2",
    "set-payment-token",
    [Cl.contractPrincipal(sbtcAddress, sbtcName)],
    nonce++
  );
} else {
  console.log("  ↷ canonical testnet sBTC token already configured");
}

for (const caller of ["agentic-commerce-v3", "sbtc-commerce-v2"]) {
  const callerPrincipal = Cl.contractPrincipal(deployer, caller);
  const isAllowed = cvToValue(
    await read("reputation-registry-v3", "is-registered-caller", [callerPrincipal])
  );
  if (isAllowed === true) {
    console.log(`  ↷ ${caller} already authorized for reputation`);
    continue;
  }
  await callContract(
    `allow-${caller}`,
    "reputation-registry-v3",
    "add-protocol-caller",
    [callerPrincipal],
    nonce++
  );
}

for (const { name } of CONTRACTS) {
  const owner = cvToValue(await read(name, "get-owner")).value;
  if (owner !== deployer) {
    throw new Error(`${deployer}.${name} is not owned by the reviewed deployer`);
  }
}

saveReceipt();
console.log("Versioned escrow candidate deployment verified on testnet.");
console.log(`Secret-free receipt: ${RESULT_PATH}`);
