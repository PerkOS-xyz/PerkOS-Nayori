import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(root, "tests/e2e/qa-suite.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const action = process.argv[2] || "plan";
const caseId = process.argv[3]?.toUpperCase();
const evidenceDir = resolve(
  process.env.NAYORI_QA_E2E_EVIDENCE_DIR || "/tmp/nayori-qa-full-system-v1"
);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function validateManifest() {
  check(manifest.schemaVersion === 1, "Unsupported QA suite schema.");
  check(manifest.network === "testnet", "QA suite must target testnet.");
  check(manifest.chainId === 2_147_483_648, "QA suite chain ID must be Stacks testnet.");
  check(manifest.cases.length === 20, "QA suite must contain exactly 20 cases.");
  check(new Set(manifest.cases.map((item) => item.id)).size === 20, "QA case IDs must be unique.");
  for (const origin of Object.values(manifest.origins)) {
    const url = new URL(origin);
    check(url.protocol === "https:", `QA origin must use HTTPS: ${origin}`);
    check(url.hostname === "qa.nayori.ai" || url.hostname.endsWith(".qa.nayori.ai"),
      `Production or non-QA origin is forbidden: ${origin}`);
  }
  for (const contract of Object.values(manifest.contracts)) {
    check(contract.startsWith("ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5."),
      `Non-QA contract is forbidden: ${contract}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeReceipt(name, payload) {
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const path = resolve(evidenceDir, name);
  writeFileSync(path, body, { mode: 0o600 });
  return { path, sha256: sha256(body) };
}

async function request(url, expectedStatus) {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { accept: "application/json", "user-agent": "nayori-qa-e2e/1" },
  });
  check(response.status === expectedStatus, `${url} returned ${response.status}, expected ${expectedStatus}.`);
  return { response, body: await response.text() };
}

async function preflight() {
  const checks = [];
  const add = (name, ok, detail) => {
    checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
    check(ok, `${name} failed${detail ? `: ${detail}` : "."}`);
  };
  const web = await request(`${manifest.origins.web}/api/health`, 200);
  const webBody = JSON.parse(web.body);
  add("web reports testnet", webBody.network === "testnet", webBody.network);
  add("web exposes exact release", /^[0-9a-f]{40}$/.test(webBody.release || ""), webBody.release);

  const docs = await request(manifest.origins.docs, 200);
  add("docs render", docs.body.includes("Nayori"));

  const api = JSON.parse((await request(`${manifest.origins.api}/supported`, 200)).body);
  add("resource API is external OAuth", api.oauthEnabled === true && api.oauthMode === "external");
  add("resource API exposes x402", api.publicResourceEnabled === true);
  add("resource API exposes MPP", api.mppResourceEnabled === true);

  const facilitator = JSON.parse((await request(`${manifest.origins.facilitator}/supported`, 200)).body);
  add("facilitator settlement enabled", facilitator.settlementEnabled === true);
  add("facilitator confirmation enabled", facilitator.confirmationEnabled === true);
  add("facilitator delivery ledger enabled", facilitator.deliveryLedgerEnabled === true);
  add("facilitator remains testnet", facilitator.networks?.length === 1 && facilitator.networks[0] === "stacks:2147483648");

  await request(`${manifest.origins.oauth}/ready`, 200);
  add("OAuth ready", true);
  await request(`${manifest.origins.evaluator}/healthz`, 200);
  add("evaluator healthy", true);

  const x402 = await request(`${manifest.origins.web}/api/v1`, 402);
  const x402Body = JSON.parse(x402.body);
  add("public x402 challenge is STX testnet",
    x402Body.accepts?.length === 1 && x402Body.accepts[0].asset === "STX" &&
      x402Body.accepts[0].network === "stacks:2147483648");
  add("public x402 quote is request-bound",
    typeof x402Body.extensions?.["nayori.stacks.quote"]?.signedQuote === "string");

  const mpp = await request(`${manifest.origins.web}/api/mpp/v1`, 402);
  const mppBody = JSON.parse(mpp.body);
  add("public MPP challenge is USDCx on testnet",
    mppBody.payment?.method === "usdc" && mppBody.payment?.request?.methodDetails?.stacks?.network === "testnet");

  for (const contract of Object.values(manifest.contracts)) {
    const [address, name] = contract.split(".");
    await request(`https://api.testnet.hiro.so/v2/contracts/interface/${address}/${name}`, 200);
    add(`contract interface exists: ${name}`, true);
  }

  const receipt = writeReceipt("PREFLIGHT.json", {
    schemaVersion: 1,
    suiteId: manifest.suiteId,
    classification: manifest.classification,
    action: "preflight",
    createdAt: new Date().toISOString(),
    checks,
    result: "passed",
  });
  console.log(JSON.stringify({ result: "passed", checks: checks.length, receipt }, null, 2));
}

function contractCase(item) {
  check(item?.driver === "autonomous-contract", `${caseId || "Case"} is not an autonomous contract case.`);
  check(process.env.CONFIRM_NAYORI_QA_E2E === "yes",
    "Refusing transactions: set CONFIRM_NAYORI_QA_E2E=yes after reviewing the case plan.");
  check(process.env.STACKS_NETWORK === "testnet", "STACKS_NETWORK must be testnet.");
  const receiptPath = resolve(evidenceDir, `${item.id}-${item.asset}-${item.scenario}.json`);
  const childEnv = {
    ...process.env,
    STACKS_NETWORK: "testnet",
    CONFIRM_AUTONOMOUS_ESCROW_TESTNET_E2E: "yes",
    AUTONOMOUS_ESCROW_E2E_ASSET: item.asset,
    AUTONOMOUS_ESCROW_E2E_SCENARIO: item.scenario,
    AUTONOMOUS_ESCROW_E2E_RESULT_PATH: receiptPath,
  };
  if (action === "resume") {
    check(item.delayed === true, `${item.id} is not resumable.`);
    check(existsSync(receiptPath), `Missing prepared receipt: ${receiptPath}`);
    const previous = JSON.parse(readFileSync(receiptPath, "utf8"));
    check(/^\d+$/.test(previous.job?.id || ""), `Prepared receipt has no job ID: ${receiptPath}`);
    childEnv.AUTONOMOUS_ESCROW_E2E_JOB_ID = previous.job.id;
  } else {
    check(action === "run", `Unsupported contract action: ${action}`);
    check(!existsSync(receiptPath), `Receipt already exists; refusing duplicate preparation: ${receiptPath}`);
  }
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  const child = spawn(process.execPath, [resolve(root, "scripts/e2e-autonomous-escrow-testnet.mjs")], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exitCode = code ?? 1;
  });
}

function printPlan() {
  const rows = manifest.cases.map(({ id, group, asset, scenario, driver, delayed }) => ({
    id, group, asset: asset || "-", scenario, driver, phase: delayed ? "prepare/resume" : "single",
  }));
  console.table(rows);
  console.log(`\nClassification: ${manifest.classification}`);
  console.log("No transaction is created by plan or preflight.");
}

validateManifest();
if (action === "plan") printPlan();
else if (action === "preflight") await preflight();
else if (action === "run" || action === "resume") {
  check(caseId, "A case ID is required.");
  contractCase(manifest.cases.find((item) => item.id === caseId));
} else throw new Error(`Unsupported action: ${action}`);
