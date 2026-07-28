// End-to-end STX escrow validation against the deployed testnet v2 contracts.
// Uses separate client, provider, and evaluator identities and verifies the
// escrow debit, provider payout, reputation update, and authorization guards.
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
  makeSTXTokenTransfer,
  randomPrivateKey,
} from "@stacks/transactions";
import { STACKS_TESTNET as network } from "@stacks/network";

const API = "https://api.testnet.hiro.so";
const CONTRACT_NAME = process.env.STX_V2_CONTRACT_NAME || "agentic-commerce-v2";
const REPUTATION_NAME = "reputation-registry-v2";
const BUDGET = 1_000_000n;
const ACTOR_FUNDING = 2_000_000n;
const RESULT_PATH = "/tmp/perkos-e2e-stx-v2-testnet.json";

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const explorerUrl = (txid) =>
  `https://explorer.hiro.so/txid/${txid.startsWith("0x") ? txid : `0x${txid}`}?chain=testnet`;

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) passed += 1;
  else failed += 1;
  console.log(
    `  ${condition ? "✓" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`
  );
}

function loadEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter(
        (line) => line && !line.startsWith("#") && line.includes("=")
      )
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
}

const env = loadEnv(".env");
const clientKey = env.DEPLOYER_PRIVATE_KEY;
const client = env.DEPLOYER_ADDRESS;
if (!clientKey || !client) {
  throw new Error("Missing DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS in .env");
}
if (getAddressFromPrivateKey(clientKey, "testnet") !== client) {
  throw new Error("DEPLOYER_PRIVATE_KEY does not match DEPLOYER_ADDRESS");
}

const providerKey = randomPrivateKey();
const provider = getAddressFromPrivateKey(providerKey, "testnet");
const evaluatorKey = randomPrivateKey();
const evaluator = getAddressFromPrivateKey(evaluatorKey, "testnet");
const contract = `${client}.${CONTRACT_NAME}`;

console.log("client:", client);
console.log("provider:", provider);
console.log("evaluator:", evaluator);
console.log("escrow:", contract, "\n");

