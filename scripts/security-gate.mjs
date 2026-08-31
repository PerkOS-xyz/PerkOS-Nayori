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
const versionedEscrowMainnetDeploy = "scripts/deploy-versioned-escrow-mainnet.mjs";
const reviewWindowCandidate = [
  "contracts/agentic-commerce-v4.clar",
  "contracts/sbtc-commerce-v3.clar",
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

requirePattern(
  "App/src/constants/contract.ts",
  /STX_COMMERCE_HAS_REVIEW_TIMEOUT[\s\S]*?agentic-commerce-v4/,
  "the Web must recognize the v4 STX review-timeout interface",
);
requirePattern(
  "App/src/constants/contract.ts",
  /SBTC_COMMERCE_HAS_REVIEW_TIMEOUT[\s\S]*?sbtc-commerce-v3/,
  "the Web must recognize the v3 sBTC review-timeout and token-pinning interface",
);

for (const path of [
  versionedEscrowTestnetDeploy,
  versionedEscrowTestnetE2e,
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

if (failures.length > 0) {
  console.error("Nayori security gate failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Nayori security gate passed.");
