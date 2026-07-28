// Verify the current PerkOS product stack on Stacks mainnet without a signer.
import { readFileSync } from "node:fs";
import {
  Cl,
  cvToValue,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const deployer =
  process.env.MAINNET_DEPLOYER ||
  "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const canonicalSbtc =
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const contracts = [
  { name: "agent-registry", file: "agent-registry.clar" },
  { name: "validation-registry", file: "validation-registry.clar" },
  { name: "sip-010-trait", file: "sip-010-trait.clar" },
  { name: "reputation-registry-v2", file: "reputation-registry-v2.clar" },
  { name: "agentic-commerce-v2", file: "agentic-commerce.clar" },
  { name: "sbtc-commerce", file: "sbtc-commerce.clar" },
];

if (!deployer.startsWith("SP")) {
  throw new Error(`MAINNET_DEPLOYER must be a Stacks mainnet address`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return data;
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

for (const { name, file } of contracts) {
  const localSource = readFileSync(`contracts/${file}`, "utf8");
  const { source } = await fetchJson(
    `${API}/v2/contracts/source/${deployer}/${name}`
  );
  if (String(source ?? "").replaceAll("\r\n", "\n") !== localSource) {
    throw new Error(`${deployer}.${name} does not match contracts/${file}`);
  }
  console.log(`✓ ${deployer}.${name} matches contracts/${file}`);
}

for (const contractName of [
  "agent-registry",
  "reputation-registry-v2",
  "agentic-commerce-v2",
  "sbtc-commerce",
]) {
  const owner = cvToValue(await read(contractName, "get-owner")).value;
  if (owner !== deployer) {
    throw new Error(`${contractName} owner is ${owner}, expected ${deployer}`);
  }
  console.log(`✓ ${contractName} owner is ${owner}`);
}

const paymentToken = cvToValue(
  await read("sbtc-commerce", "get-payment-token")
).value;
if (paymentToken !== canonicalSbtc) {
  throw new Error(
    `sbtc-commerce token is ${paymentToken}, expected ${canonicalSbtc}`
  );
}
console.log(`✓ sbtc-commerce uses canonical mainnet sBTC`);

for (const caller of ["agentic-commerce-v2", "sbtc-commerce"]) {
  const isAllowed = cvToValue(
    await read("reputation-registry-v2", "is-registered-caller", [
      Cl.contractPrincipal(deployer, caller),
    ])
  );
  if (isAllowed !== true) {
    throw new Error(`${caller} is not authorized on reputation-registry-v2`);
  }
  console.log(`✓ ${caller} is authorized on reputation-registry-v2`);
}

const agentCount = cvToValue(
  await read("agent-registry", "get-agent-count")
).value;
const stxJobCount = cvToValue(
  await read("agentic-commerce-v2", "get-job-count")
).value;
const sbtcJobCount = cvToValue(
  await read("sbtc-commerce", "get-job-count")
).value;

console.log(`✓ agent count: ${agentCount}`);
console.log(`✓ STX job count: ${stxJobCount}`);
console.log(`✓ sBTC job count: ${sbtcJobCount}`);
console.log("PerkOS mainnet verification complete.");
