// Minimal, fail-closed mainnet smoke test for Nayori's sBTC v3 escrow.
// This internal team-operated job is release evidence, never external M2 adoption.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  Cl,
  Pc,
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
import { STACKS_MAINNET as network } from "@stacks/network";

const API = "https://api.hiro.so";
const CLIENT = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const CONTRACT_NAME = "sbtc-commerce-v3";
const REPUTATION_NAME = "reputation-registry-v3";
const ESCROW_CONTRACT = `${CLIENT}.${CONTRACT_NAME}`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const [SBTC_ADDRESS, SBTC_NAME] = SBTC.split(".");
const SBTC_ASSET_NAME = "sbtc-token";
const BUDGET = 100n;
const REVIEW_WINDOW_BURN_BLOCKS = 12n;
const ACTOR_FUNDING = 500_000n;
const TRANSFER_FEE = 150_000n;
const CALL_FEE = 200_000n;
const ACTION = process.env.VERSIONED_ESCROW_MAINNET_E2E_ACTION || "preflight";
const ENV_PATH =
  process.env.VERSIONED_ESCROW_MAINNET_ENV_PATH || ".env.mainnet";
const ACTOR_ENV_PATH = process.env.VERSIONED_ESCROW_MAINNET_ACTOR_ENV_PATH;
const RESULT_PATH =
  process.env.VERSIONED_ESCROW_MAINNET_E2E_RESULT_PATH ||
  "/tmp/nayori-versioned-sbtc-mainnet-smoke.json";
const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const EXPECTED_SOURCE_HASHES = Object.freeze({
  "sip-010-trait": "a9e0b5050db87bff71bbe893b981425497c1a1d3191a9cc65e221c32a1a37b52",
  "reputation-registry-v3": "05f5996c11d07f4f2ee91c2ff083e33b232e5b1a684a614712847837ea24074a",
  "agentic-commerce-v4": "680491c2466bd3f614eda7fa3eba1a393202bb2736d673074e838b0eba11fc27",
  "sbtc-commerce-v3": "dc46bf5dafbc73dea3e578786e10426d233c9338df68ef0265b5066cbad55cda",
});
const CONTRACT_FILES = Object.keys(EXPECTED_SOURCE_HASHES);

if (process.env.STACKS_NETWORK !== "mainnet") {
  throw new Error("Refusing E2E: set STACKS_NETWORK=mainnet explicitly.");
}
if (!new Set(["preflight", "execute"]).has(ACTION)) {
  throw new Error(
    "VERSIONED_ESCROW_MAINNET_E2E_ACTION must be preflight or execute."
  );
}

function assertExternalPath(path, label) {
  if (!path || !isAbsolute(path)) {
    throw new Error(`${label} must be an explicit absolute path outside Git`);
  }
  const worktree = `${resolve(process.cwd())}/`;
  if (resolve(path).startsWith(worktree)) {
    throw new Error(`${label} must be outside the Git worktree`);
  }
}

assertExternalPath(RESULT_PATH, "VERSIONED_ESCROW_MAINNET_E2E_RESULT_PATH");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sources = new Map();
const sourceHashes = {};
for (const name of CONTRACT_FILES) {
  const source = readFileSync(`contracts/${name}.clar`, "utf8");
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest !== EXPECTED_SOURCE_HASHES[name]) {
    throw new Error(`${name}.clar differs from frozen SHA-256 ${EXPECTED_SOURCE_HASHES[name]}`);
  }
  sources.set(name, source);
  sourceHashes[name] = digest;
}

const output = {
  schemaVersion: 1,
  network: "mainnet",
  action: ACTION,
  sourceCommit,
  client: CLIENT,
  escrowContract: ESCROW_CONTRACT,
  reputationContract: `${CLIENT}.${REPUTATION_NAME}`,
  canonicalSbtc: SBTC,
  budgetAtomicSbtc: BUDGET.toString(),
  actorFundingMicroStx: ACTOR_FUNDING.toString(),
  sourceHashes,
  actors: {},
  job: {},
  transactions: {},
  checks: [],
  result: "running",
  startedAt: new Date().toISOString(),
};

