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
  /OWNED_CONTRACTS\s*=\s*CONTRACTS\.filter[\s\S]*?name\s*!==\s*["']sip-010-trait["'][\s\S]*?for\s*\(const\s*\{\s*name\s*\}\s*of\s*OWNED_CONTRACTS\)/,
  "owner verification must exclude the stateless SIP-010 trait",
);
forbidPattern(
  versionedEscrowTestnetDeploy,
  /STACKS_MAINNET|PostConditionMode\.Allow/,
  "the testnet-only candidate must have no mainnet or allow-mode path",
);

for (const path of [
  "scripts/deploy-mainnet.mjs",
  "scripts/deploy-sbtc-mainnet.mjs",
  "scripts/e2e-sbtc-mainnet.mjs",
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
