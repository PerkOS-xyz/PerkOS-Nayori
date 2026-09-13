// Verify the active Nayori v6/v5 product stack on Stacks mainnet without a signer.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  Cl,
  ClarityType,
  cvToValue,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const API = "https://api.hiro.so";
const DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const APPEAL_AUTHORITY = "SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6";
const TREASURY = "SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8";
const CANONICAL_SBTC =
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const REVIEW_WINDOW = 12n;
const APPEAL_WINDOW = 144n;
const SERVICE_FEE_BPS = 200n;
const REPUTATION = "reputation-registry-v3";
const ACTIVE = Object.freeze({
  stx: "agentic-commerce-v6",
  sbtc: "sbtc-commerce-v5",
});
const EXPECTED_SOURCE_HASHES = Object.freeze({
  "agent-registry":
    "888bda39589e2077015d6580e053ba6ee52592295e87f7f0ae4574055345070e",
  "validation-registry":
    "015be093bb805d1bafe5137cc962cb3f1c600724b2b9837d331d5d60dd9478ce",
  "sip-010-trait":
    "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  [REPUTATION]:
    "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  [ACTIVE.stx]:
    "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
  [ACTIVE.sbtc]:
    "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
});
const OWNER_CONTROLLED = Object.freeze([
  "agent-registry",
  REPUTATION,
  ACTIVE.stx,
  ACTIVE.sbtc,
]);
const TWO_STEP_OWNER_CONTROLLED = new Set([
  REPUTATION,
  ACTIVE.stx,
  ACTIVE.sbtc,
]);
const network = {
  ...STACKS_MAINNET,
  client: { ...STACKS_MAINNET.client, baseUrl: API },
};

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeSource(source) {
  return String(source ?? "").replaceAll("\r\n", "\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchJson(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  ensure(response.ok, `${path} returned HTTP ${response.status}`);
  return data;
}

async function read(contractName, functionName, functionArgs = []) {
  return fetchCallReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: DEPLOYER,
  });
}

function responseValue(value, label) {
  ensure(value?.type === ClarityType.ResponseOk, `${label} did not return (ok ...)`);
  return cvToValue(value.value);
}

function scalar(value) {
  if (value && typeof value === "object" && "value" in value) {
    return scalar(value.value);
  }
  return value;
}

ensure(!process.env.MAINNET_DEPLOYER, "MAINNET_DEPLOYER override is not supported");
ensure(
  new Set([DEPLOYER, APPEAL_AUTHORITY, TREASURY]).size === 3,
  "Owner, appeal authority and treasury must remain distinct",
);

const info = await fetchJson("/v2/info");
ensure(info.network_id === 1, `Hiro endpoint network_id is ${info.network_id}, expected 1`);
console.log(`✓ Hiro endpoint reports Stacks mainnet at block ${info.stacks_tip_height}`);

for (const [name, expectedHash] of Object.entries(EXPECTED_SOURCE_HASHES)) {
  const localSource = normalizeSource(readFileSync(`contracts/${name}.clar`, "utf8"));
  const localHash = sha256(localSource);
  ensure(
    localHash === expectedHash,
    `Local source hash for ${name} is ${localHash}, expected ${expectedHash}`,
  );
  const deployed = await fetchJson(`/v2/contracts/source/${DEPLOYER}/${name}?proof=0`);
  const deployedSource = normalizeSource(deployed.source);
  const deployedHash = sha256(deployedSource);
  ensure(
    deployedHash === expectedHash,
    `On-chain source hash for ${name} is ${deployedHash}, expected ${expectedHash}`,
  );
  ensure(
    deployedSource === localSource,
    `${DEPLOYER}.${name} does not match contracts/${name}.clar byte-for-byte`,
  );
  console.log(`✓ ${DEPLOYER}.${name} source ${expectedHash}`);
}