function saveReceipt() {
  writeFileSync(RESULT_PATH, `${JSON.stringify(output, null, 2)}\n`, {
    mode: 0o600,
  });
}

function recordCheck(name, condition, detail = "") {
  const passed = Boolean(condition);
  output.checks.push({ name, passed, detail });
  console.log(`  ${passed ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  saveReceipt();
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function parseEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
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
}

function responseValue(clarityValue) {
  const decoded = cvToValue(clarityValue);
  if (!decoded || typeof decoded !== "object" || !("value" in decoded)) {
    throw new Error(`Expected ok Clarity response, received ${JSON.stringify(decoded)}`);
  }
  return decoded.value;
}

function scalar(value) {
  return value && typeof value === "object" && "value" in value
    ? scalar(value.value)
    : value;
}

function uint(value) {
  return BigInt(scalar(value));
}

function bool(value) {
  return Boolean(scalar(value));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function read(contractName, functionName, functionArgs = []) {
  return fetchCallReadOnlyFunction({
    contractAddress: CLIENT,
    contractName,
    functionName,
    functionArgs,
    network,
    senderAddress: CLIENT,
  });
}

async function balances(address) {
  const { response, data } = await fetchJson(
    `${API}/extended/v1/address/${address}/balances`
  );
  if (!response.ok) throw new Error(`Unable to read balances for ${address}`);
  return data;
}

async function stxBalance(address) {
  return BigInt((await balances(address)).stx?.balance ?? 0);
}

async function sbtcBalance(address) {
  return BigInt(
    (await balances(address)).fungible_tokens?.[`${SBTC}::${SBTC_ASSET_NAME}`]
      ?.balance ?? 0
  );
}

async function getJob(jobId) {
  return responseValue(await read(CONTRACT_NAME, "get-job", [Cl.uint(jobId)]));
}

async function getEscrow(jobId) {
  return uint(
    responseValue(
      await read(CONTRACT_NAME, "get-escrow-balance", [Cl.uint(jobId)])
    )
  );
}

async function chainInfo() {
  const { response, data } = await fetchJson(`${API}/v2/info`);
  if (!response.ok) throw new Error("Unable to read Stacks mainnet chain info");
  return data;
}

async function verifyContracts() {
  for (const name of CONTRACT_FILES) {
    const { response, data } = await fetchJson(
      `${API}/v2/contracts/source/${CLIENT}/${name}?proof=0`
    );
    const onChain = String(data.source ?? "").replaceAll("\r\n", "\n");
    const local = sources.get(name).replaceAll("\r\n", "\n");
    recordCheck(
      `${name} exact source`,
      response.ok && onChain === local,
      response.ok ? sourceHashes[name] : `HTTP ${response.status}`
    );
  }
  const reviewWindow = uint(
    responseValue(await read(CONTRACT_NAME, "get-review-window"))
  );
  recordCheck(
    "review window is 12 Bitcoin blocks",
    reviewWindow === REVIEW_WINDOW_BURN_BLOCKS,
    reviewWindow.toString()
  );
  const paymentToken = String(
    scalar(responseValue(await read(CONTRACT_NAME, "get-payment-token")))
  );
  recordCheck("canonical mainnet sBTC is configured", paymentToken === SBTC, paymentToken);
  const allowed = cvToValue(
    await read(REPUTATION_NAME, "is-registered-caller", [
      Cl.contractPrincipal(CLIENT, CONTRACT_NAME),
    ])
  );
  recordCheck("sBTC v3 is authorized for reputation", allowed === true);
}

async function waitFor(txid, label) {
  const normalized = txid.startsWith("0x") ? txid : `0x${txid}`;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const { response, data } = await fetchJson(
      `${API}/extended/v1/tx/${normalized}`
    ).catch(() => ({ response: { ok: false }, data: {} }));
    if (response.ok && data.tx_status === "success") {
      const result = String(data.tx_result?.repr ?? "");
      if (!result.startsWith("(ok")) {
        throw new Error(`${label} confirmed without ok result: ${result}`);
      }
      return data;
    }
    if (
      response.ok &&
      (String(data.tx_status).startsWith("abort") ||
        String(data.tx_status).startsWith("dropped"))
    ) {
      throw new Error(
        `${label} failed: ${data.tx_status} ${data.tx_result?.repr ?? ""}`
      );
    }
    await sleep(10_000);
  }
  throw new Error(`${label} confirmation timed out`);
}

async function send(transaction, label) {
  const result = await broadcastTransaction({ transaction, network });
  if (result.error) {
    throw new Error(`${label} rejected: ${result.reason || result.error}`);
  }
  const txid = result.txid.startsWith("0x") ? result.txid : `0x${result.txid}`;
  console.log(`  → ${label}: ${txid}`);
  const receipt = await waitFor(txid, label);
  output.transactions[label] = {
    txid,
    status: receipt.tx_status,
    result: receipt.tx_result?.repr,
    blockHeight: receipt.block_height,
    explorer: `https://explorer.hiro.so/txid/${txid}?chain=mainnet`,
  };
  saveReceipt();
  console.log(`  ✓ ${label} confirmed in block ${receipt.block_height}`);
  return receipt;
}

