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
for (const variable of [
  "NEXT_PUBLIC_RELEASE_CHANNEL",
  "NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS",
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
  /replace_compose_environment NAYORI_RELEASE_SHA "\$SHA"[\s\S]*?replace_compose_environment NAYORI_DOCS_RELEASE "\$SHA"/,
  "QA Web and Docs rollout must publish the exact runtime release SHA",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /replace_env_file_release "\$BASE\/secrets\/platform\.env"[\s\S]*?replace_env_file_release "\$BASE\/secrets\/facilitator\.env"[\s\S]*?replace_env_file_release "\$BASE\/secrets\/oauth\.env"[\s\S]*?replace_env_file_release "\$BASE\/secrets\/evaluator\.env"/,
  "QA services must update their runtime release identity before restart",
);
requirePattern(
  "ops/vps/nayori-qa-release",
  /for item in "\$\{ENV_BACKUPS\[@\]\}"; do[\s\S]*?cp "\$backup" "\$file"/,
  "QA rollback must restore release identity environment files",
);

if (failures.length > 0) {
  console.error("Nayori security gate failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Nayori security gate passed.");