for (const contractName of OWNER_CONTROLLED) {
  const owner = String(
    scalar(
      responseValue(
        await read(contractName, "get-owner"),
        `${contractName}.get-owner`,
      ),
    ),
  );
  ensure(owner === DEPLOYER, `${contractName} owner is ${owner}, expected ${DEPLOYER}`);
  if (TWO_STEP_OWNER_CONTROLLED.has(contractName)) {
    const pendingOwner = scalar(
      responseValue(
        await read(contractName, "get-pending-owner"),
        `${contractName}.get-pending-owner`,
      ),
    );
    ensure(pendingOwner === null, `${contractName} has a pending owner proposal`);
    console.log(`✓ ${contractName} owner is ${owner}; no pending owner`);
  } else {
    console.log(`✓ ${contractName} owner is ${owner}; legacy registry has no pending-owner surface`);
  }
}

const paymentToken = String(
  scalar(
    responseValue(
      await read(ACTIVE.sbtc, "get-payment-token"),
      `${ACTIVE.sbtc}.get-payment-token`,
    ),
  ),
);
ensure(
  paymentToken === CANONICAL_SBTC,
  `${ACTIVE.sbtc} token is ${paymentToken}, expected ${CANONICAL_SBTC}`,
);
console.log(`✓ ${ACTIVE.sbtc} uses canonical mainnet sBTC`);

for (const caller of Object.values(ACTIVE)) {
  const allowed = cvToValue(
    await read(REPUTATION, "is-registered-caller", [
      Cl.contractPrincipal(DEPLOYER, caller),
    ]),
  );
  ensure(allowed === true, `${caller} is not authorized on ${REPUTATION}`);
  console.log(`✓ ${caller} is authorized on ${REPUTATION}`);
}

for (const contractName of Object.values(ACTIVE)) {
  const config = responseValue(
    await read(contractName, "get-protocol-config"),
    `${contractName}.get-protocol-config`,
  );
  const configured = Boolean(scalar(config.configured));
  const reviewWindow = BigInt(scalar(config["review-window"]));
  const appealWindow = BigInt(scalar(config["appeal-window"]));
  const serviceFeeBps = BigInt(scalar(config["service-fee-bps"]));
  const configuredAuthority = String(scalar(config["appeal-authority"]));
  const configuredTreasury = String(scalar(config.treasury));
  ensure(configured, `${contractName} protocol is not initialized`);
  ensure(
    reviewWindow === REVIEW_WINDOW,
    `${contractName} review window is ${reviewWindow}, expected ${REVIEW_WINDOW}`,
  );
  ensure(
    appealWindow === APPEAL_WINDOW,
    `${contractName} appeal window is ${appealWindow}, expected ${APPEAL_WINDOW}`,
  );
  ensure(
    serviceFeeBps === SERVICE_FEE_BPS,
    `${contractName} service fee is ${serviceFeeBps} bps, expected ${SERVICE_FEE_BPS}`,
  );
  ensure(
    configuredAuthority === APPEAL_AUTHORITY,
    `${contractName} appeal authority is ${configuredAuthority}, expected ${APPEAL_AUTHORITY}`,
  );
  ensure(
    configuredTreasury === TREASURY,
    `${contractName} treasury is ${configuredTreasury}, expected ${TREASURY}`,
  );
  const pendingAuthority = scalar(
    responseValue(
      await read(contractName, "get-pending-appeal-authority"),
      `${contractName}.get-pending-appeal-authority`,
    ),
  );
  ensure(
    pendingAuthority === null,
    `${contractName} has a pending appeal-authority proposal`,
  );
  console.log(
    `✓ ${contractName}: review 12, appeal 144, fee 200 bps, treasury ${TREASURY}`,
  );
}

const agentCount = scalar(
  responseValue(
    await read("agent-registry", "get-agent-count"),
    "agent-registry.get-agent-count",
  ),
);
const stxJobCount = scalar(
  responseValue(
    await read(ACTIVE.stx, "get-job-count"),
    `${ACTIVE.stx}.get-job-count`,
  ),
);
const sbtcJobCount = scalar(
  responseValue(
    await read(ACTIVE.sbtc, "get-job-count"),
    `${ACTIVE.sbtc}.get-job-count`,
  ),
);

console.log(`✓ agent count: ${agentCount}`);
console.log(`✓ active STX job count: ${stxJobCount}`);
console.log(`✓ active sBTC job count: ${sbtcJobCount}`);
console.log("Nayori v6/v5 mainnet verification complete.");