async function call({
  functionName,
  functionArgs,
  senderKey,
  nonce,
  label,
  postConditions = [],
}) {
  return send(
    await makeContractCall({
      contractAddress: CLIENT,
      contractName: CONTRACT_NAME,
      functionName,
      functionArgs,
      senderKey,
      network,
      nonce,
      fee: CALL_FEE,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    }),
    label
  );
}

function tokenArgument() {
  return Cl.contractPrincipal(SBTC_ADDRESS, SBTC_NAME);
}

function createOrLoadActorKeys() {
  assertExternalPath(
    ACTOR_ENV_PATH,
    "VERSIONED_ESCROW_MAINNET_ACTOR_ENV_PATH"
  );
  if (!existsSync(ACTOR_ENV_PATH)) {
    const providerKey = randomPrivateKey();
    const evaluatorKey = randomPrivateKey();
    writeFileSync(
      ACTOR_ENV_PATH,
      `PROVIDER_PRIVATE_KEY=${providerKey}\nEVALUATOR_PRIVATE_KEY=${evaluatorKey}\n`,
      { mode: 0o600, flag: "wx" }
    );
  }
  const permissions = statSync(ACTOR_ENV_PATH).mode & 0o777;
  if ((permissions & 0o077) !== 0) {
    throw new Error("Actor recovery file must not be readable or writable by group/other");
  }
  const actorEnv = parseEnv(ACTOR_ENV_PATH);
  if (!actorEnv.PROVIDER_PRIVATE_KEY || !actorEnv.EVALUATOR_PRIVATE_KEY) {
    throw new Error("Actor recovery file is missing provider or evaluator key");
  }
  return {
    providerKey: actorEnv.PROVIDER_PRIVATE_KEY,
    evaluatorKey: actorEnv.EVALUATOR_PRIVATE_KEY,
  };
}

console.log("Nayori sBTC v3 mainnet smoke test");
console.log("Action:", ACTION);
console.log("Source:", sourceCommit);
console.log("Escrow:", ESCROW_CONTRACT);
console.log("Budget:", BUDGET.toString(), "atomic sBTC units");
saveReceipt();

