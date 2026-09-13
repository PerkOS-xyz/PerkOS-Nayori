// Guarded promotion of the QA-verified v6/v5 service-fee contracts to mainnet.
// The default action is a signer-free, transaction-free preflight.
import { pathToFileURL } from "node:url";
import {
  SafetyError,
  CONTRACTS,
  MAXIMUM_TOTAL_FEES,
  guard,
  release,
  lockfileHash,
  deploymentPlan,
  signer,
  verifyTreasuryAttestation,
  Journal,
  reconcileJournal,
  campaignFeeTotal,
  waitForFinality,
  deploy,
  call,
} from "./service-fee-mainnet-core.mjs";

export async function main(env = process.env) {
  const action = guard(env, "deploy");
  const treasury = env.SERVICE_FEE_MAINNET_TREASURY_ADDRESS;
  const sha = release(env, action === "deploy");
  const dependencyLockHash = lockfileHash();
  if (action === "preflight") {
    const plan = await deploymentPlan(treasury);
    console.log(
      JSON.stringify(
        { action, sourceCommit: sha, dependencyLockHash, ...plan.report },
        null,
        2,
      ),
    );
    return plan.report;
  }
  const treasuryAttestation = verifyTreasuryAttestation(
    env.SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH,
    { expectedTreasury: treasury, expectedReviewedSha: sha },
  );
  const journal = new Journal(env.SERVICE_FEE_MAINNET_RECEIPT_PATH, {
    kind: "deploy-v6-v5",
    network: "mainnet",
    sourceCommit: sha,
    dependencyLockHash,
    treasury,
  }, {
    campaignStateDir: env.SERVICE_FEE_MAINNET_STATE_DIR,
  });
  try {
    if (!journal.data.treasuryCustodyAttestation)
      journal.data.treasuryCustodyAttestation = treasuryAttestation;
    journal.check(
      "Leather treasury custody proven by valid release-bound SIP-018 attestation",
      treasuryAttestation.treasury === treasury &&
        treasuryAttestation.reviewedSha === sha,
    );
    journal.save();
    await reconcileJournal(journal, treasury);
    const current = await deploymentPlan(treasury);
    for (const name of Object.values(CONTRACTS)) {
      if (current.report.occupied[name] && !journal.data.transactions[`deploy-${name}`])
        throw new SafetyError(
          `${name} exists without this canonical campaign journal; explicit adoption review required`,
        );
    }
    if (!current.report.ready)
      throw new SafetyError("Insufficient mainnet balance for the remaining fee cap plus reserve");
    const cumulativeFeeBudget = campaignFeeTotal(journal, current.operations);
    if (cumulativeFeeBudget > MAXIMUM_TOTAL_FEES)
      throw new SafetyError("Cumulative mainnet deployment fees exceed the hard cap");
    journal.data.reconciledPreflight = current.report;
    journal.data.cumulativeFeeBudgetMicroStx = String(cumulativeFeeBudget);
    journal.save();
    const key = current.operations.length > 0
      ? signer(env.SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH)
      : null;
    for (const operation of current.operations) {
      const transaction = operation.kind === "deploy"
        ? await deploy(journal, operation.name, key)
        : await call(journal, operation, key);
      journal.check(
        `${operation.label}: canonical anchored ok`,
        transaction.tx_status === "success" &&
          transaction.tx_result?.repr === "(ok true)",
      );
    }
    await reconcileJournal(journal, treasury);
    const after = await deploymentPlan(treasury);
    journal.check("No deployment or configuration operation remains", after.operations.length === 0);
    journal.data.postflight = after.report;
    await waitForFinality(journal);
    journal.data.result = "passed";
    journal.data.completedAt = new Date().toISOString();
    journal.save();
    return journal.data;
  } finally {
    journal.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof SafetyError
        ? error.message
        : "Mainnet promotion stopped; inspect the public preflight/journal. Secret inputs were not logged.",
    );
    process.exitCode = 1;
  });
}
