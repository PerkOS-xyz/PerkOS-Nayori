// Promote the frozen Nayori v5/v4 autonomous escrow generation to Stacks mainnet.
//
// The default action is signer-free preflight. Deployment is deliberately
// separate from the testnet candidate path and requires two release-specific
// confirmations before this process reads the external signer file.
import { createHash } from "node:crypto";
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
  validateStacksAddress,
} from "@stacks/transactions";
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const EXPECTED_DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const ENV_PATH = process.env.AUTONOMOUS_ESCROW_MAINNET_ENV_PATH || ".env.mainnet";
const RESULT_PATH =
  process.env.AUTONOMOUS_ESCROW_MAINNET_RECEIPT_PATH ||
  "/tmp/nayori-autonomous-escrow-mainnet.json";
const ACTION = process.env.AUTONOMOUS_ESCROW_MAINNET_ACTION || "preflight";
const APPEAL_AUTHORITY = process.env.AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY || "";
const SBTC_MAINNET =
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const REVIEW_WINDOW_BURN_BLOCKS = 12n;
const APPEAL_WINDOW_BURN_BLOCKS = 144n;
const DEPLOY_FEE = 1_000_000n;
const CALL_FEE = 200_000n;
const MAXIMUM_CONFIGURATION_CALLS = 5n;
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const CONTRACTS = [
  { name: "sip-010-trait", file: "sip-010-trait.clar" },
  { name: "reputation-registry-v3", file: "reputation-registry-v3.clar" },
  { name: "agentic-commerce-v5", file: "agentic-commerce-v5.clar" },
  { name: "sbtc-commerce-v4", file: "sbtc-commerce-v4.clar" },
];
const OWNED_CONTRACTS = CONTRACTS.filter(
  ({ name }) => name !== "sip-010-trait"
);
const EXPECTED_SOURCE_HASHES = Object.freeze({
  "sip-010-trait": "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  "reputation-registry-v3": "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  "agentic-commerce-v5": "e5bf374aaf514903205a9f069a794a4c34eb0f1100fb144c13ccd397e80664e7",
  "sbtc-commerce-v4": "4ab54889b8f08835f2942bd8f0b9add4d6950b0307bcbf6f8691c0a0b4d8debc",
});

if (process.env.STACKS_NETWORK !== "mainnet") {
  throw new Error(
    "Refusing promotion: set STACKS_NETWORK=mainnet explicitly."
  );
}
if (!new Set(["preflight", "deploy"]).has(ACTION)) {
  throw new Error(
    "AUTONOMOUS_ESCROW_MAINNET_ACTION must be preflight or deploy."
  );
}
if (!APPEAL_AUTHORITY.startsWith("SP") || !validateStacksAddress(APPEAL_AUTHORITY)) {
  throw new Error(
    "AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY must be an explicit Stacks mainnet principal."
  );
}
if (APPEAL_AUTHORITY === EXPECTED_DEPLOYER) {
  throw new Error("The mainnet appeal authority must be separate from the deployer/owner.");
}

const sources = new Map();
const sourceHashes = {};
for (const { name, file } of CONTRACTS) {
  const source = readFileSync(`contracts/${file}`, "utf8");
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest !== EXPECTED_SOURCE_HASHES[name]) {
    throw new Error(
      `${file} SHA-256 ${digest} does not match the frozen reviewed digest ${EXPECTED_SOURCE_HASHES[name]}`
    );
  }
  sources.set(name, source);
  sourceHashes[name] = digest;
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  action: ACTION,
  network: "mainnet",
  deployer: EXPECTED_DEPLOYER,
  sbtcToken: SBTC_MAINNET,
  reviewWindowBurnBlocks: REVIEW_WINDOW_BURN_BLOCKS.toString(),
  appealWindowBurnBlocks: APPEAL_WINDOW_BURN_BLOCKS.toString(),
  appealAuthority: APPEAL_AUTHORITY,
  sourceHashes,
  contracts: Object.fromEntries(
    CONTRACTS.map(({ name }) => [name, `${EXPECTED_DEPLOYER}.${name}`])
  ),
  sourceStatus: {},
  transactions: {},
  confirmations: {},
  finalChecks: {},
};

