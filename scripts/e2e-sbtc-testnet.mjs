// End-to-end sBTC escrow test against the DEPLOYED testnet contracts (Milestone 1 rehearsal).
// Plays a real job with real sBTC: client funds escrow, provider submits, evaluator completes,
// provider is paid in sBTC, reputation updates at settlement, client rates the provider.
// Also asserts the hardening: a client cannot reject delivered work.
import { readFileSync, writeFileSync } from "node:fs";
import {
  makeContractCall, makeSTXTokenTransfer, broadcastTransaction, fetchNonce,
  fetchCallReadOnlyFunction, cvToValue, getAddressFromPrivateKey, randomPrivateKey,
  Cl, PostConditionMode,
} from "@stacks/transactions";
import { STACKS_TESTNET as network } from "@stacks/network";

const API = "https://api.testnet.hiro.so";
const EXP = (t) => `https://explorer.hiro.so/txid/${t}?chain=testnet`;
const SBTC = "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token";
const [SBTC_ADDR, SBTC_NAME] = SBTC.split(".");
const C = "sbtc-commerce", R = "reputation-registry-v2";
const BUDGET = 10000n; // 0.0001 sBTC in sats
const RESULT_PATH = "/private/tmp/claude-501/-Users-osx-Projects-Stacks/9ce56664-604b-4571-86cd-771a7ab5ffd1/scratchpad/e2e-sbtc-testnet.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`  ${cond ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const clientKey = env.DEPLOYER_PRIVATE_KEY;
const client = env.DEPLOYER_ADDRESS;
const escrowContract = `${client}.${C}`;

const provKey = randomPrivateKey(), provider = getAddressFromPrivateKey(provKey, "testnet");
const evalKey = randomPrivateKey(), evaluator = getAddressFromPrivateKey(evalKey, "testnet");
console.log("client (deployer):", client);
console.log("provider:", provider);
console.log("evaluator:", evaluator);
console.log("escrow:", escrowContract, "\n");

const tokenArg = () => Cl.contractPrincipal(SBTC_ADDR, SBTC_NAME);

