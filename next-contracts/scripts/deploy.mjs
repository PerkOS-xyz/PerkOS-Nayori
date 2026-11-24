// Deploys build/<network>/contracts/*.clar to Stacks as Clarity 6, in
// dependency order, one contract per confirmed transaction.
//
// Preflight (default, read-only): checks the build, the deployer's balance and
// nonce, and that no contract name is already taken.
//   node scripts/deploy.mjs <testnet|mainnet> --deployer <address>
// Apply (broadcasts; the key is read from the environment and never logged):
//   DEPLOYER_PRIVATE_KEY=... node scripts/deploy.mjs testnet --apply
//   DEPLOYER_PRIVATE_KEY=... CONFIRM_NAYORI_MAINNET_DEPLOY=yes node scripts/deploy.mjs mainnet --apply
// A public journal (txids, no secrets) is written to build/<network>/deploy-journal.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClarityVersion, PostConditionMode, broadcastTransaction, getAddressFromPrivateKey, makeContractDeploy,
} from "@stacks/transactions";
import { CONTRACTS } from "./build-network.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NETWORK = process.argv[2];
if (NETWORK !== "testnet" && NETWORK !== "mainnet") {
  console.error("deploy: first argument must be testnet or mainnet"); process.exit(1);
}
const BUILD = join(ROOT, "build", NETWORK, "contracts");
const JOURNAL = join(ROOT, "build", NETWORK, "deploy-journal.json");
const API = NETWORK === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";
const SBTC = {
  mainnet: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  testnet: "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token",
};
const RESERVE = 1_000_000n; // keep 1 STX for follow-up calls
const feeFor = (bytes) => BigInt(Math.max(50_000, bytes * 20)); // micro-STX
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };
const fail = (m) => { console.error(`deploy: ${m}`); process.exit(1); };

async function get(path) {
  const r = await fetch(`${API}${path}`);
  return { status: r.status, body: r.status === 200 ? await r.json() : undefined };
}

async function preflight(deployer) {
  if (!existsSync(BUILD)) fail(`build/${NETWORK} is missing; run scripts/build-network.mjs ${NETWORK} first`);
  const sources = CONTRACTS.map((name) => ({ name, source: readFileSync(join(BUILD, `${name}.clar`), "utf8") }));
  for (const { name, source } of sources) {
    if (source.includes("#[env(simnet)]")) fail(`${name}: simnet code in the build`);
    const other = NETWORK === "mainnet" ? SBTC.testnet : SBTC.mainnet;
    if (source.includes(other)) fail(`${name}: sBTC of the other network in the ${NETWORK} build`);
    if (/'S[TN][0-9A-Z]{20,}/.test(source) && NETWORK === "mainnet") fail(`${name}: testnet principal in the mainnet build`);
    if (/'S[PM][0-9A-Z]{20,}/.test(source.replace(SBTC.mainnet, "")) && NETWORK === "testnet") fail(`${name}: mainnet principal in the testnet build`);
  }
  const roles = sources.find((s) => s.name === "nayori-roles").source;
  const rolePrincipals = [...roles.matchAll(/define-constant INITIAL_(TREASURY|APPEAL_AUTHORITY) '([0-9A-Z]+)\)/g)].map((m) => m[2]);
  if (rolePrincipals.length !== 2) fail("nayori-roles: role constants not found");
  const taken = [];
  for (const { name } of sources) {
    const { status } = await get(`/v2/contracts/interface/${deployer}/${name}`);
    if (status === 200) taken.push(name);
    await sleep(300);
  }
  const account = (await get(`/v2/accounts/${deployer}?proof=0`)).body;
  const balance = BigInt(account.balance);
  const fees = sources.reduce((sum, { source }) => sum + feeFor(source.length), 0n);
  const report = {
    network: NETWORK, deployer, clarityVersion: 6, roles: rolePrincipals,
    rolesAreMultisig: rolePrincipals.every((p) => /^S[MN]/.test(p)), contracts: sources.map(({ name, source }) => ({
      name, bytes: source.length, feeMicroStx: String(feeFor(source.length)) })),
    nonce: account.nonce, balanceMicroStx: String(balance), feesMicroStx: String(fees),
    ready: taken.length === 0 && balance >= fees + RESERVE, alreadyDeployed: taken,
  };
  return { report, sources };
}

async function waitFor(txid) {
  for (let i = 0; i < 180; i += 1) {
    const { body } = await get(`/extended/v1/tx/0x${txid.replace(/^0x/, "")}`);
    if (body?.tx_status === "success") return body;
    if (body && body.tx_status && body.tx_status !== "pending") fail(`tx ${txid} ended as ${body.tx_status}`);
    await sleep(10_000);
  }
  return fail(`tx ${txid} not confirmed after 30 minutes`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && NETWORK === "mainnet" && process.env.CONFIRM_NAYORI_MAINNET_DEPLOY !== "yes") {
    fail("refusing to spend mainnet STX; set CONFIRM_NAYORI_MAINNET_DEPLOY=yes after reviewing the preflight");
  }
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  const deployer = apply ? (key ? getAddressFromPrivateKey(key, NETWORK) : fail("DEPLOYER_PRIVATE_KEY is not set"))
    : (arg("deployer") ?? fail("--deployer <ST address> is required for preflight"));
  const { report, sources } = await preflight(deployer);
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;
  if (!report.ready) fail("preflight is not ready; nothing was broadcast");
  const journal = { started: new Date().toISOString(), deployer, deployed: [] };
  let nonce = BigInt(report.nonce);
  for (const { name, source } of sources) {
    const tx = await makeContractDeploy({
      contractName: name, codeBody: source, senderKey: key, network: NETWORK, clarityVersion: ClarityVersion.Clarity6,
      fee: feeFor(source.length), nonce, postConditionMode: PostConditionMode.Deny,
    });
    const result = await broadcastTransaction({ transaction: tx, network: NETWORK });
    if (!result.txid || result.error) fail(`${name}: broadcast rejected: ${JSON.stringify(result)}`);
    console.log(`${name}: broadcast ${result.txid}`);
    await waitFor(result.txid);
    console.log(`${name}: confirmed`);
    journal.deployed.push({ name, contractId: `${deployer}.${name}`, txid: result.txid });
    writeFileSync(JOURNAL, JSON.stringify(journal, null, 2));
    nonce += 1n;
  }
  journal.finished = new Date().toISOString();
  writeFileSync(JOURNAL, JSON.stringify(journal, null, 2));
  console.log(`deployed ${sources.length} contracts; journal at ${JOURNAL}`);
}

main().catch((error) => fail(error.message));
