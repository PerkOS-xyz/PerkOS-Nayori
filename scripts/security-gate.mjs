import { readFileSync } from "node:fs";

const failures = [];

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requirePattern(path, pattern, message) {
  if (!pattern.test(source(path))) failures.push(`${path}: ${message}`);
}

function forbidPattern(path, pattern, message) {
  if (pattern.test(source(path))) failures.push(`${path}: ${message}`);
}

const currentMainnet = "scripts/deploy-current-mainnet.mjs";
requirePattern(
  currentMainnet,
  /CONFIRM_PERKOS_MAINNET_DEPLOY\s*!==\s*["']yes["']/,
  "a typed mainnet confirmation guard is required",
);
requirePattern(
  currentMainnet,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "deny-mode post conditions are required",
);
forbidPattern(
  currentMainnet,
  /PostConditionMode\.Allow/,
  "allow-mode post conditions are forbidden",
);

const stxVersionedDeploy = "scripts/deploy-stx-v2.mjs";
requirePattern(
  stxVersionedDeploy,
  /STACKS_NETWORK\s*===\s*["']mainnet["']\s*\?\s*["']mainnet["']\s*:\s*["']testnet["']/,
  "an omitted network must fail safe to testnet",
);
requirePattern(
  stxVersionedDeploy,
  /CONFIRM_STX_V2_MAINNET_DEPLOY\s*!==\s*["']yes["']/,
  "mainnet requires a confirmation distinct from testnet",
);
forbidPattern(
  stxVersionedDeploy,
  /PostConditionMode\.Allow/,
  "allow-mode post conditions are forbidden",
);

const versionedEscrowTestnetDeploy = "scripts/deploy-versioned-escrow-testnet.mjs";
const versionedEscrowTestnetE2e = "scripts/e2e-versioned-escrow-testnet.mjs";
const autonomousEscrowTestnetDeploy = "scripts/deploy-autonomous-escrow-testnet.mjs";
const autonomousEscrowMainnetDeploy = "scripts/deploy-autonomous-escrow-mainnet.mjs";
const autonomousEscrowMainnetE2e = "scripts/e2e-autonomous-escrow-mainnet.mjs";
const serviceFeeMainnetE2e = "scripts/e2e-service-fee-mainnet.mjs";
const serviceFeeMainnetE2eCampaign =
  "scripts/run-service-fee-mainnet-e2e-campaign.mjs";
const serviceFeeMainnetE2eLauncher =
  "scripts/run-service-fee-mainnet-e2e-hardened.sh";
const serviceFeeMainnetE2eLock = "scripts/mainnet-e2e-campaign-lock.mjs";
const serviceFeeMainnetE2eExternalPath = "scripts/mainnet-e2e-external-path.mjs";
const autonomousEscrowTestnetE2e = "scripts/e2e-autonomous-escrow-testnet.mjs";
const versionedEscrowMainnetDeploy = "scripts/deploy-versioned-escrow-mainnet.mjs";
const versionedEscrowMainnetE2e = "scripts/e2e-versioned-escrow-mainnet.mjs";
const reviewWindowCandidate = [
  "contracts/agentic-commerce-v4.clar",
  "contracts/sbtc-commerce-v3.clar",
  "contracts/agentic-commerce-v5.clar",
  "contracts/sbtc-commerce-v4.clar",
];
const autonomousAppealCandidate = [
  "contracts/agentic-commerce-v5.clar",
  "contracts/sbtc-commerce-v4.clar",
];
const historicalReviewWindow = [
  "contracts/agentic-commerce-v3.clar",
  "contracts/sbtc-commerce-v2.clar",
];
const pox5TestnetSbtc = /SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1\.sbtc-token/;
const retiredTestnetSbtc = /ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT\.sbtc-token/;
requirePattern(
  versionedEscrowTestnetDeploy,
  /STACKS_NETWORK\s*!==\s*["']testnet["']/,
  "the versioned candidate must require an explicit testnet network",
);
requirePattern(
  versionedEscrowTestnetDeploy,
  /CONFIRM_VERSIONED_ESCROW_TESTNET_DEPLOY\s*!==\s*["']yes["']/,
  "the versioned candidate requires its own typed testnet confirmation",
);
requirePattern(
  versionedEscrowTestnetDeploy,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "deny-mode post conditions are required",
);
requirePattern(
  versionedEscrowTestnetDeploy,
  /name:\s*["']sip-010-trait["'][\s\S]*?name:\s*["']reputation-registry-v3["']/,
  "the local SIP-010 trait must deploy before dependent versioned contracts",
);
requirePattern(
  versionedEscrowTestnetDeploy,
  /name:\s*["']agentic-commerce-v4["'][\s\S]*?name:\s*["']sbtc-commerce-v3["']/,
  "the deployer must select only the 12-block v4/v3 escrow generation",
);
requirePattern(
  versionedEscrowTestnetDeploy,
  /OWNED_CONTRACTS\s*=\s*CONTRACTS\.filter[\s\S]*?name\s*!==\s*["']sip-010-trait["'][\s\S]*?for\s*\(const\s*\{\s*name\s*\}\s*of\s*OWNED_CONTRACTS\)/,
  "owner verification must exclude the stateless SIP-010 trait",
);
forbidPattern(
  versionedEscrowTestnetDeploy,
  /STACKS_MAINNET|PostConditionMode\.Allow/,
  "the testnet-only candidate must have no mainnet or allow-mode path",
);
requirePattern(
  autonomousEscrowTestnetDeploy,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']testnet["']/,
  "the autonomous escrow deployer must require explicit testnet",
);
requirePattern(
  autonomousEscrowTestnetDeploy,
  /CONFIRM_AUTONOMOUS_ESCROW_TESTNET_DEPLOY\s*!==\s*["']yes["']/,
  "the autonomous escrow deployer must require its own typed confirmation",
);
requirePattern(
  autonomousEscrowTestnetDeploy,
  /name:\s*["']sip-010-trait["'][\s\S]*?name:\s*["']reputation-registry-v3["'][\s\S]*?name:\s*["']agentic-commerce-v5["'][\s\S]*?name:\s*["']sbtc-commerce-v4["']/,
  "the autonomous deployer must use the reviewed dependency order and v5/v4 generation",
);
requirePattern(
  autonomousEscrowTestnetDeploy,
  /APPEAL_WINDOW_BURN_BLOCKS\s*=\s*3n[\s\S]*?initialize-protocol[\s\S]*?Cl\.principal\(appealAuthority\)/,
  "the autonomous deployer must initialize the three-block QA policy with a separate authority",
);
requirePattern(
  autonomousEscrowTestnetDeploy,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "the autonomous deployer must use deny-mode post conditions",
);
requirePattern(
  autonomousEscrowTestnetDeploy,
  /data\.source[\s\S]*?!==\s*expectedSource/,
  "the autonomous deployer must verify existing source byte-for-byte",
);
forbidPattern(
  autonomousEscrowTestnetDeploy,
  /STACKS_MAINNET|PostConditionMode\.Allow|MAINNET_APPEAL_WINDOW_BURN_BLOCKS/,
  "the autonomous testnet deployer must expose no mainnet or allow-mode path",
);
{
  const contents = source(autonomousEscrowTestnetDeploy);
  const confirmation = contents.indexOf(
    "CONFIRM_AUTONOMOUS_ESCROW_TESTNET_DEPLOY !=="
  );
  const credentialRead = contents.indexOf("loadEnv(ENV_PATH");
  if (confirmation < 0 || credentialRead < 0 || confirmation > credentialRead) {
    failures.push(
      `${autonomousEscrowTestnetDeploy}: typed confirmation must precede signer reads`
    );
  }
}
requirePattern(
  autonomousEscrowMainnetDeploy,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']mainnet["']/,
  "the autonomous mainnet promoter must require explicit mainnet",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /AUTONOMOUS_ESCROW_MAINNET_ACTION\s*\|\|\s*["']preflight["']/,
  "the autonomous mainnet promoter must default to signer-free preflight",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOY\s*!==[\s\S]*?["']deploy-v5-v4-mainnet["']/,
  "the autonomous mainnet promoter requires its release-specific typed confirmation",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOYER\s*!==\s*EXPECTED_DEPLOYER/,
  "the autonomous mainnet promoter requires the exact deployer confirmation",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /CONFIRM_AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY\s*!==\s*APPEAL_AUTHORITY/,
  "the autonomous mainnet promoter requires the exact appeal-authority confirmation",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /APPEAL_WINDOW_BURN_BLOCKS\s*=\s*144n[\s\S]*?initialize-protocol[\s\S]*?Cl\.principal\(APPEAL_AUTHORITY\)/,
  "the autonomous mainnet promoter must initialize the reviewed 144-block policy",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /EXPECTED_SOURCE_HASHES[\s\S]*?createHash\(["']sha256["']\)[\s\S]*?digest\(["']hex["']\)/,
  "the autonomous mainnet promoter must freeze source hashes",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "the autonomous mainnet promoter must use deny-mode post conditions",
);
requirePattern(
  autonomousEscrowMainnetDeploy,
  /name:\s*["']sip-010-trait["'][\s\S]*?name:\s*["']reputation-registry-v3["'][\s\S]*?name:\s*["']agentic-commerce-v5["'][\s\S]*?name:\s*["']sbtc-commerce-v4["']/,
  "the autonomous mainnet promoter must use the reviewed v5/v4 dependency order",
);
forbidPattern(
  autonomousEscrowMainnetDeploy,
  /STACKS_TESTNET|PostConditionMode\.Allow|randomPrivateKey/,
  "the autonomous mainnet promoter may not expose testnet, allow mode or ephemeral signers",
);
{
  const contents = source(autonomousEscrowMainnetDeploy);
  const confirmation = contents.indexOf(
    "CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOY !=="
  );
  const credentialRead = contents.indexOf("readFileSync(ENV_PATH");
  if (confirmation < 0 || credentialRead < 0 || confirmation > credentialRead) {
    failures.push(
      `${autonomousEscrowMainnetDeploy}: typed confirmation must precede credential reads`
    );
  }
}
requirePattern(
  autonomousEscrowMainnetE2e,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']mainnet["']/,
  "the autonomous mainnet E2E must require explicit mainnet",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /CONFIRM_AUTONOMOUS_ESCROW_MAINNET_E2E\s*!==[\s\S]*?["']execute-controlled-v5-v4-mainnet["']/,
  "the autonomous mainnet E2E requires its release-specific typed confirmation",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /CONFIRM_AUTONOMOUS_ESCROW_MAINNET_DEPLOYER\s*!==\s*client/,
  "the autonomous mainnet E2E requires the exact deployer confirmation",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /CONFIRM_AUTONOMOUS_ESCROW_MAINNET_APPEAL_AUTHORITY\s*!==\s*appealAuthority/,
  "the autonomous mainnet E2E requires the exact appeal-authority confirmation",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /EXPECTED_SOURCE_HASHES[\s\S]*?createHash\(["']sha256["']\)[\s\S]*?digest\(["']hex["']\)/,
  "the autonomous mainnet E2E must freeze source hashes",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /APPEAL_WINDOW_BURN_BLOCKS\s*=\s*144n/,
  "the autonomous mainnet E2E must require the 144-block policy",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4\.sbtc-token/,
  "the autonomous mainnet E2E must pin canonical mainnet sBTC",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "the autonomous mainnet E2E must use deny-mode post conditions",
);
requirePattern(
  autonomousEscrowMainnetE2e,
  /statSync\(path\)\.mode[\s\S]*?permissions\s*&\s*0o077/,
  "the autonomous mainnet E2E must enforce private external signer files",
);
forbidPattern(
  autonomousEscrowMainnetE2e,
  /STACKS_TESTNET|PostConditionMode\.Allow|randomPrivateKey/,
  "the autonomous mainnet E2E may not expose testnet, allow mode or ephemeral signers",
);
{
  const contents = source(autonomousEscrowMainnetE2e);
  const confirmation = contents.indexOf(
    "CONFIRM_AUTONOMOUS_ESCROW_MAINNET_E2E !=="
  );
  const credentialRead = contents.indexOf("parseEnv(CLIENT_ENV_PATH)");
  if (confirmation < 0 || credentialRead < 0 || confirmation > credentialRead) {
    failures.push(
      `${autonomousEscrowMainnetE2e}: typed confirmation must precede credential reads`
    );
  }
}
requirePattern(
  versionedEscrowMainnetDeploy,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']mainnet["']/,
  "the mainnet promoter must require an explicit mainnet network",
);
requirePattern(
  versionedEscrowMainnetDeploy,
  /VERSIONED_ESCROW_MAINNET_ACTION\s*\|\|\s*["']preflight["']/,
  "the mainnet promoter must default to signer-free preflight",
);
requirePattern(
  versionedEscrowMainnetDeploy,
  /CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOY\s*!==[\s\S]*?["']deploy-v4-v3-mainnet["']/,
  "the mainnet promoter requires its release-specific typed confirmation",
);
requirePattern(
  versionedEscrowMainnetDeploy,
  /CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOYER\s*!==\s*EXPECTED_DEPLOYER/,
  "the mainnet promoter requires the exact deployer confirmation",
);
requirePattern(
  versionedEscrowMainnetDeploy,
  /EXPECTED_SOURCE_HASHES[\s\S]*?createHash\(["']sha256["']\)[\s\S]*?digest\(["']hex["']\)/,
  "the mainnet promoter must verify frozen source hashes before signing",
);
requirePattern(
  versionedEscrowMainnetDeploy,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "the mainnet promoter must use deny-mode post conditions",
);
requirePattern(
  versionedEscrowMainnetDeploy,
  /name:\s*["']sip-010-trait["'][\s\S]*?name:\s*["']reputation-registry-v3["'][\s\S]*?name:\s*["']agentic-commerce-v4["'][\s\S]*?name:\s*["']sbtc-commerce-v3["']/,
  "the mainnet promoter must select only the frozen v4/v3 dependency order",
);
forbidPattern(
  versionedEscrowMainnetDeploy,
  /STACKS_TESTNET|PostConditionMode\.Allow|randomPrivateKey/,
  "the mainnet promoter may not expose testnet, allow mode or ephemeral signers",
);
{
  const contents = source(versionedEscrowMainnetDeploy);
  const confirmation = contents.indexOf(
    "CONFIRM_VERSIONED_ESCROW_MAINNET_DEPLOY !=="
  );
  const credentialRead = contents.indexOf("readFileSync(ENV_PATH");
  if (
    confirmation < 0 ||
    credentialRead < 0 ||
    confirmation > credentialRead
  ) {
    failures.push(
      `${versionedEscrowMainnetDeploy}: typed confirmation must precede credential reads`
    );
  }
}
requirePattern(
  versionedEscrowMainnetE2e,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']mainnet["']/,
  "the mainnet E2E must require explicit mainnet",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /VERSIONED_ESCROW_MAINNET_E2E_ACTION\s*\|\|\s*["']preflight["']/,
  "the mainnet E2E must default to signer-free preflight",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /CONFIRM_VERSIONED_ESCROW_MAINNET_E2E\s*!==[\s\S]*?["']execute-100-sats-mainnet["']/,
  "the mainnet E2E requires its amount-specific typed confirmation",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /const BUDGET = 100n/,
  "the mainnet smoke amount must remain fixed at 100 atomic sBTC units",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /Pc\.principal\(CLIENT\)\.willSendEq\(BUDGET\)\.ft\(SBTC, SBTC_ASSET_NAME\)[\s\S]*?Pc\.principal\(ESCROW_CONTRACT\)[\s\S]*?willSendEq\(BUDGET\)[\s\S]*?\.ft\(SBTC, SBTC_ASSET_NAME\)/,
  "the mainnet E2E must bind exact client funding and escrow payout",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "the mainnet E2E must fail closed",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /VERSIONED_ESCROW_MAINNET_ACTOR_ENV_PATH[\s\S]*?mode:\s*0o600[\s\S]*?flag:\s*["']wx["']/,
  "mainnet actor recovery keys must use an exclusive external 0600 file",
);
requirePattern(
  versionedEscrowMainnetE2e,
  /classification:\s*["']internal-team-operated-not-m2-adoption["']/,
  "the receipt must classify the smoke test as internal and ineligible for M2 adoption",
);
forbidPattern(
  versionedEscrowMainnetE2e,
  /STACKS_TESTNET|PostConditionMode\.Allow|output\.(providerKey|evaluatorKey)|actors:\s*\{[^}]*Key/,
  "the mainnet E2E may not expose testnet, allow mode or actor secrets",
);
{
  const contents = source(versionedEscrowMainnetE2e);
  const confirmation = contents.indexOf(
    "CONFIRM_VERSIONED_ESCROW_MAINNET_E2E !=="
  );
  const credentialRead = contents.indexOf("parseEnv(ENV_PATH");
  if (
    confirmation < 0 ||
    credentialRead < 0 ||
    confirmation > credentialRead
  ) {
    failures.push(
      `${versionedEscrowMainnetE2e}: typed confirmation must precede signer reads`
    );
  }
}
requirePattern(
  versionedEscrowTestnetE2e,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']testnet["']/,
  "versioned E2E must require explicit testnet",
);
requirePattern(
  versionedEscrowTestnetE2e,
  /CONFIRM_VERSIONED_ESCROW_TESTNET_E2E\s*!==\s*["']yes["']/,
  "versioned E2E must require typed confirmation",
);
requirePattern(
  versionedEscrowTestnetE2e,
  /Pc\.principal\(client\)[\s\S]*?willSendEq\(amount\)[\s\S]*?Pc\.principal\(escrowContract\)[\s\S]*?willSendEq\(amount\)/,
  "versioned E2E must bind exact client funding and escrow settlement outflows",
);
requirePattern(
  versionedEscrowTestnetE2e,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "versioned E2E contract calls must fail closed",
);
requirePattern(
  versionedEscrowTestnetE2e,
  /randomPrivateKey\(\)[\s\S]*?output\.actors\s*=\s*\{\s*provider,\s*evaluator\s*\}/,
  "versioned E2E must generate isolated actors and persist public principals only",
);
forbidPattern(
  versionedEscrowTestnetE2e,
  /STACKS_MAINNET|PostConditionMode\.Allow|output\.(providerKey|evaluatorKey)|actors:\s*\{[^}]*Key/,
  "versioned E2E must not expose mainnet, allow mode or actor keys",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /process\.env\.STACKS_NETWORK\s*!==\s*["']testnet["']/,
  "autonomous E2E must require explicit testnet",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /CONFIRM_AUTONOMOUS_ESCROW_TESTNET_E2E\s*!==\s*["']yes["']/,
  "autonomous E2E must require its own typed confirmation",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /clientKey[\s\S]*?evaluatorKey[\s\S]*?appealAuthorityKey[\s\S]*?new Set\(\[client, evaluator, appealAuthority\]\)\.size\s*!==\s*3/,
  "autonomous E2E must require separate persistent QA roles",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /approve-no-appeal[\s\S]*?reject-no-appeal[\s\S]*?approve-appeal-resolve-reject[\s\S]*?reject-appeal-resolve-approve[\s\S]*?approve-appeal-timeout[\s\S]*?review-timeout/,
  "autonomous E2E must cover both decisions, both reversal directions and both timeout classes",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /Pc\.principal\(client\)\.willSendEq\(amount\)[\s\S]*?Pc\.principal\(escrowContract\)\.willSendEq\(amount\)/,
  "autonomous E2E must bind exact funding and settlement outflows",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /postConditionMode:\s*PostConditionMode\.Deny/,
  "autonomous E2E contract calls must fail closed",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /classification:\s*["']internal-team-operated-not-m2-adoption["']/,
  "autonomous E2E receipts must exclude controlled actors from M2 adoption",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /value\?\.type\s*!==\s*ClarityType\.ResponseOk/,
  "autonomous E2E must reject Clarity error responses instead of decoding them as success",
);
requirePattern(
  autonomousEscrowTestnetE2e,
  /review timeout does not fabricate a reputation decision[\s\S]*?ClarityType\.ResponseErr/,
  "review-timeout verification must preserve the absence of an evaluator reputation decision",
);
forbidPattern(
  autonomousEscrowTestnetE2e,
  /STACKS_MAINNET|PostConditionMode\.Allow|output\.(clientKey|providerKey|evaluatorKey|appealAuthorityKey)|actors:\s*\{[^}]*Key/,
  "autonomous E2E must not expose mainnet, allow mode or signer material",
);
{
  const contents = source(autonomousEscrowTestnetE2e);
  const confirmation = contents.indexOf(
    "CONFIRM_AUTONOMOUS_ESCROW_TESTNET_E2E !=="
  );
  const credentialRead = contents.indexOf("parseEnv(ENV_PATH");
  if (confirmation < 0 || credentialRead < 0 || confirmation > credentialRead) {
    failures.push(
      `${autonomousEscrowTestnetE2e}: typed confirmation must precede signer reads`
    );
  }
}

for (const path of reviewWindowCandidate) {
  requirePattern(
    path,
    /\(define-constant REVIEW_WINDOW_BURN_BLOCKS u12\)/,
    "the active review candidate must use the approved fixed 12-block window",
  );
  forbidPattern(
    path,
    /\(define-constant REVIEW_WINDOW_BURN_BLOCKS u144\)/,
    "the active review candidate must not retain the historical 144-block policy",
  );
}

for (const path of historicalReviewWindow) {
  requirePattern(
    path,
    /\(define-constant REVIEW_WINDOW_BURN_BLOCKS u144\)/,
    "the deployed historical candidate must remain immutable at 144 blocks",
  );
}

for (const path of autonomousAppealCandidate) {
  requirePattern(
    path,
    /\(define-constant QA_APPEAL_WINDOW_BURN_BLOCKS u3\)[\s\S]*?\(define-constant MAINNET_APPEAL_WINDOW_BURN_BLOCKS u144\)/,
    "the appeal candidate must expose only the approved QA and mainnet policies",
  );
  requirePattern(
    path,
    /\(define-public \(initialize-protocol[\s\S]*?\(var-set protocol-configured true\)/,
    "appeal policy must be initialized explicitly before use",
  );
  requirePattern(
    path,
    /\(define-public \(record-decision[\s\S]*?\(asserts! \(is-eq \(get evaluator job\) tx-sender\) ERR_NOT_EVALUATOR\)[\s\S]*?STATUS_DECISION_PENDING/,
    "only the pinned evaluator may enter the non-settling decision state",
  );
  requirePattern(
    path,
    /\(define-public \(appeal-decision[\s\S]*?\(<= burn-block-height \(get appeal-deadline decision-state\)\)[\s\S]*?STATUS_DISPUTED/,
    "appeals must be bounded by Bitcoin burn height",
  );
  requirePattern(
    path,
    /\(define-public \(resolve-appeal[\s\S]*?\(is-eq tx-sender \(get appeal-authority job\)\)[\s\S]*?\(<= burn-block-height resolution-deadline\)/,
    "only the job-pinned authority may resolve an appeal before its deadline",
  );
  requirePattern(
    path,
    /\(define-public \(settle-appeal-timeout[\s\S]*?\(> burn-block-height resolution-deadline\)/,
    "a permissionless liveness settlement is required after appeal timeout",
  );
  forbidPattern(
    path,
    /\(define-public \((?:complete-job|reject-job)\b/,
    "the appeal generation must not retain immediate evaluator settlement entrypoints",
  );
}

requirePattern(
  "contracts/sbtc-commerce-v4.clar",
  /\(define-private \(check-job-token[\s\S]*?job-payment-tokens[\s\S]*?ERR_INVALID_TOKEN/,
  "sBTC settlement must validate the immutable per-job token",
);
for (const entrypoint of [
  "finalize-decision",
  "resolve-appeal",
  "settle-appeal-timeout",
  "settle-review-timeout",
  "expire-job",
]) {
  requirePattern(
    "contracts/sbtc-commerce-v4.clar",
    new RegExp(`\\(define-public \\(\\b${entrypoint}\\b[\\s\\S]*?\\(try! \\(check-job-token job-id token\\)\\)`),
    `${entrypoint} must bind settlement to the job-pinned SIP-010 token`,
  );
}

requirePattern(
  "App/src/constants/contract.ts",
  /STX_COMMERCE_HAS_REVIEW_TIMEOUT[\s\S]*?agentic-commerce-v4/,
  "the Web must recognize the v4 STX review-timeout interface",
);
requirePattern(
  "App/src/constants/contract.ts",
  /["']current-v6-v5["']:\s*\{[\s\S]*?stx:\s*["']agentic-commerce-v6["'][\s\S]*?sbtc:\s*["']sbtc-commerce-v5["'][\s\S]*?readOnly:\s*false/,
  "the Web default must select the active v6 STX contract",
);
requirePattern(
  "App/src/constants/contract.ts",
  /const profile = value \|\| ["']current-v6-v5["']/,
  "the Web default must select the active v5 sBTC contract",
);
requirePattern(
  "App/src/constants/contract.ts",
  /current-v6-v5[\s\S]*?legacy-v5-v4-read[\s\S]*?readOnly:\s*true[\s\S]*?CONTRACT_ADDRESS !== expectedDeployer/,
  "the Web must expose only exact current and read-only legacy profiles under the reviewed deployer",
);
requirePattern(
  "App/src/constants/contract.ts",
  /assertCommerceContractsWritable[\s\S]*?historical and read-only/,
  "historical commerce writes must fail closed below the presentation layer",
);
requirePattern(
  "App/src/constants/contract.ts",
  /NETWORK_NAME === "mainnet" && NAYORI_MANAGED_EVALUATOR_ENABLED[\s\S]*?cannot be advertised active on mainnet/,
  "the Web must not advertise an inactive managed evaluator on mainnet",
);
requirePattern(
  "App/src/constants/discovery.ts",
  /NAYORI_QUOTE_API_SETTLEMENT_ACTIVE = false[\s\S]*?quoteApi:\s*\{[\s\S]*?paymentVerification: NAYORI_QUOTE_API_SETTLEMENT_ACTIVE[\s\S]*?facilitator:\s*\{[\s\S]*?paymentVerification: true[\s\S]*?partnerRegistration: false/,
  "discovery must distinguish quote-edge gates from the active facilitator runtime on both networks",
);
requirePattern(
  ".github/workflows/ci.yml",
  /Frontend production mainnet v6\/v5[\s\S]*?network: mainnet[\s\S]*?deployer: SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH[\s\S]*?managedEvaluator: "false"/,
  "CI must build the exact mainnet v6/v5 consumer configuration",
);
for (const variable of [
  "NEXT_PUBLIC_RELEASE_CHANNEL",
  "NEXT_PUBLIC_CONTRACT_PROFILE",
  "NEXT_PUBLIC_STX_COMMERCE_CONTRACT",
  "NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT",
  "NEXT_PUBLIC_REPUTATION_CONTRACT",
  "NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS",
  "NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED",
  "NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS",
  "NEXT_PUBLIC_NAYORI_API_ORIGIN",
  "NEXT_PUBLIC_NAYORI_FACILITATOR_ORIGIN",
  "NEXT_PUBLIC_NAYORI_OAUTH_ORIGIN",
]) {
  requirePattern(
    "App/Dockerfile",
    new RegExp(`ARG ${variable}=[^\\n]*[\\s\\S]*?ENV ${variable}=\\$${variable}`),
    `${variable} must cross the Web image build boundary explicitly`,
  );
}
requirePattern(
  "App/src/services/transparency.ts",
  /NETWORK_NAME\s*===\s*["']testnet["']\s*\?\s*\{\s*\.\.\.evidenceManifest\.milestone2\.verified\s*\}/,
  "testnet transparency must not count controlled QA activity as verified M2 adoption",
);
requirePattern(
  "App/src/constants/evidence.ts",
  /verified:\s*\{\s*registeredAgentsMainnet:\s*0,\s*completedSbtcJobsMainnet:\s*0,\s*completedJobsFromNonTeamWallets:\s*0,\s*participatingNonTeamWallets:\s*0,\s*externalSdkAdoptions:\s*0,/,
  "the immutable M2 evidence baseline must remain zero until external adoption is verified",
);
requirePattern(
  "App/src/constants/contract.ts",
  /SBTC_COMMERCE_HAS_REVIEW_TIMEOUT[\s\S]*?sbtc-commerce-v3/,
  "the Web must recognize the v3 sBTC review-timeout and token-pinning interface",
);

requirePattern(
  "scripts/verify-current-mainnet.mjs",
  /stx:\s*["']agentic-commerce-v6["'][\s\S]*?sbtc:\s*["']sbtc-commerce-v5["']/,
  "the signer-free current-mainnet verifier must select the active v6/v5 contracts",
);
requirePattern(
  "scripts/verify-current-mainnet.mjs",
  /EXPECTED_SOURCE_HASHES[\s\S]*?8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2[\s\S]*?132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53/,
  "the current-mainnet verifier must pin the deployed v6/v5 source hashes",
);
requirePattern(
  "scripts/verify-current-mainnet.mjs",
  /REVIEW_WINDOW\s*=\s*12n[\s\S]*?APPEAL_WINDOW\s*=\s*144n[\s\S]*?SERVICE_FEE_BPS\s*=\s*200n/,
  "the current-mainnet verifier must enforce the 12/144 windows and 200-bps fee",
);
requirePattern(
  "scripts/verify-current-mainnet.mjs",
  /SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6[\s\S]*?SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8[\s\S]*?SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4\.sbtc-token/,
  "the current-mainnet verifier must pin authority, treasury and canonical sBTC",
);
forbidPattern(
  "scripts/verify-current-mainnet.mjs",
  /PRIVATE_KEY|broadcastTransaction|makeContractCall|makeContractDeploy/,
  "the current-mainnet verifier must remain signer-free and read-only",
);
requirePattern(
  serviceFeeMainnetE2e,
  /SERVICE_FEE_MAINNET_E2E_ACTION\s*\|\|\s*["']preflight["']/,
  "the active v6/v5 E2E must default to signer-free preflight",
);
requirePattern(
  serviceFeeMainnetE2e,
  /STACKS_NETWORK\s*===\s*["']mainnet["']/,
  "the active v6/v5 E2E must require explicit mainnet",
);
requirePattern(
  serviceFeeMainnetE2e,
  /CONFIRM_SERVICE_FEE_MAINNET_E2E\s*===\s*["']execute-controlled-v6-v5-mainnet["']/,
  "the active v6/v5 E2E requires its release-specific typed confirmation",
);
requirePattern(
  serviceFeeMainnetE2e,
  /CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_TOP_UP_MICRO_STX[\s\S]*?MAX_CAMPAIGN_TOP_UP/,
  "the active v6/v5 E2E requires an independently typed aggregate top-up cap",
);
requirePattern(
  serviceFeeMainnetE2e,
  /CONFIRM_SERVICE_FEE_MAINNET_E2E_MAX_NETWORK_FEES_MICRO_STX[\s\S]*?MAX_CAMPAIGN_NETWORK_FEES/,
  "the active v6/v5 E2E requires an independently typed aggregate network-fee cap",
);
requirePattern(
  serviceFeeMainnetE2e,
  /const MAX_CAMPAIGN_TOP_UP = 900_000n[\s\S]*?willSendEq\(amount\)\.ustx\(\)[\s\S]*?makeSTXTokenTransfer/,
  "the active v6/v5 E2E must bound and deny-bind provider gas funding",
);
requirePattern(
  serviceFeeMainnetE2e,
  /8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2[\s\S]*?132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53/,
  "the active v6/v5 E2E must freeze exact contract hashes",
);
requirePattern(
  serviceFeeMainnetE2e,
  /secretFile[\s\S]*?0o600[\s\S]*?SERVICE_FEE_MAINNET_E2E_CLIENT_ENV_PATH[\s\S]*?SERVICE_FEE_MAINNET_E2E_ACTOR_ENV_PATH[\s\S]*?SERVICE_FEE_MAINNET_E2E_AUTHORITY_ENV_PATH/,
  "the active v6/v5 E2E must isolate all role signers in external mode-0600 files",
);
requirePattern(
  serviceFeeMainnetE2e,
  /PostConditionMode\.Deny[\s\S]*?fundedEscrow\s*===\s*BUDGET[\s\S]*?provider receives exact 98% net[\s\S]*?treasury receives exact 2% fee[\s\S]*?terminal job is completed with zero escrow/,
  "the active v6/v5 E2E must deny-bind and verify exact conservation and settlement",
);
forbidPattern(
  serviceFeeMainnetE2e,
  /STACKS_TESTNET|api\.testnet\.hiro\.so|PostConditionMode\.Allow|randomPrivateKey/,
  "the active v6/v5 E2E may not expose testnet, allow mode or ephemeral signers",
);
forbidPattern(
  serviceFeeMainnetE2e,
  /serializedTransaction|PRIVATE_KEY\s*:/,
  "the active v6/v5 E2E receipt must never retain raw signed transactions or signer keys",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /\["stx", "stx-first", stxReceipt\][\s\S]*?\["sbtc", "sbtc-second", sbtcReceipt\]/,
  "the active mainnet campaign must execute STX then sBTC strictly sequentially",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /SERVICE_FEE_MAINNET_E2E_CAMPAIGN_PATH[\s\S]*?new Set\(\[stxReceipt, sbtcReceipt, manifestPath\]\)[\s\S]*?aggregateTopUpUsed[\s\S]*?aggregateNetworkFeesUsed/,
  "the active mainnet campaign must bind distinct artifacts, top-ups and network fees",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /adoptStoppedCampaignLock\(GLOBAL_LOCK_PATH[\s\S]*?acquireCampaignLock\(GLOBAL_LOCK_PATH/,
  "the active mainnet campaign must lock fresh runs and atomically adopt stopped runs",
);
requirePattern(
  serviceFeeMainnetE2eLock,
  /function acquireRecoveryGuard\(globalLockPath\)[\s\S]*?constants\.O_EXCL[\s\S]*?adoptStoppedCampaignLock\(path, expected\)[\s\S]*?acquireRecoveryGuard\(path\)[\s\S]*?still owned by a live process[\s\S]*?renameSync\(replacement, path\)[\s\S]*?fsyncParent\(path\)/,
  "mainnet campaign recovery must use an atomic sidecar and rotate ownership",
);
requirePattern(
  serviceFeeMainnetE2eLock,
  /acquireExecutorLease\(globalLockPath[\s\S]*?acquireRecoveryGuard\(globalLockPath\)[\s\S]*?validateCampaignLock\(globalLockPath, binding\.globalLockToken\)[\s\S]*?constants\.O_EXCL/,
  "executor lease acquisition must serialize with campaign recovery and bind the global token",
);
requirePattern(
  serviceFeeMainnetE2eLock,
  /Preserved executor lease is still owned by a live child process/,
  "campaign recovery must refuse takeover while an executor child remains live",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_PATH[\s\S]*?CONFIRM_SERVICE_FEE_MAINNET_E2E_RESUME_EXECUTOR_LOCK_SHA256/,
  "stale executor recovery must require exact path and hash confirmations",
);
requirePattern(
  serviceFeeMainnetE2e,
  /executionLock\(\)[\s\S]*?acquireExecutorLease\(GLOBAL_LOCK_PATH[\s\S]*?GLOBAL_LOCK_PATH}\.recover[\s\S]*?validateCampaignLock[\s\S]*?GLOBAL_LOCK_PATH}\.recover/,
  "the mainnet signer child must own an executor lease and fence campaign recovery",
);
{
  const contents = source(serviceFeeMainnetE2e);
  const broadcasts = [...contents.matchAll(/broadcastTransaction\(\{ transaction, network \}\)/g)];
  const ownershipChecks = [...contents.matchAll(/accountLock\.assertOwned\(\);/g)];
  if (broadcasts.length !== 2 || ownershipChecks.length !== 2 ||
      !broadcasts.every((broadcast, index) => ownershipChecks[index].index < broadcast.index)) {
    failures.push(
      `${serviceFeeMainnetE2e}: executor ownership must be revalidated before every broadcast`,
    );
  }
}
requirePattern(
  serviceFeeMainnetE2e,
  /constants\.O_EXCL[\s\S]*?fsyncSync\(fd\)[\s\S]*?renameSync\(temporary, path\)[\s\S]*?fsyncSync\(parentFd\)[\s\S]*?broadcastTransaction/,
  "signed intents must be durably journaled before any mainnet broadcast",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /constants\.O_EXCL[\s\S]*?fsyncSync\(fd\)[\s\S]*?renameSync\(temporary, path\)[\s\S]*?fsyncSync\(parentFd\)/,
  "campaign manifests must be durably replaced and parent-synced",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /receiptChecksPassed[\s\S]*?checks\.length > 0[\s\S]*?every\(\(entry\) => entry\?\.passed === true\)/,
  "campaign receipts must reject empty or historically failed check sets",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /INTERNAL_CLASSIFICATION = "internal-team-operated-not-m2-adoption"[\s\S]*?manifest\.schemaVersion === 1[\s\S]*?manifest\.classification === INTERNAL_CLASSIFICATION[\s\S]*?prior\.schemaVersion === 1[\s\S]*?prior\.classification === INTERNAL_CLASSIFICATION/,
  "campaign and immutable receipts must preserve internal-only evidence classification",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /manifest\.result = "transactions-complete"[\s\S]*?atomicSave\(manifestPath, manifest\)[\s\S]*?lock\.releaseSuccess\(\)[\s\S]*?manifest\.result = "passed"[\s\S]*?atomicSave\(manifestPath, manifest\)/,
  "campaign completion must durably record receipts, release locks, then mark terminal passed",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /state: "started"[\s\S]*?receiptPath: receipt[\s\S]*?remainingTopUpBeforeAsset[\s\S]*?atomicSave\(manifestPath, manifest\)[\s\S]*?const result = runAsset\(/,
  "each asset must have a durable immutable stage marker before its signer child starts",
);
requirePattern(
  serviceFeeMainnetE2eCampaign,
  /receipt exists without an immutable campaign stage marker[\s\S]*?started stage lost its exact receipt or campaign-cap binding/,
  "missing or unmarked partial receipts must stop instead of starting a fresh asset",
);
requirePattern(
  serviceFeeMainnetE2e,
  /Existing receipt contains a failed check and can never be promoted to passed[\s\S]*?Receipt contains an unresolved failed check and cannot be promoted to passed/,
  "an E2E receipt with any failed check must remain permanently non-passing",
);
for (const [label, pattern] of [
  ["create", /if \(!hasTransaction\("create-job"\)\)[\s\S]*?deadlineOpen\(chain\.stacks_tip_height, expiredAt, false\)/],
  ["fund", /if \(!hasTransaction\("fund-job"\)\)[\s\S]*?Pre-fund job state[\s\S]*?requireStacksExpiryOpen\(preFundJob/],
  ["assign", /if \(!hasTransaction\("assign-provider"\)\)[\s\S]*?Pre-assign job state[\s\S]*?requireStacksExpiryOpen\(preAssignJob/],
  ["submit", /if \(!hasTransaction\("submit-work"\)\)[\s\S]*?Pre-submit job state[\s\S]*?requireStacksExpiryOpen\(preSubmitJob/],
  ["decision", /if \(!hasTransaction\("record-decision"\)\)[\s\S]*?STATUS_SUBMITTED[\s\S]*?requireBurnDeadlineOpen\(job\["review-deadline"\]/],
  ["appeal", /if \(!hasTransaction\("appeal-decision"\)\)[\s\S]*?STATUS_DECISION_PENDING[\s\S]*?requireBurnDeadlineOpen\(decision\["appeal-deadline"\]/],
  ["resolution", /if \(!hasTransaction\("resolve-appeal"\)\)[\s\S]*?STATUS_DISPUTED[\s\S]*?requireBurnDeadlineOpen\([\s\S]*?"Resolution deadline"/],
]) {
  requirePattern(
    serviceFeeMainnetE2e,
    pattern,
    `new ${label} transactions must revalidate exact state and deadline before signing`,
  );
}
requirePattern(
  serviceFeeMainnetE2eExternalPath,
  /realpathSync\(rawParent\)[\s\S]*?rev-parse[\s\S]*?outside every Git work tree/,
  "mainnet signer and evidence paths must be canonical and outside every Git work tree",
);
requirePattern(
  serviceFeeMainnetE2eLauncher,
  /\/private\/tmp\/nayori-mainnet-e2e-release-[\s\S]*?npm ci --ignore-scripts --no-audit --no-fund[\s\S]*?exec \/usr\/bin\/env -i/,
  "armed mainnet E2E must run from an attested ephemeral dependency tree and clean environment",
);
requirePattern(
  serviceFeeMainnetE2e,
  /CLIENT_PRIVATE_KEY[\s\S]*?Client, contract owner, provider, evaluator, authority and treasury must be distinct/,
  "the mainnet E2E must use a dedicated client instead of the contract owner key",
);
requirePattern(
  serviceFeeMainnetE2e,
  /preSettlementBalances[\s\S]*?provider receives exact 98% net[\s\S]*?treasury receives exact 2% fee/,
  "resume must preserve pre-settlement balance snapshots",
);
{
  const contents = source(serviceFeeMainnetE2e);
  const publicVerification = contents.lastIndexOf("const publicState = await verifyPublicRelease()");
  const preflightReturn = contents.lastIndexOf('if (ACTION === "preflight") return preflight');
  const executeCall = contents.lastIndexOf("await execute(publicState)");
  const localGate = contents.indexOf('["run", "security:gate"]');
  const firstSignerRead = contents.indexOf("const clientEnv = parseEnv(secretFile(");
  if (
    publicVerification < 0 ||
    preflightReturn < 0 ||
    executeCall < 0 ||
    localGate < 0 ||
    firstSignerRead < 0 ||
    publicVerification > preflightReturn ||
    preflightReturn > executeCall ||
    localGate > firstSignerRead
  ) {
    failures.push(
      `${serviceFeeMainnetE2e}: public preflight must return before any signer file is opened`,
    );
  }
}

for (const path of [
  versionedEscrowTestnetDeploy,
  versionedEscrowTestnetE2e,
  autonomousEscrowTestnetDeploy,
  autonomousEscrowTestnetE2e,
  "App/src/constants/sbtc.ts",
  ".env.example",
]) {
  requirePattern(
    path,
    pox5TestnetSbtc,
    "active testnet surfaces must pin the official PoX-5 sBTC token",
  );
  forbidPattern(
    path,
    retiredTestnetSbtc,
    "the retired pre-PoX-5 token is forbidden in active testnet surfaces",
  );
}

for (const path of [
  "scripts/deploy-mainnet.mjs",
  "scripts/deploy-sbtc-mainnet.mjs",
  "scripts/e2e-sbtc-mainnet.mjs",
  "scripts/deploy-sbtc-testnet.mjs",
  "scripts/e2e-sbtc-testnet.mjs",
]) {
  const contents = source(path);
  const retired = contents.indexOf("RETIRED_UNSAFE_SCRIPT");
  const firstSecretRead = contents.indexOf("readFileSync(");
  if (retired < 0 || firstSecretRead < 0 || retired > firstSecretRead) {
    failures.push(`${path}: legacy mainnet code must stop before reading credentials`);
  }
}

for (const path of [
  "App/src/services/sbtc-commerce.ts",
  "App/src/app/jobs/page.tsx",
]) {
  forbidPattern(
    path,
    /postConditionMode:\s*["']allow["']/,
    "wallet settlement may not authorize unspecified asset transfers",
  );
}
requirePattern(
  "App/src/services/sbtc-commerce.ts",
  /Pc\.principal\(SBTC_COMMERCE\)[\s\S]*?\.willSendEq\(sats\)[\s\S]*?postConditionMode:\s*["']deny["']/,
  "sBTC settlement must constrain the exact escrow outflow",
);
requirePattern(
  "App/src/services/sbtc-commerce.ts",
  /get-job-payment-token[\s\S]*?tokenArg\(token\)[\s\S]*?settlementOptions\(sats, token, allowZero\)/,
  "versioned sBTC settlement must bind the job-pinned token before wallet access",
);
requirePattern(
  "App/src/app/jobs/page.tsx",
  /const amount = exactEscrow\(job, allowZero\)[\s\S]*?Pc\.principal\(AGENTIC_COMMERCE\)\.willSendEq\(amount\)\.ustx\(\)[\s\S]*?postConditionMode:\s*["']deny["']/,
  "STX settlement must constrain the exact escrow outflow",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /replace_compose_environment web NAYORI_RELEASE_SHA "\$SHA"[\s\S]*?replace_compose_environment docs NAYORI_DOCS_RELEASE "\$SHA"/,
  "QA Web and Docs rollout must publish the exact runtime release SHA",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /^#![^\n]+\n(?:#[^\n]*\n)*\{ set \+x; \} 2>\/dev\/null[\s\S]*?unset BASH_XTRACEFD/,
  "QA controller must disable inherited xtrace before processing release state",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /config --help \| grep -Fq -- '--no-env-resolution'[\s\S]*?compose_json\(\)[\s\S]*?config --format json --no-env-resolution[\s\S]*?compose_json "\$profile" \| jq -e/,
  "QA semantic Compose checks must stream directly into narrow jq postconditions",
);
forbidPattern(
  "ops/vps/nayori-qa-release",
  /compose_model=/,
  "QA controller must not retain the full Compose model in a traced shell variable",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /canonical QA Compose must be a JSON object[\s\S]*?jq --arg service "\$service" --arg image "\$image"[\s\S]*?\.services\[\$service\]\.image = \$image/,
  "QA must require canonical JSON Compose and update images structurally with jq",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /validate_canonical_compose\n\nif \[\[ "\$ACTION" == "verify" \]\]; then\n  verify_current_release/,
  "QA current verification must reject noncanonical Compose before receipt checks",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /verify_compose_image web "\$WEB_IMAGE"[\s\S]*?docker compose -f "\$COMPOSE" up -d web docs[\s\S]*?wait_healthy nayori-qa-web[\s\S]*?verify_running_image nayori-qa-web "\$WEB_IMAGE"/,
  "QA rollout must verify desired and running images around restart",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /replace_evaluator_migration_mount "\$RELEASE\/migrations\/001_initial\.sql"[\s\S]*?verify_compose_migration_mount "\$RELEASE\/migrations\/001_initial\.sql"[\s\S]*?verify_running_migration_mount nayori-qa-evaluator-postgres/,
  "QA Evaluator rollout must bind and verify its exact migration mount",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /verify_running_image nayori-qa-evaluator "\$IMAGE" "\$IMAGE_ID"[\s\S]*?assert_complete_verified_runtime_set[\s\S]*?schemaVersion: 2/,
  "QA passed receipts must be written only after exact Evaluator runtime verification",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /evaluator\.qa\.nayori\.ai\/healthz evaluator-health ""[\s\S]*?version:"0\.2\.0"/,
  "QA Evaluator public health contract must match the promoted 0.2.0 release",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /flock -n 9[\s\S]*?another Nayori QA release operation is active/,
  "all QA repository releases must share one VPS-wide controller lock",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /docker image inspect --format '\{\{\.Id\}\}'[\s\S]*?docker inspect --format '\{\{\.Image\}\}'[\s\S]*?VERIFIED_RUNTIME_IMAGES\+=\("\$container\|\$image\|\$image_id"\)/,
  "QA runtime verification must bind immutable image IDs as well as tags",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /current_pointer_path[\s\S]*?verify_current_release[\s\S]*?receiptSha256[\s\S]*?current container image binding mismatch/,
  "QA promotion verification must bind the authoritative pointer to live runtime state",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /trap on_error ERR[\s\S]*?trap 'exit 130' INT[\s\S]*?trap 'exit 129' HUP[\s\S]*?trap 'exit 143' TERM[\s\S]*?trap on_exit EXIT/,
  "QA release interruption and exit paths must share verified rollback",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /PREVIOUS_RUNTIME_IMAGES[\s\S]*?PREVIOUS_RELEASE_IDENTITIES[\s\S]*?verify_running_environment "\$container" "\$key" "\$value" \|\| failed=1[\s\S]*?wait_healthy nayori-qa-evaluator-postgres \|\| failed=1[\s\S]*?QA RELEASE ROLLBACK VERIFICATION FAILED[\s\S]*?deployment_commit_is_durable/,
  "QA rollback must prove restoration of the previous runtime",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /psql --single-transaction -v ON_ERROR_STOP=1/,
  "QA Evaluator migrations must fail atomically",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /replace_env_file_release "\$BASE\/secrets\/platform\.env"[\s\S]*?replace_env_file_release "\$BASE\/secrets\/facilitator\.env"[\s\S]*?replace_env_file_release "\$BASE\/secrets\/oauth\.env"[\s\S]*?replace_env_file_release "\$BASE\/secrets\/evaluator\.env"/,
  "QA services must update their runtime release identity before restart",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /rollback\(\)[\s\S]*?ENV_BACKUPS\[@\][\s\S]*?cp "\$backup" "\$file"/,
  "QA rollback must restore release identity environment files",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /api\.qa\.nayori\.ai\/supported[\s\S]*?paymentVerificationEnabled == false[\s\S]*?facilitator\.qa\.nayori\.ai\/supported[\s\S]*?paymentVerificationEnabled == true/,
  "QA public checks must distinguish the API edge from the facilitator execution role",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /verify_worker_runtime\(\)[\s\S]*?State\.Status[\s\S]*?State\.Running[\s\S]*?RestartCount[\s\S]*?esac\n\nif \[\[ "\$REPOSITORY" != "PerkOS-Nayori-Agent-SDK" \]\]; then\n  refresh_public_proxy\nfi\nverify_public_origins "\$SHA"\nif \[\[ "\$REPOSITORY" == "PerkOS-Nayori-Platform" \]\]; then\n  verify_worker_runtime\nfi\nassert_complete_verified_runtime_set[\s\S]*?RECEIPT_TEMP=/,
  "QA receipts must follow public-origin and stable-worker runtime checks",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /refresh_public_proxy\(\)[\s\S]*?caddy validate --config \/etc\/caddy\/Caddyfile --adapter caddyfile[\s\S]*?caddy reload --config \/etc\/caddy\/Caddyfile --adapter caddyfile --force[\s\S]*?refresh_public_proxy \|\| failed=1/,
  "QA runtime replacement and rollback must refresh the validated public proxy",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /PerkOS-Nayori-Agent-SDK" then[\s\S]*?publicReadiness:null,publicReleaseIdentity:null,workerRuntime:null[\s\S]*?PerkOS-Nayori-Evaluator" then[\s\S]*?publicReadiness:true,publicReleaseIdentity:null,workerRuntime:null[\s\S]*?workerRuntime:\{running:true,zeroRestarts:true\}/,
  "QA receipts must record component-specific checks without false success flags",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /"\$MUTATION_STARTED" == true \|\| "\$NEW_RECEIPT_WRITTEN" == true[\s\S]*?NEW_RECEIPT_WRITTEN=true\nmv -f "\$RECEIPT_TEMP"/,
  "QA interruption must clean an uncommitted materialized receipt, including SDK receipts",
);

// Candidate fee generation: static tripwires supplement (not replace) simnet tests.
function clarityFunction(path, kind, name) {
  const contents = source(path);
  const start = contents.indexOf(`(define-${kind} (${name}`);
  if (start < 0) {
    failures.push(`${path}: missing ${kind} function ${name}`);
    return "";
  }
  const end = contents.indexOf("\n(define-", start + 1);
  return contents.slice(start, end < 0 ? undefined : end);
}

for (const candidate of ["agentic-commerce-v6", "sbtc-commerce-v5"]) {
  const path = `contracts/${candidate}.clar`;
  const check = (condition, message) => { if (!condition) failures.push(`${path}: ${message}`); };
  const fn = (name, kind = "public") => clarityFunction(path, kind, name);
  requirePattern(path, /\(define-constant SERVICE_FEE_BPS u200\)/, "service fee must stay at the approved 200 bps");
  requirePattern(path, /\(define-constant SERVICE_FEE_DIVISOR u50\)/, "fee arithmetic must divide without multiplication overflow");
  requirePattern(path, /\(define-constant REVIEW_WINDOW_BURN_BLOCKS u12\)/, "active fee contracts must retain the 12-block review window");
  check(/\(treasury principal\)/.test(fn("initialize-protocol")), "initialization requires an explicit treasury");
  check(/treasury: \(var-get service-treasury\)/.test(fn("create-job")), "jobs must pin their treasury");
  check((source(path).match(/\(var-set service-treasury /g) ?? []).length === 1, "treasury must be immutable after initialization");
  const split = fn("settle-service-payment", "private");
  check(/\(asserts! \(is-some \(map-get\? decisions job-id\)\)/.test(split), "fees require an evaluator decision");
  check(/\(is-eq gross \(default-to u0 \(map-get\? escrow-balances job-id\)\)\)/.test(split), "split must constrain the exact job escrow");
  check(/\(is-none \(map-get\? service-fee-settlements job-id\)\)/.test(split), "fee collection must be one-shot");
  check(/service-fee-waivers job-id\)\) u0/.test(split), "a waived fee must be zero before transfer");
  for (const name of ["finalize-decision", "resolve-appeal", "settle-appeal-timeout"]) {
    check(/\(try! \(settle-service-payment job-id /.test(fn(name)), `${name} must use the atomic split helper`);
    if (candidate === "sbtc-commerce-v5") check(/\(try! \(check-job-token job-id token\)\)/.test(fn(name)), `${name} must check the pinned token`);
  }
  for (const name of ["fund-job", "record-decision", "appeal-decision", "expire-job", "settle-review-timeout", "retry-reputation-sync"]) {
    check(!/settle-service-payment|map-set service-fee-settlements/.test(fn(name)), `${name} may not collect a service fee`);
  }
  check(!/stx-transfer\?|contract-call\? token transfer/.test(fn("appeal-decision")), "filing an appeal must not charge an automatic second fee");
  const waiver = fn("waive-service-fee");
  check(/\(is-eq tx-sender \(get appeal-authority job\)\)/.test(waiver), "only the job-pinned authority can waive");
  check(/\(is-valid-hash evidence-hash\)/.test(waiver), "waivers require evidence");
  const refund = fn("refund-service-fee");
  check(/\(is-eq tx-sender \(get treasury job\)\)/.test(refund), "refunds require pinned treasury authorization");
  check(/\(is-some \(map-get\? service-fee-waivers job-id\)\)/.test(refund), "refunds require a waiver");
  check(/\(> amount u0\)/.test(refund) && /refunded-fee: \(get charged-fee settlement\)/.test(refund), "refunds must be exact and one-shot");
  check(!/as-contract/.test(refund), "fee refunds must spend treasury funds, never escrow");
  if (candidate === "sbtc-commerce-v5") {
    check(/\(try! \(check-job-token job-id token\)\)/.test(refund), "fee refunds must use the job-pinned token");
    const transfers = source(path).split("\n").filter(line => line.includes("contract-call? token transfer"));
    check(transfers.length === 6 && transfers.every(line => line.includes("ERR_TOKEN_TRANSFER_FAILED")), "every SIP-010 transfer must reject ok-false results");
  }
}

const feeTestnetCore = "scripts/service-fee-testnet-core.mjs";
requirePattern(feeTestnetCore, /env\.STACKS_NETWORK === "testnet"/, "fee runners must require explicit testnet");
requirePattern(feeTestnetCore, /PostConditionMode\.Deny/, "fee runner transactions must use deny mode");
requirePattern(feeTestnetCore, /broadcast-intent-recorded/, "fee runners must persist intent before broadcast");
requirePattern(feeTestnetCore, /SERVICE_FEE_REVIEWED_SHA/, "fee execution requires a reviewed exact SHA");
requirePattern(feeTestnetCore, /merge-base[\s\S]*--is-ancestor[\s\S]*origin\/qa/, "fee execution must be merged to QA");
requirePattern(feeTestnetCore, /0o600/, "fee custody and journals require private file permissions");
for (const runner of [feeTestnetCore, "scripts/deploy-service-fee-testnet.mjs", "scripts/e2e-service-fee-testnet.mjs"]) {
  forbidPattern(runner, /PostConditionMode\.Allow|STACKS_MAINNET|https:\/\/api\.mainnet\.hiro\.so/, "fee runner has no mainnet or allow-mode branch");
}

// Mainnet fee promotion is deliberately isolated from the QA runners. Its
// signer remains unreachable until the exact release, roles and hard fee cap
// are acknowledged, and every broadcast has a durable intent first.
const feeMainnetCore = "scripts/service-fee-mainnet-core.mjs";
const feeMainnetDeploy = "scripts/deploy-service-fee-mainnet.mjs";
const feeMainnetRuntime = "scripts/run-service-fee-mainnet-deploy.sh";
const feeMainnetAttestationUi = "App/src/services/treasury-attestation.ts";
const feeMainnetAttestationClient =
  "App/src/app/operations/treasury-attestation/TreasuryAttestationClient.tsx";
requirePattern(feeMainnetCore, /env\.STACKS_NETWORK === "mainnet"/, "mainnet fee promoter must require explicit mainnet");
requirePattern(feeMainnetCore, /STACKS_MAINNET/, "mainnet fee promoter must use only the mainnet network object");
requirePattern(feeMainnetCore, /PostConditionMode\.Deny/, "mainnet fee promoter transactions must use deny mode");
requirePattern(feeMainnetCore, /signed-bytes-recorded/, "mainnet fee promoter must persist the validated signed intent before broadcast");
requirePattern(feeMainnetCore, /broadcast-attempt-recorded/, "mainnet fee promoter must persist each broadcast attempt before network access");
requirePattern(feeMainnetCore, /SERVICE_FEE_MAINNET_REVIEWED_SHA/, "mainnet fee promoter requires a reviewed exact SHA");
requirePattern(feeMainnetCore, /merge-base[\s\S]*--is-ancestor[\s\S]*origin\/main/, "mainnet fee promoter must be merged to main");
requirePattern(feeMainnetCore, /CONFIRM_SERVICE_FEE_MAINNET_MAX_FEES_MICRO_STX/, "mainnet fee promoter requires an explicit hard fee cap");
requirePattern(feeMainnetCore, /CONFIRM_SERVICE_FEE_MAINNET_TREASURY/, "mainnet fee promoter requires the immutable treasury to be confirmed");
requirePattern(feeMainnetCore, /SERVICE_FEE_MAINNET_TREASURY_ATTESTATION_PATH/, "mainnet fee promoter requires an external treasury attestation");
requirePattern(feeMainnetCore, /encodeStructuredDataBytes/, "mainnet treasury custody must use SIP-018 structured data");
requirePattern(feeMainnetCore, /publicKeyToAddressSingleSig/, "mainnet treasury custody must bind the public key to the treasury address");
requirePattern(feeMainnetCore, /verifySignature/, "mainnet treasury custody must verify the Leather signature locally");
requirePattern(feeMainnetCore, /v6-v5-campaign\.json/, "mainnet fee promoter must bind the hard cap to one permanent campaign receipt");
requirePattern(feeMainnetCore, /CONFIRM_SERVICE_FEE_MAINNET_STATE_DIR/, "mainnet fee promoter requires the external campaign state to be confirmed");
requirePattern(feeMainnetCore, /CONFIRM_SERVICE_FEE_MAINNET_RECEIPT_PATH/, "mainnet fee promoter requires the permanent receipt path to be confirmed");
requirePattern(feeMainnetCore, /is_fully_synced === true/, "mainnet fee promoter requires a fully synchronized node");
requirePattern(feeMainnetCore, /0o600/, "mainnet fee custody and journals require private file permissions");
requirePattern(feeMainnetDeploy, /SERVICE_FEE_MAINNET_DEPLOYER_ENV_PATH/, "mainnet signer path must be explicit and external");
requirePattern(feeMainnetDeploy, /verifyTreasuryAttestation/, "mainnet deployment must verify treasury custody before opening the deployer signer");
requirePattern(feeMainnetRuntime, /\/private\/tmp\/nayori-mainnet-release-/, "mainnet signing requires an ephemeral release worktree");
requirePattern(feeMainnetRuntime, /node_major[\s\S]*-ge 20/, "mainnet signing requires a supported Node.js runtime");
requirePattern(feeMainnetRuntime, /NODE_OPTIONS must be empty/, "mainnet signing rejects inherited Node preload options");
requirePattern(feeMainnetRuntime, /\/usr\/bin\/env -i/, "mainnet signing must launch with an allowlisted environment");
requirePattern(feeMainnetRuntime, /npm ci --ignore-scripts --no-audit --no-fund/, "mainnet signing must rebuild the locked dependency tree without lifecycle scripts");
requirePattern(feeMainnetRuntime, /SERVICE_FEE_MAINNET_LOCKFILE_SHA256/, "mainnet runtime must verify the reviewed dependency lock");
forbidPattern(feeMainnetRuntime, /npm install|npm update|--force/, "mainnet runtime must not mutate dependency resolution");
for (const runner of [feeMainnetCore, feeMainnetDeploy]) {
  forbidPattern(runner, /PostConditionMode\.Allow|STACKS_TESTNET|https:\/\/api\.testnet\.hiro\.so/, "mainnet fee promoter has no testnet or allow-mode branch");
  forbidPattern(runner, /NAYORI_MAINNET_TREASURY_PRIVATE_KEY/, "Leather treasury custody must never require a private key export");
}
forbidPattern(feeMainnetRuntime, /TREASURY_ENV_PATH|TREASURY_PRIVATE_KEY/, "the isolated runtime must receive only a public treasury attestation");
for (const literal of [
  "SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8",
  "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
  "SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6",
  "agentic-commerce-v6",
  "sbtc-commerce-v5",
  "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
  "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
  "Nayori Mainnet Treasury Custody",
  "prove-control-of-nayori-mainnet-treasury",
]) {
  requirePattern(feeMainnetCore, new RegExp(literal), `mainnet promoter must pin ${literal}`);
  requirePattern(feeMainnetAttestationUi, new RegExp(literal), `Leather UI must pin ${literal}`);
}
requirePattern(feeMainnetAttestationUi, /crypto\.getRandomValues/, "Leather attestation challenge must use browser cryptographic randomness");
requirePattern(feeMainnetAttestationUi, /publicKeyToAddressSingleSig/, "Leather attestation must derive the mainnet single-sig address locally");
requirePattern(feeMainnetAttestationUi, /publicKeyFromSignatureRsv/, "Leather attestation must recover and compare the signing public key");
requirePattern(feeMainnetAttestationClient, /LOCAL_HOSTS/, "treasury signing control must be disabled outside localhost");
requirePattern(feeMainnetAttestationClient, /approvedProviderIds:\s*LEATHER_ONLY/, "treasury signing must restrict the provider picker to Leather");
requirePattern(feeMainnetAttestationClient, /stx_signStructuredMessage/, "treasury custody must use a SIP-018 wallet request");
forbidPattern(feeMainnetAttestationClient, /broadcastTransaction|makeContractCall|makeContractDeploy|stx_transferStx|stx_callContract/, "treasury custody UI must not construct or broadcast a transaction");

if (failures.length > 0) {
  console.error("Nayori security gate failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Nayori security gate passed.");