async function waitFor(txid, label) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${API}/extended/v1/tx/${txid}`);
    const d = r.ok ? await r.json() : {};
    if (d.tx_status === "success") return d;
    if (String(d.tx_status || "").startsWith("abort")) { console.log(`  ! ${label}: ${d.tx_result?.repr}`); return d; }
    await sleep(10000);
  }
  console.log(`  ! ${label} timed out`); return null;
}
async function send(tx, label) {
  const res = await broadcastTransaction({ transaction: tx, network });
  if (res.error) { console.log(`  ✗ broadcast ${label}: ${res.error} ${res.reason || ""}`); throw new Error(label); }
  return { txid: res.txid, receipt: await waitFor(res.txid, label) };
}
async function pub(contract, fn, args, key, nonce, label) {
  const tx = await makeContractCall({
    contractAddress: client, contractName: contract, functionName: fn, functionArgs: args,
    senderKey: key, network, nonce, fee: 300000n, postConditionMode: PostConditionMode.Allow,
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

const out = { network: "testnet", escrow: escrowContract, sbtc: SBTC, provider, evaluator, txids: {} };
let n = await fetchNonce({ address: client, network });

console.log("STEP 0 — fund ephemeral actors with STX for fees:");
out.txids.fundProvider = (await send(await makeSTXTokenTransfer({ recipient: provider, amount: 2_000_000n, senderKey: clientKey, network, nonce: n++, fee: 200000n }), "fund provider")).txid;
out.txids.fundEvaluator = (await send(await makeSTXTokenTransfer({ recipient: evaluator, amount: 2_000_000n, senderKey: clientKey, network, nonce: n++, fee: 200000n }), "fund evaluator")).txid;
console.log("  ✓ funded\n");

console.log("STEP 1 — create-job (client):");
const height = Number((await (await fetch(`${API}/v2/info`)).json()).stacks_tip_height);
const created = await pub(C, "create-job", [
  Cl.none(), Cl.principal(evaluator), Cl.uint(height + 500), Cl.stringAscii("M1 demo: sBTC escrowed agent job"),
], clientKey, n++, "create-job");
out.txids.createJob = created.txid;
check("create-job ok", created.receipt?.tx_result?.repr?.startsWith("(ok u"), created.receipt?.tx_result?.repr);
const jobId = Number(cvToValue(await read(C, "get-job-count", [])).value);
console.log("  job id =", jobId);

console.log("\nSTEP 2 — set-budget + fund-job (sBTC into escrow):");
out.txids.setBudget = (await pub(C, "set-budget", [Cl.uint(jobId), Cl.uint(BUDGET)], clientKey, n++, "set-budget")).txid;
const clientBefore = await sbtcBalance(client);
const funded = await pub(C, "fund-job", [Cl.uint(jobId), tokenArg()], clientKey, n++, "fund-job");
out.txids.fundJob = funded.txid;
check("fund-job ok", funded.receipt?.tx_result?.repr === "(ok true)", funded.receipt?.tx_result?.repr);
const escrowBal = cvToValue(await read(C, "get-escrow-balance", [Cl.uint(jobId)])).value;
check("escrow holds the sBTC budget", String(escrowBal) === String(BUDGET), `escrow=${escrowBal}`);
const clientAfter = await sbtcBalance(client);
check("client sBTC debited", clientBefore - clientAfter === BUDGET, `delta=${clientBefore - clientAfter}`);
const contractHolds = await sbtcBalance(escrowContract);
check("escrow contract holds sBTC on-chain", contractHolds >= BUDGET, `contract balance=${contractHolds}`);

console.log("\nSTEP 3 — assign-provider + submit-work:");
out.txids.assignProvider = (await pub(C, "assign-provider", [Cl.uint(jobId), Cl.principal(provider)], clientKey, n++, "assign-provider")).txid;
const submitted = await pub(C, "submit-work", [Cl.uint(jobId), Cl.bufferFromAscii("deliverable-hash-m1")], provKey, 0, "submit-work");
out.txids.submitWork = submitted.txid;
const st3 = cvToValue(await read(C, "get-job", [Cl.uint(jobId)])).value.status.value;
check("status = SUBMITTED (2)", String(st3) === "2", `status=${st3}`);

console.log("\nSTEP 4 — HARDENING: client must NOT be able to reject delivered work:");
const badReject = await pub(C, "reject-job", [Cl.uint(jobId), tokenArg()], clientKey, n++, "reject-job(client)");
out.txids.rejectByClient = badReject.txid;
check("client reject rejected with u309", badReject.receipt?.tx_result?.repr === "(err u309)", badReject.receipt?.tx_result?.repr);

console.log("\nSTEP 5 — complete-job (evaluator) -> sBTC payout + reputation:");
const provBefore = await sbtcBalance(provider);
const completed = await pub(C, "complete-job", [Cl.uint(jobId), tokenArg()], evalKey, 0, "complete-job");
out.txids.completeJob = completed.txid;
check("complete-job ok", completed.receipt?.tx_result?.repr === "(ok true)", completed.receipt?.tx_result?.repr);
const st4 = cvToValue(await read(C, "get-job", [Cl.uint(jobId)])).value.status.value;
check("status = COMPLETED (3)", String(st4) === "3", `status=${st4}`);
const provAfter = await sbtcBalance(provider);
check("provider RECEIVED sBTC", provAfter - provBefore === BUDGET, `delta=${provAfter - provBefore} sats`);
const escrowAfter = cvToValue(await read(C, "get-escrow-balance", [Cl.uint(jobId)])).value;
check("escrow cleared", String(escrowAfter) === "0", `escrow=${escrowAfter}`);
const rep = cvToValue(await read(R, "get-reputation", [Cl.principal(provider)])).value;
check("reputation completed-jobs = 1", String(rep["completed-jobs"].value) === "1", `completed=${rep["completed-jobs"].value}`);

console.log("\nSTEP 6 — rate-provider (client rates, gated to job participants):");
const rated = await pub(C, "rate-provider", [Cl.uint(jobId), Cl.uint(5), Cl.stringAscii("excellent sBTC-settled work")], clientKey, n++, "rate-provider");
out.txids.rateProvider = rated.txid;
check("rate-provider ok", rated.receipt?.tx_result?.repr === "(ok true)", rated.receipt?.tx_result?.repr);
const rep2 = cvToValue(await read(R, "get-reputation", [Cl.principal(provider)])).value;
check("average-score-x100 = 500 (5.00)", String(rep2["average-score-x100"].value) === "500", `avg=${rep2["average-score-x100"].value}`);

out.jobId = jobId;
out.pass = pass; out.fail = fail;
writeFileSync(RESULT_PATH, JSON.stringify(out, null, 2));
console.log(`\n========== sBTC E2E RESULT: ${pass} passed, ${fail} failed ==========`);
console.log("Evidence (testnet explorer):");
for (const [k, v] of Object.entries(out.txids)) console.log(`  ${k}: ${EXP(v)}`);
process.exit(fail === 0 ? 0 : 1);
