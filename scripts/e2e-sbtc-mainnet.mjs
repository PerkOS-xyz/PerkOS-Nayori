// End-to-end sBTC escrow job on Stacks MAINNET (Stacks Endowment Milestone 1 evidence).
// REAL sBTC and REAL STX are spent. Plays a full job: client funds escrow in sBTC, provider
// submits work, evaluator completes, provider is paid in sBTC, reputation updates at settlement,
// client rates the provider. Also proves the hardening: a client cannot reject delivered work.
//
// Note on actors: provider and evaluator are ephemeral wallets generated here, so this
// demonstrates the mechanism end to end. Milestone 2 separately requires jobs from wallets
// NOT operated by the PerkOS team.
import { readFileSync, writeFileSync } from "node:fs";
import {
  makeContractCall, makeSTXTokenTransfer, broadcastTransaction, fetchNonce,
  fetchCallReadOnlyFunction, cvToValue, getAddressFromPrivateKey, randomPrivateKey,
  Cl, PostConditionMode,
} from "@stacks/transactions";
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const EXP = (t) => `https://explorer.hiro.so/txid/${t}?chain=mainnet`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const [SBTC_ADDR, SBTC_NAME] = SBTC.split(".");
const C = "sbtc-commerce", R = "reputation-registry-v2";
const BUDGET = 10000n; // 0.0001 sBTC in sats
const FEE = 300000n;
const RESULT_PATH = "/private/tmp/claude-501/-Users-osx-Projects-Stacks/9ce56664-604b-4571-86cd-771a7ab5ffd1/scratchpad/e2e-sbtc-mainnet.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`  ${cond ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const env = Object.fromEntries(readFileSync(".env.mainnet", "utf8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const clientKey = env.DEPLOYER_PRIVATE_KEY;
const client = env.DEPLOYER_ADDRESS;
if (getAddressFromPrivateKey(clientKey, "mainnet") !== client) { console.log("✗ key/address mismatch"); process.exit(1); }
const escrowContract = `${client}.${C}`;

const provKey = randomPrivateKey(), provider = getAddressFromPrivateKey(provKey, "mainnet");
const evalKey = randomPrivateKey(), evaluator = getAddressFromPrivateKey(evalKey, "mainnet");
console.log("client (deployer):", client);
console.log("provider:", provider);
console.log("evaluator:", evaluator);
console.log("escrow:", escrowContract);
console.log("sBTC:", SBTC, "\n");

const tokenArg = () => Cl.contractPrincipal(SBTC_ADDR, SBTC_NAME);

async function waitFor(txid, label) {
  for (let i = 0; i < 160; i++) {
    const r = await fetch(`${API}/extended/v1/tx/${txid}`);
    const d = r.ok ? await r.json() : {};
    if (d.tx_status === "success") return d;
    if (String(d.tx_status || "").startsWith("abort")) { console.log(`  ! ${label}: ${d.tx_result?.repr}`); return d; }
    await sleep(15000);
  }
  console.log(`  ! ${label} timed out`); return null;
}
async function send(tx, label) {
  const res = await broadcastTransaction({ transaction: tx, network });
  if (res.error) { console.log(`  ✗ broadcast ${label}: ${res.error} ${res.reason || ""}`); throw new Error(label); }
  console.log(`  → ${label}: ${res.txid}`);
  return { txid: res.txid, receipt: await waitFor(res.txid, label) };
}
async function pub(contract, fn, args, key, nonce, label) {
  const tx = await makeContractCall({
    contractAddress: client, contractName: contract, functionName: fn, functionArgs: args,
    senderKey: key, network, nonce, fee: FEE, postConditionMode: PostConditionMode.Allow,
  });
  return send(tx, label);
}
async function read(contract, fn, args) {
  return fetchCallReadOnlyFunction({
    contractAddress: client, contractName: contract, functionName: fn,
    functionArgs: args, network, senderAddress: client,
  });
}
async function sbtcBalance(addr) {
  const r = await fetch(`${API}/extended/v1/address/${addr}/balances`);
  const d = await r.json();
  return BigInt(d.fungible_tokens?.[`${SBTC}::sbtc-token`]?.balance ?? 0);
}

const out = { network: "mainnet", escrow: escrowContract, sbtc: SBTC, client, provider, evaluator, budgetSats: String(BUDGET), txids: {} };
let n = await fetchNonce({ address: client, network });
console.log("Start nonce:", n.toString(), "\n");

console.log("STEP 0 — fund ephemeral actors with STX for fees:");
out.txids.fundProvider = (await send(await makeSTXTokenTransfer({ recipient: provider, amount: 1_000_000n, senderKey: clientKey, network, nonce: n++, fee: 200000n }), "fund provider")).txid;
out.txids.fundEvaluator = (await send(await makeSTXTokenTransfer({ recipient: evaluator, amount: 1_000_000n, senderKey: clientKey, network, nonce: n++, fee: 200000n }), "fund evaluator")).txid;