try {
  await verifyContracts();
  const clientStx = await stxBalance(CLIENT);
  const clientSbtc = await sbtcBalance(CLIENT);
  const { response: mempoolResponse, data: mempool } = await fetchJson(
    `${API}/extended/v1/address/${CLIENT}/mempool?limit=50`
  );
  recordCheck("deployer mempool API is readable", mempoolResponse.ok);
  recordCheck("deployer mempool is empty", Number(mempool.total ?? 0) === 0);
  recordCheck(
    "client has STX for actors and declared fees",
    clientStx >= 4_000_000n,
    `${clientStx} micro-STX`
  );
  recordCheck(
    "client has 100 atomic sBTC units",
    clientSbtc >= BUDGET,
    `${clientSbtc} available`
  );
  output.preflight = {
    clientStxMicro: clientStx.toString(),
    clientSbtcAtomic: clientSbtc.toString(),
    initialJobCount: String(
      uint(responseValue(await read(CONTRACT_NAME, "get-job-count")))
    ),
  };
  saveReceipt();

  if (ACTION === "preflight") {
    output.result = "preflight-pass";
    output.completedAt = new Date().toISOString();
    saveReceipt();
    console.log("Signer-free mainnet smoke preflight passed; no transaction was created.");
    process.exit(0);
  }

  if (
    process.env.CONFIRM_VERSIONED_ESCROW_MAINNET_E2E !==
    "execute-100-sats-mainnet"
  ) {
    throw new Error(
      "Set CONFIRM_VERSIONED_ESCROW_MAINNET_E2E=execute-100-sats-mainnet after reviewing actors, fees and exact post-conditions."
    );
  }
  if (process.env.CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOYER !== CLIENT) {
    throw new Error(
      `Set CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOYER=${CLIENT} to confirm the client.`
    );
  }

  assertExternalPath(ENV_PATH, "VERSIONED_ESCROW_MAINNET_ENV_PATH");
  const env = parseEnv(ENV_PATH);
  const clientKey = env.DEPLOYER_PRIVATE_KEY;
  if (
    env.DEPLOYER_ADDRESS !== CLIENT ||
    !clientKey ||
    getAddressFromPrivateKey(clientKey, "mainnet") !== CLIENT
  ) {
    throw new Error("External signer does not match the reviewed mainnet client");
  }
  const { providerKey, evaluatorKey } = createOrLoadActorKeys();
  const provider = getAddressFromPrivateKey(providerKey, "mainnet");
  const evaluator = getAddressFromPrivateKey(evaluatorKey, "mainnet");
  if (new Set([CLIENT, provider, evaluator]).size !== 3) {
    throw new Error("Client, provider and evaluator must be distinct mainnet principals");
  }
  output.actors = { provider, evaluator, classification: "internal-team-operated" };
  saveReceipt();

  let clientNonce = await fetchNonce({ address: CLIENT, network });
  await send(
    await makeSTXTokenTransfer({
      recipient: provider,
      amount: ACTOR_FUNDING,
      senderKey: clientKey,
      network,
      nonce: clientNonce++,
      fee: TRANSFER_FEE,
    }),
    "fund-provider-fees"
  );
  await send(
    await makeSTXTokenTransfer({
      recipient: evaluator,
      amount: ACTOR_FUNDING,
      senderKey: clientKey,
      network,
      nonce: clientNonce++,
      fee: TRANSFER_FEE,
    }),
    "fund-evaluator-fees"
  );

  const beforeCount = uint(responseValue(await read(CONTRACT_NAME, "get-job-count")));
  const info = await chainInfo();
  const expiredAt = BigInt(info.stacks_tip_height) + 500n;
  const created = await call({
    functionName: "create-job",
    functionArgs: [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(expiredAt),
      Cl.stringAscii("Nayori internal mainnet sBTC v3 release smoke"),
    ],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "create-job",
  });
  const match = String(created.tx_result?.repr ?? "").match(/^\(ok u(\d+)\)$/);
  recordCheck("create-job returns a job id", Boolean(match), created.tx_result?.repr);
  const jobId = BigInt(match[1]);
  output.job.id = jobId.toString();

  await call({
    functionName: "set-budget",
    functionArgs: [Cl.uint(jobId), Cl.uint(BUDGET)],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "set-budget",
  });

  const clientSbtcBeforeFunding = await sbtcBalance(CLIENT);
  await call({
    functionName: "fund-job",
    functionArgs: [Cl.uint(jobId), tokenArgument()],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "fund-job",
    postConditions: [
      Pc.principal(CLIENT).willSendEq(BUDGET).ft(SBTC, SBTC_ASSET_NAME),
    ],
  });
  recordCheck("escrow equals 100 atomic sBTC units", (await getEscrow(jobId)) === BUDGET);
  recordCheck(
    "client sBTC outflow equals 100 atomic units",
    clientSbtcBeforeFunding - (await sbtcBalance(CLIENT)) === BUDGET
  );
  const pinnedToken = String(
    scalar(
      responseValue(
        await read(CONTRACT_NAME, "get-job-payment-token", [Cl.uint(jobId)])
      )
    )
  );
  recordCheck("job pins canonical mainnet sBTC", pinnedToken === SBTC, pinnedToken);

  await call({
    functionName: "assign-provider",
    functionArgs: [Cl.uint(jobId), Cl.principal(provider)],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "assign-provider",
  });

  await call({
    functionName: "submit-work",
    functionArgs: [
      Cl.uint(jobId),
      Cl.bufferFromAscii(`nayori-mainnet-sbtc-v3-${jobId}`),
    ],
    senderKey: providerKey,
    nonce: await fetchNonce({ address: provider, network }),
    label: "submit-work",
  });
  const submitted = await getJob(jobId);
  const submittedAtBurn = uint(submitted["submitted-at-burn"]);
  const reviewDeadline = uint(submitted["review-deadline"]);
  output.job.submittedAtBurn = submittedAtBurn.toString();
  output.job.reviewDeadline = reviewDeadline.toString();
  recordCheck("job is submitted u2", uint(submitted.status) === 2n);
  recordCheck(
    "review deadline is exactly 12 Bitcoin blocks",
    reviewDeadline - submittedAtBurn === REVIEW_WINDOW_BURN_BLOCKS
  );

  const providerBefore = await sbtcBalance(provider);
  await call({
    functionName: "complete-job",
    functionArgs: [Cl.uint(jobId), tokenArgument()],
    senderKey: evaluatorKey,
    nonce: await fetchNonce({ address: evaluator, network }),
    label: "complete-job",
    postConditions: [
      Pc.principal(ESCROW_CONTRACT)
        .willSendEq(BUDGET)
        .ft(SBTC, SBTC_ASSET_NAME),
    ],
  });
  const completed = await getJob(jobId);
  recordCheck("job is completed u3", uint(completed.status) === 3n);
  recordCheck("completion clears escrow", (await getEscrow(jobId)) === 0n);
  recordCheck(
    "provider receives exactly 100 atomic sBTC units",
    (await sbtcBalance(provider)) - providerBefore === BUDGET
  );

  const sync = responseValue(
    await read(CONTRACT_NAME, "get-reputation-sync", [Cl.uint(jobId)])
  );
  recordCheck("reputation sync is not pending", !bool(sync.pending));
  recordCheck("reputation sync has no error", uint(sync["last-error"]) === 0n);
  const outcome = responseValue(
    await read(REPUTATION_NAME, "get-job-outcome", [
      Cl.contractPrincipal(CLIENT, CONTRACT_NAME),
      Cl.uint(jobId),
    ])
  );
  recordCheck("reputation outcome records completion", bool(outcome.completed));
  recordCheck("reputation outcome is not disputed", !bool(outcome.disputed));

  await call({
    functionName: "rate-provider",
    functionArgs: [
      Cl.uint(jobId),
      Cl.uint(5),
      Cl.stringAscii("Nayori internal mainnet release smoke"),
    ],
    senderKey: clientKey,
    nonce: clientNonce++,
    label: "rate-provider",
  });
  const hasRated = cvToValue(
    await read(CONTRACT_NAME, "has-rated-job", [
      Cl.uint(jobId),
      Cl.principal(CLIENT),
    ])
  );
  recordCheck("client rating is persisted", hasRated === true);
  const afterCount = uint(responseValue(await read(CONTRACT_NAME, "get-job-count")));
  recordCheck("job count increased exactly once", afterCount === beforeCount + 1n);

  output.result = "pass";
  output.completedAt = new Date().toISOString();
  output.final = {
    status: "3",
    escrowAtomicSbtc: "0",
    jobCount: afterCount.toString(),
    classification: "internal-team-operated-not-m2-adoption",
  };
  saveReceipt();
  console.log(`E2E PASS: ${output.checks.length}/${output.checks.length}`);
  console.log(`Secret-free receipt: ${RESULT_PATH}`);
} catch (error) {
  output.result = "error";
  output.error = error instanceof Error ? error.message : String(error);
  output.completedAt = new Date().toISOString();
  saveReceipt();
  throw error;
}
