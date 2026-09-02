import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PostConditionMode,
  broadcastTransaction,
  fetchNonce,
  getAddressFromPrivateKey,
  makeContractDeploy,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

const API = "https://api.testnet.hiro.so";
const EXPECTED_NETWORK_ID = 2_147_483_648;
const EXPECTED_DEPLOYER = "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5";
const DEPLOY_FEE = 1_000_000n;
const MINIMUM_RESERVE = 500_000n;
const ACTION = process.env.QA_IDENTITY_DEPLOY_ACTION || "preflight";
const RESULT_PATH = process.env.QA_IDENTITY_DEPLOY_RESULT_PATH;
const CONTRACTS = [
  { name: "agent-registry", path: "contracts/agent-registry.clar" },
  { name: "validation-registry", path: "contracts/validation-registry.clar" },
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
        return [line.slice(0, separator).trim(), value];
      }),
  );
}

async function json(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.text();
  let parsed;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    parsed = { body };
  }
  return { response, body: parsed };
}

async function sourceState(name, localSource) {
  const { response, body } = await json(`${API}/v2/contracts/source/${EXPECTED_DEPLOYER}/${name}?proof=0`);
  if (response.status === 404) {
    return { name, state: "missing", sourceSha256: sha256(localSource) };
  }
  check(response.ok, `Contract source lookup failed for ${name}: HTTP ${response.status}.`);
  const publishedSource = body.source ?? body.source_code;
  check(typeof publishedSource === "string", `Contract source lookup returned no source for ${name}.`);
  const localHash = sha256(localSource);
  const publishedHash = sha256(publishedSource);
  check(localHash === publishedHash, `${name} exists with a different source hash.`);
  return { name, state: "present-exact", sourceSha256: localHash };
}

async function preflight() {
  check(process.env.STACKS_NETWORK === undefined || process.env.STACKS_NETWORK === "testnet",
    "STACKS_NETWORK must be testnet when set.");
  const [{ response: infoResponse, body: info }, { response: balanceResponse, body: balances }, mempool] =
    await Promise.all([
      json(`${API}/v2/info`),
      json(`${API}/extended/v1/address/${EXPECTED_DEPLOYER}/balances`),
      json(`${API}/extended/v1/address/${EXPECTED_DEPLOYER}/mempool?limit=50&offset=0`),
    ]);
  check(infoResponse.ok && info.network_id === EXPECTED_NETWORK_ID,
    "The configured endpoint is not Stacks testnet.");
  check(balanceResponse.ok, "Unable to read the QA deployer balance.");
  check(mempool.response.ok && Number(mempool.body.total ?? -1) === 0,
    "The QA deployer has pending transactions; refusing a nonce race.");

  const contracts = await Promise.all(CONTRACTS.map(({ name, path }) => {
    const source = readFileSync(resolve(path), "utf8");
    return sourceState(name, source);
  }));
  const missing = contracts.filter((contract) => contract.state === "missing");
  const balance = BigInt(balances.stx?.balance ?? "0");
  const required = DEPLOY_FEE * BigInt(missing.length) + MINIMUM_RESERVE;
  check(balance >= required,
    `QA deployer balance ${balance} is below required ${required} micro-STX.`);
  return {
    network: "testnet",
    networkId: info.network_id,
    deployer: EXPECTED_DEPLOYER,
    burnBlockHeight: info.burn_block_height,
    stacksTipHeight: info.stacks_tip_height,
    mempoolTransactions: 0,
    balanceMicrostx: balance.toString(),
    feePerDeploymentMicrostx: DEPLOY_FEE.toString(),
    contracts,
    missing: missing.map(({ name }) => name),
  };
}

async function waitForSuccess(txid, name) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const { response, body } = await json(`${API}/extended/v1/tx/${txid}`);
    if (response.ok && body.tx_status === "success") {
      return { txid, blockHeight: body.block_height, burnBlockHeight: body.burn_block_height };
    }
    if (response.ok && String(body.tx_status || "").startsWith("abort")) {
      throw new Error(`${name} deployment failed with ${body.tx_status}.`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
  }
  throw new Error(`${name} deployment confirmation timed out.`);
}

function writeReceipt(payload) {
  if (!RESULT_PATH) return undefined;
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(RESULT_PATH, serialized, { mode: 0o600 });
  chmodSync(RESULT_PATH, 0o600);
  return { path: RESULT_PATH, sha256: sha256(serialized) };
}

async function main() {
  const initial = await preflight();
  if (ACTION === "preflight") {
    const result = { schemaVersion: 1, action: ACTION, result: "passed", createdAt: new Date().toISOString(), ...initial };
    const receipt = writeReceipt(result);
    console.log(JSON.stringify({ ...result, receipt }, null, 2));
    return;
  }
  check(ACTION === "deploy", `Unsupported action: ${ACTION}.`);
  check(process.env.STACKS_NETWORK === "testnet", "STACKS_NETWORK must be exactly testnet for deployment.");
  check(process.env.CONFIRM_NAYORI_QA_IDENTITY_DEPLOY === "deploy-missing-identity-contracts-on-testnet",
    "Missing typed QA identity deployment confirmation.");
  check(initial.missing.length > 0, "Both QA identity contracts already exist exactly; refusing a no-op signing run.");

  const envPath = process.env.QA_IDENTITY_DEPLOY_ENV_FILE;
  check(envPath, "QA_IDENTITY_DEPLOY_ENV_FILE is required for deployment.");
  const secretEnv = parseEnv(envPath);
  const senderKey = secretEnv.DEPLOYER_PRIVATE_KEY ?? secretEnv.STACKS_DEPLOYER_PRIVATE_KEY;
  check(senderKey, "The external environment file has no deployer private key.");
  check(getAddressFromPrivateKey(senderKey, "testnet") === EXPECTED_DEPLOYER,
    "The external signer does not derive the exact QA deployer.");

  let nonce = await fetchNonce({ address: EXPECTED_DEPLOYER, network: STACKS_TESTNET });
  const transactions = [];
  for (const contract of CONTRACTS.filter(({ name }) => initial.missing.includes(name))) {
    const codeBody = readFileSync(resolve(contract.path), "utf8");
    const transaction = await makeContractDeploy({
      contractName: contract.name,
      codeBody,
      senderKey,
      network: STACKS_TESTNET,
      nonce,
      fee: DEPLOY_FEE,
      clarityVersion: 2,
      postConditionMode: PostConditionMode.Deny,
    });
    const broadcast = await broadcastTransaction({ transaction, network: STACKS_TESTNET });
    check(!broadcast.error && broadcast.txid, `${contract.name} broadcast failed: ${broadcast.reason ?? broadcast.error}.`);
    const txid = broadcast.txid.startsWith("0x") ? broadcast.txid : `0x${broadcast.txid}`;
    transactions.push({ contract: contract.name, ...(await waitForSuccess(txid, contract.name)) });
    nonce += 1n;
  }

  const final = await preflight();
  check(final.missing.length === 0, "Identity contracts did not become fully available after confirmation.");
  const result = {
    schemaVersion: 1,
    action: ACTION,
    result: "passed",
    classification: "internal-team-operated-not-m2-adoption",
    createdAt: new Date().toISOString(),
    initial,
    final,
    transactions,
  };
  const receipt = writeReceipt(result);
  console.log(JSON.stringify({ ...result, receipt }, null, 2));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { CONTRACTS, EXPECTED_DEPLOYER, EXPECTED_NETWORK_ID, parseEnv, sha256 };
