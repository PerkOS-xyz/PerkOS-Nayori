// Explicit v6/v5 QA deployment. Preflight never reads signer files or builds transactions.
import { pathToFileURL } from "node:url";
import { Cl, cvToValue } from "@stacks/transactions";
import {
  DEPLOYER,
  AUTHORITY,
  CONTRACTS,
  REPUTATION,
  SBTC,
  CALL_FEE,
  DEPLOY_FEE,
  RESERVE,
  SOURCE_HASHES,
  SafetyError,
  ensure,
  guard,
  roles,
  release,
  signer,
  info,
  sources,
  read,
  ok,
  verifyConfig,
  account,
  nonce,
  Journal,
  deploy,
  call,
  callIntent,
} from "./service-fee-testnet-core.mjs";

export async function deploymentPlan(treasury) {
  roles(treasury);
  const chain = await info();
  const occupied = await sources(false);
  ensure(
    ok(await read(REPUTATION, "get-owner")) === DEPLOYER,
    "QA reputation owner differs",
  );
  const operations = [];
  for (const name of Object.values(CONTRACTS)) {
    let config;
    if (!occupied[name])
      operations.push({ label: `deploy-${name}`, kind: "deploy", name });
    else {
      ensure(
        ok(await read(name, "get-owner")) === DEPLOYER,
        "QA escrow owner differs",
      );
      config = ok(await read(name, "get-protocol-config"));
    }
    if (!config?.configured) {
      if (occupied[name])
        ensure(
          ok(await read(name, "get-job-count")) === "0",
          "Unconfigured candidate already has jobs",
        );
      operations.push({
        label: `initialize-${name}`,
        kind: "call",
        name,
        fn: "initialize-protocol",
        args: [Cl.uint(3), Cl.principal(AUTHORITY), Cl.principal(treasury)],
      });
    } else verifyConfig(config, treasury);
    if (
      name === CONTRACTS.sbtc &&
      (!occupied[name] || ok(await read(name, "get-payment-token")) !== SBTC)
    ) {
      if (occupied[name])
        ensure(
          ok(await read(name, "get-job-count")) === "0",
          "Refusing to change token for a used candidate",
        );
      operations.push({
        label: "set-canonical-sbtc",
        kind: "call",
        name,
        fn: "set-payment-token",
        args: [Cl.principal(SBTC)],
      });
    }
    if (
      cvToValue(
        await read(REPUTATION, "is-registered-caller", [
          Cl.principal(`${DEPLOYER}.${name}`),
        ]),
      ) !== true
    ) {
      operations.push({
        label: `authorize-${name}`,
        kind: "call",
        name: REPUTATION,
        fn: "add-protocol-caller",
        args: [Cl.principal(`${DEPLOYER}.${name}`)],
      });
    }
  }
  const balance = (await account(DEPLOYER)).stx;
  const nextNonce = await nonce(DEPLOYER);
  const fees = operations.reduce(
    (sum, op) => sum + (op.kind === "deploy" ? DEPLOY_FEE : CALL_FEE),
    0n,
  );
  return {
    operations,
    report: {
      network: "testnet",
      deployer: DEPLOYER,
      treasury,
      burnBlockHeight: chain.burn_block_height,
      stacksTipHeight: chain.stacks_tip_height,
      sourceHashes: SOURCE_HASHES,
      occupied,
      nonce: String(nextNonce),
      balanceMicroStx: String(balance),
      maximumFeesMicroStx: String(fees),
      reserveMicroStx: String(RESERVE),
      requiredMicroStx: String(fees + RESERVE),
      ready: balance >= fees + RESERVE,
      operations: operations.map(({ label, kind, name, fn }) => ({
        label,
        kind,
        name,
        fn,
      })),
    },
  };
}
export async function main(env = process.env) {
  const action = guard(env, "deploy");
  const treasury = roles(env.SERVICE_FEE_TREASURY_ADDRESS).treasury;
  const sha = release(env, action === "deploy");
  const plan = await deploymentPlan(treasury);
  console.log(
    JSON.stringify({ action, sourceCommit: sha, ...plan.report }, null, 2),
  );
  if (action === "preflight") return plan.report;
  ensure(plan.report.ready, "Insufficient testnet fee balance plus reserve");
  const journal = new Journal(env.SERVICE_FEE_RESULT_PATH, {
    kind: "deploy",
    sourceCommit: sha,
    treasury,
    network: "testnet",
  });
  try {
    const key = signer(
      env.SERVICE_FEE_DEPLOYER_ENV_PATH,
      DEPLOYER,
      "DEPLOYER_PRIVATE_KEY",
    );
    journal.data.preflight = plan.report;
    journal.save();
    for (const op of plan.operations) {
      const tx =
        op.kind === "deploy"
          ? await deploy(journal, op.name, key)
          : await call(
              journal,
              op.label,
              callIntent(op.name, op.fn, op.args, DEPLOYER),
              key,
              op.args,
            );
      journal.check(`${op.label}: ok true`, tx.tx_result?.repr === "(ok true)");
    }
    const after = await deploymentPlan(treasury);
    journal.check(
      "No deployment or configuration operation remains",
      after.operations.length === 0,
    );
    journal.data.postflight = after.report;
    journal.data.result = "passed";
    journal.data.completedAt = new Date().toISOString();
    journal.save();
    return journal.data;
  } finally {
    journal.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof SafetyError
        ? error.message
        : "Testnet deployment stopped; inspect public preflight/journal. No secret inputs logged.",
    );
    process.exitCode = 1;
  });
}
