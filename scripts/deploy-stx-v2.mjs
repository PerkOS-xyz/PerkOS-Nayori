// Deploy the hardened STX escrow under a new immutable contract name.
// This script spends STX. It will not run unless CONFIRM_STX_V2_DEPLOY=yes.
import { readFileSync, writeFileSync } from "node:fs";
import {
  Cl,
  PostConditionMode,
  broadcastTransaction,
  fetchNonce,
  getAddressFromPrivateKey,
  makeContractCall,
  makeContractDeploy,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";

const target = process.env.STACKS_NETWORK === "testnet" ? "testnet" : "mainnet";
const network = target === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const api = target === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";
const envPath = target === "mainnet" ? ".env.mainnet" : ".env";
const contractName = process.env.STX_V2_CONTRACT_NAME || "agentic-commerce-v2";
const resultPath = `/tmp/perkos-${contractName}-${target}.json`;
const deployFee = 1_000_000n;
const callFee = 200_000n;

if (process.env.CONFIRM_STX_V2_DEPLOY !== "yes") {
  throw new Error(
    "Refusing to deploy. Set CONFIRM_STX_V2_DEPLOY=yes after reviewing the network, name and fees."
  );
}
if (!/^[a-z][a-z0-9-]{0,39}$/.test(contractName)) {
  throw new Error(`Invalid Clarity contract name: ${contractName}`);
}

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [
        line.slice(0, index).trim(),
        line.slice(index + 1).trim().replace(/^"|"$/g, ""),
      ];
    })
);
const senderKey = env.DEPLOYER_PRIVATE_KEY;
const deployer = env.DEPLOYER_ADDRESS;
if (!senderKey || !deployer) {
  throw new Error(`Missing DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS in ${envPath}`);
}
const derived = getAddressFromPrivateKey(senderKey, target);
if (derived !== deployer) {
  throw new Error(`Invalid deployer configuration in ${envPath}`);
}

async function txStatus(txid) {
  const response = await fetch(`${api}/extended/v1/tx/${txid}`);
  if (!response.ok) return "pending";
  return (await response.json()).tx_status;
}

async function waitFor(txid, label) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const status = await txStatus(txid).catch(() => "pending");
    if (status === "success") return;
    if (String(status).startsWith("abort")) {
      throw new Error(`${label} failed: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`${label} confirmation timed out`);
}

let nonce = await fetchNonce({ address: deployer, network });
const source = readFileSync("contracts/agentic-commerce.clar", "utf8");
const deployTx = await makeContractDeploy({
  contractName,
  codeBody: source,
  senderKey,
  network,
  nonce: nonce++,
  fee: deployFee,
  clarityVersion: 2,
  postConditionMode: PostConditionMode.Allow,
});
const deployResult = await broadcastTransaction({ transaction: deployTx, network });
if (deployResult.error) {
  throw new Error(`Deployment rejected: ${deployResult.reason || deployResult.error}`);
}
await waitFor(deployResult.txid, contractName);

const allowTx = await makeContractCall({
  contractAddress: deployer,
  contractName: "reputation-registry-v2",
  functionName: "add-protocol-caller",
  functionArgs: [Cl.contractPrincipal(deployer, contractName)],
  senderKey,
  network,
  nonce,
  fee: callFee,
  postConditionMode: PostConditionMode.Allow,
});
const allowResult = await broadcastTransaction({ transaction: allowTx, network });
if (allowResult.error) {
  throw new Error(`Registry wiring rejected: ${allowResult.reason || allowResult.error}`);
}
await waitFor(allowResult.txid, "reputation protocol caller");

const result = {
  network: target,
  contract: `${deployer}.${contractName}`,
  deployTx: deployResult.txid,
  allowListTx: allowResult.txid,
  appEnv: `NEXT_PUBLIC_STX_COMMERCE_CONTRACT=${contractName}`,
};
writeFileSync(resultPath, JSON.stringify(result, null, 2));
console.log(result);
console.log(`Saved deployment receipt to ${resultPath}`);