function saveReceipt() {
  output.generatedAt = new Date().toISOString();
  writeFileSync(RESULT_PATH, `${JSON.stringify(output, null, 2)}\n`, {
    mode: 0o600,
  });
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

async function fetchJson(url, options = undefined) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function inspectSource(name) {
  const { response, data } = await fetchJson(
    `${API}/v2/contracts/source/${EXPECTED_DEPLOYER}/${name}?proof=0`
  );
  if (response.status === 404) {
    output.sourceStatus[name] = "missing";
    return false;
  }
  if (!response.ok) {
    throw new Error(
      `Unable to inspect ${EXPECTED_DEPLOYER}.${name}: HTTP ${response.status}`
    );
  }
  const onChain = String(data.source ?? "").replaceAll("\r\n", "\n");
  const local = sources.get(name).replaceAll("\r\n", "\n");
  if (onChain !== local) {
    throw new Error(
      `${EXPECTED_DEPLOYER}.${name} exists with source different from the frozen reviewed contract`
    );
  }
  output.sourceStatus[name] = "exact-match";
  return true;
}

async function accountState() {
  const [{ response: balanceResponse, data: balances }, { response: nonceResponse, data: nonces }, { response: mempoolResponse, data: mempool }] =
    await Promise.all([
      fetchJson(`${API}/extended/v1/address/${EXPECTED_DEPLOYER}/balances`),
      fetchJson(`${API}/extended/v1/address/${EXPECTED_DEPLOYER}/nonces`),
      fetchJson(
        `${API}/extended/v1/address/${EXPECTED_DEPLOYER}/mempool?limit=50`
      ),
    ]);
  if (!balanceResponse.ok || !nonceResponse.ok || !mempoolResponse.ok) {
    throw new Error("Unable to read mainnet deployer balance, nonce or mempool");
  }
  return {
    balance: BigInt(balances.stx?.balance ?? 0),
    nextNonce: BigInt(nonces.possible_next_nonce),
    pendingTransactions: Number(mempool.total ?? 0),
  };
}

async function transactionStatus(txid) {
  const { response, data } = await fetchJson(`${API}/extended/v1/tx/${txid}`);
  return response.ok ? data : { tx_status: "pending" };
}

async function waitFor(txid, label) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const transaction = await transactionStatus(txid).catch(() => ({
      tx_status: "pending",
    }));
    const status = transaction.tx_status;
    if (status === "success") {
      const result = String(transaction.tx_result?.repr ?? "");
      if (!result.startsWith("(ok")) {
        throw new Error(`${label} confirmed without an ok result: ${result}`);
      }
      output.confirmations[label] = {
        txid,
        status,
        result,
        blockHeight: transaction.block_height,
        burnBlockTime: transaction.burn_block_time,
      };
      saveReceipt();
      console.log(`  ✓ ${label} confirmed in block ${transaction.block_height}`);
      return;
    }
    if (
      String(status).startsWith("abort") ||
      String(status).startsWith("dropped")
    ) {
      throw new Error(`${label} failed with ${status}`);
    }
    await sleep(10_000);
  }
  throw new Error(`${label} confirmation timed out`);
}