async function waitFor(txid, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${API}/extended/v1/tx/${txid}`);
    const receipt = response.ok ? await response.json() : {};
    if (receipt.tx_status === "success") return receipt;
    if (String(receipt.tx_status || "").startsWith("abort")) {
      console.log(`  ! ${label}: ${receipt.tx_result?.repr}`);
      return receipt;
    }
    await sleep(10_000);
  }
  console.log(`  ! ${label} timed out`);
  return null;
}

async function send(transaction, label) {
  const result = await broadcastTransaction({ transaction, network });
  if (result.error) {
    throw new Error(
      `${label} broadcast rejected: ${result.reason || result.error}`
    );
  }
  return {
    txid: result.txid,
    receipt: await waitFor(result.txid, label),
  };
}

async function call(contractName, functionName, functionArgs, senderKey, nonce, label) {
  const transaction = await makeContractCall({
    contractAddress: client,
    contractName,
    functionName,
    functionArgs,
    senderKey,
    network,
    nonce,
    fee: 300_000n,
    postConditionMode: PostConditionMode.Allow,
  });
  return send(transaction, label);
}

async function read(contractName, functionName, functionArgs) {
  return fetchCallReadOnlyFunction({
    contractAddress: client,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: client,
  });
}

async function stxBalance(address) {
  const response = await fetch(`${API}/extended/v1/address/${address}/balances`);
  if (!response.ok) {
    throw new Error(`Unable to read STX balance for ${address}`);
  }
  const balances = await response.json();
  return BigInt(balances.stx?.balance ?? 0);
}

const output = {
  network: "testnet",
  contract,
  reputationContract: `${client}.${REPUTATION_NAME}`,
  provider,
  evaluator,
  budgetMicroStx: BUDGET.toString(),
  txids: {},
};
let clientNonce = await fetchNonce({ address: client, network });

console.log("STEP 0 — fund isolated provider and evaluator accounts:");
output.txids.fundProvider = (
  await send(
    await makeSTXTokenTransfer({
      recipient: provider,
      amount: ACTOR_FUNDING,
      senderKey: clientKey,
      network,
      nonce: clientNonce++,
      fee: 200_000n,
    }),
    "fund provider"
  )
).txid;
output.txids.fundEvaluator = (
  await send(
    await makeSTXTokenTransfer({
      recipient: evaluator,
      amount: ACTOR_FUNDING,
      senderKey: clientKey,
      network,
      nonce: clientNonce++,
      fee: 200_000n,
    }),
    "fund evaluator"
  )
).txid;
console.log("  ✓ actors funded\n");

console.log("STEP 1 — create a job:");
const infoResponse = await fetch(`${API}/v2/info`);
if (!infoResponse.ok) throw new Error("Unable to read testnet chain height");
const currentHeight = Number((await infoResponse.json()).stacks_tip_height);
const created = await call(
  CONTRACT_NAME,
  "create-job",
  [
    Cl.none(),
    Cl.principal(evaluator),
    Cl.uint(currentHeight + 500),
    Cl.stringAscii("PerkOS STX v2 end-to-end validation"),
  ],
  clientKey,
  clientNonce++,
  "create-job"
);
output.txids.createJob = created.txid;
check(
  "create-job succeeded",
  created.receipt?.tx_result?.repr?.startsWith("(ok u"),
  created.receipt?.tx_result?.repr
);
const jobId = Number(
  cvToValue(await read(CONTRACT_NAME, "get-job-count", [])).value
);
output.jobId = jobId;
console.log(`  job id = ${jobId}\n`);

console.log("STEP 2 — set the budget and fund the STX escrow:");
output.txids.setBudget = (
  await call(
    CONTRACT_NAME,
    "set-budget",
    [Cl.uint(jobId), Cl.uint(BUDGET)],
    clientKey,
    clientNonce++,
    "set-budget"
  )
).txid;
const clientBeforeFunding = await stxBalance(client);
const funded = await call(
  CONTRACT_NAME,
  "fund-job",
  [Cl.uint(jobId)],
  clientKey,
  clientNonce++,
  "fund-job"
);
output.txids.fundJob = funded.txid;
check(
  "fund-job succeeded",
  funded.receipt?.tx_result?.repr === "(ok true)",
  funded.receipt?.tx_result?.repr
);
const escrowBalance = cvToValue(
  await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)])
).value;
check(
  "job escrow equals the budget",
  String(escrowBalance) === String(BUDGET),
  `escrow=${escrowBalance}`
);
const clientAfterFunding = await stxBalance(client);
check(
  "client paid at least the escrow budget",
  clientBeforeFunding - clientAfterFunding >= BUDGET,
  `balance delta=${clientBeforeFunding - clientAfterFunding} micro-STX`
);
const contractBalance = await stxBalance(contract);
check(
  "contract holds the escrow on-chain",
  contractBalance >= BUDGET,
  `contract balance=${contractBalance} micro-STX`
);

console.log("\nSTEP 3 — assign the provider and submit its deliverable:");
output.txids.assignProvider = (
  await call(
    CONTRACT_NAME,
    "assign-provider",
    [Cl.uint(jobId), Cl.principal(provider)],
    clientKey,
    clientNonce++,
    "assign-provider"
  )
).txid;
const submitted = await call(
  CONTRACT_NAME,
  "submit-work",
  [Cl.uint(jobId), Cl.bufferFromAscii("perkos-stx-v2-deliverable")],
  providerKey,
  0,
  "submit-work"
);
output.txids.submitWork = submitted.txid;
const submittedStatus = cvToValue(
  await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)])
).value.status.value;
check(
  "job status is SUBMITTED (2)",
  String(submittedStatus) === "2",
  `status=${submittedStatus}`
);

console.log("\nSTEP 4 — verify that the client cannot reject delivered work:");
const unauthorizedReject = await call(
  CONTRACT_NAME,
  "reject-job",
  [Cl.uint(jobId)],
  clientKey,
  clientNonce++,
  "reject-job by client"
);
output.txids.rejectByClient = unauthorizedReject.txid;
check(
  "client rejection fails with ERR_NOT_EVALUATOR (u209)",
  unauthorizedReject.receipt?.tx_result?.repr === "(err u209)",
  unauthorizedReject.receipt?.tx_result?.repr
);

console.log("\nSTEP 5 — evaluator completes the job and releases STX:");
const providerBeforePayout = await stxBalance(provider);
const completed = await call(
  CONTRACT_NAME,
  "complete-job",
  [Cl.uint(jobId)],
  evaluatorKey,
  0,
  "complete-job"
);
output.txids.completeJob = completed.txid;
check(
  "complete-job succeeded",
  completed.receipt?.tx_result?.repr === "(ok true)",
  completed.receipt?.tx_result?.repr
);
const completedJob = cvToValue(
  await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)])
).value;
check(
  "job status is COMPLETED (3)",
  String(completedJob.status.value) === "3",
  `status=${completedJob.status.value}`
);
const providerAfterPayout = await stxBalance(provider);
check(
  "provider received exactly the STX budget",
  providerAfterPayout - providerBeforePayout === BUDGET,
  `payout=${providerAfterPayout - providerBeforePayout} micro-STX`
);
const escrowAfterPayout = cvToValue(
  await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)])
).value;
check(
  "job escrow is cleared",
  String(escrowAfterPayout) === "0",
  `escrow=${escrowAfterPayout}`
);
const reputationAfterCompletion = cvToValue(
  await read(REPUTATION_NAME, "get-reputation", [Cl.principal(provider)])
).value;
check(
  "reputation records one completed job",
  String(reputationAfterCompletion["completed-jobs"].value) === "1",
  `completed=${reputationAfterCompletion["completed-jobs"].value}`
);

console.log("\nSTEP 6 — client rates the provider:");
const rated = await call(
  CONTRACT_NAME,
  "rate-provider",
  [
    Cl.uint(jobId),
    Cl.uint(5),
    Cl.stringAscii("Excellent STX-settled work"),
  ],
  clientKey,
  clientNonce++,
  "rate-provider"
);
output.txids.rateProvider = rated.txid;
check(
  "rate-provider succeeded",
  rated.receipt?.tx_result?.repr === "(ok true)",
  rated.receipt?.tx_result?.repr
);
const reputationAfterRating = cvToValue(
  await read(REPUTATION_NAME, "get-reputation", [Cl.principal(provider)])
).value;
check(
  "rating count is 1",
  String(reputationAfterRating["rating-count"].value) === "1",
  `count=${reputationAfterRating["rating-count"].value}`
);
check(
  "average score is 5.00",
  String(reputationAfterRating["average-score-x100"].value) === "500",
  `average=${reputationAfterRating["average-score-x100"].value}`
);

console.log("\nSTEP 7 — verify duplicate ratings are blocked:");
const duplicateRating = await call(
  CONTRACT_NAME,
  "rate-provider",
  [Cl.uint(jobId), Cl.uint(4), Cl.stringAscii("Duplicate rating attempt")],
  clientKey,
  clientNonce++,
  "duplicate rate-provider"
);
output.txids.duplicateRating = duplicateRating.txid;
check(
  "duplicate rating fails with ERR_ALREADY_RATED (u214)",
  duplicateRating.receipt?.tx_result?.repr === "(err u214)",
  duplicateRating.receipt?.tx_result?.repr
);

output.passed = passed;
output.failed = failed;
writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));

console.log(
  `\n========== STX v2 E2E RESULT: ${passed} passed, ${failed} failed ==========`
);
console.log(`Evidence saved to ${RESULT_PATH}`);
console.log("Testnet explorer:");
for (const [label, txid] of Object.entries(output.txids)) {
  console.log(`  ${label}: ${explorerUrl(txid)}`);
}

process.exit(failed === 0 ? 0 : 1);
