// Deploy the sBTC escrow stack (Milestone 1) to Stacks MAINNET via Stacks.js.
// REAL STX is spent and the contracts are permanent. Reads .env.mainnet (gitignored).
//
// Order matters: sbtc-commerce statically references .sip-010-trait and
// .reputation-registry-v2, so both must confirm first. After deployment the escrow stays
// inert until set-payment-token points it at the canonical mainnet sBTC contract, and
// reputation only accepts the escrow once it is registered as a protocol caller.
//
// mock-sbtc-token is deliberately NOT deployed: it exists only for simnet tests.
import { readFileSync, writeFileSync } from "node:fs";
import {
  makeContractDeploy, makeContractCall, broadcastTransaction, fetchNonce,
  getAddressFromPrivateKey, Cl, PostConditionMode,
} from "@stacks/transactions";
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const SBTC_MAINNET = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const RESULT_PATH = "/private/tmp/claude-501/-Users-osx-Projects-Stacks/9ce56664-604b-4571-86cd-771a7ab5ffd1/scratchpad/deploy-sbtc-mainnet.json";

const ORDER = ["sip-010-trait", "reputation-registry-v2", "sbtc-commerce"];
const DEPLOY_FEE = 1_000_000n; // 1 STX per contract
const CALL_FEE = 200_000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = Object.fromEntries(
  readFileSync(".env.mainnet", "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const senderKey = env.DEPLOYER_PRIVATE_KEY;
const deployer = env.DEPLOYER_ADDRESS;
const derived = getAddressFromPrivateKey(senderKey, "mainnet");
if (derived !== deployer) {
  console.log(`✗ key/address mismatch: .env says ${deployer}, key derives ${derived}`);
  process.exit(1);
}
console.log("MAINNET deployer:", deployer);
console.log("sBTC token:", SBTC_MAINNET, "\n");

async function txStatus(txid) {
  try { const r = await fetch(`${API}/extended/v1/tx/${txid}`); if (!r.ok) return "pending"; return (await r.json()).tx_status; }
  catch { return "pending"; }
}
async function waitFor(txid, label) {
  console.log(`  waiting for ${label} (${txid}) ...`);
  for (let i = 0; i < 240; i++) {
    const s = await txStatus(txid);
    if (s === "success") { console.log(`  ✓ ${label} confirmed`); return true; }
    if (s && String(s).startsWith("abort")) { console.log(`  ✗ ${label} failed: ${s}`); return false; }
    await sleep(15000);
  }
  console.log(`  ! ${label} timed out`); return false;
}
async function deploy(name, nonce) {
  const codeBody = readFileSync(`contracts/${name}.clar`, "utf8");
  const tx = await makeContractDeploy({
    contractName: name, codeBody, senderKey, network, nonce,
    fee: DEPLOY_FEE, clarityVersion: 2, postConditionMode: PostConditionMode.Allow,
  });
  const res = await broadcastTransaction({ transaction: tx, network });
  if (res.error) { console.log(`  ✗ broadcast ${name}: ${res.error} — ${res.reason || ""}`); throw new Error(`${name}: ${res.reason || res.error}`); }
  console.log(`  → ${name} broadcast: ${res.txid}`);
  return res.txid;
}
async function call(contract, fn, args, nonce, label) {
  const tx = await makeContractCall({
    contractAddress: deployer, contractName: contract, functionName: fn, functionArgs: args,
    senderKey, network, nonce, fee: CALL_FEE, postConditionMode: PostConditionMode.Allow,
  });
  const res = await broadcastTransaction({ transaction: tx, network });
  if (res.error) { console.log(`  ✗ ${label}: ${res.error} — ${res.reason || ""}`); throw new Error(label); }
  console.log(`  → ${label} broadcast: ${res.txid}`);
  return res.txid;
}

const result = { deployer, network: "mainnet", sbtcToken: SBTC_MAINNET, explorerBase: "https://explorer.hiro.so", txids: {}, contracts: {} };
let nonce = await fetchNonce({ address: deployer, network });
console.log("Start nonce:", nonce.toString());

console.log("\nPhase 1 — deploy contracts in dependency order:");
for (const name of ORDER) {
  result.txids[name] = await deploy(name, nonce++);
}
for (const name of ORDER) {
  const ok = await waitFor(result.txids[name], name);
  if (!ok) { writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2)); process.exit(1); }
}

console.log("\nPhase 2 — post-deploy wiring:");
const [sbtcAddr, sbtcName] = SBTC_MAINNET.split(".");
result.txids["set-payment-token"] = await call(
  "sbtc-commerce", "set-payment-token", [Cl.contractPrincipal(sbtcAddr, sbtcName)], nonce++, "set-payment-token"
);
result.txids["add-protocol-caller"] = await call(
  "reputation-registry-v2", "add-protocol-caller", [Cl.contractPrincipal(deployer, "sbtc-commerce")], nonce++, "add-protocol-caller"
);
await waitFor(result.txids["set-payment-token"], "set-payment-token");
await waitFor(result.txids["add-protocol-caller"], "add-protocol-caller");

for (const c of ORDER) result.contracts[c] = `${deployer}.${c}`;
writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
console.log("\n========== sBTC MAINNET DEPLOY COMPLETE ==========");
for (const c in result.contracts) console.log(" ", result.contracts[c]);
