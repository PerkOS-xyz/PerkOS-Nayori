import { NETWORK_NAME } from "./network";

const MAINNET_DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const TESTNET_DEPLOYER = "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5";
const CONTRACT_PROFILES = {
  "current-v6-v5": {
    stx: "agentic-commerce-v6",
    sbtc: "sbtc-commerce-v5",
    reputation: "reputation-registry-v3",
    readOnly: false,
  },
  "legacy-v5-v4-read": {
    stx: "agentic-commerce-v5",
    sbtc: "sbtc-commerce-v4",
    reputation: "reputation-registry-v3",
    readOnly: true,
  },
} as const;
export type ContractProfile = keyof typeof CONTRACT_PROFILES;

export function resolveContractProfile(value?: string): ContractProfile {
  const profile = value || "current-v6-v5";
  if (!(profile in CONTRACT_PROFILES)) {
    throw new Error(
      `NEXT_PUBLIC_CONTRACT_PROFILE (${profile}) must be current-v6-v5 or legacy-v5-v4-read`
    );
  }
  return profile as ContractProfile;
}

export const CONTRACT_PROFILE = resolveContractProfile(
  process.env.NEXT_PUBLIC_CONTRACT_PROFILE
);
const selectedProfile = CONTRACT_PROFILES[CONTRACT_PROFILE];
const expectedDeployer = NETWORK_NAME === "mainnet" ? MAINNET_DEPLOYER : TESTNET_DEPLOYER;

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || expectedDeployer;
export const STX_COMMERCE_CONTRACT_NAME =
  process.env.NEXT_PUBLIC_STX_COMMERCE_CONTRACT || selectedProfile.stx;
export const SBTC_COMMERCE_CONTRACT_NAME =
  process.env.NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT || selectedProfile.sbtc;
export const REPUTATION_CONTRACT_NAME =
  process.env.NEXT_PUBLIC_REPUTATION_CONTRACT || selectedProfile.reputation;
export const COMMERCE_CONTRACTS_READ_ONLY = selectedProfile.readOnly;

export function assertCommerceContractsWritable() {
  if (COMMERCE_CONTRACTS_READ_ONLY) {
    throw new Error(
      `Contract profile ${CONTRACT_PROFILE} is historical and read-only; switch to current-v6-v5 before signing`
    );
  }
}

const prefixMatches =
  (NETWORK_NAME === "mainnet" && CONTRACT_ADDRESS.startsWith("SP")) ||
  (NETWORK_NAME === "testnet" && CONTRACT_ADDRESS.startsWith("ST"));

if (!prefixMatches) {
  throw new Error(
    `NEXT_PUBLIC_CONTRACT_ADDRESS (${CONTRACT_ADDRESS}) does not match ${NETWORK_NAME}`
  );
}

if (CONTRACT_ADDRESS !== expectedDeployer) {
  throw new Error(
    `NEXT_PUBLIC_CONTRACT_ADDRESS (${CONTRACT_ADDRESS}) is not the reviewed ${NETWORK_NAME} deployer`
  );
}

if (!/^[a-z][a-z0-9-]{0,39}$/.test(STX_COMMERCE_CONTRACT_NAME)) {
  throw new Error(
    `NEXT_PUBLIC_STX_COMMERCE_CONTRACT (${STX_COMMERCE_CONTRACT_NAME}) is not a valid Clarity contract name`
  );
}

for (const [variable, contractName] of [
  ["NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT", SBTC_COMMERCE_CONTRACT_NAME],
  ["NEXT_PUBLIC_REPUTATION_CONTRACT", REPUTATION_CONTRACT_NAME],
] as const) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(contractName)) {
    throw new Error(`${variable} (${contractName}) is not a valid Clarity contract name`);
  }
}

for (const [variable, actual, expected] of [
  ["NEXT_PUBLIC_STX_COMMERCE_CONTRACT", STX_COMMERCE_CONTRACT_NAME, selectedProfile.stx],
  ["NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT", SBTC_COMMERCE_CONTRACT_NAME, selectedProfile.sbtc],
  ["NEXT_PUBLIC_REPUTATION_CONTRACT", REPUTATION_CONTRACT_NAME, selectedProfile.reputation],
] as const) {
  if (actual !== expected) {
    throw new Error(`${variable} (${actual}) does not match ${CONTRACT_PROFILE}`);
  }
}

export const AGENT_REGISTRY_CONTRACT = `${CONTRACT_ADDRESS}.agent-registry`;
export const AGENTIC_COMMERCE_CONTRACT =
  `${CONTRACT_ADDRESS}.${STX_COMMERCE_CONTRACT_NAME}`;
export const STX_COMMERCE_IS_HARDENED =
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v6" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v2" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v3" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v4" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v5";
export const STX_COMMERCE_HAS_REVIEW_TIMEOUT =
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v6" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v3" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v4" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v5";
export const SBTC_COMMERCE_HAS_REVIEW_TIMEOUT =
  SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v5" ||
  SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v2" ||
  SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v3" ||
  SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v4";
export const STX_COMMERCE_HAS_AUTONOMOUS_DECISIONS =
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v6" ||
  STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v5";
export const SBTC_COMMERCE_HAS_AUTONOMOUS_DECISIONS =
  SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v5" ||
  SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v4";

// Capability detection keeps immutable pre-fee generations readable through explicit overrides.
export const STX_COMMERCE_HAS_SERVICE_FEES = STX_COMMERCE_CONTRACT_NAME === "agentic-commerce-v6";
export const SBTC_COMMERCE_HAS_SERVICE_FEES = SBTC_COMMERCE_CONTRACT_NAME === "sbtc-commerce-v5";

export const NAYORI_EVALUATOR_ADDRESS =
  process.env.NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS ||
  (NETWORK_NAME === "mainnet"
    ? "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3"
    : "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4");
const managedEvaluatorEnabled =
  process.env.NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED ??
  (NETWORK_NAME === "testnet" ? "true" : "false");
if (!["true", "false"].includes(managedEvaluatorEnabled)) {
  throw new Error("NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED must be true or false");
}
export const NAYORI_MANAGED_EVALUATOR_ENABLED = managedEvaluatorEnabled === "true";
if (NETWORK_NAME === "mainnet" && NAYORI_MANAGED_EVALUATOR_ENABLED) {
  throw new Error(
    "Nayori managed evaluator cannot be advertised active on mainnet before runtime activation"
  );
}
export const NAYORI_APPEAL_AUTHORITY_ADDRESS =
  process.env.NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS ||
  (NETWORK_NAME === "mainnet"
    ? "SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6"
    : "ST256E5DAXM7RDFZ76ECCTPTBYHRXXJQ29H16DN69");

const expectedEvaluator =
  NETWORK_NAME === "mainnet"
    ? "SP3GRG5CKEFNYM5BV0NPPHCM51FT176JQ02QWQ9T3"
    : "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4";
const expectedAppealAuthority =
  NETWORK_NAME === "mainnet"
    ? "SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6"
    : "ST256E5DAXM7RDFZ76ECCTPTBYHRXXJQ29H16DN69";

if (NAYORI_EVALUATOR_ADDRESS !== expectedEvaluator) {
  throw new Error(
    `NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS (${NAYORI_EVALUATOR_ADDRESS}) is not the reviewed ${NETWORK_NAME} evaluator`
  );
}
if (NAYORI_APPEAL_AUTHORITY_ADDRESS !== expectedAppealAuthority) {
  throw new Error(
    `NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS (${NAYORI_APPEAL_AUTHORITY_ADDRESS}) is not the reviewed ${NETWORK_NAME} authority`
  );
}