console.log("\nSTEP 1 — create-job (client):");
const height = Number((await (await fetch(`${API}/v2/info`)).json()).stacks_tip_height);
const created = await pub(C, "create-job", [
  Cl.none(), Cl.principal(evaluator), Cl.uint(height + 1000), Cl.stringAscii("PerkOS Milestone 1: sBTC-escrowed agent job on Bitcoin"),
], clientKey, n++, "create-job");
out.txids.createJob = created.txid;
check("create-job ok", created.receipt?.tx_result?.repr?.startsWith("(ok u"), created.receipt?.tx_result?.repr);
const jobId = Number(cvToValue(await read(C, "get-job-count", [])).value);
out.jobId = jobId;
console.log("  job id =", jobId);

console.log("\nSTEP 2 — set-budget + fund-job (sBTC into escrow):");
out.txids.setBudget = (await pub(C, "set-budget", [Cl.uint(jobId), Cl.uint(BUDGET)], clientKey, n++, "set-budget")).txid;
const clientBefore = await sbtcBalance(client);
const funded = await pub(C, "fund-job", [Cl.uint(jobId), tokenArg()], clientKey, n++, "fund-job");
out.txids.fundJob = funded.txid;
check("fund-job ok", funded.receipt?.tx_result?.repr === "(ok true)", funded.receipt?.tx_result?.repr);
const escrowBal = cvToValue(await read(C, "get-escrow-balance", [Cl.uint(jobId)])).value;
check("escrow holds the sBTC budget", String(escrowBal) === String(BUDGET), `escrow=${escrowBal} sats`);
check("client sBTC debited", clientBefore - (await sbtcBalance(client)) === BUDGET, `debited ${BUDGET} sats`);
check("escrow contract holds sBTC on-chain", (await sbtcBalance(escrowContract)) >= BUDGET);

console.log("\nSTEP 3 — assign-provider + submit-work:");
out.txids.assignProvider = (await pub(C, "assign-provider", [Cl.uint(jobId), Cl.principal(provider)], clientKey, n++, "assign-provider")).txid;
out.txids.submitWork = (await pub(C, "submit-work", [Cl.uint(jobId), Cl.bufferFromAscii("deliverable-hash-m1-mainnet")], provKey, 0, "submit-work")).txid;
const st3 = cvToValue(await read(C, "get-job", [Cl.uint(jobId)])).value.status.value;
check("status = SUBMITTED (2)", String(st3) === "2", `status=${st3}`);

console.log("\nSTEP 4 — HARDENING PROOF: client must NOT be able to reject delivered work:");
const badReject = await pub(C, "reject-job", [Cl.uint(jobId), tokenArg()], clientKey, n++, "reject-job(by client, expected to fail)");
out.txids.rejectByClient = badReject.txid;
check("client reject refused with u309", badReject.receipt?.tx_result?.repr === "(err u309)", badReject.receipt?.tx_result?.repr);
check("escrow still intact after refused reject", String(cvToValue(await read(C, "get-escrow-balance", [Cl.uint(jobId)])).value) === String(BUDGET));

console.log("\nSTEP 5 — complete-job (evaluator) -> sBTC payout + reputation:");
const provBefore = await sbtcBalance(provider);
const completed = await pub(C, "complete-job", [Cl.uint(jobId), tokenArg()], evalKey, 0, "complete-job");
out.txids.completeJob = completed.txid;
check("complete-job ok", completed.receipt?.tx_result?.repr === "(ok true)", completed.receipt?.tx_result?.repr);
const st4 = cvToValue(await read(C, "get-job", [Cl.uint(jobId)])).value.status.value;
check("status = COMPLETED (3)", String(st4) === "3", `status=${st4}`);
const provAfter = await sbtcBalance(provider);
check("provider RECEIVED sBTC", provAfter - provBefore === BUDGET, `+${provAfter - provBefore} sats`);
check("escrow cleared", String(cvToValue(await read(C, "get-escrow-balance", [Cl.uint(jobId)])).value) === "0");
const rep = cvToValue(await read(R, "get-reputation", [Cl.principal(provider)])).value;
check("reputation completed-jobs = 1", String(rep["completed-jobs"].value) === "1", `completed=${rep["completed-jobs"].value}`);

console.log("\nSTEP 6 — rate-provider (gated to job participants):");
const rated = await pub(C, "rate-provider", [Cl.uint(jobId), Cl.uint(5), Cl.stringAscii("Milestone 1 sBTC settlement verified")], clientKey, n++, "rate-provider");
out.txids.rateProvider = rated.txid;
check("rate-provider ok", rated.receipt?.tx_result?.repr === "(ok true)", rated.receipt?.tx_result?.repr);
const rep2 = cvToValue(await read(R, "get-reputation", [Cl.principal(provider)])).value;
check("average-score-x100 = 500 (5.00)", String(rep2["average-score-x100"].value) === "500", `avg=${rep2["average-score-x100"].value}`);

out.pass = pass; out.fail = fail;
writeFileSync(RESULT_PATH, JSON.stringify(out, null, 2));
console.log(`\n========== MAINNET sBTC E2E: ${pass} passed, ${fail} failed ==========`);
console.log("Evidence (mainnet explorer):");
for (const [k, v] of Object.entries(out.txids)) console.log(`  ${k}: ${EXP(v)}`);
process.exit(fail === 0 ? 0 : 1);