async function deployContract(name, nonce, senderKey) {
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

async function callContract(
  key,
  contractName,
  functionName,
  functionArgs,
  nonce,
  senderKey
) {
  const transaction = await makeContractCall({
    contractAddress: EXPECTED_DEPLOYER,
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
    contractAddress: EXPECTED_DEPLOYER,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: EXPECTED_DEPLOYER,
  });
}

console.log("Nayori autonomous escrow — Stacks mainnet promotion");
console.log("Action:", ACTION);
console.log("Deployer:", EXPECTED_DEPLOYER);
console.log("Canonical mainnet sBTC:", SBTC_MAINNET);
console.log("Appeal authority:", APPEAL_AUTHORITY);

const existing = new Map();
for (const { name } of CONTRACTS) {
  existing.set(name, await inspectSource(name));
}

const state = await accountState();
const missingCount = [...existing.values()].filter((value) => !value).length;
const maximumRequired =
  BigInt(missingCount) * DEPLOY_FEE +
  MAXIMUM_CONFIGURATION_CALLS * CALL_FEE;
output.preflight = {
  balanceMicroStx: state.balance.toString(),
  nextNonce: state.nextNonce.toString(),
  pendingTransactions: state.pendingTransactions,
  missingContracts: missingCount,
  maximumFeesMicroStx: maximumRequired.toString(),
};
saveReceipt();

console.log(`Balance: ${Number(state.balance) / 1e6} STX`);
console.log("Next nonce:", state.nextNonce.toString());
console.log("Pending deployer transactions:", state.pendingTransactions);
console.log(`Maximum remaining fees: ${Number(maximumRequired) / 1e6} STX`);

if (state.pendingTransactions !== 0) {
  throw new Error("Refusing promotion while the deployer has pending transactions");
}
if (state.balance < maximumRequired) {
  throw new Error("Insufficient STX for the reviewed maximum mainnet fees");
}
if (ACTION === "preflight") {
  console.log("Signer-free mainnet preflight passed; no transaction was created.");
  console.log(`Secret-free receipt: ${RESULT_PATH}`);
  process.exit(0);
}

if (
  process.env.CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOY !==
  "deploy-v5-v4-mainnet"
) {
  throw new Error(
    "Refusing to spend mainnet STX. Set CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOY=deploy-v5-v4-mainnet after reviewing sources, roles and fees."
  );
}
if (
  process.env.CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOYER !== EXPECTED_DEPLOYER
) {
  throw new Error(
    `Refusing to sign for an unconfirmed deployer. Set CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOYER=${EXPECTED_DEPLOYER}.`
  );
}
if (
  process.env.CONFIRM_AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY !== APPEAL_AUTHORITY
) {
  throw new Error(
    `Refusing an unconfirmed appeal authority. Set CONFIRM_AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY=${APPEAL_AUTHORITY}.`
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
const configuredDeployer = env.DEPLOYER_ADDRESS;
if (!senderKey || configuredDeployer !== EXPECTED_DEPLOYER) {
  throw new Error(
    `${ENV_PATH} must contain the exact reviewed DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY`
  );
}
if (getAddressFromPrivateKey(senderKey, "mainnet") !== EXPECTED_DEPLOYER) {
  throw new Error(`The private key in ${ENV_PATH} does not match ${EXPECTED_DEPLOYER}`);
}

let nonce = await fetchNonce({ address: EXPECTED_DEPLOYER, network });
if (nonce !== state.nextNonce) {
  throw new Error(
    `Nonce changed after preflight: expected ${state.nextNonce}, actual ${nonce}`
  );
}

for (const { name } of CONTRACTS) {
  if (existing.get(name)) {
    console.log(`  ↷ ${name} already exists with exact reviewed source`);
    continue;
  }
  await deployContract(name, nonce++, senderKey);
}

for (const contractName of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const config = responseValue(await read(contractName, "get-protocol-config"));
  if (!Boolean(scalar(config.configured))) {
    await callContract(
      `initialize-${contractName}`,
      contractName,
      "initialize-protocol",
      [Cl.uint(APPEAL_WINDOW_BURN_BLOCKS), Cl.principal(APPEAL_AUTHORITY)],
      nonce++,
      senderKey
    );
  } else {
    console.log(`  ↷ ${contractName} protocol already initialized`);
  }
}

const [sbtcAddress, sbtcName] = SBTC_MAINNET.split(".");
const configuredToken = String(
  scalar(responseValue(await read("sbtc-commerce-v4", "get-payment-token")))
);
if (configuredToken !== SBTC_MAINNET) {
  await callContract(
    "set-payment-token",
    "sbtc-commerce-v4",
    "set-payment-token",
    [Cl.contractPrincipal(sbtcAddress, sbtcName)],
    nonce++,
    senderKey
  );
} else {
  console.log("  ↷ canonical mainnet sBTC already configured");
}

for (const caller of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const callerPrincipal = Cl.contractPrincipal(EXPECTED_DEPLOYER, caller);
  const isAllowed = cvToValue(
    await read("reputation-registry-v3", "is-registered-caller", [
      callerPrincipal,
    ])
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
    nonce++,
    senderKey
  );
}

for (const { name } of CONTRACTS) {
  if (!(await inspectSource(name))) {
    throw new Error(`${EXPECTED_DEPLOYER}.${name} is missing after promotion`);
  }
}
for (const name of OWNED_CONTRACTS.map(({ name }) => name)) {
  const owner = cvToValue(await read(name, "get-owner")).value;
  output.finalChecks[`${name}.owner`] = owner;
  if (owner !== EXPECTED_DEPLOYER) {
    throw new Error(`${name} owner ${owner} differs from ${EXPECTED_DEPLOYER}`);
  }
}
for (const escrow of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const config = responseValue(await read(escrow, "get-protocol-config"));
  const reviewWindow = BigInt(scalar(config["review-window"]));
  const appealWindow = BigInt(scalar(config["appeal-window"]));
  const authority = String(scalar(config["appeal-authority"]));
  const jobCount = BigInt(scalar(await read(escrow, "get-job-count")));
  output.finalChecks[`${escrow}.reviewWindow`] = reviewWindow.toString();
  output.finalChecks[`${escrow}.appealWindow`] = appealWindow.toString();
  output.finalChecks[`${escrow}.appealAuthority`] = authority;
  output.finalChecks[`${escrow}.jobCount`] = jobCount.toString();
  if (
    reviewWindow !== REVIEW_WINDOW_BURN_BLOCKS ||
    appealWindow !== APPEAL_WINDOW_BURN_BLOCKS ||
    authority !== APPEAL_AUTHORITY ||
    jobCount !== 0n
  ) {
    throw new Error(`${escrow} failed protocol-policy or zero-state verification`);
  }
}
const finalToken = cvToValue(
  await read("sbtc-commerce-v4", "get-payment-token")
).value;
output.finalChecks["sbtc-commerce-v4.paymentToken"] = finalToken;
if (finalToken !== SBTC_MAINNET) {
  throw new Error("sbtc-commerce-v4 does not use canonical mainnet sBTC");
}
for (const caller of ["agentic-commerce-v5", "sbtc-commerce-v4"]) {
  const isAllowed = cvToValue(
    await read("reputation-registry-v3", "is-registered-caller", [
      Cl.contractPrincipal(EXPECTED_DEPLOYER, caller),
    ])
  );
  output.finalChecks[`reputation-registry-v3.allows.${caller}`] = isAllowed;
  if (isAllowed !== true) {
    throw new Error(`reputation-registry-v3 does not authorize ${caller}`);
  }
}
const { data: chainInfo } = await fetchJson(`${API}/v2/info`);
output.finalChecks.chainTip = {
  stacksTipHeight: chainInfo.stacks_tip_height,
  burnBlockHeight: chainInfo.burn_block_height,
};
output.completedAt = new Date().toISOString();
saveReceipt();

console.log("Nayori v5/v4 mainnet promotion verified.");
console.log(`Secret-free receipt: ${RESULT_PATH}`);
